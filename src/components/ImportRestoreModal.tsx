import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  GitMerge,
  Grid2x2Check,
  Image as ImageIcon,
  Layers,
  PackageSearch,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import {
  DeviceProfile,
  GridAdaptationStrategy,
  LayoutBackupSnapshot,
  MergeOptions,
  MissingAppStrategy,
  RestoreDiffReport,
  RestoreMode,
} from '../types/layout';
import {
  analyzeGridCompatibility,
  backupIncludesIconArt,
  computeRestoreResult,
  formatGridSourceLabel,
  getBackupIconArtCount,
  repairBackupPayload,
  validateBackupPayload,
} from '../engine/layoutEngine';

interface ImportRestoreModalProps {
  devices: DeviceProfile[];
  initialTargetDeviceId: string;
  backups: LayoutBackupSnapshot[];
  initialBackupId?: string;
  onClose: () => void;
  onApplyRestore: (payload: {
    targetDeviceId: string;
    nextDevice: DeviceProfile;
    report: RestoreDiffReport;
    importedBackup?: LayoutBackupSnapshot;
    autoDownloadMissingFile: boolean;
  }) => void;
  onReportTargetGrid?: (deviceId: string, cols: number, rows: number) => void;
  onDownloadSampleBackup?: () => void;
}

const GRID_STRATEGIES: {
  id: GridAdaptationStrategy;
  title: string;
  desc: string;
}[] = [
  {
    id: 'auto-reflow',
    title: 'Auto-Reflow & Overflow',
    desc: 'Preserves reading order, resizes wide widgets to fit, and spills extra icons onto a new supplemental screen (zero loss).',
  },
  {
    id: 'proportional-scale',
    title: 'Proportional Spatial Scale',
    desc: 'Maps corner and edge positions proportionally from source to target grid so muscle memory stays close.',
  },
  {
    id: 'preserve-pages',
    title: 'Split Per Source Page',
    desc: 'Keeps each dense backup page separate by splitting overflow into "Part 1 / Part 2" sibling pages.',
  },
  {
    id: 'resize-target-grid',
    title: 'Resize Target Grid to Match',
    desc: 'Switches the target device grid to match the backup dimensions for a 1:1 coordinate restore.',
  },
  {
    id: 'crop-within-bounds',
    title: 'Strict Bounds (Crop Excess)',
    desc: 'Restores only items within the target grid dimensions and drops out-of-bounds slots without adding pages.',
  },
];

