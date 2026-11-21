import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Code2,
  FolderSync,
  LayoutGrid,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import {
  AppCatalogEntry,
  DeviceProfile,
  HomeScreenPage,
  LayoutBackupSnapshot,
  RestoreDiffReport,
  SelectionTarget,
  WidgetItem,
  WidgetSyncPolicy,
} from './types/layout';
import {
  createInitialBackups,
  createInitialDevices,
  WidgetTemplate,
} from './data/catalog';
import {
  buildBackupSnapshot,
  canPlaceAt,
  cloneDeep,
  computeOccupancyGrid,
  findFirstOpenSlot,
  propagateSyncedWidget,
  pushWidgetToDevice,
  uid,
} from './engine/layoutEngine';
import {
  downloadBackupJson,
  loadVaultState,
  persistVaultState,
  pushBackupToCloud,
  removeBackupFromCloud,
} from './services/cloudApi';
import { PhoneCanvas } from './components/PhoneCanvas';
import { InspectorPanel } from './components/InspectorPanel';
import { BackupExportModal } from './components/BackupExportModal';
import { ImportRestoreModal } from './components/ImportRestoreModal';
import { BackupsView } from './components/BackupsView';
import { WidgetSyncView } from './components/WidgetSyncView';
import { CompanionView } from './components/CompanionView';

type ActiveTab = 'screens' | 'backups' | 'widgets' | 'companion';

interface UndoSnapshot {
  deviceId: string;
  previousDevice: DeviceProfile;
  report: RestoreDiffReport;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('screens');
  const [devices, setDevices] = useState<DeviceProfile[]>(() => createInitialDevices());
  const [backups, setBackups] = useState<LayoutBackupSnapshot[]>(() =>
    createInitialBackups(createInitialDevices())
  );
  const [widgetSyncPolicy, setWidgetSyncPolicy] = useState<WidgetSyncPolicy>({
    conflictStrategy: 'newest',
    autoSyncEnabled: true,
    lastSyncAt: '2026-11-21T07:02:00.000Z',
  });

