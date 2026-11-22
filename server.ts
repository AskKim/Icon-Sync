/**
 * @file server.ts
 * @license GPL-3.0-or-later
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ============================================================================
 * ICON SYNC — EXPRESS CLOUD VAULT SERVER & VITE HOST
 * ============================================================================
 *
 * PLAIN-ENGLISH OVERVIEW (for beginners & AI readers):
 * This single Node.js file runs on Port 3000 and does TWO jobs:
 *   1. Serves the Icon Sync web app (via Vite during development, or from the
 *      compiled `dist/` folder in production).
 *   2. Provides a tiny local REST API (`/api/*`) that saves your Android device
 *      layouts and backup snapshots into `.data/icon-sync-vault.json`.
 *
 * SECURITY & HARDENING SAFEGUARDS IN THIS FILE:
 *   - Disables `X-Powered-By` fingerprinting header.
 *   - Adds hardened HTTP headers (`X-Content-Type-Options: nosniff`,
 *     `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cache-Control: no-store`
 *     on API routes). Note: omits `X-Frame-Options` so embedded preview works.
 *   - Confines all disk reads/writes strictly inside `.data/` using `path.resolve`
 *     boundary checks.
 *   - Uses atomic file writes (write temp file -> rename) with mode `0o600` so a
 *     crash mid-write can never leave behind a half-written JSON vault.
 *   - Strips prototype-pollution keys (`__proto__`, `constructor`, `prototype`)
 *     and validates entity IDs, array bounds, and enum values on every write.
 *   - Applies a lightweight per-IP rate limiter on write endpoints (`PUT/POST/DELETE`).
 *   - Catches invalid JSON payloads cleanly without leaking server stack traces.
 */

import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All persistent data is strictly confined inside `<repo>/.data/`
const DATA_DIR = path.resolve(__dirname, '.data');
const VAULT_FILE = resolveConfinedDataPath('icon-sync-vault.json');
const LEGACY_VAULT_FILE = resolveConfinedDataPath('homegrid-vault.json');

const SERVICE_VERSION = '2.3.0';
const STARTED_AT = Date.now();

// Hard upper limits to protect memory and disk from abusive payloads
const MAX_DEVICES = 32;
const MAX_BACKUPS = 250;
const ALLOWED_CONFLICT_STRATEGIES = new Set(['newest', 'primary_device', 'manual']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,96}$/;

interface VaultStore {
  devices: unknown[];
  backups: unknown[];
  widgetSyncPolicy: {
    conflictStrategy: 'newest' | 'primary_device' | 'manual';
    autoSyncEnabled: boolean;
    lastSyncAt: string;
  };
  schemaRevision?: number;
  updatedAt: string;
}

/**
 * Resolves a filename inside `DATA_DIR` and verifies it cannot escape the
 * directory via `..` path traversal.
 */
function resolveConfinedDataPath(filename: string): string {
  const resolved = path.resolve(DATA_DIR, filename);
  if (!resolved.startsWith(DATA_DIR + path.sep)) {
    throw new Error(`Refused path outside confined data directory: ${filename}`);
  }
  return resolved;
}

/**
 * Recursively strips `__proto__`, `constructor`, and `prototype` keys from
 * incoming JSON payloads to prevent prototype pollution.
 */
function sanitizeJsonValue<T>(value: T, depth = 16): T {
  if (depth <= 0 || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item, depth - 1)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    clean[k] = sanitizeJsonValue(v, depth - 1);
  }
  return clean as T;
}

/**
 * Validates and normalizes the widget sync policy object so invalid enum
 * values or unexpected fields are rejected cleanly.
 */
function normalizeWidgetSyncPolicy(raw: unknown): VaultStore['widgetSyncPolicy'] {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const strategy =
    typeof obj.conflictStrategy === 'string' && ALLOWED_CONFLICT_STRATEGIES.has(obj.conflictStrategy)
      ? (obj.conflictStrategy as VaultStore['widgetSyncPolicy']['conflictStrategy'])
      : 'newest';
  return {
    conflictStrategy: strategy,
    autoSyncEnabled: typeof obj.autoSyncEnabled === 'boolean' ? obj.autoSyncEnabled : true,
    lastSyncAt:
      typeof obj.lastSyncAt === 'string' && obj.lastSyncAt.length <= 64
        ? obj.lastSyncAt
        : new Date().toISOString(),
  };
}

/** Ensures `.data/` exists with restrictive owner-only directory permissions (0700). */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

let cachedVault: VaultStore | null = null;
let cachedVaultMtimeMs: number | null = null;
let cachedVaultSizeBytes = 0;

