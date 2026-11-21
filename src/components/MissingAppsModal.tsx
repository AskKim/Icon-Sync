import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Globe,
  PackageCheck,
  X,
} from 'lucide-react';
import { MissingAppEntry } from '../types/layout';
import { AndroidIcon } from './AndroidIcon';

interface MissingAppsModalProps {
  targetDeviceName: string;
  backupName: string;
  missingApps: MissingAppEntry[];
  installedPackages: string[];
  initialView?: 'walkthrough' | 'list';
  onMarkInstalled: (packageName: string) => void;
  onDownloadFile: (format: 'txt' | 'html') => void;
  onClose: () => void;
}

export function MissingAppsModal({
  targetDeviceName,
  backupName,
  missingApps,
  installedPackages,
  initialView = 'walkthrough',
  onMarkInstalled,
  onDownloadFile,
  onClose,
}: MissingAppsModalProps) {
  const [viewMode, setViewMode] = useState<'walkthrough' | 'list'>(initialView);
  const [stepIndex, setStepIndex] = useState(0);

  const installedSet = new Set(installedPackages);
  const completedCount = missingApps.filter((a) => installedSet.has(a.packageName)).length;
  const remainingCount = missingApps.length - completedCount;

  const safeStep = Math.min(stepIndex, Math.max(0, missingApps.length - 1));
  const currentApp = missingApps[safeStep];
  const isCurrentInstalled = currentApp ? installedSet.has(currentApp.packageName) : false;

  const handleMarkAndAdvance = (pkg: string) => {
    onMarkInstalled(pkg);
    if (safeStep < missingApps.length - 1) {
      setStepIndex(safeStep + 1);
    }
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
              Missing Apps on {targetDeviceName}
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {completedCount} of {missingApps.length} installed · From “{backupName}”
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close missing apps guide"
            className="w-9 h-9 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] hover:text-[#111827] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Progress + View Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-[#F3F4F6] rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setViewMode('walkthrough')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  viewMode === 'walkthrough'
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                Step-by-Step Install
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                All Missing ({missingApps.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onDownloadFile('txt')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#166534] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-[#166534]" />
                Download Links (.txt)
              </button>
              <button
                type="button"
                onClick={() => onDownloadFile('html')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#166534] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-[#166534]" />
                Clickable List (.html)
              </button>
            </div>
          </div>

          {/* Step-by-Step Guided Walkthrough */}
          {viewMode === 'walkthrough' && currentApp && (
            <div className="border border-[#E4E7EC] rounded-2xl p-6 space-y-5 bg-[#FAFBFD]">
              <div className="flex items-center justify-between text-xs text-[#6B7280]">
                <span className="font-mono tabular-nums font-medium text-[#111827]">
                  App {safeStep + 1} of {missingApps.length}
                </span>
                <span>{currentApp.targetLocation}</span>
              </div>

              <div className="flex items-center gap-4">
                <AndroidIcon
                  iconKey={currentApp.iconKey}
                  tint={currentApp.tint}
                  size="lg"
                  isPlaceholder={!isCurrentInstalled}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-[#111827] truncate">
                      {currentApp.label}
                    </h3>
                    {isCurrentInstalled && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#166534]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Installed
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-[#6B7280] truncate mt-0.5">
                    {currentApp.packageName}
                  </p>
                  <p className="text-xs text-[#4B5563] mt-1">
                    {isCurrentInstalled
                      ? 'Placeholder icon on the home screen has been converted to an active shortcut.'
                      : 'Install from Google Play on your device, then confirm below to convert its placeholder icon.'}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white border border-[#E4E7EC] flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-[#4B5563] truncate">
                  {currentApp.playStoreUrl}
                </span>
                <a
                  href={currentApp.playStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#166534] bg-[#166534]/10 hover:bg-[#166534]/15 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Open Play Store
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safeStep === 0}
                    onClick={() => setStepIndex((s) => Math.max(0, s - 1))}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-[#374151] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] disabled:opacity-40 rounded-lg cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={safeStep >= missingApps.length - 1}
                    onClick={() => setStepIndex((s) => Math.min(missingApps.length - 1, s + 1))}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-[#374151] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] disabled:opacity-40 rounded-lg cursor-pointer disabled:cursor-not-allowed"
                  >
                    Skip / Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!isCurrentInstalled ? (
                  <button
                    type="button"
                    onClick={() => handleMarkAndAdvance(currentApp.packageName)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <PackageCheck className="w-4 h-4" />
                    Mark Installed & Convert Icon
                  </button>
                ) : (
                  <span className="text-xs font-medium text-[#166534]">
                    Active on {targetDeviceName}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Full Missing Apps Checklist View */}
          {viewMode === 'list' && (
            <div className="border border-[#E4E7EC] rounded-xl divide-y divide-[#F1F3F6] overflow-hidden">
              {missingApps.map((app) => {
                const isDone = installedSet.has(app.packageName);
                return (
                  <div
                    key={app.packageName}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AndroidIcon
                        iconKey={app.iconKey}
                        tint={app.tint}
                        size="sm"
                        isPlaceholder={!isDone}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#111827] truncate">{app.label}</p>
                        <p className="text-[11px] font-mono text-[#6B7280] truncate">
                          {app.packageName} · {app.targetLocation}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={app.playStoreUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#374151] bg-[#F9FAFB] border border-[#E4E7EC] hover:border-[#166534] rounded-lg whitespace-nowrap"
                      >
                        Play Store
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      {isDone ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#166534]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Installed
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onMarkInstalled(app.packageName)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Mark Installed
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#F1F3F6] bg-[#F9FAFB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-[#4B5563]">
            {remainingCount > 0
              ? `${remainingCount} app${remainingCount === 1 ? '' : 's'} still pending installation. Save the link file to finish anytime.`
              : `All missing apps installed and placeholders converted on ${targetDeviceName}.`}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onDownloadFile('txt')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Save Link File
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#111827] hover:bg-[#1F2937] rounded-lg cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
