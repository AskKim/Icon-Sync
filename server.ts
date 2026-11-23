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
const EXPORTS_DIR = resolveConfinedDataPath('exports');
const VAULT_FILE = resolveConfinedDataPath('icon-sync-vault.json');
const VAULT_BACKUP_FILE = resolveConfinedDataPath('icon-sync-vault.json.bak');
const LEGACY_VAULT_FILE = resolveConfinedDataPath('homegrid-vault.json');

const SERVICE_VERSION = '0.1.0-alpha.1';
const STARTED_AT = Date.now();

// Hard upper limits to protect memory and disk from abusive payloads
const MAX_DEVICES = 32;
const MAX_BACKUPS = 250;
const MAX_EXPORT_FOLDERS = 32;
const MAX_EXPORT_FILES_PER_FOLDER = 200;
const DEFAULT_EXPORT_FOLDERS = ['backups', 'missing-apps', 'diagnostics'];
const ALLOWED_CONFLICT_STRATEGIES = new Set(['newest', 'primary_device', 'manual']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,96}$/;
const SAFE_EXPORT_FOLDER_PATTERN = /^[a-zA-Z0-9_-]{1,48}$/;
const SAFE_EXPORT_FILENAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const EXPORT_MIME_BY_EXT: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.kt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
};

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

function validateExportFolderName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!SAFE_EXPORT_FOLDER_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function validateExportFilename(raw: unknown): { filename: string; ext: string } | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!SAFE_EXPORT_FILENAME_PATTERN.test(trimmed) || trimmed.includes('..')) {
    return null;
  }
  const ext = path.extname(trimmed).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(EXPORT_MIME_BY_EXT, ext)) {
    return null;
  }
  return { filename: trimmed, ext };
}

function resolveConfinedExportFolderPath(folder: string): string {
  const resolved = path.resolve(EXPORTS_DIR, folder);
  if (!resolved.startsWith(EXPORTS_DIR + path.sep)) {
    throw new Error(`Refused export folder outside exports directory: ${folder}`);
  }
  return resolved;
}

function resolveConfinedExportFilePath(folder: string, filename: string): string {
  const folderPath = resolveConfinedExportFolderPath(folder);
  const resolved = path.resolve(folderPath, filename);
  if (!resolved.startsWith(folderPath + path.sep)) {
    throw new Error(`Refused export file outside folder boundary: ${filename}`);
  }
  return resolved;
}

