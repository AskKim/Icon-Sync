import React, { useEffect, useState } from 'react';
import {
  Check,
  Download,
  Folder,
  FolderOpen,
  HardDrive,
  Plus,
  Server,
} from 'lucide-react';
import {
  DownloadLocationMode,
  DownloadLocationPreferences,
  WorkspaceFolderSummary,
  clearStoredDirectoryHandle,
  fetchWorkspaceExportFolders,
  getPickerCapabilities,
  pickAndSaveDeviceFolder,
  sanitizeWorkspaceFolderName,
} from '../services/downloadManager';

interface DownloadLocationControlProps {
  prefs: DownloadLocationPreferences;
  onChangePrefs: (next: DownloadLocationPreferences) => void;
  onOpenFolderBrowser?: () => void;
  compact?: boolean;
}

export function DownloadLocationControl({
  prefs,
  onChangePrefs,
  onOpenFolderBrowser,
  compact = false,
}: DownloadLocationControlProps) {
  const [folders, setFolders] = useState<WorkspaceFolderSummary[]>([]);
  const [newFolderInput, setNewFolderInput] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [pickerMessage, setPickerMessage] = useState<string | null>(null);

  const capabilities = getPickerCapabilities();

  useEffect(() => {
    let active = true;
    void fetchWorkspaceExportFolders().then((list) => {
      if (active) setFolders(list);
    });
    return () => {
      active = false;
    };
  }, [prefs.workspaceFolder, prefs.mode]);

  const handleSelectMode = async (mode: DownloadLocationMode) => {
    setPickerMessage(null);
    if (mode === 'device-folder') {
      if (!prefs.deviceFolderName) {
        const res = await pickAndSaveDeviceFolder();
        if (res.ok && res.folderName) {
          onChangePrefs({
            ...prefs,
            mode: 'device-folder',
            deviceFolderName: res.folderName,
          });
          return;
        }
        if (res.error) {
          setPickerMessage(res.error);
          return;
        }
        return;
      }
    }
    onChangePrefs({ ...prefs, mode });
  };

  const handlePickDifferentDeviceFolder = async () => {
    setPickerMessage(null);
    const res = await pickAndSaveDeviceFolder();
    if (res.ok && res.folderName) {
      onChangePrefs({
        ...prefs,
        mode: 'device-folder',
        deviceFolderName: res.folderName,
      });
    } else if (res.error) {
      setPickerMessage(res.error);
    }
  };

  const handleClearDeviceFolder = async () => {
    await clearStoredDirectoryHandle();
    onChangePrefs({
      ...prefs,
      mode: 'browser-downloads',
      deviceFolderName: null,
    });
  };

  const handleCreateWorkspaceFolder = () => {
    const clean = sanitizeWorkspaceFolderName(newFolderInput);
    if (!clean) return;
    onChangePrefs({
      ...prefs,
      mode: 'workspace-folder',
      workspaceFolder: clean,
    });
    setNewFolderInput('');
    setShowNewFolderInput(false);
  };

  const folderOptions = Array.from(
    new Set([
      'backups',
      'missing-apps',
      'diagnostics',
      prefs.workspaceFolder,
      ...folders.map((f) => f.name),
    ])
  );

  return (
    <div className="p-3.5 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC] space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Folder className="w-3.5 h-3.5 text-[#166534] shrink-0" />
          <span className="text-xs font-semibold text-[#111827]">
            Download Location
          </span>
        </div>
        {onOpenFolderBrowser && (
          <button
            type="button"
            onClick={onOpenFolderBrowser}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#166534] hover:text-[#14532D] cursor-pointer whitespace-nowrap"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Open Saved Folder
          </button>
        )}
      </div>

      <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
        <button
          type="button"
          onClick={() => void handleSelectMode('browser-downloads')}
          className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
            prefs.mode === 'browser-downloads'
              ? 'border-[#166534] bg-[#166534]/5'
              : 'border-[#E4E7EC] bg-white hover:border-[#9CA3AF]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <Download
              className={`w-3.5 h-3.5 ${
                prefs.mode === 'browser-downloads' ? 'text-[#166534]' : 'text-[#6B7280]'
              }`}
            />
            {prefs.mode === 'browser-downloads' && (
              <Check className="w-3.5 h-3.5 text-[#166534]" />
            )}
          </div>
          <p className="text-xs font-semibold text-[#111827] mt-1">Browser Downloads</p>
          <p className="text-[11px] text-[#6B7280] leading-snug">
            Default system folder
          </p>
        </button>

        <button
          type="button"
          onClick={() => void handleSelectMode('workspace-folder')}
          className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
            prefs.mode === 'workspace-folder'
              ? 'border-[#166534] bg-[#166534]/5'
              : 'border-[#E4E7EC] bg-white hover:border-[#9CA3AF]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <Server
              className={`w-3.5 h-3.5 ${
                prefs.mode === 'workspace-folder' ? 'text-[#166534]' : 'text-[#6B7280]'
              }`}
            />
            {prefs.mode === 'workspace-folder' && (
              <Check className="w-3.5 h-3.5 text-[#166534]" />
            )}
          </div>
          <p className="text-xs font-semibold text-[#111827] mt-1">Workspace Folder</p>
          <p className="text-[11px] text-[#6B7280] leading-snug truncate">
            .data/exports/{prefs.workspaceFolder}/
          </p>
        </button>

        <button
          type="button"
          onClick={() => void handleSelectMode('device-folder')}
          className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
            prefs.mode === 'device-folder'
              ? 'border-[#166534] bg-[#166534]/5'
              : 'border-[#E4E7EC] bg-white hover:border-[#9CA3AF]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <HardDrive
              className={`w-3.5 h-3.5 ${
                prefs.mode === 'device-folder' ? 'text-[#166534]' : 'text-[#6B7280]'
              }`}
            />
            {prefs.mode === 'device-folder' && (
              <Check className="w-3.5 h-3.5 text-[#166534]" />
            )}
          </div>
          <p className="text-xs font-semibold text-[#111827] mt-1">Device Folder</p>
          <p className="text-[11px] text-[#6B7280] leading-snug truncate">
            {prefs.deviceFolderName
              ? `Folder: ${prefs.deviceFolderName}`
              : capabilities.hasDirectoryPicker
              ? 'Pick local folder'
              : 'Outside iframe / Chrome'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => void handleSelectMode('ask-each-time')}
          className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
            prefs.mode === 'ask-each-time'
              ? 'border-[#166534] bg-[#166534]/5'
              : 'border-[#E4E7EC] bg-white hover:border-[#9CA3AF]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <FolderOpen
              className={`w-3.5 h-3.5 ${
                prefs.mode === 'ask-each-time' ? 'text-[#166534]' : 'text-[#6B7280]'
              }`}
            />
            {prefs.mode === 'ask-each-time' && (
              <Check className="w-3.5 h-3.5 text-[#166534]" />
            )}
          </div>
          <p className="text-xs font-semibold text-[#111827] mt-1">Ask Every Time</p>
          <p className="text-[11px] text-[#6B7280] leading-snug">
            {capabilities.hasSaveFilePicker ? 'System Save As dialog' : 'Save As (when supported)'}
          </p>
        </button>
      </div>

      {/* Mode-specific controls */}
      {prefs.mode === 'workspace-folder' && (
        <div className="pt-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[11px] font-medium text-[#374151] shrink-0">
              Target Folder:
            </label>
            <select
              aria-label="Select workspace export folder"
              value={prefs.workspaceFolder}
              onChange={(e) =>
                onChangePrefs({
                  ...prefs,
                  workspaceFolder: sanitizeWorkspaceFolderName(e.target.value),
                })
              }
              className="px-2.5 py-1.5 text-xs bg-white border border-[#E4E7EC] rounded-lg text-[#111827] focus:outline-none focus:border-[#166534]"
            >
              {folderOptions.map((folderName) => {
                const summary = folders.find((f) => f.name === folderName);
                return (
                  <option key={folderName} value={folderName}>
                    {folderName}/
                    {summary ? ` (${summary.fileCount} files)` : ''}
                  </option>
                );
              })}
            </select>

            {!showNewFolderInput ? (
              <button
                type="button"
                onClick={() => setShowNewFolderInput(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-[#166534] bg-white border border-[#E4E7EC] hover:border-[#166534] rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3 h-3" />
                New Folder
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newFolderInput}
                  onChange={(e) => setNewFolderInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateWorkspaceFolder();
                    }
                  }}
                  placeholder="e.g. pixel-backups"
                  className="w-36 px-2.5 py-1 text-xs bg-white border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
                />
                <button
                  type="button"
                  onClick={handleCreateWorkspaceFolder}
                  className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg cursor-pointer"
                >
                  Use
                </button>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-[11px] text-[#4B5563] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={prefs.alsoTriggerBrowserDownload}
              onChange={(e) =>
                onChangePrefs({
                  ...prefs,
                  alsoTriggerBrowserDownload: e.target.checked,
                })
              }
              className="w-3.5 h-3.5 accent-[#166534]"
            />
            Also save a copy to Browser Downloads
          </label>
        </div>
      )}

      {prefs.mode === 'device-folder' && (
        <div className="pt-1 flex items-center justify-between gap-2 flex-wrap text-[11px]">
          <span className="text-[#374151]">
            Selected folder:{' '}
            <strong className="font-mono text-[#111827]">
              {prefs.deviceFolderName ?? 'None'}
            </strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePickDifferentDeviceFolder()}
              className="px-2.5 py-1 font-medium text-[#166534] bg-white border border-[#E4E7EC] hover:border-[#166534] rounded-md cursor-pointer"
            >
              Change Folder…
            </button>
            {prefs.deviceFolderName && (
              <button
                type="button"
                onClick={() => void handleClearDeviceFolder()}
                className="px-2 py-1 font-medium text-[#6B7280] hover:text-[#111827] cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {prefs.mode === 'ask-each-time' && !capabilities.hasSaveFilePicker && (
        <p className="text-[11px] text-[#92400E] leading-snug">
          {capabilities.embeddedIframe
            ? 'Note: System "Save As" dialogs are restricted inside embedded preview frames; saves will fall back to Browser Downloads unless you open the app in its own tab or choose Workspace Folder.'
            : 'Note: This browser does not support the Save As picker API; saves will fall back to Browser Downloads.'}
        </p>
      )}

      {pickerMessage && (
        <p className="text-[11px] text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-2.5 py-1.5 leading-snug">
          {pickerMessage}
        </p>
      )}
    </div>
  );
}
