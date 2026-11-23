/**
 * @file src/components/BackupsView.tsx
 * @license AGPL-3.0-or-later
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * ============================================================================
 * ICON SYNC — CLOUD VAULT & BACKUP ARCHIVES VIEW
 * ============================================================================
 *
 * PLAIN-ENGLISH OVERVIEW (for beginners & AI readers):
 * Displays all saved Android layout snapshots (from both Cloud Vault and local
 * JSON exports). Users can:
 *   - Filter by storage type (All / Cloud / Local) or grid density (e.g., 6x6, 4x6)
 *   - Search by backup name, source device, launcher, or notes
 *   - Sort snapshots (Newest, Oldest, Name A-Z, or Most Icons)
 *   - Restore any snapshot using Replace or Merge mode with cross-grid adaptation
 *   - Clone a snapshot before testing changes, download portable `.json`, or
 *     safely delete using an inline two-step confirmation (no accidental wipes)
 */

import React, { useMemo, useState } from 'react';
import {
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Folder,
  FolderOpen,
  HardDrive,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { LayoutBackupSnapshot } from '../types/layout';
import { backupIncludesIconArt, getBackupIconArtCount } from '../engine/layoutEngine';
import { DownloadLocationPreferences, SavedFileRecord } from '../services/downloadManager';
import { DownloadLocationControl } from './DownloadLocationControl';

type SortOption = 'newest' | 'oldest' | 'name' | 'icons';

interface BackupsViewProps {
  backups: LayoutBackupSnapshot[];
  downloadPrefs: DownloadLocationPreferences;
  lastSavedFile: SavedFileRecord | null;
  onChangeDownloadPrefs: (next: DownloadLocationPreferences) => void;
  onOpenSavedFile: (file: SavedFileRecord) => void;
  onOpenSavedFolder: () => void;
  onOpenImportModal: (backupId?: string) => void;
  onOpenExportModal: () => void;
  onDownloadBackup: (backup: LayoutBackupSnapshot) => void;
  onDuplicateBackup?: (backup: LayoutBackupSnapshot) => void;
  onDeleteBackup: (backupId: string) => void;
}

export function BackupsView({
  backups,
  downloadPrefs,
  lastSavedFile,
  onChangeDownloadPrefs,
  onOpenSavedFile,
  onOpenSavedFolder,
  onOpenImportModal,
  onOpenExportModal,
  onDownloadBackup,
  onDuplicateBackup,
  onDeleteBackup,
}: BackupsViewProps) {
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [filter, setFilter] = useState<'all' | 'cloud' | 'local'>('all');
  const [gridFilter, setGridFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [query, setQuery] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Collect all unique grid dimensions (e.g., "6×6", "4×6") for quick filtering
  const availableGrids = useMemo(() => {
    const set = new Set<string>();
    for (const b of backups) {
      set.add(`${b.gridCols}×${b.gridRows}`);
    }
    return Array.from(set).sort();
  }, [backups]);

  // Memoized filtering + sorting avoids recalculating on unrelated renders
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = backups.filter((b) => {
      if (filter !== 'all' && b.storage !== filter) return false;
      if (gridFilter !== 'all' && `${b.gridCols}×${b.gridRows}` !== gridFilter) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.sourceDeviceName.toLowerCase().includes(q) ||
        b.sourceLauncher.toLowerCase().includes(q) ||
        b.notes.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'icons') {
        const aIcons = a.stats.iconCount + a.stats.nestedAppCount;
        const bIcons = b.stats.iconCount + b.stats.nestedAppCount;
        return bIcons - aIcons;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [backups, filter, gridFilter, sortBy, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Cloud Vault & Backup Archives
          </h1>
          <p className="text-sm text-[#4B5563] mt-1">
            Restore any saved snapshot to another Android device using Replace or Merge mode, or export portable JSON files.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setShowLocationPicker((v) => !v)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Folder className="w-3.5 h-3.5 text-[#166534]" />
            Save To:{' '}
            <span className="font-semibold">
              {downloadPrefs.mode === 'workspace-folder'
                ? downloadPrefs.workspaceFolder
                : downloadPrefs.mode === 'device-folder'
                ? downloadPrefs.deviceFolderName ?? 'Device Folder'
                : downloadPrefs.mode === 'ask-each-time'
                ? 'Ask Each Time'
                : 'Downloads'}
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenSavedFolder}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#166534]" />
            Open Saved Folder
          </button>
          <button
            type="button"
            onClick={() => onOpenImportModal()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Backup File
          </button>
          <button
            type="button"
            onClick={onOpenExportModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Cloud className="w-3.5 h-3.5" />
            Create Snapshot
          </button>
        </div>
      </div>

      {showLocationPicker && (
        <DownloadLocationControl
          prefs={downloadPrefs}
          onChangePrefs={onChangeDownloadPrefs}
          onOpenFolderBrowser={onOpenSavedFolder}
          compact
        />
      )}

      {lastSavedFile && (
        <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 text-xs text-[#14532D]">
            <span className="font-semibold">Last Saved:</span>{' '}
            <span className="font-mono font-medium">{lastSavedFile.filename}</span>{' '}
            <span className="text-[#166534]">
              ({lastSavedFile.locationLabel} · {(lastSavedFile.sizeBytes / 1024).toFixed(1)} KB)
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenSavedFile(lastSavedFile)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open File
            </button>
            <button
              type="button"
              onClick={onOpenSavedFolder}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-white border border-[#BBF7D0] hover:border-[#166534] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Open Folder
            </button>
          </div>
        </div>
      )}

      {/* Filter, Grid Selector, Sort & Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-[#ECEEF2] rounded-lg w-fit">
            {[
              { id: 'all' as const, label: 'All Backups' },
              { id: 'cloud' as const, label: 'Cloud Vault' },
              { id: 'local' as const, label: 'Local Exports' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  filter === tab.id
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by grid size"
            value={gridFilter}
            onChange={(e) => setGridFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg text-[#374151] focus:outline-none focus:border-[#166534]"
          >
            <option value="all">All Grids</option>
            {availableGrids.map((grid) => (
              <option key={grid} value={grid}>
                Grid {grid}
              </option>
            ))}
          </select>

          <select
            aria-label="Sort backups"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg text-[#374151] focus:outline-none focus:border-[#166534]"
          >
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="name">Sort: Name (A–Z)</option>
            <option value="icons">Sort: Most Icons</option>
          </select>
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by device, launcher, or note..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
          />
        </div>
      </div>

      {/* Backup Table */}
      <div className="bg-white border border-[#E4E7EC] rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <HardDrive className="w-6 h-6 text-[#9CA3AF] mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#111827]">No matching layout backups</p>
            <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
              Clear your filters or capture your current home screen and supplemental screens to save a portable snapshot.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {(filter !== 'all' || gridFilter !== 'all' || query.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all');
                    setGridFilter('all');
                    setQuery('');
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={onOpenExportModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg cursor-pointer"
              >
                Capture Backup
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#F1F3F6]">
            {filtered.map((backup) => {
              const isConfirmingDelete = pendingDeleteId === backup.id;
              return (
                <div
                  key={backup.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#FAFBFD] transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-[#111827] truncate">
                        {backup.name}
                      </h3>
                    </div>

                    {/* Clean unboxed metadata with typographic separators */}
                    <div className="flex items-center gap-2 text-xs text-[#6B7280] flex-wrap">
                      <span className="font-medium text-[#374151]">{backup.sourceDeviceName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{backup.sourceLauncher}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums font-medium text-[#111827]">
                        {backup.gridCols}×{backup.gridRows}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{backup.storage === 'cloud' ? 'Cloud Vault' : 'Local Export'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {new Date(backup.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {backup.notes && (
                      <p className="text-xs text-[#4B5563] pt-0.5 max-w-2xl">{backup.notes}</p>
                    )}

                    <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-[#6B7280] tabular-nums flex-wrap">
                      <span>{backup.stats.screenCount} screens</span>
                      <span aria-hidden="true">/</span>
                      <span>{backup.stats.iconCount + backup.stats.nestedAppCount} icons</span>
                      <span aria-hidden="true">/</span>
                      <span>{backup.stats.folderCount} folders</span>
                      <span aria-hidden="true">/</span>
                      <span>{backup.stats.widgetCount} widgets</span>
                      <span aria-hidden="true">/</span>
                      <span
                        className={
                          backupIncludesIconArt(backup)
                            ? 'text-[#166534] font-medium'
                            : 'text-[#6B7280]'
                        }
                      >
                        {backupIncludesIconArt(backup)
                          ? `icon art (${getBackupIconArtCount(backup)})`
                          : 'no icon art'}
                      </span>
                      <span aria-hidden="true">/</span>
                      <span>{(backup.stats.bytes / 1024).toFixed(1)} KB</span>
                      <span aria-hidden="true">/</span>
                      <span>{backup.checksum}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onOpenImportModal(backup.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#111827] hover:bg-[#1F2937] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restore (Replace / Merge)
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadBackup(backup)}
                      title="Download backup JSON"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#374151] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      JSON
                    </button>
                    {onDuplicateBackup && (
                      <button
                        type="button"
                        onClick={() => onDuplicateBackup(backup)}
                        title="Duplicate backup snapshot"
                        aria-label={`Clone ${backup.name}`}
                        className="p-2 text-[#4B5563] hover:text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Safe two-step inline confirmation prevents accidental one-click deletion */}
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPendingDeleteId(null);
                            onDeleteBackup(backup.id);
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg whitespace-nowrap cursor-pointer"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(null)}
                          className="px-2.5 py-1.5 text-xs font-medium text-[#374151] bg-white border border-[#E4E7EC] rounded-lg whitespace-nowrap cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(backup.id)}
                        aria-label={`Delete ${backup.name}`}
                        className="p-2 text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
