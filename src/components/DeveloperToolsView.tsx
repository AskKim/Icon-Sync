import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bug,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Download,
  FileJson,
  Grid2x2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  DeviceProfile,
  GridAdaptationStrategy,
  LayoutBackupSnapshot,
  WidgetSyncPolicy,
} from '../types/layout';
import {
  DiagnosticCategory,
  DiagnosticLogEntry,
  FaultSimulationConfig,
  IntegrityFinding,
  ServerDiagnosticsSnapshot,
} from '../types/diagnostics';
import {
  analyzeGridCompatibility,
  auditWorkspaceIntegrity,
  computeRestoreResult,
  repairBackupPayload,
  validateBackupPayload,
} from '../engine/layoutEngine';
import {
  downloadDiagnosticsBundle,
  fetchServerDiagnostics,
  inspectLocalStorageCache,
} from '../services/cloudApi';

const LazyCompanionView = lazy(() =>
  import('./CompanionView').then((m) => ({ default: m.CompanionView }))
);

type DevSubTab = 'health' | 'grid-lab' | 'logs' | 'faults-json' | 'android-apk';

interface DeveloperToolsViewProps {
  devices: DeviceProfile[];
  activeDeviceId: string;
  backups: LayoutBackupSnapshot[];
  widgetSyncPolicy: WidgetSyncPolicy;
  logs: DiagnosticLogEntry[];
  faultConfig: FaultSimulationConfig;
  schemaRevision: number;
  onUpdateFaultConfig: (next: FaultSimulationConfig) => void;
  onAutoFixFinding: (finding: IntegrityFinding) => void;
  onAutoFixAllFindings: (findings: IntegrityFinding[]) => void;
  onInjectOutOfBoundsFault: () => void;
  onForcePushCloud: () => Promise<void>;
  onReloadFromCloud: () => Promise<void>;
  onClearLocalCache: () => void;
  onResetDemoWorkspace: () => void;
  onImportRepairedBackup: (backup: LayoutBackupSnapshot) => void;
  onClearLogs: () => void;
  onRecordLog: (entry: Omit<DiagnosticLogEntry, 'id' | 'timestamp'>) => void;
  onNotify: (severity: 'success' | 'warning' | 'error' | 'info', title: string, message: string) => void;
}

