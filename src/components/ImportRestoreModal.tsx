import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  GitMerge,
  Layers,
  Upload,
  X,
} from 'lucide-react';
import {
  DeviceProfile,
  LayoutBackupSnapshot,
  MergeOptions,
  RestoreDiffReport,
  RestoreMode,
} from '../types/layout';
import { computeRestoreResult, validateBackupPayload } from '../engine/layoutEngine';

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
  }) => void;
}

export function ImportRestoreModal({
  devices,
  initialTargetDeviceId,
  backups,
  initialBackupId,
  onClose,
  onApplyRestore,
}: ImportRestoreModalProps) {
  const [sourceTab, setSourceTab] = useState<'cloud' | 'file'>(
    initialBackupId || backups.length > 0 ? 'cloud' : 'file'
  );
  const [selectedBackupId, setSelectedBackupId] = useState<string>(
    initialBackupId ?? backups[0]?.id ?? ''
  );
  const [uploadedBackup, setUploadedBackup] = useState<LayoutBackupSnapshot | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [targetDeviceId, setTargetDeviceId] = useState<string>(initialTargetDeviceId);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [mergeOptions, setMergeOptions] = useState<MergeOptions>({
    deduplicateApps: true,
    mergeMatchingFolders: true,
    syncWidgetsOnImport: true,
    overflowToNewScreen: true,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeBackup: LayoutBackupSnapshot | undefined =
    sourceTab === 'file'
      ? uploadedBackup ?? undefined
      : backups.find((b) => b.id === selectedBackupId);

  const targetDevice = devices.find((d) => d.id === targetDeviceId) ?? devices[0];

  const preview = useMemo(() => {
    if (!activeBackup || !targetDevice) return null;
    return computeRestoreResult(targetDevice, activeBackup, mode, mergeOptions);
  }, [activeBackup, targetDevice, mode, mergeOptions]);

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = validateBackupPayload(parsed);
      if (!result.valid || !result.backup) {
        setUploadError(result.error ?? 'Invalid backup file.');
        setUploadedBackup(null);
        return;
      }
      setUploadedBackup(result.backup);
      setSourceTab('file');
    } catch {
      setUploadError('Could not parse JSON file. Select a valid HomeGrid .json layout backup.');
      setUploadedBackup(null);
    }
  };

  const handleApply = () => {
    if (!preview || !targetDevice) return;
    onApplyRestore({
      targetDeviceId: targetDevice.id,
      nextDevice: preview.nextDevice,
      report: preview.report,
      importedBackup: sourceTab === 'file' && uploadedBackup ? uploadedBackup : undefined,
    });
  };

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
              Choose a backup source and decide whether to replace or merge your current device layout.
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
                <label className="text-xs font-semibold text-[#111827]">1. Backup Source</label>
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
                <select
                  value={selectedBackupId}
                  onChange={(e) => setSelectedBackupId(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
                >
                  {backups.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.gridCols}×{b.gridRows})
                    </option>
                  ))}
                </select>
              ) : (
                <div>
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
                    {uploadedBackup ? uploadedBackup.name : 'Choose HomeGrid .json Backup'}
                  </button>
                  {uploadError && (
                    <p className="text-[11px] text-[#DC2626] mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {uploadError}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-2">
                2. Target Android Device
              </label>
              <select
                value={targetDeviceId}
                onChange={(e) => setTargetDeviceId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.gridCols}×{d.gridRows} ({d.screens.length} screens)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 2: Replace vs Merge Strategy */}
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
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Layers
                      className={`w-4 h-4 ${
                        mode === 'replace' ? 'text-[#166534]' : 'text-[#6B7280]'
                      }`}
                    />
                    <span className="text-sm font-semibold text-[#111827]">
                      Replace Current Layout
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[#4B5563] leading-relaxed">
                  Clears existing home screens, folders, dock, and widgets on {targetDevice.name}, restoring the exact backup layout with automatic grid-density adaptation.
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
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <GitMerge
                      className={`w-4 h-4 ${
                        mode === 'merge' ? 'text-[#166534]' : 'text-[#6B7280]'
                      }`}
                    />
                    <span className="text-sm font-semibold text-[#111827]">
                      Merge with Current Layout
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[#4B5563] leading-relaxed">
                  Preserves all icons, folders, and widgets currently on {targetDevice.name}. Deduplicates apps, combines matching folders, and places additions into open slots.
                </p>
              </button>
            </div>
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
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#111827]">
                  <CheckCircle2 className="w-4 h-4 text-[#166534]" />
                  Pre-Flight Restoration Preview
                </div>
                <span className="text-[11px] font-mono text-[#6B7280] tabular-nums">
                  Checksum {activeBackup.checksum}
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
                  <p className="text-[#6B7280]">Icons Added</p>
                  <p className="font-mono font-semibold text-[#111827] tabular-nums mt-0.5">
                    +{preview.report.iconsAdded}
                    {preview.report.iconsSkippedDuplicate > 0 && (
                      <span className="text-[#6B7280] font-normal">
                        {' '}({preview.report.iconsSkippedDuplicate} dupes)
                      </span>
                    )}
                  </p>
                </div>
                <div className="border-t border-[#F1F3F6] pt-2">
                  <p className="text-[#6B7280]">Folders</p>
                  <p className="font-mono font-semibold text-[#111827] tabular-nums mt-0.5">
                    +{preview.report.foldersCreated} new · {preview.report.foldersMerged} merged
                  </p>
                </div>
                <div className="border-t border-[#F1F3F6] pt-2">
                  <p className="text-[#6B7280]">Widgets</p>
                  <p className="font-mono font-semibold text-[#111827] tabular-nums mt-0.5">
                    +{preview.report.widgetsPlaced} placed · {preview.report.widgetsUpdated} synced
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
