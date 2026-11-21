import React, { useState } from 'react';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';
import { ANDROID_COMPANION_FILES } from '../data/kotlinCompanion';

export function CompanionView() {
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const activeFile = ANDROID_COMPANION_FILES[selectedFileIndex];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadFile = () => {
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
          Android Companion Module (Kotlin)
        </h1>
        <p className="text-sm text-[#4B5563] mt-1 max-w-3xl">
          Native Android Kotlin source files that pair directly with HomeGrid’s v2.0 JSON backup format and REST Cloud Vault endpoints using <code className="font-mono text-xs text-[#111827]">LauncherApps</code>, <code className="font-mono text-xs text-[#111827]">AppWidgetManager</code>, and <code className="font-mono text-xs text-[#111827]">WorkManager</code>.
        </p>
      </div>

      {/* Capabilities breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E4E7EC] rounded-2xl p-5">
          <p className="text-sm font-semibold text-[#111827]">01. Launcher Grid Capture</p>
          <p className="text-xs text-[#4B5563] mt-1.5 leading-relaxed">
            Reads active home screens, supplemental pages, folder groups, and dock apps via <code className="font-mono">LauncherApps</code> and optional Accessibility node traversal for stock launchers.
          </p>
        </div>
        <div className="bg-white border border-[#E4E7EC] rounded-2xl p-5">
          <p className="text-sm font-semibold text-[#111827]">02. Replace & Merge Engine</p>
          <p className="text-xs text-[#4B5563] mt-1.5 leading-relaxed">
            Supports clean-slate layout restoration or non-destructive merging that deduplicates packages and combines identically named icon folders across devices.
          </p>
        </div>
        <div className="bg-white border border-[#E4E7EC] rounded-2xl p-5">
          <p className="text-sm font-semibold text-[#111827]">03. Background Widget Sync</p>
          <p className="text-xs text-[#4B5563] mt-1.5 leading-relaxed">
            Uses <code className="font-mono">WorkManager</code> + <code className="font-mono">AppWidgetManager.updateAppWidgetOptions()</code> to synchronize bound widget configurations across Android devices.
          </p>
        </div>
      </div>

      {/* Code Viewer */}
      <div className="bg-white border border-[#E4E7EC] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E4E7EC] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAFBFD]">
          <div className="flex items-center gap-1 overflow-x-auto">
            {ANDROID_COMPANION_FILES.map((file, idx) => (
              <button
                key={file.filename}
                type="button"
                onClick={() => setSelectedFileIndex(idx)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  idx === selectedFileIndex
                    ? 'bg-[#111827] text-white'
                    : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#ECEEF2]'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5" />
                {file.filename}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#374151] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#166534]" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleDownloadFile}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-[#F1F3F6] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <span className="font-mono text-[#6B7280]">{activeFile.path}</span>
          <span className="text-[#4B5563]">{activeFile.summary}</span>
        </div>

        <pre className="p-5 overflow-x-auto text-xs leading-relaxed font-mono bg-[#0F172A] text-[#E2E8F0] max-h-[540px]">
          <code>{activeFile.content}</code>
        </pre>
      </div>
    </div>
  );
}
