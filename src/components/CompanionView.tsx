import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';
import { ANDROID_COMPANION_FILES } from '../data/kotlinCompanion';

export function CompanionView() {
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const activeFile = ANDROID_COMPANION_FILES[selectedFileIndex];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
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
        <h2 className="text-xl font-bold tracking-tight text-[#111827]">
          Icon Sync Android APK & Companion Source (Kotlin)
        </h2>
        <p className="text-sm text-[#4B5563] mt-1 max-w-3xl">
          Native Android Kotlin source files under <code className="font-mono text-xs text-[#111827]">android/</code> (<code className="font-mono text-xs text-[#111827]">com.iconsync.android</code>) paired with Icon Sync’s v2.0 JSON backup schema, cross-grid remapper, and automated GitHub Actions APK build workflow.
        </p>
      </div>

      {/* Capabilities breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E4E7EC] rounded-2xl p-5">
          <p className="text-sm font-semibold text-[#111827]">01. Auto Grid Detection</p>
          <p className="text-xs text-[#4B5563] mt-1.5 leading-relaxed">
            Detects active grid dimensions via launcher provider metadata (Nova, Lawnchair), Accessibility bounds, or OEM profiles, with manual fallback reporting for minimalist launchers.
          </p>
        </div>
        <div className="bg-white border border-[#E4E7EC] rounded-2xl p-5">
          <p className="text-sm font-semibold text-[#111827]">02. Cross-Grid Remapper</p>
          <p className="text-xs text-[#4B5563] mt-1.5 leading-relaxed">
            Adapts mismatched grids such as <code className="font-mono">6×6 → 5×4</code> via Auto-Reflow, Proportional Spatial Scaling, Page-Locked Split, or Target Resize without dropping apps.
          </p>
        </div>
        <div className="bg-white border border-[#E4E7EC] rounded-2xl p-5">
          <p className="text-sm font-semibold text-[#111827]">03. GitHub Actions APK Build</p>
          <p className="text-xs text-[#4B5563] mt-1.5 leading-relaxed">
            Compiles <code className="font-mono">IconSync-v*-debug.apk</code> and optional signed release APKs on every push or tag via <code className="font-mono">.github/workflows/build-android-apk.yml</code>.
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
