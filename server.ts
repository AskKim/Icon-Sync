/**
 * @file server.ts
 * @license AGPL-3.0-or-later
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
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
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

const ROOT_DIR = import.meta.dirname;

// All persistent data is strictly confined inside `<repo>/.data/`
const DATA_DIR = path.resolve(ROOT_DIR, '.data');
const VAULT_FILE = resolveConfinedDataPath('icon-sync-vault.json');
const VAULT_BACKUP_FILE = resolveConfinedDataPath('icon-sync-vault.json.bak');
const LEGACY_VAULT_FILE = resolveConfinedDataPath('homegrid-vault.json');

const SERVICE_VERSION = '0.1.0-alpha.1';
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
let writeQueue: Promise<void> = Promise.resolve();

function enqueueVaultMutation<T>(task: () => T): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function readBackupVaultFallback(): VaultStore | null {
  if (!fs.existsSync(VAULT_BACKUP_FILE)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(VAULT_BACKUP_FILE, 'utf-8');
    return sanitizeJsonValue(JSON.parse(raw) as VaultStore);
  } catch (backupErr) {
    console.error('Failed to read backup vault file:', backupErr);
    return null;
  }
}

/**
 * Reads the persisted vault JSON from disk, using an in-memory cache validated
 * against the file's `mtimeMs` and `size` so hot API reads skip redundant I/O,
 * JSON parsing, and deep object sanitization.
 * Automatically falls back to `.data/icon-sync-vault.json.bak` if `VAULT_FILE`
 * fails JSON parsing, and migrates legacy vault files when present.
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
      try {
        const raw = fs.readFileSync(VAULT_FILE, 'utf-8');
        const parsed = sanitizeJsonValue(JSON.parse(raw) as VaultStore);
        cachedVault = parsed;
        cachedVaultMtimeMs = stat.mtimeMs;
        cachedVaultSizeBytes = stat.size;
        return parsed;
      } catch (parseErr) {
        console.error('Primary vault JSON failed parsing, checking backup:', parseErr);
        cachedVault = null;
        cachedVaultMtimeMs = null;
        cachedVaultSizeBytes = 0;
        return readBackupVaultFallback();
      }
    }
    if (fs.existsSync(LEGACY_VAULT_FILE)) {
      const raw = fs.readFileSync(LEGACY_VAULT_FILE, 'utf-8');
      const parsed = sanitizeJsonValue(JSON.parse(raw) as VaultStore);
      void writeVaultAtomic(parsed).catch((err) => {
        console.error('Failed to migrate legacy vault file:', err);
      });
      return cachedVault ?? parsed;
    }
    const fallback = readBackupVaultFallback();
    if (fallback) {
      return fallback;
    }
    cachedVault = null;
    cachedVaultMtimeMs = null;
    cachedVaultSizeBytes = 0;
    return null;
  } catch (err) {
    console.error('Failed to read vault file:', err);
    return readBackupVaultFallback();
  }
}

function performWriteVaultAtomic(store: VaultStore): void {
  ensureDataDir();
  const payload: VaultStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(payload, null, 2);
  const tmpFile = resolveConfinedDataPath(
    `icon-sync-vault.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`
  );
  fs.writeFileSync(tmpFile, serialized, {
    encoding: 'utf-8',
    mode: 0o600,
  });
  try {
    if (fs.existsSync(VAULT_FILE)) {
      try {
        const existingRaw = fs.readFileSync(VAULT_FILE, 'utf-8');
        JSON.parse(existingRaw);
        fs.copyFileSync(VAULT_FILE, VAULT_BACKUP_FILE);
        fs.chmodSync(VAULT_BACKUP_FILE, 0o600);
      } catch {
        // Existing primary vault is invalid JSON or unreadable; keep previous .bak intact
      }
    }
    fs.renameSync(tmpFile, VAULT_FILE);
  } catch (err) {
    if (fs.existsSync(tmpFile)) {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup failure
      }
    }
    throw err;
  }
  const stat = fs.statSync(VAULT_FILE);
  cachedVault = payload;
  cachedVaultMtimeMs = stat.mtimeMs;
  cachedVaultSizeBytes = stat.size;
}

/**
 * Atomically writes the vault JSON serialized through `writeQueue` by writing to a
 * temporary file inside `.data/` with mode `0600`, backing up the previous valid
 * vault to `.data/icon-sync-vault.json.bak` (`0600`), and renaming over the target.
 */
