import {
  DeviceProfile,
  LayoutBackupSnapshot,
  MissingAppEntry,
  WidgetSyncPolicy,
} from '../types/layout';
import {
  FaultSimulationConfig,
  ServerDiagnosticsSnapshot,
} from '../types/diagnostics';

export const LOCAL_STORAGE_KEY = 'iconsync.vault.v4';
const LEGACY_STORAGE_KEY = 'homegrid.vault.v3';

export interface CloudVaultState {
  devices: DeviceProfile[];
  backups: LayoutBackupSnapshot[];
  widgetSyncPolicy: WidgetSyncPolicy;
  schemaRevision?: number;
  updatedAt?: string;
}

export interface ApiOperationResult<T = undefined> {
  ok: boolean;
  data?: T;
  status?: number;
  latencyMs: number;
  error?: string;
  simulatedFault?: boolean;
}

let activeFaultConfig: FaultSimulationConfig = {
  forceCloudOffline: false,
  artificialLatencyMs: 0,
  corruptBackupChecksumOnExport: false,
  failLauncherGridAutoDetect: false,
};

export function setFaultSimulationConfig(next: FaultSimulationConfig): void {
  activeFaultConfig = { ...next };
}

export function getFaultSimulationConfig(): FaultSimulationConfig {
  return { ...activeFaultConfig };
}

async function maybeDelayAndCheckFault(endpoint: string): Promise<ApiOperationResult<never> | null> {
  const start = performance.now();
  if (activeFaultConfig.artificialLatencyMs > 0) {
    await new Promise((r) => setTimeout(r, activeFaultConfig.artificialLatencyMs));
  }
  if (activeFaultConfig.forceCloudOffline) {
    return {
      ok: false,
      status: 503,
      latencyMs: Math.round(performance.now() - start),
      error: `Cloud Vault offline (simulated 503 on ${endpoint}).`,
      simulatedFault: true,
    };
  }
  return null;
}

export function inspectLocalStorageCache(): {
  key: string;
  exists: boolean;
  sizeBytes: number;
  schemaRevision: number | null;
  updatedAt: string | null;
  legacyKeyPresent: boolean;
} {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return {
        key: LOCAL_STORAGE_KEY,
        exists: false,
        sizeBytes: 0,
        schemaRevision: null,
        updatedAt: null,
        legacyKeyPresent: Boolean(legacy),
      };
    }
    const parsed = JSON.parse(raw) as CloudVaultState;
    return {
      key: LOCAL_STORAGE_KEY,
      exists: true,
      sizeBytes: new TextEncoder().encode(raw).length,
      schemaRevision: parsed.schemaRevision ?? null,
      updatedAt: parsed.updatedAt ?? null,
      legacyKeyPresent: Boolean(legacy),
    };
  } catch {
    return {
      key: LOCAL_STORAGE_KEY,
      exists: false,
      sizeBytes: 0,
      schemaRevision: null,
      updatedAt: null,
      legacyKeyPresent: false,
    };
  }
}

export function clearLocalStorageCache(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function fetchServerDiagnostics(): Promise<ServerDiagnosticsSnapshot> {
  const start = performance.now();
  const fault = await maybeDelayAndCheckFault('GET /api/diagnostics');
  if (fault) {
    return {
      ok: false,
      service: 'icon-sync-cloud-vault',
      version: '2.2.0',
      vaultFileExists: false,
      vaultFilePath: '.data/icon-sync-vault.json',
      vaultSizeBytes: 0,
      vaultUpdatedAt: null,
      legacyVaultDetected: false,
      uptimeSeconds: 0,
      nodeVersion: 'unreachable',
      latencyMs: fault.latencyMs,
      checkedAt: new Date().toISOString(),
      error: fault.error,
    };
  }

  try {
    const res = await fetch('/api/diagnostics');
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      return {
        ok: false,
        service: 'icon-sync-cloud-vault',
        version: 'unknown',
        vaultFileExists: false,
        vaultFilePath: '.data/icon-sync-vault.json',
        vaultSizeBytes: 0,
        vaultUpdatedAt: null,
        legacyVaultDetected: false,
        uptimeSeconds: 0,
        nodeVersion: 'unknown',
        latencyMs,
        checkedAt: new Date().toISOString(),
        error: `HTTP ${res.status} from /api/diagnostics`,
      };
    }
    const json = (await res.json()) as Omit<ServerDiagnosticsSnapshot, 'latencyMs' | 'checkedAt'>;
    return {
      ...json,
      latencyMs,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      service: 'icon-sync-cloud-vault',
      version: 'unknown',
      vaultFileExists: false,
      vaultFilePath: '.data/icon-sync-vault.json',
      vaultSizeBytes: 0,
      vaultUpdatedAt: null,
      legacyVaultDetected: false,
      uptimeSeconds: 0,
      nodeVersion: 'unreachable',
      latencyMs: Math.round(performance.now() - start),
      checkedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Network error reaching Express server.',
    };
  }
}

