import React, { useEffect, useId, useMemo, useState } from 'react';
import { Cloud, Download, HardDrive, Image as ImageIcon, X } from 'lucide-react';
import { DeviceProfile } from '../types/layout';
import {
  computeBackupStats,
  estimateIconArtPayload,
} from '../engine/layoutEngine';

import { DownloadLocationPreferences } from '../services/downloadManager';
import { DownloadLocationControl } from './DownloadLocationControl';

interface BackupExportModalProps {
  device: DeviceProfile;
  downloadPrefs: DownloadLocationPreferences;
  onChangeDownloadPrefs: (next: DownloadLocationPreferences) => void;
  onOpenFolderBrowser: () => void;
  onClose: () => void;
  onConfirmExport: (payload: {
    name: string;
    notes: string;
    destination: 'cloud' | 'local' | 'both';
    includeIconArt: boolean;
  }) => void;
}

export function BackupExportModal({
  device,
  downloadPrefs,
  onChangeDownloadPrefs,
  onOpenFolderBrowser,
  onClose,
  onConfirmExport,
}: BackupExportModalProps) {
  const titleId = useId();
  const defaultName = `${device.name} — ${new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })} Layout`;
  const [name, setName] = useState(defaultName);
  const [notes, setNotes] = useState('');
  const [destination, setDestination] = useState<'cloud' | 'local' | 'both'>('both');
  const [includeIconArt, setIncludeIconArt] = useState<boolean>(true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const stats = useMemo(
    () => computeBackupStats(device.screens, device.dock),
    [device.screens, device.dock]
  );
  const artEstimate = useMemo(() => estimateIconArtPayload(device), [device]);
  const estimatedTotalKb = (
    (stats.bytes + (includeIconArt ? artEstimate.artBytes : 0)) /
    1024
  ).toFixed(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmExport({
      name: name.trim() || defaultName,
      notes: notes.trim(),
      destination,
      includeIconArt,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#111827]/45 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg bg-white border border-[#E4E7EC] rounded-2xl shadow-xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#F1F3F6] flex items-center justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-[#111827]">
              Save & Export Home Screen Layout
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {device.name} · {device.launcher} · {device.gridCols}×{device.gridRows} grid
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="w-9 h-9 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] hover:text-[#111827] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[85dvh] overflow-y-auto">
          {/* Capture summary strip */}
          <div className="grid grid-cols-4 gap-3 py-3 px-4 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC] text-center">
            <div>
              <p className="text-[11px] text-[#6B7280]">Screens</p>
              <p className="text-base font-semibold font-mono tabular-nums text-[#111827]">
                {stats.screenCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#6B7280]">Icons</p>
              <p className="text-base font-semibold font-mono tabular-nums text-[#111827]">
                {stats.iconCount + stats.nestedAppCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#6B7280]">Folders</p>
              <p className="text-base font-semibold font-mono tabular-nums text-[#111827]">
                {stats.folderCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#6B7280]">Widgets</p>
              <p className="text-base font-semibold font-mono tabular-nums text-[#111827]">
                {stats.widgetCount}
              </p>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Backup Snapshot Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Migration Notes (optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Before upgrading to Pixel 10, includes synced Tasks and Weather widgets"
                className="w-full px-3.5 py-2 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534] resize-none"
              />
            </div>

            {/* Backup settings */}
            <div className="p-3.5 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#374151]">
                  Backup Settings
                </span>
                <span className="text-[11px] font-mono tabular-nums text-[#6B7280]">
                  Est. {estimatedTotalKb} KB
                </span>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeIconArt}
                  onChange={(e) => setIncludeIconArt(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-[#CBD5E1] accent-[#166534] shrink-0"
                />
                <div className="min-w-0">
                  <span className="text-xs font-medium text-[#111827] flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-[#166534]" />
                    Back up app icon art
                  </span>
                  <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">
                    {includeIconArt
                      ? `Bundles portable icon artwork and custom icons for ${artEstimate.uniqueIconCount} unique apps (+${(
                          artEstimate.artBytes / 1024
                        ).toFixed(1)} KB).`
                      : 'Layout coordinates and package IDs only — excludes bundled icon artwork for a smaller snapshot.'}
                  </p>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#374151] mb-2">
                Export Destination
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'both' as const,
                    title: 'Cloud + File',
                    desc: 'Sync vault & download JSON',
                    icon: Cloud,
                  },
                  {
                    id: 'cloud' as const,
                    title: 'Cloud Vault',
                    desc: 'Instant cross-device access',
                    icon: HardDrive,
                  },
                  {
                    id: 'local' as const,
                    title: 'Local File',
                    desc: 'Download .json archive',
                    icon: Download,
                  },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const active = destination === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDestination(opt.id)}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-[#166534] bg-[#166534]/5'
                          : 'border-[#E4E7EC] hover:border-[#9CA3AF]'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 mb-1.5 ${
                          active ? 'text-[#166534]' : 'text-[#6B7280]'
                        }`}
                      />
                      <p className="text-xs font-semibold text-[#111827]">{opt.title}</p>
                      <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {(destination === 'local' || destination === 'both') && (
              <DownloadLocationControl
                prefs={downloadPrefs}
                onChangePrefs={onChangeDownloadPrefs}
                onOpenFolderBrowser={() => {
                  onClose();
                  onOpenFolderBrowser();
                }}
              />
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#4B5563] hover:text-[#111827] rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {destination === 'local'
                ? 'Download Backup JSON'
                : destination === 'cloud'
                ? 'Save to Cloud Vault'
                : 'Save to Cloud & Download'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
