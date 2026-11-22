/**
 * @file src/App.tsx
 * @license AGPL-3.0-or-later
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * ============================================================================
 * ICON SYNC — ROOT APPLICATION ORCHESTRATOR
 * ============================================================================
 *
 * PLAIN-ENGLISH OVERVIEW (for beginners & AI readers):
 * `App.tsx` is the central control center of the Icon Sync web studio.
 * It holds the single source of truth for:
 *   - `devices`: Registered Android phones/tablets & their launcher grids
 *   - `backups`: Saved Cloud Vault and local JSON snapshots
 *   - `widgetSyncPolicy`: How widget edits sync across linked Android devices
 *   - `feedbackItems`: Actionable Success / Action Needed / Failed banners
 *   - `logs` & `faultConfig`: Under-the-hood Developer Tools diagnostics state
 *
 * TIP FOR NOVICE CODERS:
 * All complex math (grid occupancy, 6x6 -> 5x4 remapping, checksum verification)
 * lives outside this file inside `src/engine/layoutEngine.ts`. All HTTP/file I/O
 * lives in `src/services/cloudApi.ts`. See `ARCHITECTURE.md` for a full map.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Cloud,
  Download,
  FolderSync,
  LayoutGrid,
  PackageSearch,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Smartphone,
  Upload,
  Wrench,
} from 'lucide-react';
import {
  AppCatalogEntry,
  DeviceProfile,
  HomeScreenPage,
  LayoutBackupSnapshot,
  MissingAppEntry,
  RestoreDiffReport,
  SelectionTarget,
  WidgetItem,
  WidgetSyncPolicy,
} from './types/layout';
import {
  DiagnosticLogEntry,
  FaultSimulationConfig,
  FeedbackBannerItem,
  FeedbackRecoveryAction,
  FeedbackSeverity,
  IntegrityFinding,
} from './types/diagnostics';
import {
  createInitialBackups,
  createInitialDevices,
  WidgetTemplate,
} from './data/catalog';
import {
  autoDetectDeviceGrid,
  buildBackupSnapshot,
  canPlaceAt,
  cloneDeep,
  computeBackupChecksum,
  computeChecksum,
  computeOccupancyGrid,
  findFirstOpenSlot,
  formatGridSourceLabel,
  markPackageInstalledOnDevice,
  propagateSyncedWidget,
  pushWidgetToDevice,
  reflowDeviceToGrid,
  uid,
} from './engine/layoutEngine';
import {
  clearLocalStorageCache,
  CloudVaultState,
  downloadBackupJson,
  downloadMissingAppsFile,
  loadVaultState,
  persistVaultState,
  pushBackupToCloud,
  readLocalVaultCacheSync,
  removeBackupFromCloud,
  setFaultSimulationConfig,
} from './services/cloudApi';
import { PhoneCanvas } from './components/PhoneCanvas';
import { InspectorPanel } from './components/InspectorPanel';
import { FeedbackBanner } from './components/FeedbackBanner';
import { BackupsView } from './components/BackupsView';
import { WidgetSyncView } from './components/WidgetSyncView';
import { HowItWorksView } from './components/HowItWorksView';
import { DeveloperToolsView } from './components/DeveloperToolsView';
import { BackupExportModal } from './components/BackupExportModal';
import { ImportRestoreModal } from './components/ImportRestoreModal';
import { MissingAppsModal } from './components/MissingAppsModal';
import { AddDeviceModal } from './components/AddDeviceModal';

type ActiveTab = 'screens' | 'backups' | 'widgets' | 'how-it-works' | 'developer';

const VAULT_SCHEMA_REVISION = 7;

interface UndoSnapshot {
  deviceId: string;
  previousDevice: DeviceProfile;
  report: RestoreDiffReport;
}

const DEFAULT_FAULT_CONFIG: FaultSimulationConfig = {
  forceCloudOffline: false,
  artificialLatencyMs: 0,
  corruptBackupChecksumOnExport: false,
  failLauncherGridAutoDetect: false,
};

const DEFAULT_WIDGET_SYNC_POLICY: WidgetSyncPolicy = {
  conflictStrategy: 'newest',
  autoSyncEnabled: true,
  lastSyncAt: '2026-11-21T07:02:00.000Z',
};

function normalizeLoadedVault(rawState: CloudVaultState): {
  devices: DeviceProfile[];
  backups: LayoutBackupSnapshot[];
  widgetSyncPolicy: WidgetSyncPolicy;
  needsMigration: boolean;
} {
  const needsMigration =
    !rawState.schemaRevision || rawState.schemaRevision < VAULT_SCHEMA_REVISION;

  // Only instantiate factory defaults when a schema migration actually needs them
  const defaultDevices = needsMigration ? createInitialDevices() : null;
  const defaultBackups =
    needsMigration && defaultDevices ? createInitialBackups(defaultDevices) : null;

  let normalizedDevices: DeviceProfile[] = rawState.devices
    .filter((d) => !(needsMigration && d.id === 'dev-galaxy-a15-16'))
    .map((d) => {
      const def = defaultDevices?.find((item) => item.id === d.id);
      const upgradedTabS9 =
        needsMigration && d.id === 'dev-tab-s9' && d.gridCols === 5 && d.gridRows === 6 && def
          ? def
          : d;

      return {
        ...upgradedTabS9,
        gridDetectionSource:
          upgradedTabS9.gridDetectionSource ?? def?.gridDetectionSource ?? 'auto-accessibility',
        gridConfidence: upgradedTabS9.gridConfidence ?? def?.gridConfidence ?? 'verified',
        gridDetectedAt:
          upgradedTabS9.gridDetectedAt ?? def?.gridDetectedAt ?? upgradedTabS9.lastScannedAt,
        installedPackages:
          Array.isArray(upgradedTabS9.installedPackages) &&
          upgradedTabS9.installedPackages.length > 0
            ? upgradedTabS9.installedPackages
            : def?.installedPackages ?? [],
      };
    });

  if (needsMigration && defaultDevices) {
    const existingDeviceIds = new Set(normalizedDevices.map((d) => d.id));
    const missingDefaults = defaultDevices.filter((def) => !existingDeviceIds.has(def.id));
    if (missingDefaults.length > 0) {
      const insertAt = Math.min(1, normalizedDevices.length);
      normalizedDevices = [
        ...normalizedDevices.slice(0, insertAt),
        ...missingDefaults,
        ...normalizedDevices.slice(insertAt),
      ];
    }
  }

  let normalizedBackups = Array.isArray(rawState.backups) ? [...rawState.backups] : [];
  if (needsMigration && defaultBackups) {
    normalizedBackups = normalizedBackups.filter(
      (b) => b.id !== 'bk-galaxy-a15-16-oneui'
    );
    normalizedBackups = normalizedBackups.map((b) => {
      if (b.includesIconArt !== undefined) return b;
      const def = defaultBackups.find((d) => d.id === b.id);
      if (!def) return b;
      return {
        ...b,
        includesIconArt: def.includesIconArt,
        ...(def.iconArtAssets ? { iconArtAssets: def.iconArtAssets } : {}),
        stats: def.stats,
        checksum: def.checksum,
      };
    });
    const existingBackupIds = new Set(normalizedBackups.map((b) => b.id));
    const missingDefaultBackups = defaultBackups.filter(
      (def) => !existingBackupIds.has(def.id)
    );
    if (missingDefaultBackups.length > 0) {
      normalizedBackups = [...missingDefaultBackups, ...normalizedBackups];
    }
  }

  return {
    devices: normalizedDevices,
    backups: normalizedBackups,
    widgetSyncPolicy: rawState.widgetSyncPolicy ?? DEFAULT_WIDGET_SYNC_POLICY,
    needsMigration,
  };
}

function getInitialBootState(): {
  devices: DeviceProfile[];
  backups: LayoutBackupSnapshot[];
  widgetSyncPolicy: WidgetSyncPolicy;
  activeDeviceId: string;
} {
  const cached = readLocalVaultCacheSync();
  if (cached) {
    const normalized = normalizeLoadedVault(cached);
    return {
      devices: normalized.devices,
      backups: normalized.backups,
      widgetSyncPolicy: normalized.widgetSyncPolicy,
      activeDeviceId: normalized.devices[0]?.id ?? 'dev-pixel-9-pro',
    };
  }

  const initialDevices = createInitialDevices();
  return {
    devices: initialDevices,
    backups: createInitialBackups(initialDevices),
    widgetSyncPolicy: DEFAULT_WIDGET_SYNC_POLICY,
    activeDeviceId: initialDevices[0]?.id ?? 'dev-pixel-9-pro',
  };
}

export default function App() {
  const [initialBoot] = useState(getInitialBootState);
  const [activeTab, setActiveTab] = useState<ActiveTab>('screens');
  const [devices, setDevices] = useState<DeviceProfile[]>(initialBoot.devices);
  const [backups, setBackups] = useState<LayoutBackupSnapshot[]>(initialBoot.backups);
  const [widgetSyncPolicy, setWidgetSyncPolicy] = useState<WidgetSyncPolicy>(
    initialBoot.widgetSyncPolicy
  );

  const [activeDeviceId, setActiveDeviceId] = useState<string>(initialBoot.activeDeviceId);
  const [activeScreenIndex, setActiveScreenIndex] = useState<number>(0);
  const [selection, setSelection] = useState<SelectionTarget>({ type: 'screen' });
  const [isScanning, setIsScanning] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [importModalState, setImportModalState] = useState<{
    open: boolean;
    backupId?: string;
  }>({ open: false });

  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const [missingAppsSession, setMissingAppsSession] = useState<{
    deviceId: string;
    targetDeviceName: string;
    backupName: string;
    missingApps: MissingAppEntry[];
    modalOpen: boolean;
    initialView: 'walkthrough' | 'list';
  } | null>(null);

  const [feedbackItems, setFeedbackItems] = useState<FeedbackBannerItem[]>([]);
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>([]);
  const [faultConfig, setFaultConfig] = useState<FaultSimulationConfig>(DEFAULT_FAULT_CONFIG);
  const [hydrated, setHydrated] = useState(false);

  const autoHideTimersRef = useRef<Map<string, number>>(new Map());
  const scanTimerRef = useRef<number | null>(null);
  // Tracks last persisted checksum so identical states never trigger redundant PUT /api/vault writes
  const lastSavedSignatureRef = useRef<string>('');
  const bootSignatureRef = useRef<string | null>(
    initialBoot.devices.length > 0 && readLocalVaultCacheSync() !== null
      ? computeChecksum({
          devices: initialBoot.devices,
          backups: initialBoot.backups,
          widgetSyncPolicy: initialBoot.widgetSyncPolicy,
        })
      : null
  );

  const recordLog = useCallback((entry: Omit<DiagnosticLogEntry, 'id' | 'timestamp'>) => {
    const full: DiagnosticLogEntry = {
      ...entry,
      id: uid('log'),
      timestamp: new Date().toISOString(),
    };
    setLogs((prev) => [full, ...prev].slice(0, 150));
  }, []);

  const dismissFeedback = useCallback((id: string) => {
    const timer = autoHideTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      autoHideTimersRef.current.delete(id);
    }
    setFeedbackItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushFeedback = useCallback(
    (payload: {
      severity: FeedbackSeverity;
      title: string;
      message: string;
      code?: string;
      details?: string;
      recoveryActions?: FeedbackRecoveryAction[];
      autoHideMs?: number;
    }) => {
      const id = uid('fb');
      const item: FeedbackBannerItem = {
        id,
        severity: payload.severity,
        title: payload.title,
        message: payload.message,
        code: payload.code,
        details: payload.details,
        recoveryActions: payload.recoveryActions,
        createdAt: new Date().toISOString(),
        autoHideMs: payload.autoHideMs,
      };

      setFeedbackItems((prev) => [item, ...prev.filter((x) => x.title !== item.title)].slice(0, 3));

      const shouldAutoHide =
        payload.autoHideMs !== undefined
          ? payload.autoHideMs > 0
          : payload.severity === 'success' || payload.severity === 'info';

      if (shouldAutoHide) {
        const delay = payload.autoHideMs ?? 6500;
        const timer = window.setTimeout(() => {
          autoHideTimersRef.current.delete(id);
          setFeedbackItems((prev) => prev.filter((x) => x.id !== id));
        }, delay);
        autoHideTimersRef.current.set(id, timer);
      }
    },
    []
  );

  // Sync fault simulator configuration with cloudApi
  const handleUpdateFaultConfig = useCallback(
    (next: FaultSimulationConfig) => {
      setFaultConfig(next);
      setFaultSimulationConfig(next);
      recordLog({
        level: 'info',
        category: 'system',
        title: 'Fault simulator updated',
        message: `Offline=${next.forceCloudOffline}, Latency=${next.artificialLatencyMs}ms, CorruptChecksum=${next.corruptBackupChecksumOnExport}, FailGridDetect=${next.failLauncherGridAutoDetect}`,
      });
    },
    [recordLog]
  );

  // Keyboard shortcut Ctrl+Shift+D / Cmd+Shift+D to toggle Developer Tools
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setActiveTab((prev) => (prev === 'developer' ? 'screens' : 'developer'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Cleanup feedback & scan timers on unmount
  useEffect(() => {
    const timers = autoHideTimersRef.current;
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
      if (scanTimerRef.current !== null) {
        window.clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
    };
  }, []);

  const hydrateFromVault = useCallback(
    async (isManualReload = false) => {
      const result = await loadVaultState();
      recordLog({
        level: result.cloudError ? 'warn' : 'success',
        category: 'vault',
        title: isManualReload ? 'Reloaded vault from storage' : 'Initial vault hydration',
        message: result.cloudError
          ? `Loaded from ${result.source} fallback (${result.cloudError})`
          : `Loaded state from ${result.source} in ${result.latencyMs}ms.`,
        durationMs: result.latencyMs,
      });

      if (result.state) {
        const normalized = normalizeLoadedVault(result.state);
        const loadedSig = computeChecksum({
          devices: normalized.devices,
          backups: normalized.backups,
          widgetSyncPolicy: normalized.widgetSyncPolicy,
        });

        if (result.source === 'cloud' && !normalized.needsMigration) {
          // Record signature of the already-persisted cloud state so boot doesn't bounce PUT /api/vault back
          lastSavedSignatureRef.current = loadedSig;
        }

        // Skip re-rendering the entire tree on initial boot if warm local cache already matched cloud
        const matchesWarmBoot =
          !isManualReload &&
          bootSignatureRef.current !== null &&
          bootSignatureRef.current === loadedSig;

        if (!matchesWarmBoot) {
          setDevices(normalized.devices);
          setBackups(normalized.backups);
          setWidgetSyncPolicy(normalized.widgetSyncPolicy);
          setActiveDeviceId((prevId) =>
            normalized.devices.some((d) => d.id === prevId)
              ? prevId
              : normalized.devices[0]?.id ?? 'dev-pixel-9-pro'
          );
        }
      }

      if (result.cloudError) {
        pushFeedback({
          severity: 'warning',
          title: 'Cloud Vault unreachable — using local browser cache',
          message:
            'Icon Sync loaded your cached workspace from browser storage. You can keep editing safely, then retry syncing once the server is available.',
          code: 'VAULT_LOAD_FALLBACK',
          details: result.cloudError,
          recoveryActions: [
            {
              id: 'retry-load',
              label: 'Retry Cloud Load',
              variant: 'primary',
              onClick: () => {
                void hydrateFromVault(true);
              },
            },
            {
              id: 'open-dev',
              label: 'Open Developer Tools',
              variant: 'secondary',
              onClick: () => setActiveTab('developer'),
            },
          ],
        });
      } else if (isManualReload) {
        pushFeedback({
          severity: 'success',
          title: 'Vault reloaded',
          message: `Successfully reloaded workspace from ${result.source} (${result.latencyMs}ms).`,
        });
      }

      setHydrated(true);
    },
    [pushFeedback, recordLog]
  );

  // Initial load on startup
  useEffect(() => {
    void hydrateFromVault(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistCurrentState = useCallback(
    async (
      nextDevices: DeviceProfile[],
      nextBackups: LayoutBackupSnapshot[],
      nextPolicy: WidgetSyncPolicy,
      isManualPush = false
    ) => {
      const res = await persistVaultState({
        devices: nextDevices,
        backups: nextBackups,
        widgetSyncPolicy: nextPolicy,
        schemaRevision: VAULT_SCHEMA_REVISION,
      });

      recordLog({
        level: res.ok ? 'success' : 'error',
        category: 'api',
        title: isManualPush ? 'Manual Cloud Vault push' : 'Auto-sync PUT /api/vault',
        message: res.ok
          ? `Persisted ${nextDevices.length} devices & ${nextBackups.length} backups in ${res.latencyMs}ms.`
          : res.error ?? 'Failed to persist vault state.',
        durationMs: res.latencyMs,
        statusCode: res.status,
      });

      if (!res.ok) {
        pushFeedback({
          severity: 'error',
          title: 'Cloud Vault sync failed (saved locally)',
          message:
            res.error ??
            'Changes are safe in browser localStorage, but could not be written to the Express Cloud Vault.',
          code: res.status ? `HTTP_${res.status}` : 'CLOUD_SYNC_ERROR',
          details: `Endpoint: PUT /api/vault\nLocal cache saved: ${res.data?.savedToLocal ? 'Yes' : 'No'}\nLatency: ${res.latencyMs}ms`,
          recoveryActions: [
            {
              id: 'retry-sync',
              label: 'Retry Cloud Sync',
              variant: 'primary',
              onClick: () => {
                void persistCurrentState(nextDevices, nextBackups, nextPolicy, true);
              },
            },
            {
              id: 'download-json-fallback',
              label: 'Download JSON Backup',
              variant: 'secondary',
              onClick: () => {
                const currentDev = nextDevices.find((d) => d.id === activeDeviceId) ?? nextDevices[0];
                if (currentDev) {
                  const emergency = buildBackupSnapshot(currentDev, {
                    name: `${currentDev.name} Offline Fallback`,
                    notes: 'Downloaded locally while Cloud Vault was unavailable.',
                    storage: 'local',
                  });
                  downloadBackupJson(emergency);
                }
              },
            },
            {
              id: 'open-dev-sync',
              label: 'Open Developer Tools',
              variant: 'secondary',
              onClick: () => setActiveTab('developer'),
            },
          ],
        });
      } else if (isManualPush) {
        pushFeedback({
          severity: 'success',
          title: 'Cloud Vault synchronized',
          message: `Saved ${nextDevices.length} device profiles and ${nextBackups.length} backup snapshots (${res.latencyMs}ms).`,
        });
      }
    },
    [activeDeviceId, pushFeedback, recordLog]
  );

  // Auto-persist changes to Express Cloud Vault + localStorage after hydration
  // Compute checksum inside the debounce timer so rapid keystrokes never serialize the whole vault synchronously
  useEffect(() => {
    if (!hydrated) return;

    const timer = window.setTimeout(() => {
      const signature = computeChecksum({ devices, backups, widgetSyncPolicy });
      if (signature === lastSavedSignatureRef.current) return;
      lastSavedSignatureRef.current = signature;
      void persistCurrentState(devices, backups, widgetSyncPolicy, false);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [devices, backups, widgetSyncPolicy, hydrated, persistCurrentState]);

  const activeDevice = useMemo(
    () => devices.find((d) => d.id === activeDeviceId) ?? devices[0],
    [devices, activeDeviceId]
  );

  const handleSelectDevice = (deviceId: string) => {
    setActiveDeviceId(deviceId);
    setActiveScreenIndex(0);
    setSelection({ type: 'screen' });
  };

  const handleCreateCustomDevice = (newDevice: DeviceProfile) => {
    setDevices((prev) => [...prev, newDevice]);
    setActiveDeviceId(newDevice.id);
    setActiveScreenIndex(0);
    setSelection({ type: 'screen' });
    setShowAddDeviceModal(false);
    recordLog({
      level: 'success',
      category: 'grid',
      title: `Registered custom device "${newDevice.name}"`,
      message: `${newDevice.launcher} · ${newDevice.gridCols}×${newDevice.gridRows} (${formatGridSourceLabel(newDevice.gridDetectionSource)}).`,
    });
    pushFeedback({
      severity: 'success',
      title: `Added ${newDevice.name} (${newDevice.gridCols}×${newDevice.gridRows})`,
      message: `Ready for editing, backups, or cross-grid imports (try importing the 6×6 Nova backup into this ${newDevice.gridCols}×${newDevice.gridRows} layout).`,
      recoveryActions: [
        {
          id: 'import-into-new-device',
          label: 'Import Backup Into Device',
          variant: 'primary',
          onClick: () => setImportModalState({ open: true }),
        },
      ],
    });
  };

  const handleDuplicateBackup = (source: LayoutBackupSnapshot) => {
    const cloned: LayoutBackupSnapshot = {
      ...cloneDeep(source),
      id: uid('bk'),
      name: `${source.name} (Copy)`,
      createdAt: new Date().toISOString(),
    };
    setBackups((prev) => [cloned, ...prev]);
    recordLog({
      level: 'info',
      category: 'vault',
      title: `Duplicated backup "${source.name}"`,
      message: `Created "${cloned.name}" (${cloned.gridCols}×${cloned.gridRows}).`,
    });
    pushFeedback({
      severity: 'success',
      title: `Cloned "${source.name}"`,
      message: `Saved "${cloned.name}" to your backup archive.`,
    });
  };

  const handleUpdateDevice = (nextDevice: DeviceProfile) => {
    setDevices((prev) => prev.map((d) => (d.id === nextDevice.id ? nextDevice : d)));
  };

  const handleChangeDeviceGrid = (
    cols: number,
    rows: number,
    targetId?: string
  ) => {
    const device = devices.find((d) => d.id === (targetId ?? activeDevice.id)) ?? activeDevice;
    const prevGrid = `${device.gridCols}×${device.gridRows}`;
    const { nextDevice, relocatedCount, widgetsResized, overflowPagesAdded } = reflowDeviceToGrid(
      device,
      cols,
      rows,
      'user-reported'
    );
    handleUpdateDevice(nextDevice);
    if (nextDevice.id === activeDevice.id) {
      setActiveScreenIndex((idx) => Math.min(idx, nextDevice.screens.length - 1));
    }

    const detailsText =
      relocatedCount > 0 || widgetsResized > 0 || overflowPagesAdded > 0
        ? `Reflowed ${relocatedCount} item${relocatedCount === 1 ? '' : 's'}, resized ${widgetsResized} widget${widgetsResized === 1 ? '' : 's'}, added ${overflowPagesAdded} overflow page${overflowPagesAdded === 1 ? '' : 's'}.`
        : 'All existing icons, folders, and widgets fit cleanly inside the updated bounds.';

    recordLog({
      level: 'info',
      category: 'grid',
      title: `Grid updated on ${device.name}`,
      message: `Changed from ${prevGrid} to ${nextDevice.gridCols}×${nextDevice.gridRows} (User Reported). ${detailsText}`,
    });

    pushFeedback({
      severity: overflowPagesAdded > 0 || widgetsResized > 0 ? 'warning' : 'success',
      title: `Grid set to ${nextDevice.gridCols}×${nextDevice.gridRows} on ${device.name}`,
      message: detailsText,
      recoveryActions:
        prevGrid !== `${nextDevice.gridCols}×${nextDevice.gridRows}`
          ? [
              {
                id: 'revert-grid',
                label: `Revert to ${prevGrid}`,
                variant: 'secondary',
                onClick: () => {
                  handleUpdateDevice(device);
                  pushFeedback({
                    severity: 'info',
                    title: 'Grid change reverted',
                    message: `Restored ${device.name} back to ${prevGrid}.`,
                  });
                },
              },
            ]
          : undefined,
    });
  };

  const handleAutoDetectGrid = () => {
    const result = autoDetectDeviceGrid(activeDevice, {
      simulateFailure: faultConfig.failLauncherGridAutoDetect,
    });

    if (!result.ok) {
      recordLog({
        level: 'error',
        category: 'grid',
        title: `Grid auto-detect failed on ${activeDevice.name}`,
        message: result.error ?? result.summary,
      });

      pushFeedback({
        severity: 'error',
        title: `Could not auto-detect grid for ${activeDevice.launcher}`,
        message:
          result.error ??
          'This launcher does not expose its grid layout automatically. Report your grid dimensions manually so cross-grid imports remap accurately.',
        code: 'GRID_DETECT_UNAVAILABLE',
        details: `Device: ${activeDevice.name}\nLauncher: ${activeDevice.launcher}\nCurrent configured grid: ${activeDevice.gridCols}×${activeDevice.gridRows}`,
        recoveryActions: [
          {
            id: 'report-5x4',
            label: 'Report 5×4 Grid',
            variant: 'primary',
            onClick: () => handleChangeDeviceGrid(5, 4),
          },
          {
            id: 'report-6x6',
            label: 'Report 6×6 Grid',
            variant: 'secondary',
            onClick: () => handleChangeDeviceGrid(6, 6),
          },
          {
            id: 'open-dev-grid',
            label: 'Open Developer Tools',
            variant: 'secondary',
            onClick: () => setActiveTab('developer'),
          },
        ],
      });
      return;
    }

    const updated: DeviceProfile = {
      ...activeDevice,
      gridCols: result.cols,
      gridRows: result.rows,
      gridDetectionSource: result.source,
      gridConfidence: result.confidence,
      gridDetectedAt: new Date().toISOString(),
    };
    handleUpdateDevice(updated);

    recordLog({
      level: 'success',
      category: 'grid',
      title: `Auto-detected ${result.cols}×${result.rows} grid`,
      message: result.summary,
    });

    pushFeedback({
      severity: 'success',
      title: `Detected ${result.cols}×${result.rows} grid (${formatGridSourceLabel(result.source)})`,
      message: result.summary,
    });
  };

  const handleScanDevice = () => {
    if (isScanning) return;
    setIsScanning(true);
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
    }
    scanTimerRef.current = window.setTimeout(() => {
      scanTimerRef.current = null;
      const scannedAt = new Date().toISOString();
      const detect = autoDetectDeviceGrid(activeDevice, {
        simulateFailure: faultConfig.failLauncherGridAutoDetect,
      });

      const updated: DeviceProfile = {
        ...activeDevice,
        lastScannedAt: scannedAt,
        gridCols: detect.ok ? detect.cols : activeDevice.gridCols,
        gridRows: detect.ok ? detect.rows : activeDevice.gridRows,
        gridDetectionSource: detect.ok ? detect.source : activeDevice.gridDetectionSource,
        gridConfidence: detect.ok ? detect.confidence : activeDevice.gridConfidence,
        gridDetectedAt: detect.ok ? scannedAt : activeDevice.gridDetectedAt,
      };
      handleUpdateDevice(updated);
      setIsScanning(false);

      const iconCount = updated.screens.reduce(
        (sum, s) => sum + s.icons.length + s.folders.reduce((fs, f) => fs + f.apps.length, 0),
        0
      );
      const folderCount = updated.screens.reduce((sum, s) => sum + s.folders.length, 0);
      const widgetCount = updated.screens.reduce((sum, s) => sum + s.widgets.length, 0);

      recordLog({
        level: detect.ok ? 'success' : 'warn',
        category: 'grid',
        title: `Scanned ${updated.name}`,
        message: `${updated.screens.length} screens, ${iconCount} icons, ${folderCount} folders, ${widgetCount} widgets · Grid ${updated.gridCols}×${updated.gridRows}${detect.ok ? '' : ' (auto-detect unavailable)'}`,
      });

      if (!detect.ok) {
        pushFeedback({
          severity: 'warning',
          title: `Scanned ${updated.name} — manual grid verification needed`,
          message: `Found ${iconCount} icons, ${folderCount} folders, and ${widgetCount} widgets, but ${updated.launcher} did not report its grid bounds automatically.`,
          code: 'SCAN_MANUAL_GRID',
          details: detect.error,
          recoveryActions: [
            {
              id: 'set-5x4-after-scan',
              label: 'Report 5×4 Grid',
              variant: 'primary',
              onClick: () => handleChangeDeviceGrid(5, 4),
            },
            {
              id: 'set-6x6-after-scan',
              label: 'Report 6×6 Grid',
              variant: 'secondary',
              onClick: () => handleChangeDeviceGrid(6, 6),
            },
          ],
        });
      } else {
        pushFeedback({
          severity: 'success',
          title: `Layout scan complete on ${updated.name}`,
          message: `Verified ${updated.gridCols}×${updated.gridRows} grid (${formatGridSourceLabel(updated.gridDetectionSource)}) with ${updated.screens.length} screens, ${iconCount} icons, ${folderCount} folders, and ${widgetCount} widgets.`,
        });
      }
    }, 900);
  };

  const handleAddSupplementalScreen = (): HomeScreenPage => {
    const nextOrder = activeDevice.screens.length;
    const newPage: HomeScreenPage = {
      id: uid('scr'),
      name: `Supplemental ${nextOrder}`,
      isPrimary: false,
      order: nextOrder,
      icons: [],
      folders: [],
      widgets: [],
    };
    const nextDevice: DeviceProfile = {
      ...activeDevice,
      screens: [...activeDevice.screens, newPage],
    };
    handleUpdateDevice(nextDevice);
    setActiveScreenIndex(nextOrder);
    setSelection({ type: 'screen', id: newPage.id });
    pushFeedback({
      severity: 'success',
      title: 'Supplemental screen added',
      message: `Added "${newPage.name}" (${activeDevice.gridCols}×${activeDevice.gridRows}) to ${activeDevice.name}.`,
    });
    return newPage;
  };

  const handleDeleteScreen = (screenId: string) => {
    if (activeDevice.screens.length <= 1) return;
    const removed = activeDevice.screens.find((s) => s.id === screenId);
    const remaining = activeDevice.screens
      .filter((s) => s.id !== screenId)
      .map((s, idx) => ({ ...s, order: idx, isPrimary: idx === 0 }));
    handleUpdateDevice({ ...activeDevice, screens: remaining });
    setActiveScreenIndex(0);
    setSelection({ type: 'screen', id: remaining[0]?.id });
    pushFeedback({
      severity: 'info',
      title: 'Supplemental screen removed',
      message: `Removed "${removed?.name ?? 'screen'}" from ${activeDevice.name}.`,
    });
  };

  const handlePlaceAppAt = (app: AppCatalogEntry, col: number, row: number) => {
    const safeIdx = Math.min(activeScreenIndex, activeDevice.screens.length - 1);
    const page = activeDevice.screens[safeIdx];
    const grid = computeOccupancyGrid(page, activeDevice.gridCols, activeDevice.gridRows);
    const slot = canPlaceAt(
      grid,
      activeDevice.gridCols,
      activeDevice.gridRows,
      col,
      row,
      1,
      1
    )
      ? { col, row }
      : findFirstOpenSlot(grid, activeDevice.gridCols, activeDevice.gridRows, 1, 1);

    if (!slot) {
      pushFeedback({
        severity: 'warning',
        title: `No open slots on ${page.name} (${activeDevice.gridCols}×${activeDevice.gridRows})`,
        message: `Could not place "${app.label}" because every cell on ${page.name} is occupied. Add a supplemental screen or expand your grid rows.`,
        code: 'GRID_FULL',
        recoveryActions: [
          {
            id: 'add-screen-and-place-app',
            label: 'Add Supplemental Screen & Place',
            variant: 'primary',
            onClick: () => {
              const nextOrder = activeDevice.screens.length;
              const newIcon = { id: uid('ic'), ...app, col: 0, row: 0 };
              const newPage: HomeScreenPage = {
                id: uid('scr'),
                name: `Supplemental ${nextOrder}`,
                isPrimary: false,
                order: nextOrder,
                icons: [newIcon],
                folders: [],
                widgets: [],
              };
              handleUpdateDevice({
                ...activeDevice,
                screens: [...activeDevice.screens, newPage],
              });
              setActiveScreenIndex(nextOrder);
              setSelection({ type: 'icon', id: newIcon.id });
              pushFeedback({
                severity: 'success',
                title: `Placed ${app.label} on ${newPage.name}`,
                message: `Created "${newPage.name}" and placed ${app.label} at (1, 1).`,
              });
            },
          },
          ...(activeDevice.gridRows < 8
            ? [
                {
                  id: 'expand-row-for-app',
                  label: `Expand Grid to ${activeDevice.gridCols}×${activeDevice.gridRows + 1}`,
                  variant: 'secondary' as const,
                  onClick: () => handleChangeDeviceGrid(activeDevice.gridCols, activeDevice.gridRows + 1),
                },
              ]
            : []),
        ],
      });
      return;
    }

    const newIcon = {
      id: uid('ic'),
      ...app,
      col: slot.col,
      row: slot.row,
    };

    const nextScreens = activeDevice.screens.map((s, idx) =>
      idx === safeIdx ? { ...s, icons: [...s.icons, newIcon] } : s
    );
    handleUpdateDevice({ ...activeDevice, screens: nextScreens });
    setSelection({ type: 'icon', id: newIcon.id });
  };

  const handleCreateFolderAt = (name: string, col: number, row: number) => {
    const safeIdx = Math.min(activeScreenIndex, activeDevice.screens.length - 1);
    const page = activeDevice.screens[safeIdx];
    const grid = computeOccupancyGrid(page, activeDevice.gridCols, activeDevice.gridRows);
    const slot = canPlaceAt(grid, activeDevice.gridCols, activeDevice.gridRows, col, row, 1, 1)
      ? { col, row }
      : findFirstOpenSlot(grid, activeDevice.gridCols, activeDevice.gridRows, 1, 1);

    if (!slot) {
      pushFeedback({
        severity: 'warning',
        title: `No open slots on ${page.name}`,
        message: `Could not create folder "${name}" because ${page.name} is full.`,
        code: 'GRID_FULL',
        recoveryActions: [
          {
            id: 'add-screen-and-create-folder',
            label: 'Add Supplemental Screen & Create',
            variant: 'primary',
            onClick: () => {
              const nextOrder = activeDevice.screens.length;
              const newFolder = {
                id: uid('fld'),
                name,
                col: 0,
                row: 0,
                tint: '#334155',
                apps: [],
              };
              const newPage: HomeScreenPage = {
                id: uid('scr'),
                name: `Supplemental ${nextOrder}`,
                isPrimary: false,
                order: nextOrder,
                icons: [],
                folders: [newFolder],
                widgets: [],
              };
              handleUpdateDevice({
                ...activeDevice,
                screens: [...activeDevice.screens, newPage],
              });
              setActiveScreenIndex(nextOrder);
              setSelection({ type: 'folder', id: newFolder.id });
              pushFeedback({
                severity: 'success',
                title: `Created folder "${name}"`,
                message: `Added "${newPage.name}" and placed folder "${name}" at (1, 1).`,
              });
            },
          },
        ],
      });
      return;
    }

    const newFolder = {
      id: uid('fld'),
      name,
      col: slot.col,
      row: slot.row,
      tint: '#334155',
      apps: [],
    };
    const nextScreens = activeDevice.screens.map((s, idx) =>
      idx === safeIdx ? { ...s, folders: [...s.folders, newFolder] } : s
    );
    handleUpdateDevice({ ...activeDevice, screens: nextScreens });
    setSelection({ type: 'folder', id: newFolder.id });
  };

  const handlePlaceWidgetAt = (template: WidgetTemplate, col: number, row: number) => {
    const safeIdx = Math.min(activeScreenIndex, activeDevice.screens.length - 1);
    const page = activeDevice.screens[safeIdx];
    const spanX = Math.min(template.defaultSpanX, activeDevice.gridCols);
    const spanY = Math.min(template.defaultSpanY, activeDevice.gridRows);
    const grid = computeOccupancyGrid(page, activeDevice.gridCols, activeDevice.gridRows);
    const slot = canPlaceAt(grid, activeDevice.gridCols, activeDevice.gridRows, col, row, spanX, spanY)
      ? { col, row }
      : findFirstOpenSlot(grid, activeDevice.gridCols, activeDevice.gridRows, spanX, spanY);

    if (!slot) {
      pushFeedback({
        severity: 'warning',
        title: `Not enough contiguous space (${spanX}×${spanY}) on ${page.name}`,
        message: `"${template.title}" requires a ${spanX}×${spanY} block of free cells. Add a supplemental screen or expand your grid rows to fit it.`,
        code: 'WIDGET_SPACE_EXHAUSTED',
        recoveryActions: [
          {
            id: 'add-screen-and-place-widget',
            label: 'Add Supplemental Screen & Place',
            variant: 'primary',
            onClick: () => {
              const nextOrder = activeDevice.screens.length;
              const newWidget: WidgetItem = {
                id: uid('w'),
                syncKey: template.syncKey,
                provider: template.provider,
                title: template.title,
                kind: template.kind,
                col: 0,
                row: 0,
                spanX,
                spanY,
                syncEnabled: true,
                updatedAt: new Date().toISOString(),
                updatedByDeviceId: activeDevice.id,
                config: cloneDeep(template.defaultConfig),
              };
              const newPage: HomeScreenPage = {
                id: uid('scr'),
                name: `Supplemental ${nextOrder}`,
                isPrimary: false,
                order: nextOrder,
                icons: [],
                folders: [],
                widgets: [newWidget],
              };
              handleUpdateDevice({
                ...activeDevice,
                screens: [...activeDevice.screens, newPage],
              });
              setActiveScreenIndex(nextOrder);
              setSelection({ type: 'widget', id: newWidget.id });
              pushFeedback({
                severity: 'success',
                title: `Placed "${template.title}" widget`,
                message: `Added "${newPage.name}" and placed the ${spanX}×${spanY} widget at (1, 1).`,
              });
            },
          },
          ...(activeDevice.gridRows < 8
            ? [
                {
                  id: 'expand-row-for-widget',
                  label: `Expand Grid to ${activeDevice.gridCols}×${activeDevice.gridRows + 1}`,
                  variant: 'secondary' as const,
                  onClick: () => handleChangeDeviceGrid(activeDevice.gridCols, activeDevice.gridRows + 1),
                },
              ]
            : []),
        ],
      });
      return;
    }

    const newWidget: WidgetItem = {
      id: uid('w'),
      syncKey: template.syncKey,
      provider: template.provider,
      title: template.title,
      kind: template.kind,
      col: slot.col,
      row: slot.row,
      spanX,
      spanY,
      syncEnabled: true,
      updatedAt: new Date().toISOString(),
      updatedByDeviceId: activeDevice.id,
      config: cloneDeep(template.defaultConfig),
    };

    const nextScreens = activeDevice.screens.map((s, idx) =>
      idx === safeIdx ? { ...s, widgets: [...s.widgets, newWidget] } : s
    );
    handleUpdateDevice({ ...activeDevice, screens: nextScreens });
    setSelection({ type: 'widget', id: newWidget.id });
  };

  const handleExtractAppFromFolder = (folderId: string, appId: string) => {
    const safeIdx = Math.min(activeScreenIndex, activeDevice.screens.length - 1);
    const page = activeDevice.screens[safeIdx];
    const folder = page.folders.find((f) => f.id === folderId);
    const app = folder?.apps.find((a) => a.id === appId);
    if (!folder || !app) return;

    const grid = computeOccupancyGrid(page, activeDevice.gridCols, activeDevice.gridRows);
    const slot = findFirstOpenSlot(grid, activeDevice.gridCols, activeDevice.gridRows, 1, 1);
    if (!slot) {
      pushFeedback({
        severity: 'warning',
        title: `No free slot on ${page.name} to extract ${app.label}`,
        message: `Every cell on ${page.name} is occupied. Add a supplemental screen to move ${app.label} out of "${folder.name}".`,
        code: 'GRID_FULL',
        recoveryActions: [
          {
            id: 'extract-to-new-screen',
            label: 'Add Supplemental Screen & Move',
            variant: 'primary',
            onClick: () => {
              const nextOrder = activeDevice.screens.length;
              const extracted = { ...app, id: uid('ic'), col: 0, row: 0 };
              const newPage: HomeScreenPage = {
                id: uid('scr'),
                name: `Supplemental ${nextOrder}`,
                isPrimary: false,
                order: nextOrder,
                icons: [extracted],
                folders: [],
                widgets: [],
              };
              const nextScreens = activeDevice.screens.map((s, idx) =>
                idx === safeIdx
                  ? {
                      ...s,
                      folders: s.folders.map((f) =>
                        f.id === folderId ? { ...f, apps: f.apps.filter((a) => a.id !== appId) } : f
                      ),
                    }
                  : s
              );
              handleUpdateDevice({
                ...activeDevice,
                screens: [...nextScreens, newPage],
              });
              setActiveScreenIndex(nextOrder);
              setSelection({ type: 'icon', id: extracted.id });
              pushFeedback({
                severity: 'success',
                title: `Moved ${app.label} to ${newPage.name}`,
                message: `Extracted ${app.label} out of "${folder.name}" onto a new supplemental screen.`,
              });
            },
          },
        ],
      });
      return;
    }

    const nextScreens = activeDevice.screens.map((s, idx) => {
      if (idx !== safeIdx) return s;
      return {
        ...s,
        folders: s.folders.map((f) =>
          f.id === folderId ? { ...f, apps: f.apps.filter((a) => a.id !== appId) } : f
        ),
        icons: [
          ...s.icons,
          {
            ...app,
            id: uid('ic'),
            col: slot.col,
            row: slot.row,
          },
        ],
      };
    });
    handleUpdateDevice({ ...activeDevice, screens: nextScreens });
    pushFeedback({
      severity: 'success',
      title: `Extracted ${app.label}`,
      message: `Moved ${app.label} out of "${folder.name}" onto ${page.name}.`,
    });
  };

  const handleUpdateWidgetWithSync = (updatedWidget: WidgetItem, propagate: boolean) => {
    const now = new Date().toISOString();
    const shouldPropagate = propagate || (updatedWidget.syncEnabled && widgetSyncPolicy.autoSyncEnabled);

    if (shouldPropagate) {
      const result = propagateSyncedWidget(devices, updatedWidget, activeDevice.id);
      setDevices(result.devices);
      setWidgetSyncPolicy((prev) => ({ ...prev, lastSyncAt: now }));
      recordLog({
        level: result.pausedDevicesCount > 0 ? 'warn' : 'success',
        category: 'widget',
        title: `Propagated widget "${updatedWidget.title}"`,
        message: `Synced to ${result.syncedDevicesCount} linked device(s); ${result.pausedDevicesCount} paused.`,
      });

      if (result.pausedDevicesCount > 0) {
        pushFeedback({
          severity: 'warning',
          title: `Synced "${updatedWidget.title}" (${result.pausedDevicesCount} device paused)`,
          message: `Updated ${result.syncedDevicesCount + 1} device(s), while ${result.pausedDevicesCount} device(s) have sync paused for this widget.`,
          recoveryActions: [
            {
              id: 'open-widget-sync',
              label: 'Review Widget Sync',
              variant: 'secondary',
              onClick: () => setActiveTab('widgets'),
            },
          ],
        });
      } else if (result.syncedDevicesCount > 0) {
        pushFeedback({
          severity: 'success',
          title: `Synced "${updatedWidget.title}"`,
          message: `Propagated live state across ${result.syncedDevicesCount + 1} Android devices.`,
        });
      }
      return;
    }

    const nextDevices = devices.map((d) => {
      if (d.id !== activeDevice.id) return d;
      return {
        ...d,
        screens: d.screens.map((scr) => ({
          ...scr,
          widgets: scr.widgets.map((w) =>
            w.id === updatedWidget.id ? { ...updatedWidget, updatedAt: now } : w
          ),
        })),
      };
    });
    setDevices(nextDevices);
  };

  const handleSyncWidgetFromMatrix = (widget: WidgetItem, sourceDeviceId: string) => {
    const now = new Date().toISOString();
    const result = propagateSyncedWidget(devices, widget, sourceDeviceId);
    setDevices(result.devices);
    setWidgetSyncPolicy((prev) => ({ ...prev, lastSyncAt: now }));
    recordLog({
      level: result.syncedDevicesCount > 0 ? 'success' : 'warn',
      category: 'widget',
      title: `Matrix sync "${widget.title}"`,
      message: `Applied to ${result.syncedDevicesCount} device(s); ${result.pausedDevicesCount} paused.`,
    });

    if (result.syncedDevicesCount === 0 && result.pausedDevicesCount > 0) {
      pushFeedback({
        severity: 'warning',
        title: `No devices updated for "${widget.title}"`,
        message: `${result.pausedDevicesCount} linked device(s) have sync paused for this widget. Resume sync on those devices to propagate updates.`,
      });
    } else {
      pushFeedback({
        severity: 'success',
        title: `Propagated "${widget.title}"`,
        message: `Synced state to ${result.syncedDevicesCount} linked device${result.syncedDevicesCount === 1 ? '' : 's'}${result.pausedDevicesCount > 0 ? ` (${result.pausedDevicesCount} paused)` : ''}.`,
      });
    }
  };

  const handlePushWidgetToDevice = (targetDeviceId: string, sourceWidget: WidgetItem) => {
    const target = devices.find((d) => d.id === targetDeviceId);
    if (!target) return;
    const updatedTarget = pushWidgetToDevice(target, sourceWidget);
    setDevices((prev) => prev.map((d) => (d.id === targetDeviceId ? updatedTarget : d)));
    setWidgetSyncPolicy((prev) => ({ ...prev, lastSyncAt: new Date().toISOString() }));
    recordLog({
      level: 'success',
      category: 'widget',
      title: `Added widget to ${target.name}`,
      message: `Pushed synced "${sourceWidget.title}" widget onto ${target.name}.`,
    });
    pushFeedback({
      severity: 'success',
      title: `Widget added to ${target.name}`,
      message: `Placed synced "${sourceWidget.title}" widget on ${target.name}.`,
    });
  };

  const handleToggleWidgetSyncOnDevice = (deviceId: string, widgetId: string) => {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== deviceId) return d;
        return {
          ...d,
          screens: d.screens.map((s) => ({
            ...s,
            widgets: s.widgets.map((w) =>
              w.id === widgetId ? { ...w, syncEnabled: !w.syncEnabled } : w
            ),
          })),
        };
      })
    );
  };

  const handleSyncAllWidgetsNow = () => {
    let workingDevices = cloneDeep(devices);
    const latestByKey = new Map<string, { widget: WidgetItem; deviceId: string }>();

    for (const dev of workingDevices) {
      for (const scr of dev.screens) {
        for (const w of scr.widgets) {
          if (!w.syncEnabled) continue;
          const existing = latestByKey.get(w.syncKey);
          if (
            !existing ||
            (widgetSyncPolicy.conflictStrategy === 'primary_device' && dev.id === activeDevice.id) ||
            (widgetSyncPolicy.conflictStrategy !== 'primary_device' &&
              new Date(w.updatedAt) > new Date(existing.widget.updatedAt))
          ) {
            latestByKey.set(w.syncKey, { widget: w, deviceId: dev.id });
          }
        }
      }
    }

    let totalSynced = 0;
    let totalPaused = 0;
    for (const { widget, deviceId } of latestByKey.values()) {
      const res = propagateSyncedWidget(workingDevices, widget, deviceId);
      workingDevices = res.devices;
      totalSynced += res.syncedDevicesCount;
      totalPaused += res.pausedDevicesCount;
    }

    setDevices(workingDevices);
    setWidgetSyncPolicy((prev) => ({ ...prev, lastSyncAt: new Date().toISOString() }));
    recordLog({
      level: 'success',
      category: 'widget',
      title: 'Synced all shared widget groups',
      message: `${latestByKey.size} groups synchronized (${totalSynced} updates, ${totalPaused} paused).`,
    });
    pushFeedback({
      severity: 'success',
      title: 'Widget sync complete',
      message: `Synchronized ${latestByKey.size} shared widget group${latestByKey.size === 1 ? '' : 's'} across ${devices.length} devices (${totalSynced} updates applied${totalPaused > 0 ? `, ${totalPaused} paused` : ''}).`,
    });
  };

  const handleConfirmExport = async ({
    name,
    notes,
    destination,
    includeIconArt,
  }: {
    name: string;
    notes: string;
    destination: 'cloud' | 'local' | 'both';
    includeIconArt: boolean;
  }) => {
    let snapshot = buildBackupSnapshot(activeDevice, {
      name,
      notes,
      storage: destination === 'local' ? 'local' : 'cloud',
      includeIconArt,
    });

    if (faultConfig.corruptBackupChecksumOnExport) {
      snapshot = {
        ...snapshot,
        checksum: 'fnv1a-deadbeef',
      };
    }

    setBackups((prev) => [snapshot, ...prev]);
    setShowExportModal(false);

    if (destination === 'local' || destination === 'both') {
      downloadBackupJson(snapshot);
    }

    if (destination === 'cloud' || destination === 'both') {
      const res = await pushBackupToCloud(snapshot);
      recordLog({
        level: res.ok ? 'success' : 'error',
        category: 'api',
        title: `Export backup "${snapshot.name}"`,
        message: res.ok
          ? `Uploaded to Cloud Vault (${res.latencyMs}ms) · Grid ${snapshot.gridCols}×${snapshot.gridRows} · ${
              includeIconArt ? `Icon art (${snapshot.stats.iconArtCount ?? 0} apps)` : 'Layout only'
            }`
          : res.error ?? 'Cloud upload failed',
        durationMs: res.latencyMs,
        statusCode: res.status,
      });

      if (!res.ok) {
        pushFeedback({
          severity: 'error',
          title: `Cloud backup upload failed for "${snapshot.name}"`,
          message:
            res.error ??
            'The snapshot is kept in your local session, but could not be uploaded to Cloud Vault. Retry upload or save a local JSON file instead.',
          code: res.status ? `HTTP_${res.status}` : 'UPLOAD_FAILED',
          details: `Snapshot ID: ${snapshot.id}\nGrid: ${snapshot.gridCols}×${snapshot.gridRows}\nLatency: ${res.latencyMs}ms`,
          recoveryActions: [
            {
              id: 'retry-upload-backup',
              label: 'Retry Cloud Upload',
              variant: 'primary',
              onClick: async () => {
                const retry = await pushBackupToCloud(snapshot);
                if (retry.ok) {
                  pushFeedback({
                    severity: 'success',
                    title: 'Backup uploaded to Cloud Vault',
                    message: `"${snapshot.name}" is now persisted in Cloud Vault (${retry.latencyMs}ms).`,
                  });
                } else {
                  pushFeedback({
                    severity: 'error',
                    title: 'Retry failed',
                    message: retry.error ?? 'Cloud Vault is still unavailable.',
                    recoveryActions: [
                      {
                        id: 'dl-after-retry-fail',
                        label: 'Download JSON File',
                        variant: 'primary',
                        onClick: () => downloadBackupJson(snapshot),
                      },
                    ],
                  });
                }
              },
            },
            {
              id: 'download-fallback-backup',
              label: 'Download JSON Instead',
              variant: 'secondary',
              onClick: () => downloadBackupJson(snapshot),
            },
          ],
        });
        return;
      }
    } else {
      recordLog({
        level: 'success',
        category: 'vault',
        title: `Exported local JSON "${snapshot.name}"`,
        message: `Grid ${snapshot.gridCols}×${snapshot.gridRows}, ${snapshot.stats.iconCount} icons, ${
          includeIconArt ? `icon art (${snapshot.stats.iconArtCount ?? 0} apps)` : 'layout only'
        }.`,
      });
    }

    if (faultConfig.corruptBackupChecksumOnExport) {
      pushFeedback({
        severity: 'warning',
        title: `Saved "${snapshot.name}" with simulated checksum corruption`,
        message:
          'Fault simulation injected an invalid checksum (fnv1a-deadbeef). Open Developer Tools → Health & Audit to inspect and auto-repair it.',
        code: 'SIMULATED_CHECKSUM_FAULT',
        recoveryActions: [
          {
            id: 'open-auditor-checksum',
            label: 'Open Integrity Auditor',
            variant: 'primary',
            onClick: () => setActiveTab('developer'),
          },
        ],
      });
      return;
    }

    const artSummary = includeIconArt
      ? ` with icon art (${snapshot.stats.iconArtCount ?? 0} apps)`
      : ' (layout only, no icon art)';
    pushFeedback({
      severity: 'success',
      title: `Backup "${snapshot.name}" created`,
      message:
        destination === 'local'
          ? `Downloaded local JSON snapshot (${snapshot.gridCols}×${snapshot.gridRows})${artSummary}.`
          : destination === 'cloud'
          ? `Saved ${snapshot.gridCols}×${snapshot.gridRows} layout snapshot to Cloud Vault${artSummary}.`
          : `Saved to Cloud Vault and downloaded local JSON file (${snapshot.gridCols}×${snapshot.gridRows})${artSummary}.`,
    });
  };

  const handleDeleteBackup = async (backupId: string) => {
    const target = backups.find((b) => b.id === backupId);
    setBackups((prev) => prev.filter((b) => b.id !== backupId));
    const res = await removeBackupFromCloud(backupId);

    recordLog({
      level: res.ok ? 'info' : 'error',
      category: 'api',
      title: `Delete backup "${target?.name ?? backupId}"`,
      message: res.ok
        ? `Removed from Cloud Vault (${res.latencyMs}ms).`
        : res.error ?? 'Failed to delete from Cloud Vault.',
      durationMs: res.latencyMs,
      statusCode: res.status,
    });

    if (!res.ok) {
      pushFeedback({
        severity: 'error',
        title: 'Cloud Vault delete failed',
        message:
          res.error ??
          'Removed locally, but Cloud Vault did not confirm deletion. Retry delete or restore the snapshot.',
        code: res.status ? `HTTP_${res.status}` : 'DELETE_FAILED',
        recoveryActions: [
          {
            id: 'retry-delete-backup',
            label: 'Retry Delete',
            variant: 'primary',
            onClick: () => {
              void handleDeleteBackup(backupId);
            },
          },
          ...(target
            ? [
                {
                  id: 'restore-deleted-backup',
                  label: 'Restore Snapshot',
                  variant: 'secondary' as const,
                  onClick: () => {
                    setBackups((prev) => [target, ...prev.filter((b) => b.id !== target.id)]);
                    pushFeedback({
                      severity: 'info',
                      title: 'Snapshot restored',
                      message: `Restored "${target.name}" back into your backup list.`,
                    });
                  },
                },
              ]
            : []),
        ],
      });
      return;
    }

    pushFeedback({
      severity: 'success',
      title: 'Backup deleted',
      message: `Deleted "${target?.name ?? 'layout snapshot'}" from Cloud Vault.`,
    });
  };

  const handleMarkPackageInstalled = (packageName: string, targetDevId?: string) => {
    const devId = targetDevId ?? activeDevice.id;
    setDevices((prev) =>
      prev.map((d) =>
        d.id === devId ? markPackageInstalledOnDevice(d, packageName) : d
      )
    );
    recordLog({
      level: 'success',
      category: 'restore',
      title: 'Placeholder activated',
      message: `Marked ${packageName} installed on device ${devId}.`,
    });
    pushFeedback({
      severity: 'success',
      title: `${packageName} activated`,
      message: 'Converted placeholder icon into a live Android home-screen shortcut.',
    });
  };

  const handleApplyRestore = ({
    targetDeviceId,
    nextDevice,
    report,
    importedBackup,
    autoDownloadMissingFile,
  }: {
    targetDeviceId: string;
    nextDevice: DeviceProfile;
    report: RestoreDiffReport;
    importedBackup?: LayoutBackupSnapshot;
    autoDownloadMissingFile: boolean;
  }) => {
    const previous = devices.find((d) => d.id === targetDeviceId);
    if (previous) {
      setUndoSnapshot({
        deviceId: targetDeviceId,
        previousDevice: cloneDeep(previous),
        report,
      });
    }

    if (importedBackup) {
      setBackups((prev) => [importedBackup, ...prev.filter((b) => b.id !== importedBackup.id)]);
    }

    setDevices((prev) => prev.map((d) => (d.id === targetDeviceId ? nextDevice : d)));
    setActiveDeviceId(targetDeviceId);
    setActiveScreenIndex(0);
    setSelection({ type: 'screen' });
    setActiveTab('screens');
    setImportModalState({ open: false });

    if (report.missingApps.length > 0) {
      if (autoDownloadMissingFile) {
        downloadMissingAppsFile(
          report.targetDeviceName,
          report.backupName,
          report.missingApps,
          'txt'
        );
      }
      setMissingAppsSession({
        deviceId: targetDeviceId,
        targetDeviceName: report.targetDeviceName,
        backupName: report.backupName,
        missingApps: report.missingApps,
        modalOpen: report.missingAppStrategy === 'guided',
        initialView: report.missingAppStrategy === 'guided' ? 'walkthrough' : 'list',
      });
    } else {
      setMissingAppsSession(null);
    }

    const gridChanged =
      report.sourceGrid.cols !== report.targetGridAfter.cols ||
      report.sourceGrid.rows !== report.targetGridAfter.rows ||
      report.targetGridBefore.cols !== report.targetGridAfter.cols ||
      report.targetGridBefore.rows !== report.targetGridAfter.rows;

    const gridPart = gridChanged
      ? ` · Adapted ${report.sourceGrid.cols}×${report.sourceGrid.rows} → ${report.targetGridAfter.cols}×${report.targetGridAfter.rows} (${report.gridStrategy})`
      : '';
    const artPart =
      report.iconArtImported > 0
        ? ` · ${report.iconArtImported} icon art imported`
        : report.iconArtSkipped
        ? ' · icon art skipped'
        : '';
    const croppedPart =
      report.itemsDroppedByCrop > 0
        ? ` · ${report.itemsDroppedByCrop} out-of-bounds item(s) dropped by Crop mode`
        : '';

    recordLog({
      level: report.itemsDroppedByCrop > 0 ? 'warn' : 'success',
      category: 'restore',
      title: `${report.mode === 'replace' ? 'Replaced' : 'Merged'} layout on ${report.targetDeviceName}`,
      message: `+${report.iconsAdded} live icons, ${report.placeholdersCreated} placeholders, ${report.outOfBoundsRelocated} relocated, ${report.widgetsResized} widgets resized${gridPart}${artPart}${croppedPart}.`,
    });

    pushFeedback({
      severity: report.itemsDroppedByCrop > 0 ? 'warning' : 'success',
      title: `${report.mode === 'replace' ? 'Replaced' : 'Merged'} layout on ${report.targetDeviceName}`,
      message: `Placed +${report.iconsAdded} live icons and ${report.placeholdersCreated} placeholder(s)${gridPart}${artPart}${croppedPart}.`,
      recoveryActions:
        report.itemsDroppedByCrop > 0 && previous
          ? [
              {
                id: 'undo-crop-restore',
                label: 'Undo & Choose Reflow',
                variant: 'primary',
                onClick: () => {
                  setDevices((prev) =>
                    prev.map((d) => (d.id === targetDeviceId ? previous : d))
                  );
                  setUndoSnapshot(null);
                  setImportModalState({ open: true, backupId: importedBackup?.id });
                },
              },
            ]
          : undefined,
    });
  };

  const handleUndoLastRestore = () => {
    if (!undoSnapshot) return;
    setDevices((prev) =>
      prev.map((d) =>
        d.id === undoSnapshot.deviceId ? undoSnapshot.previousDevice : d
      )
    );
    setActiveDeviceId(undoSnapshot.deviceId);
    setActiveScreenIndex(0);
    setSelection({ type: 'screen' });
    setUndoSnapshot(null);
    recordLog({
      level: 'info',
      category: 'restore',
      title: 'Rolled back last restore',
      message: `Restored previous state on ${undoSnapshot.previousDevice.name}.`,
    });
    pushFeedback({
      severity: 'info',
      title: 'Restore rolled back',
      message: `Reverted ${undoSnapshot.previousDevice.name} to its pre-import layout.`,
    });
  };

  // Developer Tools: Auto-Fix Integrity Findings
  const applyFixForFinding = (
    finding: IntegrityFinding,
    currentDevices: DeviceProfile[],
    currentBackups: LayoutBackupSnapshot[]
  ): { nextDevices: DeviceProfile[]; nextBackups: LayoutBackupSnapshot[]; fixed: boolean } => {
    if (
      finding.targetType === 'device' &&
      (finding.category === 'out-of-bounds' || finding.category === 'collision')
    ) {
      let fixed = false;
      const nextDevices = currentDevices.map((dev) => {
        if (dev.id !== finding.targetId) return dev;
        fixed = true;
        return reflowDeviceToGrid(
          dev,
          dev.gridCols,
          dev.gridRows,
          dev.gridDetectionSource ?? 'auto-accessibility'
        ).nextDevice;
      });
      return { nextDevices, nextBackups: currentBackups, fixed };
    }

    if (finding.targetType === 'device' && finding.category === 'stale-placeholder') {
      let fixed = false;
      const nextDevices = currentDevices.map((dev) => {
        if (dev.id !== finding.targetId) return dev;
        let updated = dev;
        for (const pkg of dev.installedPackages) {
          updated = markPackageInstalledOnDevice(updated, pkg);
        }
        fixed = true;
        return updated;
      });
      return { nextDevices, nextBackups: currentBackups, fixed };
    }

    if (finding.targetType === 'backup' && finding.category === 'checksum') {
      let fixed = false;
      const nextBackups = currentBackups.map((bk) => {
        if (bk.id !== finding.targetId) return bk;
        fixed = true;
        return {
          ...bk,
          checksum: computeBackupChecksum(
            bk.screens,
            bk.dock,
            bk.gridCols,
            bk.gridRows,
            bk.iconArtAssets
          ),
        };
      });
      return { nextDevices: currentDevices, nextBackups, fixed };
    }

    return { nextDevices: currentDevices, nextBackups: currentBackups, fixed: false };
  };

  const handleAutoFixFinding = (finding: IntegrityFinding) => {
    const { nextDevices, nextBackups, fixed } = applyFixForFinding(finding, devices, backups);
    if (!fixed) {
      pushFeedback({
        severity: 'warning',
        title: 'Manual review required',
        message: `"${finding.summary}" cannot be auto-fixed automatically.`,
      });
      return;
    }
    setDevices(nextDevices);
    setBackups(nextBackups);
    recordLog({
      level: 'success',
      category: 'system',
      title: 'Auto-fixed integrity finding',
      message: `${finding.targetName}: ${finding.summary}`,
    });
    pushFeedback({
      severity: 'success',
      title: 'Integrity issue resolved',
      message: `Auto-repaired "${finding.summary}" on ${finding.targetName}.`,
    });
  };

  const handleAutoFixAllFindings = (findings: IntegrityFinding[]) => {
    let workingDevices = devices;
    let workingBackups = backups;
    let fixedCount = 0;

    for (const f of findings) {
      if (!f.autoFixable) continue;
      const res = applyFixForFinding(f, workingDevices, workingBackups);
      if (res.fixed) {
        workingDevices = res.nextDevices;
        workingBackups = res.nextBackups;
        fixedCount++;
      }
    }

    setDevices(workingDevices);
    setBackups(workingBackups);
    recordLog({
      level: 'success',
      category: 'system',
      title: 'Batch integrity repair',
      message: `Auto-repaired ${fixedCount} workspace finding(s).`,
    });
    pushFeedback({
      severity: 'success',
      title: `Resolved ${fixedCount} integrity issue${fixedCount === 1 ? '' : 's'}`,
      message: 'All auto-fixable coordinate, placeholder, and checksum findings have been repaired.',
    });
  };

  const handleInjectOutOfBoundsFault = () => {
    const target = activeDevice;
    const faultIcon = {
      id: uid('ic-fault'),
      packageName: 'com.iconsync.test.oob',
      label: 'OOB Fault Test',
      iconKey: 'terminal',
      tint: '#DC2626',
      category: 'Utilities' as const,
      col: target.gridCols + 1,
      row: target.gridRows + 1,
    };

    const nextDevice: DeviceProfile = {
      ...target,
      screens: target.screens.map((s, idx) =>
        idx === 0 ? { ...s, icons: [...s.icons, faultIcon] } : s
      ),
    };
    handleUpdateDevice(nextDevice);
    recordLog({
      level: 'warn',
      category: 'error',
      title: 'Injected out-of-bounds test icon',
      message: `Placed test icon at (${faultIcon.col + 1}, ${faultIcon.row + 1}) on ${target.name} (${target.gridCols}×${target.gridRows}).`,
    });
    pushFeedback({
      severity: 'error',
      title: `Out-of-bounds coordinate fault injected on ${target.name}`,
      message: `A test shortcut was placed at (${faultIcon.col + 1}, ${faultIcon.row + 1}) outside the ${target.gridCols}×${target.gridRows} grid. Use Auto-Fix in the Integrity Auditor to recover safely.`,
      code: 'OOB_COORDINATE_FAULT',
      recoveryActions: [
        {
          id: 'fix-injected-fault',
          label: 'Auto-Reflow Device Grid',
          variant: 'primary',
          onClick: () => handleChangeDeviceGrid(target.gridCols, target.gridRows, target.id),
        },
        {
          id: 'inspect-in-dev',
          label: 'Open Integrity Auditor',
          variant: 'secondary',
          onClick: () => setActiveTab('developer'),
        },
      ],
    });
  };

  const handleClearLocalCache = () => {
    clearLocalStorageCache();
    recordLog({
      level: 'info',
      category: 'vault',
      title: 'Cleared localStorage cache',
      message: 'Removed iconsync.vault.v4 and legacy homegrid.vault.v3 cache keys.',
    });
    pushFeedback({
      severity: 'info',
      title: 'Browser cache cleared',
      message: 'Cleared localStorage cache keys. Your in-memory workspace remains active until reload.',
    });
  };

  const handleResetDemoWorkspace = () => {
    const freshDevices = createInitialDevices();
    const freshBackups = createInitialBackups(freshDevices);
    clearLocalStorageCache();
    setDevices(freshDevices);
    setBackups(freshBackups);
    setActiveDeviceId(freshDevices[0].id);
    setActiveScreenIndex(0);
    setSelection({ type: 'screen' });
    setUndoSnapshot(null);
    setMissingAppsSession(null);
    recordLog({
      level: 'warn',
      category: 'vault',
      title: 'Workspace reset to factory defaults',
      message: `Restored ${freshDevices.length} default devices and ${freshBackups.length} default snapshots.`,
    });
    pushFeedback({
      severity: 'success',
      title: 'Factory demo workspace restored',
      message: `Reset all ${freshDevices.length} devices (including 6×6 Nova Tab S9) and ${freshBackups.length} backup snapshots.`,
    });
  };

  const handleImportRepairedBackup = (backup: LayoutBackupSnapshot) => {
    setBackups((prev) => [backup, ...prev.filter((b) => b.id !== backup.id)]);
    recordLog({
      level: 'success',
      category: 'vault',
      title: `Imported repaired backup "${backup.name}"`,
      message: `Schema v2.0 normalized (${backup.gridCols}×${backup.gridRows}, checksum ${backup.checksum}).`,
    });
    pushFeedback({
      severity: 'success',
      title: `Added repaired backup "${backup.name}"`,
      message: 'Snapshot is now available in your Backups vault and ready to import onto any device.',
      recoveryActions: [
        {
          id: 'restore-repaired-now',
          label: 'Restore Now',
          variant: 'primary',
          onClick: () => setImportModalState({ open: true, backupId: backup.id }),
        },
      ],
    });
  };

  const navItems: {
    id: ActiveTab;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'screens', label: 'Screens', mobileLabel: 'Screens', icon: LayoutGrid },
    { id: 'backups', label: 'Backups', mobileLabel: 'Backups', icon: Cloud },
    { id: 'widgets', label: 'Widget Sync', mobileLabel: 'Widgets', icon: FolderSync },
    { id: 'how-it-works', label: 'Guide', mobileLabel: 'Guide', icon: BookOpen },
    { id: 'developer', label: 'Developer', mobileLabel: 'Dev', icon: Wrench },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F7F9] text-[#111827] pb-16 md:pb-0">
      {/* Top Bar Contract: 3 zones, gap-8, single-line wordmark + 5 concise nav links + 1 primary CTA */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-[#E4E7EC]">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <a
            href="#screens"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('screens');
            }}
            className="font-display text-lg font-bold tracking-tight text-[#111827] whitespace-nowrap shrink-0"
          >
            Icon Sync
          </a>

          {/* Zone 2: Clean single-line navigation links */}
          <nav className="hidden md:flex items-center gap-7 h-full">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative h-full inline-flex items-center text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active ? 'text-[#111827]' : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#166534] rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary CTA button */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Backup Layout
            </button>
          </div>
        </div>
      </header>

      {/* Actionable Success / Warning / Error Feedback Stack */}
      <FeedbackBanner items={feedbackItems} onDismiss={dismissFeedback} />

      {/* Main Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'screens' && (
          <div className="space-y-6">
            {/* Workspace Device & Action Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E4E7EC]">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
                  Home & Supplemental Screen Studio
                </h1>
                <div className="flex items-center gap-2 text-xs text-[#6B7280] mt-1 flex-wrap">
                  <span className="font-medium text-[#374151]">
                    {activeDevice.name}
                    {activeDevice.modelCode ? ` (${activeDevice.modelCode})` : ''}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeDevice.androidVersion}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeDevice.launcher}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums font-semibold text-[#111827]">
                    {activeDevice.gridCols}×{activeDevice.gridRows}
                  </span>
                  <span className="text-[#4B5563]">
                    ({formatGridSourceLabel(activeDevice.gridDetectionSource)})
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {activeDevice.installedPackages.length} installed apps
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Connected Device Segmented Switcher */}
                <div className="flex items-center gap-1 p-1 bg-[#ECEEF2] rounded-lg overflow-x-auto max-w-full">
                  {devices.map((dev) => {
                    const active = dev.id === activeDevice.id;
                    return (
                      <button
                        key={dev.id}
                        type="button"
                        onClick={() => handleSelectDevice(dev.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-white text-[#111827] shadow-xs'
                            : 'text-[#4B5563] hover:text-[#111827]'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        {dev.name}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowAddDeviceModal(true)}
                    title="Register custom phone or Mini Launcher grid"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#166534] hover:bg-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Device
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleScanDevice}
                  disabled={isScanning}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <ScanLine className="w-3.5 h-3.5 text-[#166534]" />
                  {isScanning ? 'Scanning…' : 'Scan Layout'}
                </button>

                <button
                  type="button"
                  onClick={() => setImportModalState({ open: true })}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#111827] hover:bg-[#1F2937] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import / Restore
                </button>
              </div>
            </div>

            {/* Post-restore rollback & missing-apps action bar */}
            {undoSnapshot && (
              <div className="bg-white border border-[#E4E7EC] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-[#374151]">
                  <span className="font-semibold text-[#111827]">
                    {undoSnapshot.report.mode === 'replace' ? 'Layout Replaced' : 'Layout Merged'}
                  </span>{' '}
                  from “{undoSnapshot.report.backupName}” onto {undoSnapshot.report.targetDeviceName} —{' '}
                  <span className="font-mono tabular-nums">
                    {undoSnapshot.report.sourceGrid.cols}×{undoSnapshot.report.sourceGrid.rows} →{' '}
                    {undoSnapshot.report.targetGridAfter.cols}×{undoSnapshot.report.targetGridAfter.rows} · +
                    {undoSnapshot.report.iconsAdded} live · {undoSnapshot.report.placeholdersCreated} placeholders
                    {undoSnapshot.report.outOfBoundsRelocated > 0
                      ? ` · ${undoSnapshot.report.outOfBoundsRelocated} reflowed`
                      : ''}
                    {undoSnapshot.report.widgetsResized > 0
                      ? ` · ${undoSnapshot.report.widgetsResized} widgets resized`
                      : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {missingAppsSession && missingAppsSession.missingApps.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setMissingAppsSession((prev) =>
                            prev ? { ...prev, modalOpen: true, initialView: 'walkthrough' } : null
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <PackageSearch className="w-3.5 h-3.5" />
                        Install Missing Apps ({missingAppsSession.missingApps.length})
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadMissingAppsFile(
                            missingAppsSession.targetDeviceName,
                            missingAppsSession.backupName,
                            missingAppsSession.missingApps,
                            'txt'
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Play Store Links (.txt)
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleUndoLastRestore}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-[#F3F4F6] hover:bg-[#E5E7EB] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Undo Restore
                  </button>
                </div>
              </div>
            )}

            {/* Main 2-Column Studio Grid: Interactive Android Device Canvas + Inspector */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-6 xl:col-span-5 flex justify-center">
                <PhoneCanvas
                  device={activeDevice}
                  activeScreenIndex={activeScreenIndex}
                  selection={selection}
                  isScanning={isScanning}
                  onChangeScreen={setActiveScreenIndex}
                  onAddScreen={handleAddSupplementalScreen}
                  onSelect={setSelection}
                  onQuickWidgetInteract={(w) => handleUpdateWidgetWithSync(w, w.syncEnabled)}
                  onExtractAppFromFolder={handleExtractAppFromFolder}
                  onMarkPackageInstalled={(pkg) => handleMarkPackageInstalled(pkg)}
                />
              </div>

              <div className="lg:col-span-6 xl:col-span-7 space-y-6">
                <InspectorPanel
                  device={activeDevice}
                  activeScreenIndex={activeScreenIndex}
                  selection={selection}
                  onUpdateDevice={handleUpdateDevice}
                  onChangeDeviceGrid={(cols, rows) => handleChangeDeviceGrid(cols, rows)}
                  onAutoDetectGrid={handleAutoDetectGrid}
                  onUpdateWidgetWithSync={handleUpdateWidgetWithSync}
                  onPlaceAppAt={handlePlaceAppAt}
                  onCreateFolderAt={handleCreateFolderAt}
                  onPlaceWidgetAt={handlePlaceWidgetAt}
                  onDeleteScreen={handleDeleteScreen}
                  onMarkPackageInstalled={(pkg) => handleMarkPackageInstalled(pkg)}
                  onSelect={setSelection}
                />

                {/* Quick Cross-Device Summary Strip */}
                <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[#111827]">
                        Quick Migration & Sync Actions
                      </h3>
                      <p className="text-xs text-[#6B7280] mt-0.5">
                        Move this screen layout across different Android grid densities (e.g., 6×6 → 5×4) or propagate widget updates.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setShowExportModal(true)}
                      className="p-3.5 rounded-xl border border-[#E4E7EC] hover:border-[#166534] text-left transition-colors cursor-pointer"
                    >
                      <Cloud className="w-4 h-4 text-[#166534] mb-2" />
                      <p className="text-xs font-semibold text-[#111827]">Export to Cloud / File</p>
                      <p className="text-[11px] text-[#6B7280] mt-0.5">
                        Save screens, folders & grid spec
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setImportModalState({ open: true })}
                      className="p-3.5 rounded-xl border border-[#E4E7EC] hover:border-[#166534] text-left transition-colors cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-[#166534] mb-2" />
                      <p className="text-xs font-semibold text-[#111827]">Cross-Grid Import</p>
                      <p className="text-[11px] text-[#6B7280] mt-0.5">
                        Adapt 6×6 → 5×4 with 5 strategies
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('widgets')}
                      className="p-3.5 rounded-xl border border-[#E4E7EC] hover:border-[#166534] text-left transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4 text-[#166534] mb-2" />
                      <p className="text-xs font-semibold text-[#111827]">Sync App Widgets</p>
                      <p className="text-[11px] text-[#6B7280] mt-0.5">
                        Manage live cross-device state
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab !== 'screens' && (
          <>
            {activeTab === 'backups' && (
              <BackupsView
                backups={backups}
                onOpenImportModal={(backupId) =>
                  setImportModalState({ open: true, backupId })
                }
                onOpenExportModal={() => setShowExportModal(true)}
                onDownloadBackup={downloadBackupJson}
                onDuplicateBackup={handleDuplicateBackup}
                onDeleteBackup={handleDeleteBackup}
              />
            )}

            {activeTab === 'widgets' && (
              <WidgetSyncView
                devices={devices}
                policy={widgetSyncPolicy}
                onUpdatePolicy={setWidgetSyncPolicy}
                onSyncWidgetAcrossDevices={handleSyncWidgetFromMatrix}
                onPushWidgetToDevice={handlePushWidgetToDevice}
                onToggleWidgetSyncOnDevice={handleToggleWidgetSyncOnDevice}
                onSyncAllNow={handleSyncAllWidgetsNow}
              />
            )}

            {activeTab === 'how-it-works' && (
              <HowItWorksView
                onOpenScreens={() => setActiveTab('screens')}
                onOpenImportModal={() => setImportModalState({ open: true })}
                onOpenExportModal={() => setShowExportModal(true)}
                onOpenBackups={() => setActiveTab('backups')}
                onOpenWidgets={() => setActiveTab('widgets')}
              />
            )}

            {activeTab === 'developer' && (
              <DeveloperToolsView
                devices={devices}
                activeDeviceId={activeDevice.id}
                backups={backups}
                widgetSyncPolicy={widgetSyncPolicy}
                logs={logs}
                faultConfig={faultConfig}
                schemaRevision={VAULT_SCHEMA_REVISION}
                onUpdateFaultConfig={handleUpdateFaultConfig}
                onAutoFixFinding={handleAutoFixFinding}
                onAutoFixAllFindings={handleAutoFixAllFindings}
                onInjectOutOfBoundsFault={handleInjectOutOfBoundsFault}
                onForcePushCloud={() => persistCurrentState(devices, backups, widgetSyncPolicy, true)}
                onReloadFromCloud={() => hydrateFromVault(true)}
                onClearLocalCache={handleClearLocalCache}
                onResetDemoWorkspace={handleResetDemoWorkspace}
                onImportRepairedBackup={handleImportRepairedBackup}
                onClearLogs={() => setLogs([])}
                onRecordLog={recordLog}
                onNotify={(severity, title, message) =>
                  pushFeedback({ severity, title, message })
                }
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 backdrop-blur-md border-t border-[#E4E7EC] grid grid-cols-5"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] cursor-pointer ${
                active ? 'text-[#166534]' : 'text-[#6B7280]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Save / Export Layout Modal */}
      {showExportModal && (
        <BackupExportModal
          device={activeDevice}
          onClose={() => setShowExportModal(false)}
          onConfirmExport={handleConfirmExport}
        />
      )}

      {/* Register Custom Device / Mini Launcher Modal */}
      {showAddDeviceModal && (
        <AddDeviceModal
          onClose={() => setShowAddDeviceModal(false)}
          onCreateDevice={handleCreateCustomDevice}
        />
      )}

      {/* Import & Restore (Replace vs Merge + Cross-Grid Strategy) Modal */}
      {importModalState.open && (
        <ImportRestoreModal
          devices={devices}
          initialTargetDeviceId={activeDevice.id}
          backups={backups}
          initialBackupId={importModalState.backupId}
          onClose={() => setImportModalState({ open: false })}
          onApplyRestore={handleApplyRestore}
          onReportTargetGrid={(deviceId, cols, rows) =>
            handleChangeDeviceGrid(cols, rows, deviceId)
          }
          onDownloadSampleBackup={() => {
            const sample = backups[0];
            if (sample) downloadBackupJson(sample);
          }}
        />
      )}

      {/* Post-Import Missing Apps Walkthrough & Play Store Link File Export Modal */}
      {missingAppsSession && missingAppsSession.modalOpen && (
        <MissingAppsModal
          targetDeviceName={missingAppsSession.targetDeviceName}
          backupName={missingAppsSession.backupName}
          missingApps={missingAppsSession.missingApps}
          installedPackages={
            devices.find((d) => d.id === missingAppsSession.deviceId)?.installedPackages ?? []
          }
          initialView={missingAppsSession.initialView}
          onMarkInstalled={(pkg) =>
            handleMarkPackageInstalled(pkg, missingAppsSession.deviceId)
          }
          onDownloadFile={(format) => {
            downloadMissingAppsFile(
              missingAppsSession.targetDeviceName,
              missingAppsSession.backupName,
              missingAppsSession.missingApps,
              format
            );
            pushFeedback({
              severity: 'success',
              title: `Downloaded Play Store install list (.${format})`,
              message: `Saved ${missingAppsSession.missingApps.length} missing app link(s) for ${missingAppsSession.targetDeviceName}.`,
            });
          }}
          onClose={() =>
            setMissingAppsSession((prev) => (prev ? { ...prev, modalOpen: false } : null))
          }
        />
      )}
    </div>
  );
}