export async function loadVaultState(): Promise<{
  state: CloudVaultState | null;
  source: 'cloud' | 'local' | 'default';
  latencyMs: number;
  cloudError?: string;
}> {
  const start = performance.now();
  let cloudError: string | undefined;

  const fault = await maybeDelayAndCheckFault('GET /api/vault');
  if (fault) {
    cloudError = fault.error;
  } else {
    try {
      const res = await fetch('/api/vault');
      if (res.ok) {
        const data = (await res.json()) as {
          initialized: boolean;
          vault: CloudVaultState | null;
        };
        if (
          data.initialized &&
          data.vault &&
          Array.isArray(data.vault.devices) &&
          data.vault.devices.length > 0
        ) {
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.vault));
          } catch {
            // ignore storage quota errors
          }
          return {
            state: data.vault,
            source: 'cloud',
            latencyMs: Math.round(performance.now() - start),
          };
        }
      } else {
        cloudError = `Cloud Vault returned HTTP ${res.status} on initial load.`;
      }
    } catch (err) {
      cloudError =
        err instanceof Error
          ? `Cloud Vault unreachable (${err.message}).`
          : 'Cloud Vault unreachable.';
    }
  }

  // Fallback to new Icon Sync localStorage key, then legacy HomeGrid key
  for (const key of [LOCAL_STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as CloudVaultState;
        if (Array.isArray(parsed.devices) && parsed.devices.length > 0) {
          if (key === LEGACY_STORAGE_KEY) {
            try {
              localStorage.setItem(LOCAL_STORAGE_KEY, raw);
            } catch {
              // ignore
            }
          }
          return {
            state: parsed,
            source: 'local',
            latencyMs: Math.round(performance.now() - start),
            cloudError,
          };
        }
      }
    } catch {
      // ignore parse failures
    }
  }

  return {
    state: null,
    source: 'default',
    latencyMs: Math.round(performance.now() - start),
    cloudError,
  };
}

export async function persistVaultState(
  state: CloudVaultState
): Promise<ApiOperationResult<{ updatedAt: string; savedToLocal: boolean }>> {
  const start = performance.now();
  const updatedAt = new Date().toISOString();
  const payload: CloudVaultState = { ...state, updatedAt };
  let savedToLocal = false;

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    savedToLocal = true;
  } catch {
    savedToLocal = false;
  }

  const fault = await maybeDelayAndCheckFault('PUT /api/vault');
  if (fault) {
    return {
      ...fault,
      data: { updatedAt, savedToLocal },
    };
  }

  try {
    const res = await fetch('/api/vault', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const latencyMs = Math.round(performance.now() - start);
    if (res.ok) {
      const json = (await res.json()) as { updatedAt?: string };
      return {
        ok: true,
        status: res.status,
        latencyMs,
        data: { updatedAt: json.updatedAt ?? updatedAt, savedToLocal },
      };
    }
    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      latencyMs,
      error: `Cloud Vault save rejected (HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ''}).`,
      data: { updatedAt, savedToLocal },
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error:
        err instanceof Error
          ? `Could not reach Cloud Vault (${err.message}). Changes are cached in browser storage.`
          : 'Could not reach Cloud Vault. Changes are cached in browser storage.',
      data: { updatedAt, savedToLocal },
    };
  }
}

