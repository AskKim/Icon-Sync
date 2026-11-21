export type FeedbackSeverity = 'success' | 'warning' | 'error' | 'info';

export interface FeedbackRecoveryAction {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary';
  onClick: () => void;
}

export interface FeedbackBannerItem {
  id: string;
  severity: FeedbackSeverity;
  title: string;
  message: string;
  code?: string;
  details?: string;
  createdAt: string;
  recoveryActions?: FeedbackRecoveryAction[];
  autoHideMs?: number;
}

export type DiagnosticCategory =
  | 'api'
  | 'vault'
  | 'grid'
  | 'restore'
  | 'widget'
  | 'error'
  | 'system';

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  category: DiagnosticCategory;
  title: string;
  message: string;
  durationMs?: number;
  statusCode?: number;
  meta?: Record<string, unknown>;
}

export interface FaultSimulationConfig {
  forceCloudOffline: boolean;
  artificialLatencyMs: number;
  corruptBackupChecksumOnExport: boolean;
  failLauncherGridAutoDetect: boolean;
}

export interface IntegrityFinding {
  id: string;
  severity: 'error' | 'warning';
  category: 'out-of-bounds' | 'collision' | 'checksum' | 'stale-placeholder' | 'duplicate-package';
  targetType: 'device' | 'backup';
  targetId: string;
  targetName: string;
  summary: string;
  details: string;
  autoFixable: boolean;
}

export interface ServerDiagnosticsSnapshot {
  ok: boolean;
  service: string;
  version: string;
  vaultFileExists: boolean;
  vaultFilePath: string;
  vaultSizeBytes: number;
  vaultUpdatedAt: string | null;
  legacyVaultDetected: boolean;
  uptimeSeconds: number;
  nodeVersion: string;
  latencyMs: number;
  checkedAt: string;
  error?: string;
}