/**
 * Reads the persisted vault JSON from disk, using an in-memory cache validated
 * against the file's `mtimeMs` and `size` so hot API reads skip redundant I/O,
 * JSON parsing, and deep object sanitization.
 * If the user is upgrading from the legacy vault filename, automatically migrates
 * the file to `.data/icon-sync-vault.json`.
 */
function readVault(): VaultStore | null {
  try {
    if (fs.existsSync(VAULT_FILE)) {
      const stat = fs.statSync(VAULT_FILE);
      if (
        cachedVault !== null &&
        cachedVaultMtimeMs === stat.mtimeMs &&
        cachedVaultSizeBytes === stat.size
      ) {
        return cachedVault;
      }
      const raw = fs.readFileSync(VAULT_FILE, 'utf-8');
      const parsed = sanitizeJsonValue(JSON.parse(raw) as VaultStore);
      cachedVault = parsed;
      cachedVaultMtimeMs = stat.mtimeMs;
      cachedVaultSizeBytes = stat.size;
      return parsed;
    }
    if (fs.existsSync(LEGACY_VAULT_FILE)) {
      const raw = fs.readFileSync(LEGACY_VAULT_FILE, 'utf-8');
      const parsed = sanitizeJsonValue(JSON.parse(raw) as VaultStore);
      writeVaultAtomic(parsed);
      return cachedVault ?? parsed;
    }
    cachedVault = null;
    cachedVaultMtimeMs = null;
    cachedVaultSizeBytes = 0;
    return null;
  } catch (err) {
    console.error('Failed to read vault file:', err);
    return null;
  }
}

/**
 * Atomically writes the vault JSON by writing to a temporary file inside `.data/`
 * with mode `0600` (owner read/write only) and then renaming it over the target.
 * This prevents corrupted JSON if the process stops mid-write.
 */