export async function pushBackupToCloud(
  backup: LayoutBackupSnapshot
): Promise<ApiOperationResult<{ updatedAt: string }>> {
  const start = performance.now();
  const fault = await maybeDelayAndCheckFault('POST /api/backups');
  if (fault) return fault;

  try {
    const res = await fetch('/api/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backup),
    });
    const latencyMs = Math.round(performance.now() - start);
    if (res.ok) {
      const json = (await res.json()) as { updatedAt?: string };
      return {
        ok: true,
        status: res.status,
        latencyMs,
        data: { updatedAt: json.updatedAt ?? new Date().toISOString() },
      };
    }
    return {
      ok: false,
      status: res.status,
      latencyMs,
      error: `Cloud Vault refused backup snapshot (HTTP ${res.status}).`,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error:
        err instanceof Error
          ? `Failed to upload backup to Cloud Vault (${err.message}).`
          : 'Failed to upload backup to Cloud Vault.',
    };
  }
}

export async function removeBackupFromCloud(
  backupId: string
): Promise<ApiOperationResult<{ deletedId: string }>> {
  const start = performance.now();
  const fault = await maybeDelayAndCheckFault(`DELETE /api/backups/${backupId}`);
  if (fault) return fault;

  try {
    const res = await fetch(`/api/backups/${encodeURIComponent(backupId)}`, {
      method: 'DELETE',
    });
    const latencyMs = Math.round(performance.now() - start);
    if (res.ok) {
      return { ok: true, status: res.status, latencyMs, data: { deletedId: backupId } };
    }
    return {
      ok: false,
      status: res.status,
      latencyMs,
      error: `Cloud Vault could not delete backup (HTTP ${res.status}).`,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error:
        err instanceof Error
          ? `Network error deleting backup (${err.message}).`
          : 'Network error deleting backup.',
    };
  }
}

export function downloadBackupJson(backup: LayoutBackupSnapshot): void {
  const safeName = backup.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const filename = `icon-sync-${safeName || 'backup'}-${backup.createdAt.slice(0, 10)}.json`;
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

export function downloadDiagnosticsBundle(payload: unknown): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `icon-sync-diagnostics-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadMissingAppsFile(
  targetDeviceName: string,
  backupName: string,
  missingApps: MissingAppEntry[],
  format: 'txt' | 'html' = 'txt'
): void {
  const safeDevice = targetDeviceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === 'html') {
    const rows = missingApps
      .map(
        (app, i) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;">${i + 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;">${app.label}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:12px;color:#4b5563;">${app.packageName}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#4b5563;">${app.targetLocation}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
          <a href="${app.playStoreUrl}" target="_blank" rel="noopener noreferrer" style="color:#166534;font-weight:600;text-decoration:underline;">Open in Play Store</a>
        </td>
      </tr>`
      )
      .join('');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Icon Sync Missing Apps — ${targetDeviceName}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:860px;margin:32px auto;padding:0 20px;color:#111827;">
  <h1 style="font-size:22px;margin-bottom:6px;">Icon Sync Missing Apps Install List</h1>
  <p style="font-size:13px;color:#4b5563;margin-top:0;">Target Device: <strong>${targetDeviceName}</strong> · Imported Backup: <strong>${backupName}</strong> · Generated ${dateStamp}</p>
  <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px;">
    <thead>
      <tr style="text-align:left;background:#f9fafb;border-bottom:2px solid #e5e7eb;">
        <th style="padding:10px 12px;">#</th>
        <th style="padding:10px 12px;">App Name</th>
        <th style="padding:10px 12px;">Package ID</th>
        <th style="padding:10px 12px;">Layout Placement</th>
        <th style="padding:10px 12px;">Google Play Store</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `icon-sync-missing-apps-${safeDevice || 'device'}-${dateStamp}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  const lines = [
    `Icon Sync — Missing Apps Play Store Install List`,
    `Target Device: ${targetDeviceName}`,
    `Imported Backup: ${backupName}`,
    `Generated: ${new Date().toISOString()}`,
    `Total Missing Apps: ${missingApps.length}`,
    `============================================================`,
    '',
    ...missingApps.flatMap((app, idx) => [
      `${idx + 1}. ${app.label}`,
      `   Package: ${app.packageName}`,
      `   Placement: ${app.targetLocation}`,
      `   Play Store: ${app.playStoreUrl}`,
      '',
    ]),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `icon-sync-missing-apps-${safeDevice || 'device'}-${dateStamp}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
