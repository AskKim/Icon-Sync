import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '.data');
const VAULT_FILE = path.join(DATA_DIR, 'icon-sync-vault.json');
const LEGACY_VAULT_FILE = path.join(DATA_DIR, 'homegrid-vault.json');
const SERVICE_VERSION = '2.2.0';
const STARTED_AT = Date.now();

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

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readVault(): VaultStore | null {
  try {
    if (fs.existsSync(VAULT_FILE)) {
      const raw = fs.readFileSync(VAULT_FILE, 'utf-8');
      return JSON.parse(raw) as VaultStore;
    }
    // Seamlessly migrate legacy HomeGrid vault file to Icon Sync
    if (fs.existsSync(LEGACY_VAULT_FILE)) {
      const raw = fs.readFileSync(LEGACY_VAULT_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as VaultStore;
      writeVault(parsed);
      return parsed;
    }
    return null;
  } catch (err) {
    console.error('Failed to read vault file:', err);
    return null;
  }
}

function writeVault(store: VaultStore): void {
  ensureDataDir();
  const payload = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(VAULT_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '4mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'icon-sync-cloud-vault', version: SERVICE_VERSION });
  });

  // Under-the-hood diagnostics endpoint for the Developer Tools page
  app.get('/api/diagnostics', (_req, res) => {
    const exists = fs.existsSync(VAULT_FILE);
    const legacyExists = fs.existsSync(LEGACY_VAULT_FILE);
    let sizeBytes = 0;
    let updatedAt: string | null = null;
    if (exists) {
      try {
        const stat = fs.statSync(VAULT_FILE);
        sizeBytes = stat.size;
        const vault = readVault();
        updatedAt = vault?.updatedAt ?? stat.mtime.toISOString();
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

  // Retrieve full cloud vault state (devices, cloud backups, widget sync policy)
  app.get('/api/vault', (_req, res) => {
    const vault = readVault();
    if (!vault) {
      res.json({ initialized: false, vault: null });
      return;
    }
    res.json({ initialized: true, vault });
  });

  // Persist full cloud vault state
  app.put('/api/vault', (req, res) => {
    const body = req.body as Partial<VaultStore> | undefined;
    if (!body || !Array.isArray(body.devices) || !Array.isArray(body.backups)) {
      res.status(400).json({ error: 'Invalid vault payload. Expected devices and backups arrays.' });
      return;
    }
    const nextStore: VaultStore = {
      devices: body.devices,
      backups: body.backups,
      widgetSyncPolicy: body.widgetSyncPolicy ?? {
        conflictStrategy: 'newest',
        autoSyncEnabled: true,
        lastSyncAt: new Date().toISOString(),
      },
      schemaRevision: typeof body.schemaRevision === 'number' ? body.schemaRevision : undefined,
      updatedAt: new Date().toISOString(),
    };
    writeVault(nextStore);
    res.json({ ok: true, updatedAt: nextStore.updatedAt });
  });

  // Save a single cloud backup snapshot
  app.post('/api/backups', (req, res) => {
    const backup = req.body;
    if (!backup || typeof backup !== 'object' || typeof backup.id !== 'string') {
      res.status(400).json({ error: 'Invalid backup snapshot payload.' });
      return;
    }
    const current = readVault() ?? {
      devices: [],
      backups: [],
      widgetSyncPolicy: {
        conflictStrategy: 'newest' as const,
        autoSyncEnabled: true,
        lastSyncAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    const existingList = Array.isArray(current.backups) ? current.backups : [];
    const filtered = existingList.filter(
      (item: unknown) => typeof item === 'object' && item !== null && (item as { id?: string }).id !== backup.id
    );
    const updated: VaultStore = {
      ...current,
      backups: [backup, ...filtered],
      updatedAt: new Date().toISOString(),
    };
    writeVault(updated);
    res.status(201).json({ ok: true, backup, updatedAt: updated.updatedAt });
  });

  // Delete a cloud backup snapshot
  app.delete('/api/backups/:id', (req, res) => {
    const { id } = req.params;
    const current = readVault();
    if (!current) {
      res.status(404).json({ error: 'Cloud vault not initialized.' });
      return;
    }
    const nextBackups = current.backups.filter(
      (item: unknown) => typeof item === 'object' && item !== null && (item as { id?: string }).id !== id
    );
    writeVault({ ...current, backups: nextBackups });
    res.json({ ok: true, deletedId: id });
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
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Icon Sync server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