function writeVaultAtomic(store: VaultStore): Promise<void> {
  return enqueueVaultMutation(() => {
    performWriteVaultAtomic(store);
  });
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
  app.put('/api/vault', writeLimiter, async (req, res) => {
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
      await writeVaultAtomic(nextStore);
      res.json({ ok: true, updatedAt: cachedVault?.updatedAt ?? nextStore.updatedAt });
    } catch (err) {
      console.error('Vault write failed:', err);
      res.status(500).json({ error: 'Failed to write vault file to disk.' });
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/backups — Upsert a single sanitized layout backup snapshot
  // --------------------------------------------------------------------------
  app.post('/api/backups', writeLimiter, async (req, res) => {
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

    try {
      const updatedAt = await enqueueVaultMutation(() => {
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

        performWriteVaultAtomic(updated);
        return cachedVault?.updatedAt ?? updated.updatedAt;
      });
      res.status(201).json({ ok: true, backup, updatedAt });
    } catch (err) {
      console.error('Backup upsert failed:', err);
      res.status(500).json({ error: 'Failed to save backup snapshot to disk.' });
    }
  });

  // --------------------------------------------------------------------------
  // DELETE /api/backups/:id — Delete a single backup snapshot by validated ID
  // --------------------------------------------------------------------------
  app.delete('/api/backups/:id', writeLimiter, async (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    if (!SAFE_ID_PATTERN.test(id)) {
      res.status(400).json({ error: 'Invalid backup ID format.' });
      return;
    }

    try {
      const deleted = await enqueueVaultMutation(() => {
        const current = readVault();
        if (!current) {
          return false;
        }

        const nextBackups = current.backups.filter(
          (item: unknown) =>
            typeof item === 'object' && item !== null && (item as { id?: string }).id !== id
        );

        performWriteVaultAtomic({ ...current, backups: nextBackups });
        return true;
      });

      if (!deleted) {
        res.status(404).json({ error: 'Cloud vault not initialized.' });
        return;
      }

      res.json({ ok: true, deletedId: id });
    } catch (err) {
      console.error('Backup deletion failed:', err);
      res.status(500).json({ error: 'Failed to update vault after deletion.' });
    }
  });

  // Clean JSON error handler (prevents raw stack traces on malformed JSON bodies)
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      res.status(400).json({ error: 'Malformed JSON request body.' });
      return;
    }
    if (req.path.startsWith('/api/')) {
      console.error('Unhandled API error:', err);
      res.status(500).json({ error: 'Internal server error.' });
      return;
    }
    next(err);
  });

  // Vite middleware for development; static dist/ for production
  let viteServer: Awaited<ReturnType<typeof createViteServer>> | null = null;
  if (process.env.NODE_ENV !== 'production') {
    viteServer = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distPath = path.resolve(ROOT_DIR, 'dist');
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
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Icon Sync server v${SERVICE_VERSION} running on http://0.0.0.0:${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}. Draining pending vault writes and shutting down...`);

    const forceTimer = setTimeout(async () => {
      try {
        await writeQueue;
      } catch {
        // Ignore
      }
      process.exit(1);
    }, 5000);
    forceTimer.unref();

    server.close(async (closeErr) => {
      if (closeErr) {
        console.error('Error closing HTTP server:', closeErr);
      }
      try {
        await writeQueue;
      } catch (err) {
        console.error('Error draining vault write queue:', err);
      }
      if (viteServer) {
        try {
          await viteServer.close();
        } catch (err) {
          console.error('Error closing Vite dev server:', err);
        }
      }
      clearTimeout(forceTimer);
      process.exit(closeErr ? 1 : 0);
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

startServer();