export function ImportRestoreModal({
  devices,
  initialTargetDeviceId,
  backups,
  initialBackupId,
  onClose,
  onApplyRestore,
  onReportTargetGrid,
  onDownloadSampleBackup,
}: ImportRestoreModalProps) {
  const [sourceTab, setSourceTab] = useState<'cloud' | 'file'>(
    initialBackupId || backups.length > 0 ? 'cloud' : 'file'
  );
  const [selectedBackupId, setSelectedBackupId] = useState<string>(
    initialBackupId ?? backups[0]?.id ?? ''
  );
  const [uploadedBackup, setUploadedBackup] = useState<LayoutBackupSnapshot | null>(null);
  const [rawFailedPayload, setRawFailedPayload] = useState<unknown>(null);
  const [uploadError, setUploadError] = useState<{
    message: string;
    repairable: boolean;
    code?: string;
  } | null>(null);
  const [uploadRepairNote, setUploadRepairNote] = useState<string | null>(null);

  const [targetDeviceId, setTargetDeviceId] = useState<string>(initialTargetDeviceId);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [autoDownloadMissingFile, setAutoDownloadMissingFile] = useState<boolean>(true);
  const [showInlineGridReport, setShowInlineGridReport] = useState(false);

  const [mergeOptions, setMergeOptions] = useState<MergeOptions>({
    deduplicateApps: true,
    mergeMatchingFolders: true,
    syncWidgetsOnImport: true,
    overflowToNewScreen: true,
    missingAppStrategy: 'guided',
    gridStrategy: 'auto-reflow',
    importIconArt: true,
  });

  const [strategyOverride, setStrategyOverride] = useState<{
    pairKey: string;
    strategy: GridAdaptationStrategy;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeBackup: LayoutBackupSnapshot | undefined =
    sourceTab === 'file'
      ? uploadedBackup ?? undefined
      : backups.find((b) => b.id === selectedBackupId) ?? backups[0];

  const effectiveSelectedBackupId = activeBackup?.id ?? selectedBackupId;
  const targetDevice = devices.find((d) => d.id === targetDeviceId) ?? devices[0];

  const backupHasIconArt = useMemo(
    () => backupIncludesIconArt(activeBackup),
    [activeBackup]
  );
  const backupIconArtCount = useMemo(
    () => getBackupIconArtCount(activeBackup),
    [activeBackup]
  );
  const effectiveImportIconArt = backupHasIconArt && (mergeOptions.importIconArt ?? true);

  const gridAnalysis = useMemo(() => {
    if (!activeBackup || !targetDevice) return null;
    return analyzeGridCompatibility(targetDevice, activeBackup);
  }, [activeBackup, targetDevice]);

  const pairKey =
    activeBackup && targetDevice
      ? `${activeBackup.id}:${targetDevice.id}:${targetDevice.gridCols}x${targetDevice.gridRows}`
      : '';
  const recommendedStrategy: GridAdaptationStrategy = gridAnalysis
    ? gridAnalysis.isExactMatch
      ? 'auto-reflow'
      : gridAnalysis.recommendedStrategy
    : 'auto-reflow';
  const effectiveGridStrategy: GridAdaptationStrategy =
    strategyOverride && strategyOverride.pairKey === pairKey
      ? strategyOverride.strategy
      : recommendedStrategy;

  const preview = useMemo(() => {
    if (!activeBackup || !targetDevice) return null;
    return computeRestoreResult(targetDevice, activeBackup, mode, {
      ...mergeOptions,
      gridStrategy: effectiveGridStrategy,
      importIconArt: effectiveImportIconArt,
    });
  }, [
    activeBackup,
    targetDevice,
    mode,
    mergeOptions,
    effectiveGridStrategy,
    effectiveImportIconArt,
  ]);

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploadRepairNote(null);
    setRawFailedPayload(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = validateBackupPayload(parsed);
      if (!result.valid || !result.backup) {
        setUploadError({
          message: result.error ?? 'Invalid backup file.',
          repairable: Boolean(result.repairable),
          code: result.errorCode,
        });
        setRawFailedPayload(parsed);
        setUploadedBackup(null);
        return;
      }
      setUploadedBackup(result.backup);
      if (result.warnings && result.warnings.length > 0) {
        setUploadRepairNote(result.warnings.join(' '));
      }
      setSourceTab('file');
    } catch {
      setUploadError({
        message: 'Could not parse JSON file. Select a valid Icon Sync .json layout backup.',
        repairable: false,
        code: 'SYNTAX',
      });
      setUploadedBackup(null);
    }
  };

  const handleRepairUploadedFile = () => {
    if (!rawFailedPayload) return;
    const repaired = repairBackupPayload(rawFailedPayload);
    if (repaired.repaired && repaired.backup) {
      setUploadedBackup(repaired.backup);
      setUploadError(null);
      setRawFailedPayload(null);
      setUploadRepairNote(`Auto-repaired backup: ${repaired.changes.join(' · ')}.`);
    } else {
      setUploadError({
        message: repaired.error ?? 'Auto-repair could not recover this file.',
        repairable: false,
      });
    }
  };

  const handleApply = () => {
    if (!preview || !targetDevice) return;
    onApplyRestore({
      targetDeviceId: targetDevice.id,
      nextDevice: preview.nextDevice,
      report: preview.report,
      importedBackup: sourceTab === 'file' && uploadedBackup ? uploadedBackup : undefined,
      autoDownloadMissingFile: autoDownloadMissingFile && preview.report.missingApps.length > 0,
    });
  };

  const missingStrategies: {
    id: MissingAppStrategy;
    title: string;
    desc: string;
  }[] = [
    {
      id: 'guided',
      title: 'Placeholders + Guided Install',
      desc: 'Place dummy icons in exact slots and step through Play Store installs right after import.',
    },
    {
      id: 'placeholder',
      title: 'Dummy Placeholder Icons',
      desc: 'Hold each missing app’s slot with a dimmed placeholder icon until you install it later.',
    },
    {
      id: 'skip',
      title: 'Skip Uninstalled Apps',
      desc: 'Only restore already-installed apps while still exporting a Play Store link checklist.',
    },
  ];

  const missingCount = preview?.report.missingApps.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#111827]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white border border-[#E4E7EC] rounded-2xl shadow-xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#F1F3F6] flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#111827]">
              Import & Restore Home Screen Layout
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Choose Replace or Merge mode, resolve any cross-grid differences, and handle uninstalled apps.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import modal"
            className="w-9 h-9 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] hover:text-[#111827] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Step 1: Backup Source & Target Device */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="backup-source-select" className="text-xs font-semibold text-[#111827]">
                  1. Backup Source
                </label>
                <div className="flex items-center gap-1 p-0.5 bg-[#F3F4F6] rounded-md">
                  <button
                    type="button"
                    onClick={() => setSourceTab('cloud')}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      sourceTab === 'cloud'
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#6B7280]'
                    }`}
                  >
                    Cloud Vault
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceTab('file')}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      sourceTab === 'file'
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#6B7280]'
                    }`}
                  >
                    Local File
                  </button>
                </div>
              </div>

              {sourceTab === 'cloud' ? (
                <div className="space-y-1.5">
                  <select
                    id="backup-source-select"
                    value={effectiveSelectedBackupId}
                    onChange={(e) => setSelectedBackupId(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
                  >
                    {backups.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.gridCols}×{b.gridRows})
                      </option>
                    ))}
                  </select>
                  {activeBackup && (
                    <p className="text-[11px] text-[#6B7280] flex items-center gap-1.5 flex-wrap">
                      <span>{activeBackup.sourceDeviceName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeBackup.sourceLauncher}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {activeBackup.gridCols}×{activeBackup.gridRows}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => handleFileSelected(e.target.files?.[0])}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-3.5 py-2.5 text-xs font-medium text-[#374151] bg-[#F9FAFB] hover:bg-[#F3F4F6] border border-dashed border-[#CBD5E1] rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#166534]" />
                    {uploadedBackup ? uploadedBackup.name : 'Choose Icon Sync .json Backup'}
                  </button>
                  {uploadError && (
                    <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] space-y-2">
                      <p className="text-[11px] text-[#991B1B] flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#DC2626]" />
                        <span>{uploadError.message}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {uploadError.repairable && (
                          <button
                            type="button"
                            onClick={handleRepairUploadedFile}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-[#111827] hover:bg-[#1F2937] rounded-md cursor-pointer"
                          >
                            <Wrench className="w-3 h-3" />
                            Auto-Repair & Normalize
                          </button>
                        )}
                        {onDownloadSampleBackup && (
                          <button
                            type="button"
                            onClick={onDownloadSampleBackup}
                            className="px-2.5 py-1 text-[11px] font-medium text-[#374151] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-md cursor-pointer"
                          >
                            Download Valid Sample (.json)
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {uploadRepairNote && (
                    <p className="text-[11px] text-[#166534] bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg px-3 py-2">
                      {uploadRepairNote}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-[#111827]">
                  2. Target Android Device
                </label>
                {onReportTargetGrid && (
                  <button
                    type="button"
                    onClick={() => setShowInlineGridReport((v) => !v)}
                    className="text-[11px] font-medium text-[#166534] hover:underline cursor-pointer"
                  >
                    {showInlineGridReport ? 'Hide grid override' : 'Report custom grid'}
                  </button>
                )}
              </div>
              <select
                value={targetDeviceId}
                onChange={(e) => setTargetDeviceId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.gridCols}×{d.gridRows} ({d.installedPackages.length} installed)
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[#6B7280] flex items-center gap-1.5 flex-wrap">
                <span>{targetDevice.launcher}</span>
                <span aria-hidden="true">·</span>
                <span>{formatGridSourceLabel(targetDevice.gridDetectionSource)}</span>
              </p>

              {showInlineGridReport && onReportTargetGrid && (
                <div className="p-2.5 rounded-lg bg-[#F9FAFB] border border-[#E4E7EC] flex items-center gap-2 text-xs">
                  <span className="text-[#4B5563] shrink-0">Actual grid:</span>
                  <select
                    aria-label="Target columns"
                    value={targetDevice.gridCols}
                    onChange={(e) =>
                      onReportTargetGrid(targetDevice.id, Number(e.target.value), targetDevice.gridRows)
                    }
                    className="px-2 py-1 bg-white border border-[#E4E7EC] rounded font-mono text-xs"
                  >
                    {[3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} cols
                      </option>
                    ))}
                  </select>
                  <span className="text-[#6B7280]">×</span>
                  <select
                    aria-label="Target rows"
                    value={targetDevice.gridRows}
                    onChange={(e) =>
                      onReportTargetGrid(targetDevice.id, targetDevice.gridCols, Number(e.target.value))
                    }
                    className="px-2 py-1 bg-white border border-[#E4E7EC] rounded font-mono text-xs"
                  >
                    {[3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} rows
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Step 2.5: Cross-Grid Mismatch Resolution (e.g., 6×6 → 5×4) */}
          {gridAnalysis && !gridAnalysis.isExactMatch && (
            <div className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-[#111827]">
                      Grid Configuration Mismatch: {gridAnalysis.sourceGrid.cols}×{gridAnalysis.sourceGrid.rows} → {gridAnalysis.targetGrid.cols}×{gridAnalysis.targetGrid.rows}
                    </p>
                    <p className="text-xs text-[#78350F] mt-0.5 leading-relaxed">
                      {gridAnalysis.summary}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-[#92400E] whitespace-nowrap shrink-0">
                  {gridAnalysis.sourceCellsPerPage} → {gridAnalysis.targetCellsPerPage} cells/page
                </span>
              </div>

              {/* Impact metrics row */}
              <div className="grid grid-cols-3 gap-2.5 text-xs bg-white/80 rounded-lg p-2.5 border border-[#FDE68A]/80">
                <div>
                  <span className="text-[#6B7280] block text-[11px]">Out-of-bounds items</span>
                  <span className="font-mono font-semibold tabular-nums text-[#111827]">
                    {gridAnalysis.totalAffectedItems} ({gridAnalysis.outOfBoundsIcons} icons · {gridAnalysis.outOfBoundsFolders} folders)
                  </span>
                </div>
                <div>
                  <span className="text-[#6B7280] block text-[11px]">Widgets needing resize</span>
                  <span className="font-mono font-semibold tabular-nums text-[#111827]">
                    {gridAnalysis.widgetsRequiringResize}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B7280] block text-[11px]">Target launcher resize</span>
                  <span className="font-medium text-[#111827]">
                    {gridAnalysis.canResizeTargetLauncher ? 'Supported natively' : 'Not supported'}
                  </span>
                </div>
              </div>

              {/* Strategy picker */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-[#78350F]">
                  Choose how to adapt {gridAnalysis.sourceGrid.cols}×{gridAnalysis.sourceGrid.rows} onto {gridAnalysis.targetGrid.cols}×{gridAnalysis.targetGrid.rows}:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {GRID_STRATEGIES.map((st) => {
                    const active = effectiveGridStrategy === st.id;
                    const disabled =
                      st.id === 'resize-target-grid' && !gridAnalysis.canResizeTargetLauncher;
                    const isRecommended = gridAnalysis.recommendedStrategy === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          setStrategyOverride({ pairKey, strategy: st.id })
                        }
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          disabled
                            ? 'bg-white/40 border-[#E5E7EB] opacity-55 cursor-not-allowed'
                            : active
                            ? 'bg-white border-[#166534] ring-1 ring-[#166534]/20 cursor-pointer'
                            : 'bg-white/80 border-[#FDE68A] hover:border-[#B45309] cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#111827]">{st.title}</span>
                          {isRecommended && !disabled && (
                            <span className="text-[10px] font-semibold text-[#166534]">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#4B5563] mt-1 leading-snug">
                          {disabled ? gridAnalysis.resizeTargetReason : st.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {gridAnalysis && gridAnalysis.isExactMatch && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] flex items-center gap-2 text-xs text-[#14532D]">
              <Grid2x2Check className="w-4 h-4 text-[#166534] shrink-0" />
              <span>
                Exact <span className="font-mono font-semibold">{gridAnalysis.targetGrid.cols}×{gridAnalysis.targetGrid.rows}</span> grid match — all coordinates and widget spans restore 1:1.
              </span>
            </div>
          )}

          {/* Step 3: Replace vs Merge Strategy */}
          <div>
            <p className="text-xs font-semibold text-[#111827] mb-2.5">
              3. Restoration Mode
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('replace')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  mode === 'replace'
                    ? 'border-[#166534] bg-[#166534]/5 ring-1 ring-[#166534]/20'
                    : 'border-[#E4E7EC] hover:border-[#9CA3AF]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Layers
                    className={`w-4 h-4 ${
                      mode === 'replace' ? 'text-[#166534]' : 'text-[#6B7280]'
                    }`}
                  />
                  <span className="text-sm font-semibold text-[#111827]">
                    Replace Current Layout
                  </span>
                </div>
                <p className="text-xs text-[#4B5563] leading-relaxed">
                  Clears existing screens, folders, and widgets on {targetDevice.name} and rebuilds the backup layout using your chosen grid strategy.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('merge')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  mode === 'merge'
                    ? 'border-[#166534] bg-[#166534]/5 ring-1 ring-[#166534]/20'
                    : 'border-[#E4E7EC] hover:border-[#9CA3AF]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <GitMerge
                    className={`w-4 h-4 ${
                      mode === 'merge' ? 'text-[#166534]' : 'text-[#6B7280]'
                    }`}
                  />
                  <span className="text-sm font-semibold text-[#111827]">
                    Merge with Current Layout
                  </span>
                </div>
                <p className="text-xs text-[#4B5563] leading-relaxed">
                  Preserves existing screens on {targetDevice.name}, deduplicates apps, merges identically named folders, and places additions in open slots.
                </p>
              </button>
            </div>
          </div>

          {/* Step 4: Missing / Uninstalled Apps Handling */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#111827]">
                4. Uninstalled Apps on {targetDevice.name}
              </p>
              <span className="text-xs font-mono tabular-nums text-[#4B5563]">
                {missingCount === 0
                  ? 'All backup apps installed'
                  : `${missingCount} app${missingCount === 1 ? '' : 's'} not installed`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {missingStrategies.map((st) => {
                const active = mergeOptions.missingAppStrategy === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() =>
                      setMergeOptions((prev) => ({ ...prev, missingAppStrategy: st.id }))
                    }
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-[#166534] bg-[#166534]/5'
                        : 'border-[#E4E7EC] hover:border-[#9CA3AF]'
                    }`}
                  >
                    <p className="text-xs font-semibold text-[#111827]">{st.title}</p>
                    <p className="text-[11px] text-[#6B7280] mt-1 leading-snug">{st.desc}</p>
                  </button>
                );
              })}
            </div>

            {missingCount > 0 && (
              <div className="p-3.5 rounded-xl bg-[#FAFBFD] border border-[#E4E7EC] space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#111827]">
                  <PackageSearch className="w-3.5 h-3.5 text-[#D97706]" />
                  <span>
                    Missing from {targetDevice.name}:{' '}
                    <span className="font-normal text-[#4B5563]">
                      {preview?.report.missingApps
                        .slice(0, 6)
                        .map((a) => a.label)
                        .join(', ')}
                      {missingCount > 6 ? ` +${missingCount - 6} more` : ''}
                    </span>
                  </span>
                </div>
                <label className="flex items-center gap-2 text-xs text-[#374151] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoDownloadMissingFile}
                    onChange={(e) => setAutoDownloadMissingFile(e.target.checked)}
                    className="w-4 h-4 accent-[#166534]"
                  />
                  <span>
                    Automatically download a Play Store links file (.txt) for missing apps when import finishes
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Icon Art Import Option (applies to Replace & Merge when backup includes icon art) */}
          <div className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#111827]">Icon Art &amp; Assets</p>
              {activeBackup && (
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    backupHasIconArt ? 'text-[#166534]' : 'text-[#6B7280]'
                  }`}
                >
                  {backupHasIconArt
                    ? `${backupIconArtCount} app icon${backupIconArtCount === 1 ? '' : 's'} bundled`
                    : 'Not included in backup'}
                </span>
              )}
            </div>
            <label
              className={`flex items-start gap-2.5 select-none ${
                backupHasIconArt ? 'cursor-pointer' : 'cursor-not-allowed opacity-65'
              }`}
            >
              <input
                type="checkbox"
                checked={effectiveImportIconArt}
                disabled={!backupHasIconArt}
                onChange={(e) =>
                  setMergeOptions((prev) => ({
                    ...prev,
                    importIconArt: e.target.checked,
                  }))
                }
                className="mt-0.5 w-4 h-4 rounded border-[#CBD5E1] accent-[#166534] shrink-0 disabled:cursor-not-allowed"
              />
              <div className="min-w-0">
                <span className="text-xs font-medium text-[#111827] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#166534]" />
                  Import icon art from backup
                </span>
                <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">
                  {!activeBackup
                    ? 'Select or upload a backup snapshot to inspect bundled icon artwork.'
                    : backupHasIconArt
                    ? effectiveImportIconArt
                      ? `Restores bundled icon artwork for ${backupIconArtCount} unique app${backupIconArtCount === 1 ? '' : 's'}. Uncheck to keep ${targetDevice.name}'s local icon styles.`
                      : `Bundled icon art will be skipped — ${targetDevice.name}'s local app icons will be preserved.`
                    : `This backup was saved without icon art (layout coordinates only). ${targetDevice.name}'s local app icons will be used.`}
                </p>
              </div>
            </label>
          </div>

          {/* Merge fine-tuning controls */}
          {mode === 'merge' && (
            <div className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC] space-y-2.5">
              <p className="text-xs font-semibold text-[#111827]">Merge Rules</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    key: 'deduplicateApps' as const,
                    label: 'Skip duplicate packages already placed',
                  },
                  {
                    key: 'mergeMatchingFolders' as const,
                    label: 'Combine identically named icon folders',
                  },
                  {
                    key: 'syncWidgetsOnImport' as const,
                    label: 'Update matching synced widget configs',
                  },
                  {
                    key: 'overflowToNewScreen' as const,
                    label: 'Overflow collisions to new supplemental screen',
                  },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center gap-2.5 text-xs text-[#374151] cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={mergeOptions[opt.key]}
                      onChange={(e) =>
                        setMergeOptions((prev) => ({ ...prev, [opt.key]: e.target.checked }))
                      }
                      className="w-4 h-4 rounded border-[#CBD5E1] accent-[#166534]"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Pre-flight Diff Preview */}
          {preview && activeBackup ? (
            <div className="p-4 rounded-xl border border-[#E4E7EC] bg-white space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#111827]">
                  <CheckCircle2 className="w-4 h-4 text-[#166534]" />
                  Pre-Flight Restoration Preview
                </div>
                <span className="text-[11px] font-mono text-[#6B7280] tabular-nums">
                  {preview.report.sourceGrid.cols}×{preview.report.sourceGrid.rows} → {preview.report.targetGridAfter.cols}×{preview.report.targetGridAfter.rows} · Checksum {activeBackup.checksum}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                <div className="border-t border-[#F1F3F6] pt-2">
                  <p className="text-[#6B7280]">Screens</p>
                  <p className="font-mono font-semibold text-[#111827] tabular-nums mt-0.5">
                    {preview.report.screensBefore} → {preview.report.screensAfter}
                  </p>
                </div>
                <div className="border-t border-[#F1F3F6] pt-2">
                  <p className="text-[#6B7280]">Active / Placeholders</p>
                  <p className="font-mono font-semibold text-[#111827] tabular-nums mt-0.5">
                    +{preview.report.iconsAdded} live · {preview.report.placeholdersCreated} dummy
                  </p>
                </div>
                <div className="border-t border-[#F1F3F6] pt-2">
                  <p className="text-[#6B7280]">Grid Remapped</p>
                  <p className="font-mono font-semibold text-[#111827] tabular-nums mt-0.5">
                    {preview.report.reflowedItems} moved · {preview.report.widgetsResized} resized
                  </p>
                </div>
                <div className="border-t border-[#F1F3F6] pt-2">
                  <p className="text-[#6B7280]">Folders / Widgets</p>
                  <p className="font-mono font-semibold text-[#111827] tabular-nums mt-0.5">
                    +{preview.report.foldersCreated} fld · +{preview.report.widgetsPlaced} wdg
                  </p>
                </div>
              </div>

              <ul className="space-y-1 pt-2 border-t border-[#F1F3F6] text-xs text-[#4B5563]">
                {preview.report.notes.map((note, idx) => (
                  <li key={idx}>• {note}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-dashed border-[#E4E7EC] text-center text-xs text-[#6B7280]">
              <Cloud className="w-5 h-5 mx-auto mb-2 text-[#9CA3AF]" />
              Select a Cloud Vault snapshot or upload a local backup file to preview restoration changes.
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#F1F3F6] bg-[#F9FAFB] flex items-center justify-between gap-3">
          <p className="text-xs text-[#6B7280]">
            Automatic safety rollback snapshot created before applying.
          </p>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#4B5563] hover:text-[#111827] rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!preview}
              onClick={handleApply}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {mode === 'replace' ? 'Replace Device Layout' : 'Merge into Device Layout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