function ensureExportsRoot(): void {
  ensureDataDir();
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true, mode: 0o700 });
  }
  for (const folder of DEFAULT_EXPORT_FOLDERS) {
    const dir = resolveConfinedExportFolderPath(folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
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

  // --------------------------------------------------------------------------
  // GET /api/exports/folders — List selectable workspace export folders
  // --------------------------------------------------------------------------
  app.get('/api/exports/folders', (_req, res) => {
    try {
      ensureExportsRoot();
      const entries = fs.readdirSync(EXPORTS_DIR, { withFileTypes: true });
      const folders = entries
        .filter((e) => e.isDirectory() && SAFE_EXPORT_FOLDER_PATTERN.test(e.name))
        .map((e) => {
          const dirPath = resolveConfinedExportFolderPath(e.name);
          const files = fs
            .readdirSync(dirPath, { withFileTypes: true })
            .filter((f) => f.isFile() && validateExportFilename(f.name) !== null);
          return {
            name: e.name,
            fileCount: files.length,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({ ok: true, folders });
    } catch (err) {
      console.error('Failed to list export folders:', err);
      res.status(500).json({ error: 'Failed to list export folders.' });
    }
  });

  // --------------------------------------------------------------------------
  // GET /api/exports — List saved files in a selected workspace export folder
  // --------------------------------------------------------------------------
  app.get('/api/exports', (req, res) => {
    const folder = validateExportFolderName(req.query.folder ?? 'backups');
    if (!folder) {
      res.status(400).json({ error: 'Invalid export folder name.' });
      return;
    }

    try {
      ensureExportsRoot();
      const dirPath = resolveConfinedExportFolderPath(folder);
      if (!fs.existsSync(dirPath)) {
        res.json({ ok: true, folder, files: [] });
        return;
      }

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => {
          const validated = validateExportFilename(e.name);
          if (!validated) return null;
          const filePath = resolveConfinedExportFilePath(folder, validated.filename);
          const stat = fs.statSync(filePath);
          return {
            filename: validated.filename,
            folder,
            sizeBytes: stat.size,
            updatedAt: stat.mtime.toISOString(),
            mimeType: EXPORT_MIME_BY_EXT[validated.ext],
            url: `/api/exports/file/${encodeURIComponent(folder)}/${encodeURIComponent(validated.filename)}`,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      res.json({ ok: true, folder, files });
    } catch (err) {
      console.error('Failed to list exported files:', err);
      res.status(500).json({ error: 'Failed to read export folder.' });
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/exports — Save an exported file into a selected workspace folder
  // --------------------------------------------------------------------------
  app.post('/api/exports', writeLimiter, async (req, res) => {
    const rawBody = req.body as Record<string, unknown> | undefined;
    const folder = validateExportFolderName(rawBody?.folder ?? 'backups');
    const fileInfo = validateExportFilename(rawBody?.filename);
    const content = typeof rawBody?.content === 'string' ? rawBody.content : null;

    if (!folder || !fileInfo || content === null) {
      res.status(400).json({
        error: 'Invalid export payload. Provide a valid folder, filename, and string content.',
      });
      return;
    }

    if (Buffer.byteLength(content, 'utf-8') > 3_500_000) {
      res.status(413).json({ error: 'Export file exceeds 3.5 MB size limit.' });
      return;
    }

    try {
      const savedMeta = await enqueueVaultMutation(() => {
        ensureExportsRoot();
        const existingFolders = fs
          .readdirSync(EXPORTS_DIR, { withFileTypes: true })
          .filter((e) => e.isDirectory());
        const folderPath = resolveConfinedExportFolderPath(folder);
        if (!fs.existsSync(folderPath)) {
          if (existingFolders.length >= MAX_EXPORT_FOLDERS) {
            throw new Error(`Maximum export folder limit (${MAX_EXPORT_FOLDERS}) reached.`);
          }
          fs.mkdirSync(folderPath, { recursive: true, mode: 0o700 });
        }

        const existingFiles = fs.readdirSync(folderPath, { withFileTypes: true }).filter((e) => e.isFile());
        const targetPath = resolveConfinedExportFilePath(folder, fileInfo.filename);
        if (!fs.existsSync(targetPath) && existingFiles.length >= MAX_EXPORT_FILES_PER_FOLDER) {
          throw new Error(`Folder "${folder}" reached max file limit (${MAX_EXPORT_FILES_PER_FOLDER}).`);
        }

        const tmpFile = resolveConfinedExportFilePath(
          folder,
          `.tmp-${process.pid}-${Date.now()}-${crypto.randomUUID()}.json`
        );
        fs.writeFileSync(tmpFile, content, { encoding: 'utf-8', mode: 0o600 });
        try {
          fs.renameSync(tmpFile, targetPath);
        } catch (renameErr) {
          if (fs.existsSync(tmpFile)) {
            try {
              fs.unlinkSync(tmpFile);
            } catch {
              // ignore cleanup failure
            }
          }
          throw renameErr;
        }
        const stat = fs.statSync(targetPath);
        return {
          filename: fileInfo.filename,
          folder,
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
          mimeType: EXPORT_MIME_BY_EXT[fileInfo.ext],
          url: `/api/exports/file/${encodeURIComponent(folder)}/${encodeURIComponent(fileInfo.filename)}`,
        };
      });

      res.status(201).json({ ok: true, file: savedMeta });
    } catch (err) {
      console.error('Failed to save export file:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to save export file.',
      });
    }
  });

  // --------------------------------------------------------------------------
  // GET /api/exports/file/:folder/:filename — Open or download a saved export file
  // --------------------------------------------------------------------------
  app.get('/api/exports/file/:folder/:filename', async (req, res) => {
    const folder = validateExportFolderName(req.params.folder);
    const fileInfo = validateExportFilename(req.params.filename);
    if (!folder || !fileInfo) {
      res.status(400).json({ error: 'Invalid folder or filename.' });
      return;
    }

    try {
      const filePath = resolveConfinedExportFilePath(folder, fileInfo.filename);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Exported file not found.' });
        return;
      }
      const asDownload = req.query.download === '1';
      res.setHeader('Content-Type', EXPORT_MIME_BY_EXT[fileInfo.ext]);
      res.setHeader(
        'Content-Disposition',
        `${asDownload ? 'attachment' : 'inline'}; filename="${fileInfo.filename}"`
      );
      if (fileInfo.ext === '.html') {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; style-src 'unsafe-inline';"
        );
      }
      const data = await fs.promises.readFile(filePath);
      res.send(data);
    } catch (err) {
      console.error('Failed to serve export file:', err);
      res.status(500).json({ error: 'Failed to read exported file.' });
    }
  });

  // --------------------------------------------------------------------------
  // DELETE /api/exports/file/:folder/:filename — Delete a saved export file
  // --------------------------------------------------------------------------
  app.delete('/api/exports/file/:folder/:filename', writeLimiter, async (req, res) => {
    const folder = validateExportFolderName(req.params.folder);
    const fileInfo = validateExportFilename(req.params.filename);
    if (!folder || !fileInfo) {
      res.status(400).json({ error: 'Invalid folder or filename.' });
      return;
    }

    try {
      const removed = await enqueueVaultMutation(() => {
        const filePath = resolveConfinedExportFilePath(folder, fileInfo.filename);
        if (!fs.existsSync(filePath)) return false;
        fs.unlinkSync(filePath);
        return true;
      });
      if (!removed) {
        res.status(404).json({ error: 'Exported file not found.' });
        return;
      }
      res.json({ ok: true, folder, filename: fileInfo.filename });
    } catch (err) {
      console.error('Failed to delete export file:', err);
      res.status(500).json({ error: 'Failed to delete exported file.' });
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
