import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  DownloadLocationPreferences,
  FolderFileEntry,
  SavedFileRecord,
  WorkspaceFolderSummary,
  deleteWorkspaceExportFile,
  fetchWorkspaceExportFiles,
  fetchWorkspaceExportFolders,
  listDeviceDirectoryFiles,
  readDeviceDirectoryFile,
  readWorkspaceExportFile,
  sanitizeWorkspaceFolderName,
  saveExportedFile,
  triggerStandardBrowserDownload,
} from '../services/downloadManager';
import { DownloadLocationControl } from './DownloadLocationControl';

interface SavedFileModalProps {
  initialTab: 'file' | 'folder';
  activeFile: SavedFileRecord | null;
  recentFiles: SavedFileRecord[];
  prefs: DownloadLocationPreferences;
  onChangePrefs: (next: DownloadLocationPreferences) => void;
  onSelectFile: (record: SavedFileRecord) => void;
  onFileSaved: (record: SavedFileRecord) => void;
  onClose: () => void;
}

export function SavedFileModal({
  initialTab,
  activeFile,
  recentFiles,
  prefs,
  onChangePrefs,
  onSelectFile,
  onFileSaved,
  onClose,
}: SavedFileModalProps) {
  const titleId = useId();
  const [tab, setTab] = useState<'file' | 'folder'>(initialTab);
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [showLocationSettings, setShowLocationSettings] = useState(false);

  // Folder browser state
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolderSummary[]>([]);
  const [browseWorkspaceFolder, setBrowseWorkspaceFolder] = useState<string>(
    activeFile?.workspaceFolder ?? prefs.workspaceFolder
  );
  const [folderFiles, setFolderFiles] = useState<FolderFileEntry[]>([]);
  const [deviceFolderName, setDeviceFolderName] = useState<string | null>(
    prefs.deviceFolderName
  );
  const [folderStatusMsg, setFolderStatusMsg] = useState<string | null>(null);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const blobPreviewUrl = useMemo(() => {
    if (!activeFile || activeFile.serverUrl) return null;
    const blob = new Blob([activeFile.content], { type: activeFile.mimeType });
    return URL.createObjectURL(blob);
  }, [activeFile]);

  useEffect(() => {
    return () => {
      if (blobPreviewUrl) {
        URL.revokeObjectURL(blobPreviewUrl);
      }
    };
  }, [blobPreviewUrl]);

  const loadFolderContents = async (targetWorkspaceFolder?: string) => {
    setLoadingFolder(true);
    setFolderStatusMsg(null);
    const folderToRead = targetWorkspaceFolder ?? browseWorkspaceFolder;

    if (prefs.mode === 'device-folder') {
      const res = await listDeviceDirectoryFiles();
      setDeviceFolderName(res.folderName ?? prefs.deviceFolderName);
      if (res.ok) {
        setFolderFiles(res.files);
      } else {
        setFolderFiles([]);
        setFolderStatusMsg(res.error ?? 'Could not inspect selected device folder.');
      }
      setLoadingFolder(false);
      return;
    }

    const [folders, files] = await Promise.all([
      fetchWorkspaceExportFolders(),
      fetchWorkspaceExportFiles(folderToRead),
    ]);
    setWorkspaceFolders(folders);
    setFolderFiles(files);
    setLoadingFolder(false);
  };

  useEffect(() => {
    if (tab === 'folder') {
      void loadFolderContents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, prefs.mode, browseWorkspaceFolder]);

  const handleCopy = async () => {
    if (!activeFile || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleOpenFolderEntry = async (entry: FolderFileEntry) => {
    if (entry.source === 'device-folder') {
      const res = await readDeviceDirectoryFile(entry.filename);
      if (!res.ok || res.content === undefined) {
        setFolderStatusMsg(res.error ?? 'Failed to read file.');
        return;
      }
      onSelectFile({
        id: `open-${Date.now()}`,
        filename: entry.filename,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        savedAt: entry.updatedAt,
        locationMode: 'device-folder',
        locationLabel: `Folder: ${deviceFolderName ?? 'Device Folder'}`,
        content: res.content,
      });
      setTab('file');
      return;
    }

    const folder = entry.workspaceFolder ?? browseWorkspaceFolder;
    const res = await readWorkspaceExportFile(folder, entry.filename);
    if (!res.ok || res.content === undefined) {
      setFolderStatusMsg(res.error ?? 'Failed to open file from workspace folder.');
      return;
    }
    onSelectFile({
      id: `open-${Date.now()}`,
      filename: entry.filename,
      mimeType: entry.mimeType,
      sizeBytes: entry.sizeBytes,
      savedAt: entry.updatedAt,
      locationMode: 'workspace-folder',
      locationLabel: `Workspace: .data/exports/${folder}/`,
      workspaceFolder: folder,
      serverUrl: res.url,
      content: res.content,
    });
    setTab('file');
  };

  const handleDeleteWorkspaceEntry = async (entry: FolderFileEntry) => {
    if (entry.source !== 'workspace-folder') return;
    const folder = entry.workspaceFolder ?? browseWorkspaceFolder;
    const ok = await deleteWorkspaceExportFile(folder, entry.filename);
    if (ok) {
      await loadFolderContents(folder);
    }
  };

  const handleSaveCopyToWorkspace = async () => {
    if (!activeFile) return;
    const targetFolder = sanitizeWorkspaceFolderName(
      newFolderName || prefs.workspaceFolder || 'backups'
    );
    const saved = await saveExportedFile({
      filename: activeFile.filename,
      content: activeFile.content,
      mimeType: activeFile.mimeType,
      overridePrefs: {
        ...prefs,
        mode: 'workspace-folder',
        workspaceFolder: targetFolder,
        alsoTriggerBrowserDownload: false,
      },
    });
    onFileSaved(saved);
    onSelectFile(saved);
    setBrowseWorkspaceFolder(targetFolder);
  };

  const openHref = activeFile?.serverUrl ?? blobPreviewUrl ?? undefined;
  const isHtmlFile = Boolean(activeFile?.filename.toLowerCase().endsWith('.html'));

  return (
    <div
      className="fixed inset-0 z-50 bg-[#111827]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-4xl bg-white border border-[#E4E7EC] rounded-2xl shadow-xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#F1F3F6] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-[#111827] truncate">
              {tab === 'file' && activeFile
                ? activeFile.filename
                : prefs.mode === 'device-folder'
                ? `Saved Folder: ${deviceFolderName ?? 'Device Folder'}`
                : 'Saved Exports & Download Folder'}
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5 truncate">
              {tab === 'file' && activeFile
                ? `${activeFile.locationLabel} · ${(activeFile.sizeBytes / 1024).toFixed(1)} KB`
                : `Active save destination: ${
                    prefs.mode === 'workspace-folder'
                      ? `.data/exports/${prefs.workspaceFolder}/`
                      : prefs.mode === 'device-folder'
                      ? prefs.deviceFolderName ?? 'Device Folder'
                      : prefs.mode === 'ask-each-time'
                      ? 'Ask every time (Save As)'
                      : 'Browser Downloads'
                  }`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-[#F3F4F6] rounded-lg">
              <button
                type="button"
                onClick={() => setTab('file')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  tab === 'file'
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                Open File
              </button>
              <button
                type="button"
                onClick={() => setTab('folder')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  tab === 'folder'
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                Open Folder
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close saved file viewer"
              className="w-9 h-9 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] hover:text-[#111827] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[80dvh] overflow-y-auto">
          {tab === 'file' && (
            <>
              {!activeFile ? (
                <div className="py-12 text-center space-y-3">
                  <FileText className="w-8 h-8 text-[#9CA3AF] mx-auto" />
                  <p className="text-sm font-semibold text-[#111827]">
                    No file selected yet
                  </p>
                  <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
                    Export a backup snapshot or open any file from your Saved Folder tab.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('folder')}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg cursor-pointer"
                  >
                    Browse Saved Folder
                  </button>
                </div>
              ) : (
                <>
                  {/* Quick Action Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-[#F1F3F6]">
                    <div className="flex flex-wrap items-center gap-2">
                      {openHref && (
                        <a
                          href={openHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open in New Tab
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleCopy()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-[#166534]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copied ? 'Copied' : 'Copy Contents'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          triggerStandardBrowserDownload(
                            activeFile.content,
                            activeFile.filename,
                            activeFile.mimeType
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Copy
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isHtmlFile && (
                        <button
                          type="button"
                          onClick={() => setWrapLines((w) => !w)}
                          className="px-2.5 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#111827] bg-[#F3F4F6] rounded-lg cursor-pointer"
                        >
                          {wrapLines ? 'No Wrap' : 'Wrap Lines'}
                        </button>
                      )}
                      {activeFile.locationMode !== 'workspace-folder' && (
                        <button
                          type="button"
                          onClick={() => void handleSaveCopyToWorkspace()}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#166534] bg-[#F0FDF4] border border-[#BBF7D0] hover:border-[#166534] rounded-lg cursor-pointer whitespace-nowrap"
                        >
                          <Folder className="w-3.5 h-3.5" />
                          Also Save to Workspace Folder
                        </button>
                      )}
                    </div>
                  </div>

                  {activeFile.fallbackNotice && (
                    <div className="p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E]">
                      {activeFile.fallbackNotice}
                    </div>
                  )}

                  {isHtmlFile ? (
                    <iframe
                      title={activeFile.filename}
                      sandbox=""
                      srcDoc={activeFile.content}
                      className="w-full h-[420px] rounded-xl border border-[#E4E7EC] bg-white"
                    />
                  ) : (
                    <pre
                      className={`p-4 rounded-xl bg-[#0F172A] text-[#E2E8F0] text-xs font-mono leading-relaxed max-h-[420px] overflow-auto ${
                        wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
                      }`}
                    >
                      <code>{activeFile.content}</code>
                    </pre>
                  )}
                </>
              )}
            </>
          )}

          {tab === 'folder' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowLocationSettings((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-[#F9FAFB] border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg cursor-pointer"
                >
                  <Folder className="w-3.5 h-3.5 text-[#166534]" />
                  {showLocationSettings ? 'Hide Location Settings' : 'Change Default Save Location'}
                </button>
                <button
                  type="button"
                  onClick={() => void loadFolderContents()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#374151] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingFolder ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {showLocationSettings && (
                <DownloadLocationControl prefs={prefs} onChangePrefs={onChangePrefs} compact />
              )}

              {/* Folder selector for Workspace Folders */}
              {prefs.mode !== 'device-folder' && (
                <div className="flex items-center justify-between gap-3 flex-wrap p-3.5 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-[#374151]">
                      Workspace Folder:
                    </span>
                    <select
                      aria-label="Browse workspace folder"
                      value={browseWorkspaceFolder}
                      onChange={(e) => setBrowseWorkspaceFolder(e.target.value)}
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#E4E7EC] rounded-lg text-[#111827] focus:outline-none focus:border-[#166534]"
                    >
                      {Array.from(
                        new Set([
                          'backups',
                          'missing-apps',
                          'diagnostics',
                          prefs.workspaceFolder,
                          ...workspaceFolders.map((f) => f.name),
                        ])
                      ).map((name) => {
                        const info = workspaceFolders.find((f) => f.name === name);
                        return (
                          <option key={name} value={name}>
                            .data/exports/{name}/
                            {info ? ` (${info.fileCount})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="New folder name..."
                      className="w-36 px-2.5 py-1.5 text-xs bg-white border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const clean = sanitizeWorkspaceFolderName(newFolderName);
                        if (!clean) return;
                        setBrowseWorkspaceFolder(clean);
                        onChangePrefs({
                          ...prefs,
                          mode: 'workspace-folder',
                          workspaceFolder: clean,
                        });
                        setNewFolderName('');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Set
                    </button>
                  </div>
                </div>
              )}

              {folderStatusMsg && (
                <div className="p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E]">
                  {folderStatusMsg}
                </div>
              )}

              {/* Folder file list */}
              <div className="border border-[#E4E7EC] rounded-xl overflow-hidden divide-y divide-[#F1F3F6]">
                {folderFiles.length === 0 ? (
                  <div className="py-10 px-4 text-center space-y-1.5">
                    <FolderOpen className="w-6 h-6 text-[#9CA3AF] mx-auto" />
                    <p className="text-xs font-semibold text-[#111827]">
                      {prefs.mode === 'device-folder'
                        ? 'No files found in selected device folder'
                        : `No saved files in .data/exports/${browseWorkspaceFolder}/ yet`}
                    </p>
                    <p className="text-[11px] text-[#6B7280] max-w-md mx-auto">
                      {prefs.mode === 'browser-downloads'
                        ? 'Your current download mode is Browser Downloads (managed by your browser). Switch to Workspace Folder or Device Folder above to save and open files directly inside a selectable folder.'
                        : 'Export a backup snapshot or Play Store list while this folder is selected to see and open it here.'}
                    </p>
                  </div>
                ) : (
                  folderFiles.map((entry) => (
                    <div
                      key={`${entry.source}-${entry.filename}`}
                      className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white hover:bg-[#FAFBFD]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileCode2 className="w-4 h-4 text-[#166534] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold font-mono text-[#111827] truncate">
                            {entry.filename}
                          </p>
                          <p className="text-[11px] text-[#6B7280] font-mono tabular-nums">
                            {(entry.sizeBytes / 1024).toFixed(1)} KB ·{' '}
                            {new Date(entry.updatedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleOpenFolderEntry(entry)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg cursor-pointer whitespace-nowrap"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open
                        </button>
                        {entry.url && (
                          <a
                            href={`${entry.url}?download=1`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#374151] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg whitespace-nowrap"
                          >
                            <Download className="w-3 h-3" />
                            Save Copy
                          </a>
                        )}
                        {entry.source === 'workspace-folder' && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteWorkspaceEntry(entry)}
                            aria-label={`Delete ${entry.filename}`}
                            className="p-1.5 text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Recent session saves (especially helpful for Browser Downloads mode) */}
              {recentFiles.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-semibold text-[#374151]">
                    Recently Saved in This Session ({recentFiles.length})
                  </p>
                  <div className="border border-[#E4E7EC] rounded-xl divide-y divide-[#F1F3F6] overflow-hidden">
                    {recentFiles.slice(0, 6).map((item) => (
                      <div
                        key={item.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-3 bg-white"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-medium text-[#111827] truncate">
                            {item.filename}
                          </p>
                          <p className="text-[11px] text-[#6B7280] truncate">
                            {item.locationLabel} · {(item.sizeBytes / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectFile(item);
                            setTab('file');
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-[#166534] bg-[#F0FDF4] border border-[#BBF7D0] hover:border-[#166534] rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Open File
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
