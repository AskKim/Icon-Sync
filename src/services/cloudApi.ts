import {
  DeviceProfile,
  LayoutBackupSnapshot,
  WidgetSyncPolicy,
} from '../types/layout';

const LOCAL_STORAGE_KEY = 'homegrid.vault.v2';

export interface CloudVaultState {
  devices: DeviceProfile[];
  backups: LayoutBackupSnapshot[];
  widgetSyncPolicy: WidgetSyncPolicy;
  updatedAt?: string;
}

export async function loadVaultState(): Promise<{
  state: CloudVaultState | null;
  source: 'cloud' | 'local' | 'default';
}> {
  try {
    const res = await fetch('/api/vault');
    if (res.ok) {
      const data = (await res.json()) as { initialized: boolean; vault: CloudVaultState | null };
      if (data.initialized && data.vault && Array.isArray(data.vault.devices) && data.vault.devices.length > 0) {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.vault));
        } catch {
          // ignore storage quota errors
        }
        return { state: data.vault, source: 'cloud' };
      }
    }
  } catch {
    // Fallback to localStorage if API unreachable
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CloudVaultState;
      if (Array.isArray(parsed.devices) && parsed.devices.length > 0) {
        return { state: parsed, source: 'local' };
      }
    }
  } catch {
    // ignore parse failures
  }

  return { state: null, source: 'default' };
}

export async function persistVaultState(state: CloudVaultState): Promise<{
  savedToCloud: boolean;
  updatedAt: string;
}> {
  const updatedAt = new Date().toISOString();
  const payload: CloudVaultState = { ...state, updatedAt };

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore localStorage errors
  }

  try {
    const res = await fetch('/api/vault', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const json = (await res.json()) as { updatedAt?: string };
      return { savedToCloud: true, updatedAt: json.updatedAt ?? updatedAt };
    }
  } catch {
    // Cloud server offline, local persistence still succeeded
  }

  return { savedToCloud: false, updatedAt };
}

export async function pushBackupToCloud(backup: LayoutBackupSnapshot): Promise<boolean> {
  try {
    const res = await fetch('/api/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backup),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function removeBackupFromCloud(backupId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/backups/${encodeURIComponent(backupId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function downloadBackupJson(backup: LayoutBackupSnapshot): void {
  const safeName = backup.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const filename = `homegrid-${safeName || 'backup'}-${backup.createdAt.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