function writeVaultAtomic(store: VaultStore): void {
  ensureDataDir();
  const payload: VaultStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(payload, null, 2);
  const tmpFile = resolveConfinedDataPath(`icon-sync-vault.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmpFile, serialized, {
    encoding: 'utf-8',
    mode: 0o600,
  });
  fs.renameSync(tmpFile, VAULT_FILE);
  const stat = fs.statSync(VAULT_FILE);
  cachedVault = payload;
  cachedVaultMtimeMs = stat.mtimeMs;
  cachedVaultSizeBytes = stat.size;
}

/**
 * Lightweight sliding-window rate limiter for write routes (`/api/vault`, `/api/backups`).
 * Protects local disk I/O from runaway loops or accidental flood traffic without
 * requiring any external database.
 */
function createWriteRateLimiter(maxRequestsPerMinute: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'local';
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || now > existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + 60_000 });
      // Prune stale buckets periodically so memory stays bounded
      if (buckets.size > 500) {
        for (const [ip, bucket] of buckets.entries()) {
          if (now > bucket.resetAt) buckets.delete(ip);
        }
      }
      next();
      return;
    }

    if (existing.count >= maxRequestsPerMinute) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: 'Too many write requests. Please wait a moment and retry.',
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Hide Express server signature header
  app.disable('x-powered-by');

  // Hardened baseline security headers on all responses
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });

  // Never cache API responses in intermediate proxies or browsers
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Bound request body size to 4 MB to prevent memory exhaustion
  app.use(express.json({ limit: '4mb' }));

  const writeLimiter = createWriteRateLimiter(120);

  // --------------------------------------------------------------------------
  // GET /api/health — Lightweight liveness check
  // --------------------------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'icon-sync-cloud-vault', version: SERVICE_VERSION });
  });

  // --------------------------------------------------------------------------
  // GET /api/diagnostics — Under-the-hood runtime info for Developer Tools
  // --------------------------------------------------------------------------
  app.get('/api/diagnostics', (_req, res) => {
    const exists = fs.existsSync(VAULT_FILE);
    const legacyExists = fs.existsSync(LEGACY_VAULT_FILE);
    let sizeBytes = 0;
    let updatedAt: string | null = null;
    if (exists) {
      try {
        const stat = fs.statSync(VAULT_FILE);
        sizeBytes = stat.size;
        updatedAt =
          cachedVault !== null &&
          cachedVaultMtimeMs === stat.mtimeMs &&
          cachedVaultSizeBytes === stat.size
            ? cachedVault.updatedAt
            : stat.mtime.toISOString();
      } catch {
        sizeBytes = 0;
      }
    }
    res.json({
      ok: true,
      service: 'icon-sync-cloud-vault',
      version: SERVICE_VERSION,
      vaultFileExists: exists,
      vaultFilePath: '.data/icon-sync-vault.json',
      vaultSizeBytes: sizeBytes,
      vaultUpdatedAt: updatedAt,
      legacyVaultDetected: legacyExists,
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      nodeVersion: process.version,
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/vault — Retrieve persisted devices, backups & widget sync policy
  // --------------------------------------------------------------------------
  app.get('/api/vault', (_req, res) => {
    const vault = readVault();
    if (!vault) {
      res.json({ initialized: false, vault: null });
      return;
    }
    res.json({ initialized: true, vault });
  });

  // --------------------------------------------------------------------------
  // PUT /api/vault — Atomically persist sanitized workspace state
  // --------------------------------------------------------------------------
  app.put('/api/vault', writeLimiter, (req, res) => {
    const rawBody = sanitizeJsonValue(req.body) as Partial<VaultStore> | undefined;
    if (!rawBody || !Array.isArray(rawBody.devices) || !Array.isArray(rawBody.backups)) {
      res.status(400).json({
        error: 'Invalid vault payload. Expected devices and backups arrays.',
      });
      return;
    }

    if (rawBody.devices.length > MAX_DEVICES || rawBody.backups.length > MAX_BACKUPS) {
      res.status(413).json({
        error: `Vault exceeds safety bounds (max ${MAX_DEVICES} devices, ${MAX_BACKUPS} backups).`,
      });
      return;
    }

    const nextStore: VaultStore = {
      devices: rawBody.devices,
      backups: rawBody.backups,
      widgetSyncPolicy: normalizeWidgetSyncPolicy(rawBody.widgetSyncPolicy),
      schemaRevision:
        typeof rawBody.schemaRevision === 'number' && Number.isInteger(rawBody.schemaRevision)
          ? rawBody.schemaRevision
          : undefined,
      updatedAt: new Date().toISOString(),
    };

    try {
      writeVaultAtomic(nextStore);
      res.json({ ok: true, updatedAt: nextStore.updatedAt });
    } catch (err) {
      console.error('Vault write failed:', err);
      res.status(500).json({ error: 'Failed to write vault file to disk.' });
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/backups — Upsert a single sanitized layout backup snapshot
  // --------------------------------------------------------------------------
  app.post('/api/backups', writeLimiter, (req, res) => {
    const backup = sanitizeJsonValue(req.body) as Record<string, unknown> | undefined;
    if (
      !backup ||
      typeof backup !== 'object' ||
      Array.isArray(backup) ||
      !SAFE_ID_PATTERN.test(String(backup.id ?? '')) ||
      !Array.isArray(backup.screens)
    ) {
      res.status(400).json({
        error: 'Invalid backup snapshot payload. Expected valid id and screens array.',
      });
      return;
    }

    const current = readVault() ?? {
      devices: [],
      backups: [],
      widgetSyncPolicy: normalizeWidgetSyncPolicy(undefined),
      updatedAt: new Date().toISOString(),
    };

    const existingList = Array.isArray(current.backups) ? current.backups : [];
    const filtered = existingList.filter(
      (item: unknown) =>
        typeof item === 'object' &&
        item !== null &&
        (item as { id?: string }).id !== backup.id
    );

    const updated: VaultStore = {
      ...current,
      backups: [backup, ...filtered].slice(0, MAX_BACKUPS),
      updatedAt: new Date().toISOString(),
    };

    try {
      writeVaultAtomic(updated);
      res.status(201).json({ ok: true, backup, updatedAt: updated.updatedAt });
    } catch (err) {
      console.error('Backup upsert failed:', err);
      res.status(500).json({ error: 'Failed to save backup snapshot to disk.' });
    }
  });

  // --------------------------------------------------------------------------
  // DELETE /api/backups/:id — Delete a single backup snapshot by validated ID
  // --------------------------------------------------------------------------
  app.delete('/api/backups/:id', writeLimiter, (req, res) => {
    const { id } = req.params;
    if (!SAFE_ID_PATTERN.test(id)) {
      res.status(400).json({ error: 'Invalid backup ID format.' });
      return;
    }

    const current = readVault();
    if (!current) {
      res.status(404).json({ error: 'Cloud vault not initialized.' });
      return;
    }

    const nextBackups = current.backups.filter(
      (item: unknown) =>
        typeof item === 'object' && item !== null && (item as { id?: string }).id !== id
    );

    try {
      writeVaultAtomic({ ...current, backups: nextBackups });
      res.json({ ok: true, deletedId: id });
    } catch (err) {
      console.error('Backup deletion failed:', err);
      res.status(500).json({ error: 'Failed to update vault after deletion.' });
    }
  });

  // Clean JSON error handler (prevents raw stack traces on malformed JSON bodies)
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      res.status(400).json({ error: 'Malformed JSON request body.' });
      return;
    }
    next(err);
  });

  // Vite middleware for development; static dist/ for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );
    app.use(
      express.static(distPath, {
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Icon Sync server v${SERVICE_VERSION} running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