  const [activeDeviceId, setActiveDeviceId] = useState<string>('dev-pixel-9-pro');
  const [activeScreenIndex, setActiveScreenIndex] = useState<number>(0);
  const [selection, setSelection] = useState<SelectionTarget>({ type: 'screen' });
  const [isScanning, setIsScanning] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [importModalState, setImportModalState] = useState<{
    open: boolean;
    backupId?: string;
  }>({ open: false });

  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const noticeTimerRef = useRef<number | null>(null);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
    }, 5000);
  };

  // Load persisted Cloud Vault state on startup
  useEffect(() => {
    let active = true;
    loadVaultState().then(({ state }) => {
      if (!active) return;
      if (state) {
        setDevices(state.devices);
        setBackups(state.backups);
        if (state.widgetSyncPolicy) {
          setWidgetSyncPolicy(state.widgetSyncPolicy);
        }
        if (state.devices[0]) {
          setActiveDeviceId(state.devices[0].id);
        }
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Auto-persist changes to Express Cloud Vault + localStorage after hydration
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void persistVaultState({
        devices,
        backups,
        widgetSyncPolicy,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [devices, backups, widgetSyncPolicy, hydrated]);

  const activeDevice =
    devices.find((d) => d.id === activeDeviceId) ?? devices[0];

  const handleSelectDevice = (deviceId: string) => {
    setActiveDeviceId(deviceId);
    setActiveScreenIndex(0);
    setSelection({ type: 'screen' });
  };

  const handleUpdateDevice = (nextDevice: DeviceProfile) => {
    setDevices((prev) => prev.map((d) => (d.id === nextDevice.id ? nextDevice : d)));
  };

  const handleScanDevice = () => {
    if (isScanning) return;
    setIsScanning(true);
    window.setTimeout(() => {
      const scannedAt = new Date().toISOString();
      const updated = { ...activeDevice, lastScannedAt: scannedAt };
      handleUpdateDevice(updated);
      setIsScanning(false);

      const iconCount = updated.screens.reduce(
        (sum, s) => sum + s.icons.length + s.folders.reduce((fs, f) => fs + f.apps.length, 0),
        0
      );
      const folderCount = updated.screens.reduce((sum, s) => sum + s.folders.length, 0);
      const widgetCount = updated.screens.reduce((sum, s) => sum + s.widgets.length, 0);
      showNotice(
        `Scanned ${updated.name}: ${updated.screens.length} screens, ${iconCount} icons, ${folderCount} folders, ${widgetCount} widgets.`
      );
    }, 1250);
  };

  const handleAddSupplementalScreen = () => {
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
    showNotice(`Added supplemental screen "${newPage.name}" to ${activeDevice.name}.`);
  };

  const handleDeleteScreen = (screenId: string) => {
    if (activeDevice.screens.length <= 1) return;
    const remaining = activeDevice.screens
      .filter((s) => s.id !== screenId)
      .map((s, idx) => ({ ...s, order: idx, isPrimary: idx === 0 }));
    handleUpdateDevice({ ...activeDevice, screens: remaining });
    setActiveScreenIndex(0);
    setSelection({ type: 'screen', id: remaining[0]?.id });
  };

  const handlePlaceAppAt = (app: AppCatalogEntry, col: number, row: number) => {
    const safeIdx = Math.min(activeScreenIndex, activeDevice.screens.length - 1);
    const page = activeDevice.screens[safeIdx];
    const grid = computeOccupancyGrid(page, activeDevice.gridCols, activeDevice.gridRows);
    let slot: { col: number; row: number } | null = canPlaceAt(
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
      showNotice('Current screen is full. Add a supplemental screen to place more icons.');
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
      showNotice('Current screen is full. Add a supplemental screen to create a new folder.');
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
      showNotice(`Not enough contiguous space (${spanX}×${spanY}) on ${page.name}. Try adding a supplemental screen.`);
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
      showNotice('No free slot on this screen to extract the app from its folder.');
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
    showNotice(`Moved ${app.label} out of ${folder.name} onto ${page.name}.`);
  };

  const handleUpdateWidgetWithSync = (updatedWidget: WidgetItem, propagate: boolean) => {
    const now = new Date().toISOString();
    const shouldPropagate = propagate || (updatedWidget.syncEnabled && widgetSyncPolicy.autoSyncEnabled);

    if (shouldPropagate) {
      const result = propagateSyncedWidget(devices, updatedWidget, activeDevice.id);
      setDevices(result.devices);
      setWidgetSyncPolicy((prev) => ({ ...prev, lastSyncAt: now }));
      if (result.syncedDevicesCount > 0) {
        showNotice(
          `Synced "${updatedWidget.title}" across ${result.syncedDevicesCount + 1} Android devices.`
        );
      }
      return;
    }

    // Local update only
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
    showNotice(
      `Propagated "${widget.title}" state to ${result.syncedDevicesCount} linked device${result.syncedDevicesCount === 1 ? '' : 's'}.`
    );
  };

  const handlePushWidgetToDevice = (targetDeviceId: string, sourceWidget: WidgetItem) => {
    const target = devices.find((d) => d.id === targetDeviceId);
    if (!target) return;
    const updatedTarget = pushWidgetToDevice(target, sourceWidget);
    setDevices((prev) => prev.map((d) => (d.id === targetDeviceId ? updatedTarget : d)));
    setWidgetSyncPolicy((prev) => ({ ...prev, lastSyncAt: new Date().toISOString() }));
    showNotice(`Added synced "${sourceWidget.title}" widget to ${target.name}.`);
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
    for (const { widget, deviceId } of latestByKey.values()) {
      const res = propagateSyncedWidget(workingDevices, widget, deviceId);
      workingDevices = res.devices;
      totalSynced += res.syncedDevicesCount;
    }

    setDevices(workingDevices);
    setWidgetSyncPolicy((prev) => ({ ...prev, lastSyncAt: new Date().toISOString() }));
    showNotice(
      `Synchronized ${latestByKey.size} shared widget group${latestByKey.size === 1 ? '' : 's'} across ${devices.length} devices (${totalSynced} updates applied).`
    );
  };

  const handleConfirmExport = async ({
    name,
    notes,
    destination,
  }: {
    name: string;
    notes: string;
    destination: 'cloud' | 'local' | 'both';
  }) => {
    const snapshot = buildBackupSnapshot(activeDevice, {
      name,
      notes,
      storage: destination === 'local' ? 'local' : 'cloud',
    });

    setBackups((prev) => [snapshot, ...prev]);

    if (destination === 'cloud' || destination === 'both') {
      await pushBackupToCloud(snapshot);
    }
    if (destination === 'local' || destination === 'both') {
      downloadBackupJson(snapshot);
    }

    setShowExportModal(false);
    showNotice(
      destination === 'local'
        ? `Exported "${snapshot.name}" as a local JSON backup file.`
        : destination === 'cloud'
        ? `Saved "${snapshot.name}" to Cloud Vault.`
        : `Saved "${snapshot.name}" to Cloud Vault and downloaded JSON file.`
    );
  };

  const handleDeleteBackup = async (backupId: string) => {
    setBackups((prev) => prev.filter((b) => b.id !== backupId));
    await removeBackupFromCloud(backupId);
    showNotice('Deleted layout backup snapshot.');
  };

  const handleApplyRestore = ({
    targetDeviceId,
    nextDevice,
    report,
    importedBackup,
  }: {
    targetDeviceId: string;
    nextDevice: DeviceProfile;
    report: RestoreDiffReport;
    importedBackup?: LayoutBackupSnapshot;
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

    const verb = report.mode === 'replace' ? 'Replaced' : 'Merged';
    showNotice(
      `${verb} layout on ${report.targetDeviceName}: +${report.iconsAdded} icons, ${report.foldersCreated} new / ${report.foldersMerged} merged folders, ${report.widgetsPlaced + report.widgetsUpdated} widgets.`
    );
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
    showNotice(`Restored previous layout snapshot on ${undoSnapshot.previousDevice.name}.`);
  };

  const navItems: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'screens', label: 'Screens', icon: LayoutGrid },
    { id: 'backups', label: 'Backups', icon: Cloud },
    { id: 'widgets', label: 'Widget Sync', icon: FolderSync },
    { id: 'companion', label: 'Kotlin Code', icon: Code2 },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F7F9] text-[#111827] pb-16 md:pb-0">
      {/* Top Bar Contract: 3 zones, gap-8, single-line wordmark + 4 nav links + 1 primary CTA */}
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
            HomeGrid
          </a>

          {/* Zone 2: 4 clean single-line navigation links */}
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

      {/* Contextual feedback toast bar (only visible after real user action) */}
      {notice && (
        <div className="bg-[#111827] text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">{notice}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
              className="text-white/70 hover:text-white shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
                  <span className="font-medium text-[#374151]">{activeDevice.name}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeDevice.androidVersion}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeDevice.launcher}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {activeDevice.gridCols}×{activeDevice.gridRows}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Last scanned{' '}
                    {new Date(activeDevice.lastScannedAt).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Connected Device Segmented Switcher */}
                <div className="flex items-center gap-1 p-1 bg-[#ECEEF2] rounded-lg">
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

            {/* Post-restore rollback bar if a Replace or Merge was just applied */}
            {undoSnapshot && (
              <div className="bg-white border border-[#E4E7EC] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-[#374151]">
                  <span className="font-semibold text-[#111827]">
                    {undoSnapshot.report.mode === 'replace' ? 'Layout Replaced' : 'Layout Merged'}
                  </span>{' '}
                  from “{undoSnapshot.report.backupName}” onto {undoSnapshot.report.targetDeviceName} —{' '}
                  <span className="font-mono tabular-nums">
                    +{undoSnapshot.report.iconsAdded} icons · {undoSnapshot.report.foldersCreated} new / {undoSnapshot.report.foldersMerged} merged folders · {undoSnapshot.report.widgetsPlaced + undoSnapshot.report.widgetsUpdated} widgets
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleUndoLastRestore}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-[#F3F4F6] hover:bg-[#E5E7EB] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Undo Restore
                </button>
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
                />
              </div>

              <div className="lg:col-span-6 xl:col-span-7 space-y-6">
                <InspectorPanel
                  device={activeDevice}
                  activeScreenIndex={activeScreenIndex}
                  selection={selection}
                  onUpdateDevice={handleUpdateDevice}
                  onUpdateWidgetWithSync={handleUpdateWidgetWithSync}
                  onPlaceAppAt={handlePlaceAppAt}
                  onCreateFolderAt={handleCreateFolderAt}
                  onPlaceWidgetAt={handlePlaceWidgetAt}
                  onDeleteScreen={handleDeleteScreen}
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
                        Move this screen layout to another Android device or propagate widget updates.
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
                        Save screens, folders & widgets
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setImportModalState({ open: true })}
                      className="p-3.5 rounded-xl border border-[#E4E7EC] hover:border-[#166534] text-left transition-colors cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-[#166534] mb-2" />
                      <p className="text-xs font-semibold text-[#111827]">Replace or Merge</p>
                      <p className="text-[11px] text-[#6B7280] mt-0.5">
                        Import backup with diff preview
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

        {activeTab === 'backups' && (
          <BackupsView
            backups={backups}
            onOpenImportModal={(backupId) =>
              setImportModalState({ open: true, backupId })
            }
            onOpenExportModal={() => setShowExportModal(true)}
            onDownloadBackup={downloadBackupJson}
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

        {activeTab === 'companion' && <CompanionView />}
      </main>

      {/* Mobile Bottom Navigation Bar (compact h-14, keeps total sticky chrome well under 15% of viewport) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 backdrop-blur-md border-t border-[#E4E7EC] grid grid-cols-4"
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
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
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

      {/* Import & Restore (Replace vs Merge) Modal */}
      {importModalState.open && (
        <ImportRestoreModal
          devices={devices}
          initialTargetDeviceId={activeDevice.id}
          backups={backups}
          initialBackupId={importModalState.backupId}
          onClose={() => setImportModalState({ open: false })}
          onApplyRestore={handleApplyRestore}
        />
      )}
    </div>
  );
}
