import React, { useState } from 'react';
import {
  Cloud,
  Download,
  HardDrive,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { LayoutBackupSnapshot } from '../types/layout';

interface BackupsViewProps {
  backups: LayoutBackupSnapshot[];
  onOpenImportModal: (backupId?: string) => void;
  onOpenExportModal: () => void;
  onDownloadBackup: (backup: LayoutBackupSnapshot) => void;
  onDeleteBackup: (backupId: string) => void;
}

export function BackupsView({
  backups,
  onOpenImportModal,
  onOpenExportModal,
  onDownloadBackup,
  onDeleteBackup,
}: BackupsViewProps) {
  const [filter, setFilter] = useState<'all' | 'cloud' | 'local'>('all');
  const [query, setQuery] = useState('');

  const filtered = backups.filter((b) => {
    if (filter !== 'all' && b.storage !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.sourceDeviceName.toLowerCase().includes(q) ||
      b.notes.toLowerCase().includes(q)
    );
  });

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
        <div className="flex items-center gap-2.5 shrink-0">
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

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
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

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by device, name, or note..."
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
              Capture your current home screen and supplemental screens to save a portable snapshot to Cloud Vault or disk.
            </p>
            <button
              type="button"
              onClick={onOpenExportModal}
              className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg cursor-pointer"
            >
              Capture First Backup
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#F1F3F6]">
            {filtered.map((backup) => (
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
                    <span className="font-mono tabular-nums">
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
                    <span>{(backup.stats.bytes / 1024).toFixed(1)} KB</span>
                    <span aria-hidden="true">/</span>
                    <span>SHA {backup.checksum}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
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
                  <button
                    type="button"
                    onClick={() => onDeleteBackup(backup.id)}
                    aria-label={`Delete ${backup.name}`}
                    className="p-2 text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