export function DeveloperToolsView({
  devices,
  activeDeviceId,
  backups,
  widgetSyncPolicy,
  logs,
  faultConfig,
  schemaRevision,
  onUpdateFaultConfig,
  onAutoFixFinding,
  onAutoFixAllFindings,
  onInjectOutOfBoundsFault,
  onForcePushCloud,
  onReloadFromCloud,
  onClearLocalCache,
  onResetDemoWorkspace,
  onImportRepairedBackup,
  onClearLogs,
  onRecordLog,
  onNotify,
}: DeveloperToolsViewProps) {
  const [subTab, setSubTab] = useState<DevSubTab>('health');
  const [serverDiag, setServerDiag] = useState<ServerDiagnosticsSnapshot | null>(null);
  const [isProbing, setIsProbing] = useState(false);

  // Grid Remap Lab state
  const defaultSixBySix =
    backups.find((b) => b.gridCols >= 6 || b.gridRows >= 6)?.id ?? backups[0]?.id ?? '';
  const [labBackupId, setLabBackupId] = useState<string>(defaultSixBySix);
  const [labTargetCols, setLabTargetCols] = useState<number>(5);
  const [labTargetRows, setLabTargetRows] = useState<number>(4);
  const [labStrategy, setLabStrategy] = useState<GridAdaptationStrategy>('auto-reflow');

  // Activity log filter state
  const [logFilter, setLogFilter] = useState<DiagnosticCategory | 'all'>('all');
  const [logSearch, setLogSearch] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // JSON Validator / Inspector state
  const [rawJsonInput, setRawJsonInput] = useState('');
  const [jsonValidationMsg, setJsonValidationMsg] = useState<{
    ok: boolean;
    text: string;
    repairable?: boolean;
    parsed?: unknown;
  } | null>(null);
  const [copiedBundle, setCopiedBundle] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const localCache = useMemo(
    () => inspectLocalStorageCache(),
    // Re-inspect when persisted workspace snapshots or server diagnostics refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devices, backups, serverDiag]
  );
  const integrityFindings = useMemo(
    () => auditWorkspaceIntegrity(devices, backups),
    [devices, backups]
  );

  const runServerProbe = async () => {
    setIsProbing(true);
    const snap = await fetchServerDiagnostics();
    setServerDiag(snap);
    setIsProbing(false);
    onRecordLog({
      level: snap.ok ? 'success' : 'error',
      category: 'api',
      title: 'GET /api/diagnostics',
      message: snap.ok
        ? `Server healthy (${snap.latencyMs}ms) · Vault ${(snap.vaultSizeBytes / 1024).toFixed(1)} KB`
        : snap.error ?? 'Diagnostics probe failed',
      durationMs: snap.latencyMs,
      statusCode: snap.ok ? 200 : 503,
      meta: {
        vaultFileExists: snap.vaultFileExists,
        uptimeSeconds: snap.uptimeSeconds,
        nodeVersion: snap.nodeVersion,
      },
    });
  };

  useEffect(() => {
    void runServerProbe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grid Remap Lab live computation (only when the Grid Lab tab is active)
  const labBackup = backups.find((b) => b.id === labBackupId) ?? backups[0];
  const labResult = useMemo(() => {
    if (subTab !== 'grid-lab' || !labBackup) return null;
    const activeDev = devices.find((d) => d.id === activeDeviceId) ?? devices[0];
    const syntheticTarget: DeviceProfile = {
      ...activeDev,
      id: 'sandbox-target',
      name: `Sandbox Target (${labTargetCols}×${labTargetRows})`,
      launcher: 'Nova Launcher 8',
      gridCols: labTargetCols,
      gridRows: labTargetRows,
      installedPackages: Array.from(
        new Set([
          ...activeDev.installedPackages,
          ...labBackup.screens.flatMap((s) => [
            ...s.icons.map((i) => i.packageName),
            ...s.folders.flatMap((f) => f.apps.map((a) => a.packageName)),
          ]),
        ])
      ),
    };
    const compat = analyzeGridCompatibility(syntheticTarget, labBackup);
    const res = computeRestoreResult(syntheticTarget, labBackup, 'replace', {
      deduplicateApps: false,
      mergeMatchingFolders: false,
      syncWidgetsOnImport: true,
      overflowToNewScreen: true,
      missingAppStrategy: 'placeholder',
      gridStrategy: labStrategy,
    });
    return { compat, ...res };
  }, [subTab, labBackup, devices, activeDeviceId, labTargetCols, labTargetRows, labStrategy]);

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (logFilter !== 'all' && entry.category !== logFilter) return false;
      if (!logSearch.trim()) return true;
      const q = logSearch.toLowerCase();
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.message.toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q)
      );
    });
  }, [logs, logFilter, logSearch]);

  const buildFullDiagnosticsBundle = () => ({
    app: 'Icon Sync',
    exportedAt: new Date().toISOString(),
    schemaRevision,
    serverDiagnostics: serverDiag,
    localStorageCache: localCache,
    faultSimulation: faultConfig,
    integrityFindings,
    deviceSummaries: devices.map((d) => ({
      id: d.id,
      name: d.name,
      launcher: d.launcher,
      grid: `${d.gridCols}x${d.gridRows}`,
      gridDetectionSource: d.gridDetectionSource,
      screens: d.screens.length,
      installedPackages: d.installedPackages.length,
    })),
    backupSummaries: backups.map((b) => ({
      id: b.id,
      name: b.name,
      grid: `${b.gridCols}x${b.gridRows}`,
      checksum: b.checksum,
      storage: b.storage,
    })),
    widgetSyncPolicy,
    recentLogs: logs.slice(0, 80),
  });

  const handleCopyBundle = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildFullDiagnosticsBundle(), null, 2));
      setCopiedBundle(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopiedBundle(false), 1800);
      onNotify('success', 'Diagnostics Copied', 'Copied Icon Sync diagnostic JSON bundle to clipboard.');
    } catch {
      onNotify(
        'error',
        'Clipboard Access Blocked',
        'Browser denied clipboard write. Use "Download Bundle" instead.'
      );
    }
  };

  const handleValidatePastedJson = () => {
    if (!rawJsonInput.trim()) {
      setJsonValidationMsg({ ok: false, text: 'Paste a backup JSON payload first.' });
      return;
    }
    try {
      const parsed = JSON.parse(rawJsonInput) as unknown;
      const res = validateBackupPayload(parsed);
      if (res.valid && res.backup) {
        setJsonValidationMsg({
          ok: true,
          text: `Valid Icon Sync v2.0 backup: "${res.backup.name}" (${res.backup.gridCols}×${res.backup.gridRows}, ${res.backup.stats.screenCount} screens, checksum ${res.backup.checksum}).`,
          parsed,
        });
      } else {
        setJsonValidationMsg({
          ok: false,
          text: `${res.errorCode ?? 'VALIDATION_ERROR'}: ${res.error ?? 'Invalid backup structure.'}`,
          repairable: res.repairable,
          parsed,
        });
      }
    } catch (err) {
      setJsonValidationMsg({
        ok: false,
        text: `JSON Syntax Error: ${err instanceof Error ? err.message : 'Unable to parse JSON.'}`,
        repairable: false,
      });
    }
  };

  const handleRepairAndImportPastedJson = () => {
    if (!jsonValidationMsg?.parsed) return;
    const repaired = repairBackupPayload(jsonValidationMsg.parsed);
    if (repaired.repaired && repaired.backup) {
      onImportRepairedBackup(repaired.backup);
      setJsonValidationMsg({
        ok: true,
        text: `Repaired & added "${repaired.backup.name}" to Vault (${repaired.changes.join(' · ')}).`,
      });
    } else {
      onNotify('error', 'Repair Failed', repaired.error ?? 'Could not repair pasted payload.');
    }
  };

  const subTabs: { id: DevSubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'health', label: 'Health & Audit', icon: Database },
    { id: 'grid-lab', label: 'Grid Remap Lab', icon: Grid2x2 },
    { id: 'logs', label: `Activity Log (${logs.length})`, icon: Activity },
    { id: 'faults-json', label: 'Faults & JSON Repair', icon: Bug },
    { id: 'android-apk', label: 'Android APK & Kotlin', icon: Code2 },
  ];

  const errorCount = integrityFindings.filter((f) => f.severity === 'error').length;
  const fixableFindings = integrityFindings.filter((f) => f.autoFixable);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#E4E7EC]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Developer Diagnostics & Android Build Tools
          </h1>
          <p className="text-sm text-[#4B5563] mt-1 max-w-3xl">
            Inspect Cloud Vault health, audit grid coordinates and checksums, stress-test non-same grid migrations (e.g. 6×6 → 5×4), simulate failure recovery paths, and view the Icon Sync Kotlin APK source.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyBundle}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            {copiedBundle ? 'Copied Bundle' : 'Copy Diagnostics'}
          </button>
          <button
            type="button"
            onClick={() => downloadDiagnosticsBundle(buildFullDiagnosticsBundle())}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#111827] hover:bg-[#1F2937] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Bundle (.json)
          </button>
        </div>
      </div>

      {/* Sub-Navigation Segmented Control */}
      <div className="flex items-center gap-1 p-1 bg-[#ECEEF2] rounded-lg overflow-x-auto w-full sm:w-fit">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-white text-[#111827] shadow-xs'
                  : 'text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: HEALTH & INTEGRITY AUDIT */}
      {subTab === 'health' && (
        <div className="space-y-6">
          {/* Server & Local Cache Side-by-Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#111827]">
                    Express Cloud Vault Probe
                  </h2>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Live round-trip check against <code className="font-mono">/api/diagnostics</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runServerProbe}
                  disabled={isProbing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-[#F9FAFB] border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
                  {isProbing ? 'Probing…' : 'Run Probe'}
                </button>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs pt-2 border-t border-[#F1F3F6]">
                <div>
                  <dt className="text-[#6B7280]">Endpoint Status</dt>
                  <dd className="font-semibold mt-0.5 flex items-center gap-1.5">
                    {serverDiag?.ok ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#166534]" />
                        <span className="text-[#166534]">Reachable</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5 text-[#DC2626]" />
                        <span className="text-[#DC2626]">Unreachable</span>
                      </>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Measured Latency</dt>
                  <dd className="font-mono tabular-nums font-medium text-[#111827] mt-0.5">
                    {serverDiag ? `${serverDiag.latencyMs} ms` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Vault File</dt>
                  <dd className="font-mono text-[11px] text-[#111827] mt-0.5 truncate">
                    {serverDiag?.vaultFilePath ?? '.data/icon-sync-vault.json'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Disk Size</dt>
                  <dd className="font-mono tabular-nums font-medium text-[#111827] mt-0.5">
                    {serverDiag ? `${(serverDiag.vaultSizeBytes / 1024).toFixed(2)} KB` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Server Uptime</dt>
                  <dd className="font-mono tabular-nums text-[#111827] mt-0.5">
                    {serverDiag ? `${serverDiag.uptimeSeconds}s` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Runtime</dt>
                  <dd className="font-mono text-[#111827] mt-0.5">
                    {serverDiag?.nodeVersion ?? '—'}
                  </dd>
                </div>
              </dl>

              {serverDiag?.error && (
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B] space-y-2">
                  <p className="font-semibold">Failure Cause</p>
                  <p>{serverDiag.error}</p>
                  {faultConfig.forceCloudOffline && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateFaultConfig({ ...faultConfig, forceCloudOffline: false })
                      }
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#111827] rounded-lg cursor-pointer"
                    >
                      Disable Simulated Offline Fault
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F1F3F6]">
                <button
                  type="button"
                  onClick={() => void onForcePushCloud()}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[#166534] hover:bg-[#14532D] rounded-lg cursor-pointer"
                >
                  Force Push Local → Cloud
                </button>
                <button
                  type="button"
                  onClick={() => void onReloadFromCloud()}
                  className="px-3 py-1.5 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg cursor-pointer"
                >
                  Reload Vault From Cloud
                </button>
              </div>
            </div>

            <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#111827]">
                  Browser Cache & Schema State
                </h2>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Client-side persistence under <code className="font-mono">{localCache.key}</code>
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs pt-2 border-t border-[#F1F3F6]">
                <div>
                  <dt className="text-[#6B7280]">Cache Status</dt>
                  <dd className="font-medium text-[#111827] mt-0.5">
                    {localCache.exists ? 'Populated' : 'Empty'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Cache Footprint</dt>
                  <dd className="font-mono tabular-nums font-medium text-[#111827] mt-0.5">
                    {(localCache.sizeBytes / 1024).toFixed(2)} KB
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Schema Revision</dt>
                  <dd className="font-mono tabular-nums text-[#111827] mt-0.5">
                    App Rev {schemaRevision} / Cache Rev {localCache.schemaRevision ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Registered Entities</dt>
                  <dd className="font-mono tabular-nums text-[#111827] mt-0.5">
                    {devices.length} devices · {backups.length} backups
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Last Cache Write</dt>
                  <dd className="font-mono tabular-nums text-[#111827] mt-0.5">
                    {localCache.updatedAt
                      ? new Date(localCache.updatedAt).toLocaleTimeString()
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Legacy HomeGrid Key</dt>
                  <dd className="font-medium text-[#111827] mt-0.5">
                    {localCache.legacyKeyPresent ? 'Detected (auto-migrated)' : 'None'}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F1F3F6]">
                <button
                  type="button"
                  onClick={onClearLocalCache}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#374151] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Local Cache
                </button>
                <button
                  type="button"
                  onClick={onResetDemoWorkspace}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] hover:bg-[#FEE2E2] rounded-lg cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Factory Reset Workspace
                </button>
              </div>
            </div>
          </div>

          {/* Workspace Integrity Auditor */}
          <div className="bg-white border border-[#E4E7EC] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#F1F3F6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#111827]">
                  Layout & Backup Integrity Auditor
                </h2>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Scans all {devices.length} devices and {backups.length} backups for out-of-bounds slots, overlapping cells, checksum drift, and stale placeholders.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-mono tabular-nums text-[#4B5563]">
                  {integrityFindings.length === 0
                    ? '0 issues found'
                    : `${errorCount} error${errorCount === 1 ? '' : 's'} · ${integrityFindings.length - errorCount} warning${integrityFindings.length - errorCount === 1 ? '' : 's'}`}
                </span>
                {fixableFindings.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onAutoFixAllFindings(fixableFindings)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Auto-Fix All ({fixableFindings.length})
                  </button>
                )}
              </div>
            </div>

            {integrityFindings.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <CheckCircle2 className="w-6 h-6 text-[#166534] mx-auto" />
                <p className="text-sm font-semibold text-[#111827]">
                  All device grids, coordinates, and backup checksums passed validation
                </p>
                <p className="text-xs text-[#6B7280] max-w-md mx-auto">
                  Need to verify how fail states behave? Switch to the Faults & JSON Repair tab to inject an out-of-bounds icon or corrupt checksum.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#F1F3F6]">
                {integrityFindings.map((finding) => (
                  <div
                    key={finding.id}
                    className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      {finding.severity === 'error' ? (
                        <ShieldAlert className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span
                            className={`font-semibold ${
                              finding.severity === 'error'
                                ? 'text-[#DC2626]'
                                : 'text-[#B45309]'
                            }`}
                          >
                            {finding.severity === 'error' ? 'Error' : 'Warning'}
                          </span>
                          <span aria-hidden="true" className="text-[#CBD5E1]">
                            ·
                          </span>
                          <span className="font-semibold text-[#111827]">{finding.summary}</span>
                          <span aria-hidden="true" className="text-[#CBD5E1]">
                            ·
                          </span>
                          <span className="text-[#6B7280]">{finding.targetName}</span>
                        </div>
                        <p className="text-xs text-[#4B5563] mt-0.5">{finding.details}</p>
                      </div>
                    </div>

                    {finding.autoFixable && (
                      <button
                        type="button"
                        onClick={() => onAutoFixFinding(finding)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111827] hover:bg-[#1F2937] rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        Auto-Fix
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: GRID REMAP LAB */}
      {subTab === 'grid-lab' && labBackup && labResult && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-[#111827]">
                Non-Same Grid Adaptation Sandbox (e.g., 6×6 → 5×4)
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Simulate importing any backup grid into any target launcher grid and compare occupancy heatmaps before touching a real device.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[#374151] mb-1.5">
                  Source Backup Snapshot
                </label>
                <select
                  value={labBackup.id}
                  onChange={(e) => setLabBackupId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
                >
                  {backups.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.gridCols}×{b.gridRows})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">
                  Target Grid (Cols × Rows)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={labTargetCols}
                    onChange={(e) => setLabTargetCols(Number(e.target.value))}
                    className="flex-1 px-2.5 py-2 text-xs font-mono bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
                  >
                    {[3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-[#6B7280]">×</span>
                  <select
                    value={labTargetRows}
                    onChange={(e) => setLabTargetRows(Number(e.target.value))}
                    className="flex-1 px-2.5 py-2 text-xs font-mono bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
                  >
                    {[3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">
                  Adaptation Strategy
                </label>
                <select
                  value={labStrategy}
                  onChange={(e) => setLabStrategy(e.target.value as GridAdaptationStrategy)}
                  className="w-full px-3 py-2 text-xs bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
                >
                  <option value="auto-reflow">Auto-Reflow & Overflow</option>
                  <option value="proportional-scale">Proportional Spatial Scale</option>
                  <option value="preserve-pages">Split Per Source Page</option>
                  <option value="resize-target-grid">Resize Target Grid</option>
                  <option value="crop-within-bounds">Strict Bounds (Crop)</option>
                </select>
              </div>
            </div>

            {/* Quick scenario buttons */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#6B7280]">Quick targets:</span>
              {[
                { cols: 5, rows: 4, label: '5×4 (Compact Mini)' },
                { cols: 4, rows: 5, label: '4×5 (Pixel)' },
                { cols: 4, rows: 6, label: '4×6 (A15/A16)' },
                { cols: 5, rows: 6, label: '5×6 (S24)' },
                { cols: 7, rows: 7, label: '7×7 (Home Up)' },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setLabTargetCols(p.cols);
                    setLabTargetRows(p.rows);
                  }}
                  className={`px-2.5 py-1 rounded-md border font-mono text-[11px] cursor-pointer ${
                    labTargetCols === p.cols && labTargetRows === p.rows
                      ? 'bg-[#111827] text-white border-[#111827]'
                      : 'bg-white text-[#374151] border-[#E4E7EC] hover:border-[#9CA3AF]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Diff metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-[#F1F3F6] text-xs">
              <div>
                <p className="text-[#6B7280]">Mismatch Type</p>
                <p className="font-semibold text-[#111827] capitalize mt-0.5">
                  {labResult.compat.mismatchType}
                </p>
              </div>
              <div>
                <p className="text-[#6B7280]">Out-of-Bounds Input</p>
                <p className="font-mono tabular-nums font-semibold text-[#111827] mt-0.5">
                  {labResult.compat.totalAffectedItems} items
                </p>
              </div>
              <div>
                <p className="text-[#6B7280]">Remapped / Resized</p>
                <p className="font-mono tabular-nums font-semibold text-[#111827] mt-0.5">
                  {labResult.report.reflowedItems} moved · {labResult.report.widgetsResized} wdg
                </p>
              </div>
              <div>
                <p className="text-[#6B7280]">Resulting Screens</p>
                <p className="font-mono tabular-nums font-semibold text-[#111827] mt-0.5">
                  {labBackup.screens.length} → {labResult.nextDevice.screens.length}
                </p>
              </div>
              <div>
                <p className="text-[#6B7280]">Dropped by Crop</p>
                <p className="font-mono tabular-nums font-semibold text-[#111827] mt-0.5">
                  {labResult.report.itemsDroppedByCrop}
                </p>
              </div>
            </div>

            {/* Side-by-side Source vs Output Occupancy Matrices */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              <div className="p-4 rounded-xl bg-[#FAFBFD] border border-[#E4E7EC] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#111827]">
                    Source Page 1 ({labBackup.gridCols}×{labBackup.gridRows})
                  </span>
                  <span className="font-mono tabular-nums text-[#6B7280]">
                    {labBackup.screens[0]?.name}
                  </span>
                </div>
                {labBackup.screens[0] && (
                  <OccupancyMatrix
                    page={labBackup.screens[0]}
                    cols={labBackup.gridCols}
                    rows={labBackup.gridRows}
                    highlightOutsideCols={labResult.report.targetGridAfter.cols}
                    highlightOutsideRows={labResult.report.targetGridAfter.rows}
                  />
                )}
                <p className="text-[11px] text-[#6B7280]">
                  Red-tinted cells exceed the target {labResult.report.targetGridAfter.cols}×{labResult.report.targetGridAfter.rows} boundary and must be remapped or resized.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAFBFD] border border-[#E4E7EC] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#111827]">
                    Adapted Output ({labResult.report.targetGridAfter.cols}×{labResult.report.targetGridAfter.rows})
                  </span>
                  <span className="font-mono tabular-nums text-[#6B7280]">
                    {labResult.nextDevice.screens.length} screen{labResult.nextDevice.screens.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  {labResult.nextDevice.screens.map((scr) => (
                    <div key={scr.id} className="space-y-1.5">
                      <p className="text-[11px] font-medium text-[#374151]">
                        {scr.name} ({scr.widgets.length} widgets · {scr.folders.length} folders · {scr.icons.length} icons)
                      </p>
                      <OccupancyMatrix
                        page={scr}
                        cols={labResult.report.targetGridAfter.cols}
                        rows={labResult.report.targetGridAfter.rows}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE ACTIVITY & API LOG */}
      {subTab === 'logs' && (
        <div className="bg-white border border-[#E4E7EC] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F1F3F6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-[#F3F4F6] rounded-lg overflow-x-auto">
              {(['all', 'api', 'grid', 'restore', 'vault', 'widget', 'error'] as const).map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setLogFilter(cat)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md capitalize whitespace-nowrap cursor-pointer ${
                      logFilter === cat
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    {cat}
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Filter events..."
                className="px-3 py-1.5 text-xs bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg w-44"
              />
              <button
                type="button"
                onClick={onClearLogs}
                className="px-2.5 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#DC2626] rounded-lg cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#6B7280]">
              No matching diagnostic events recorded yet. Interact with the app or run a Server Probe to inspect live telemetry.
            </div>
          ) : (
            <div className="divide-y divide-[#F1F3F6] max-h-[540px] overflow-y-auto">
              {filteredLogs.map((entry) => {
                const expanded = expandedLogId === entry.id;
                return (
                  <div key={entry.id} className="px-5 py-3 hover:bg-[#FAFBFD] text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="font-mono text-[11px] text-[#6B7280] tabular-nums">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        <span
                          className={`font-semibold uppercase text-[10px] ${
                            entry.level === 'error'
                              ? 'text-[#DC2626]'
                              : entry.level === 'warn'
                              ? 'text-[#B45309]'
                              : entry.level === 'success'
                              ? 'text-[#166534]'
                              : 'text-[#1D4ED8]'
                          }`}
                        >
                          {entry.level}
                        </span>
                        <span className="font-mono text-[11px] text-[#6B7280]">
                          [{entry.category}]
                        </span>
                        <span className="font-semibold text-[#111827]">{entry.title}</span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 font-mono text-[11px] text-[#6B7280] tabular-nums">
                        {entry.statusCode !== undefined && <span>HTTP {entry.statusCode}</span>}
                        {entry.durationMs !== undefined && <span>{entry.durationMs}ms</span>}
                        {entry.meta && (
                          <button
                            type="button"
                            onClick={() => setExpandedLogId(expanded ? null : entry.id)}
                            className="font-sans text-[11px] font-medium text-[#166534] hover:underline cursor-pointer"
                          >
                            {expanded ? 'Hide JSON' : 'Inspect'}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[#4B5563] mt-1">{entry.message}</p>
                    {expanded && entry.meta && (
                      <pre className="mt-2 p-3 rounded-lg bg-[#0F172A] text-[#E2E8F0] text-[11px] font-mono overflow-x-auto">
                        {JSON.stringify(entry.meta, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: FAULT SIMULATOR & JSON REPAIR */}
      {subTab === 'faults-json' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[#111827]">
                Failure Mode Simulator
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Inject controlled failures to verify Icon Sync’s error messaging, fallback caching, and recovery buttons.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              <label className="flex items-start justify-between gap-4 p-3.5 rounded-xl bg-[#FAFBFD] border border-[#E4E7EC] cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-[#111827]">
                    Force Cloud Vault Offline (HTTP 503)
                  </p>
                  <p className="text-[11px] text-[#6B7280] mt-0.5">
                    Causes /api/vault and /api/backups calls to fail so you can test Retry Cloud Sync & Local JSON fallback.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={faultConfig.forceCloudOffline}
                  onChange={(e) =>
                    onUpdateFaultConfig({ ...faultConfig, forceCloudOffline: e.target.checked })
                  }
                  className="w-4 h-4 mt-0.5 accent-[#DC2626]"
                />
              </label>

              <label className="flex items-start justify-between gap-4 p-3.5 rounded-xl bg-[#FAFBFD] border border-[#E4E7EC] cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-[#111827]">
                    Fail Launcher Grid Auto-Detection
                  </p>
                  <p className="text-[11px] text-[#6B7280] mt-0.5">
                    Simulates a restricted launcher blocking grid queries when clicking Auto-Detect on the Screens tab.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={faultConfig.failLauncherGridAutoDetect}
                  onChange={(e) =>
                    onUpdateFaultConfig({
                      ...faultConfig,
                      failLauncherGridAutoDetect: e.target.checked,
                    })
                  }
                  className="w-4 h-4 mt-0.5 accent-[#DC2626]"
                />
              </label>

              <label className="flex items-start justify-between gap-4 p-3.5 rounded-xl bg-[#FAFBFD] border border-[#E4E7EC] cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-[#111827]">
                    Corrupt Export Checksum (DEAD0000)
                  </p>
                  <p className="text-[11px] text-[#6B7280] mt-0.5">
                    Writes an invalid checksum on the next exported snapshot to test integrity auditing and auto-repair.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={faultConfig.corruptBackupChecksumOnExport}
                  onChange={(e) =>
                    onUpdateFaultConfig({
                      ...faultConfig,
                      corruptBackupChecksumOnExport: e.target.checked,
                    })
                  }
                  className="w-4 h-4 mt-0.5 accent-[#DC2626]"
                />
              </label>

              <div className="p-3.5 rounded-xl bg-[#FAFBFD] border border-[#E4E7EC] flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-[#111827]">Artificial API Latency</p>
                  <p className="text-[11px] text-[#6B7280] mt-0.5">
                    Adds delay to Cloud Vault HTTP requests.
                  </p>
                </div>
                <select
                  value={faultConfig.artificialLatencyMs}
                  onChange={(e) =>
                    onUpdateFaultConfig({
                      ...faultConfig,
                      artificialLatencyMs: Number(e.target.value),
                    })
                  }
                  className="px-2.5 py-1.5 text-xs font-mono bg-white border border-[#E4E7EC] rounded-lg"
                >
                  <option value={0}>0 ms (Normal)</option>
                  <option value={500}>500 ms</option>
                  <option value={1500}>1500 ms</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-[#F1F3F6] flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onInjectOutOfBoundsFault}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] hover:bg-[#FEE2E2] rounded-lg cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Inject Out-of-Bounds Icon on Active Device
              </button>
            </div>
          </div>

          {/* Raw Backup JSON Validator & Repair Tool */}
          <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#111827]">
                  Backup JSON Validator & Repair Tool
                </h2>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Paste any Icon Sync or legacy HomeGrid JSON snapshot to check schema v2.0 compliance and FNV-1a checksums.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (backups[0]) {
                    setRawJsonInput(JSON.stringify(backups[0], null, 2));
                    setJsonValidationMsg(null);
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-[#374151] bg-[#F9FAFB] border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg whitespace-nowrap cursor-pointer"
              >
                <FileJson className="w-3.5 h-3.5" />
                Load Active Sample
              </button>
            </div>

            <textarea
              rows={9}
              value={rawJsonInput}
              onChange={(e) => setRawJsonInput(e.target.value)}
              placeholder='Paste backup JSON here, e.g. { "name": "...", "gridCols": 6, "gridRows": 6, "screens": [...] }'
              className="w-full p-3 text-xs font-mono bg-[#0F172A] text-[#E2E8F0] rounded-xl border border-[#1E293B] focus:outline-none focus:border-[#166534]"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleValidatePastedJson}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#111827] hover:bg-[#1F2937] rounded-lg cursor-pointer"
              >
                Validate Schema & Checksum
              </button>
              {jsonValidationMsg && !jsonValidationMsg.ok && jsonValidationMsg.repairable && (
                <button
                  type="button"
                  onClick={handleRepairAndImportPastedJson}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg cursor-pointer"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  Auto-Repair & Add to Vault
                </button>
              )}
            </div>

            {jsonValidationMsg && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  jsonValidationMsg.ok
                    ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#14532D]'
                    : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                }`}
              >
                {jsonValidationMsg.text}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: ANDROID APK, KOTLIN COMPANION & GITHUB ACTIONS */}
      {subTab === 'android-apk' && (
        <Suspense
          fallback={
            <div className="bg-white border border-[#E4E7EC] rounded-2xl p-8 text-xs text-[#6B7280] text-center">
              Loading Android Companion source viewer…
            </div>
          }
        >
          <LazyCompanionView />
        </Suspense>
      )}
    </div>
  );
}

type CellKind = 'widget' | 'folder' | 'icon' | 'empty';

function OccupancyMatrix({
  page,
  cols,
  rows,
  highlightOutsideCols,
  highlightOutsideRows,
}: {
  page: DeviceProfile['screens'][number];
  cols: number;
  rows: number;
  highlightOutsideCols?: number;
  highlightOutsideRows?: number;
}) {
  const cellKinds = useMemo(() => {
    const matrix: CellKind[][] = Array.from({ length: rows }, () =>
      Array<CellKind>(cols).fill('empty')
    );
    for (const ic of page.icons) {
      if (ic.row >= 0 && ic.row < rows && ic.col >= 0 && ic.col < cols) {
        matrix[ic.row][ic.col] = 'icon';
      }
    }
    for (const fl of page.folders) {
      if (fl.row >= 0 && fl.row < rows && fl.col >= 0 && fl.col < cols) {
        matrix[fl.row][fl.col] = 'folder';
      }
    }
    for (const w of page.widgets) {
      const rEnd = Math.min(rows, w.row + w.spanY);
      const cEnd = Math.min(cols, w.col + w.spanX);
      for (let r = Math.max(0, w.row); r < rEnd; r++) {
        for (let c = Math.max(0, w.col); c < cEnd; c++) {
          matrix[r][c] = 'widget';
        }
      }
    }
    return matrix;
  }, [page, cols, rows]);

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {cellKinds.map((rowCells, r) =>
        rowCells.map((kind, c) => {
          const outside =
            (highlightOutsideCols !== undefined && c >= highlightOutsideCols) ||
            (highlightOutsideRows !== undefined && r >= highlightOutsideRows);

          const styleClass =
            outside && kind !== 'empty'
              ? 'bg-[#FEE2E2] border-[#FCA5A5] text-[#991B1B]'
              : outside
              ? 'bg-[#FEF2F2]/60 border-dashed border-[#FECACA] text-[#DC2626]/60'
              : kind === 'widget'
              ? 'bg-[#DCFCE7] border-[#86EFAC] text-[#166534]'
              : kind === 'folder'
              ? 'bg-[#E0E7FF] border-[#A5B4FC] text-[#3730A3]'
              : kind === 'icon'
              ? 'bg-[#111827] border-[#111827] text-white'
              : 'bg-white border-[#E4E7EC] text-[#9CA3AF]';

          return (
            <div
              key={`${c}-${r}`}
              className={`h-7 rounded border text-[10px] font-mono tabular-nums flex items-center justify-center ${styleClass}`}
              title={`(${c + 1},${r + 1}) ${kind}${outside ? ' — outside target grid' : ''}`}
            >
              {kind === 'widget'
                ? 'W'
                : kind === 'folder'
                ? 'F'
                : kind === 'icon'
                ? 'I'
                : '·'}
            </div>
          );
        })
      )}
    </div>
  );
}
