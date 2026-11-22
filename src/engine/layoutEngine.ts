/**
 * @file src/engine/layoutEngine.ts
 * @license GPL-3.0-or-later
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ============================================================================
 * ICON SYNC — CORE HOME SCREEN LAYOUT, CROSS-GRID ADAPTATION & AUDIT ENGINE
 * ============================================================================
 *
 * PLAIN-ENGLISH OVERVIEW (for beginners & AI readers):
 * Think of every Android home screen page as a spreadsheet of cells:
 *   - `col` = column index starting at 0 on the left (`0 .. gridCols - 1`)
 *   - `row` = row index starting at 0 at the top (`0 .. gridRows - 1`)
 *   - Icons and folders occupy 1x1 cell; widgets occupy `spanX x spanY` cells.
 *
 * This pure TypeScript engine has zero React UI dependencies, which makes it
 * deterministic, easy to test, and mirrored 1:1 in Kotlin (`GridRemapper.kt`).
 *
 * MAIN RESPONSIBILITIES:
 *   1. Launcher Grid Registry & Auto-Detection (`LAUNCHER_GRID_CAPABILITIES`, `autoDetectDeviceGrid`)
 *   2. Cross-Grid Compatibility Analysis (`analyzeGridCompatibility` — e.g., 6x6 -> 5x4)
 *   3. 5-Strategy Layout Restore Solver (`computeRestoreResult` in Replace & Merge modes)
 *   4. Strict Backup JSON Validation, Sanitation & Auto-Repair (`validateBackupPayload`, `repairBackupPayload`)
 *   5. Workspace Integrity Auditor (`auditWorkspaceIntegrity`)
 *   6. Cross-Device Widget State Propagation (`propagateSyncedWidget`, `pushWidgetToDevice`)
 */

import {
  AppIconItem,
  BackupStats,
  DeviceProfile,
  FolderItem,
  GridAdaptationStrategy,
  GridCompatibilityAnalysis,
  GridConfidence,
  GridDetectionSource,
  HomeScreenPage,
  IconArtEntry,
  LauncherGridCapability,
  LayoutBackupSnapshot,
  MergeOptions,
  MissingAppEntry,
  RestoreDiffReport,
  RestoreMode,
  WidgetItem,
} from '../types/layout';
import { IntegrityFinding } from '../types/diagnostics';
import {
  sanitizeHexColor,
  sanitizeIconArtDataUri,
  sanitizePackageName,
  sanitizePlayStoreUrl,
  sanitizeText,
  stripDangerousKeys,
} from '../utils/sanitize';

export const LAUNCHER_GRID_CAPABILITIES: LauncherGridCapability[] = [
  {
    id: 'pixel-launcher',
    launcherName: 'Pixel Launcher',
    packageName: 'com.google.android.apps.nexuslauncher',
    supportsProviderQuery: false,
    supportsAccessibilityDetect: true,
    allowsCustomGrid: false,
    minCols: 4,
    maxCols: 5,
    minRows: 4,
    maxRows: 6,
    presets: [
      { cols: 4, rows: 4, label: '4 × 4 (Large)' },
      { cols: 4, rows: 5, label: '4 × 5 (Default)' },
      { cols: 5, rows: 5, label: '5 × 5 (Medium)' },
      { cols: 5, rows: 6, label: '5 × 6 (Compact)' },
    ],
    detectionNotes:
      'Pixel Launcher restricts grid presets to 4×4–5×6 and does not expose a public ContentProvider; Icon Sync detects coordinates via Accessibility workspace traversal.',
  },
  {
    id: 'one-ui-home',
    launcherName: 'One UI Home',
    packageName: 'com.sec.android.app.launcher',
    supportsProviderQuery: false,
    supportsAccessibilityDetect: true,
    allowsCustomGrid: true,
    minCols: 4,
    maxCols: 7,
    minRows: 5,
    maxRows: 7,
    presets: [
      { cols: 4, rows: 5, label: '4 × 5 (Classic)' },
      { cols: 4, rows: 6, label: '4 × 6 (A15/A16)' },
      { cols: 5, rows: 5, label: '5 × 5' },
      { cols: 5, rows: 6, label: '5 × 6 (S-Series)' },
      { cols: 6, rows: 6, label: '6 × 6 (Home Up)' },
      { cols: 7, rows: 7, label: '7 × 7 (Home Up Max)' },
    ],
    detectionNotes:
      'Stock One UI supports 4×5 through 5×6; installing Samsung Good Lock Home Up unlocks custom grids up to 7×7.',
  },
  {
    id: 'nova-launcher',
    launcherName: 'Nova Launcher 8',
    packageName: 'com.teslacoilsw.launcher',
    supportsProviderQuery: true,
    supportsAccessibilityDetect: true,
    allowsCustomGrid: true,
    minCols: 3,
    maxCols: 8,
    minRows: 3,
    maxRows: 8,
    presets: [
      { cols: 4, rows: 5, label: '4 × 5' },
      { cols: 5, rows: 4, label: '5 × 4 (Compact)' },
      { cols: 5, rows: 5, label: '5 × 5' },
      { cols: 5, rows: 6, label: '5 × 6' },
      { cols: 6, rows: 6, label: '6 × 6 (Power)' },
      { cols: 6, rows: 7, label: '6 × 7 (Dense)' },
      { cols: 7, rows: 7, label: '7 × 7' },
    ],
    detectionNotes:
      'Nova Launcher exports explicit desktopGridColumns & desktopGridRows metadata so Icon Sync can auto-detect or resize custom grids up to 8×8.',
  },
  {
    id: 'lawnchair',
    launcherName: 'Lawnchair 14',
    packageName: 'app.lawnchair',
    supportsProviderQuery: true,
    supportsAccessibilityDetect: true,
    allowsCustomGrid: true,
    minCols: 3,
    maxCols: 8,
    minRows: 3,
    maxRows: 8,
    presets: [
      { cols: 4, rows: 5, label: '4 × 5' },
      { cols: 5, rows: 4, label: '5 × 4' },
      { cols: 5, rows: 5, label: '5 × 5' },
      { cols: 6, rows: 6, label: '6 × 6' },
      { cols: 7, rows: 6, label: '7 × 6' },
    ],
    detectionNotes:
      'Lawnchair reports grid geometry via launcher backup preferences and supports arbitrary column/row pairs.',
  },
  {
    id: 'mini-launcher',
    launcherName: 'Mini / Minimalist Launcher',
    packageName: 'bitpit.launcher',
    supportsProviderQuery: false,
    supportsAccessibilityDetect: false,
    allowsCustomGrid: true,
    minCols: 3,
    maxCols: 6,
    minRows: 3,
    maxRows: 7,
    presets: [
      { cols: 4, rows: 4, label: '4 × 4 (Mini)' },
      { cols: 5, rows: 4, label: '5 × 4 (Compact)' },
      { cols: 4, rows: 5, label: '4 × 5' },
      { cols: 6, rows: 5, label: '6 × 5' },
    ],
    detectionNotes:
      'Minimalist & custom launchers often hide workspace bounds from system APIs; report your grid manually so Icon Sync maps slots accurately.',
  },
  {
    id: 'quickstep-aosp',
    launcherName: 'Quickstep Launcher (AOSP)',
    packageName: 'com.android.launcher3',
    supportsProviderQuery: false,
    supportsAccessibilityDetect: true,
    allowsCustomGrid: false,
    minCols: 4,
    maxCols: 5,
    minRows: 4,
    maxRows: 5,
    presets: [
      { cols: 4, rows: 4, label: '4 × 4 (Large)' },
      { cols: 4, rows: 5, label: '4 × 5 (Icon 5 Default)' },
      { cols: 5, rows: 5, label: '5 × 5 (Compact)' },
    ],
    detectionNotes:
      'Stock Android 13 Quickstep launcher (e.g., Cricket Icon 5 SL112C) defaults to a fixed 4×5 grid; Icon Sync reads icon coordinates via Accessibility bounds or OEM profile.',
  },
];

export function getLauncherCapability(launcherName: string): LauncherGridCapability {
  const lower = launcherName.toLowerCase();
  if (lower.includes('pixel')) return LAUNCHER_GRID_CAPABILITIES[0];
  if (lower.includes('one ui')) return LAUNCHER_GRID_CAPABILITIES[1];
  if (lower.includes('nova')) return LAUNCHER_GRID_CAPABILITIES[2];
  if (lower.includes('lawnchair')) return LAUNCHER_GRID_CAPABILITIES[3];
  if (lower.includes('mini') || lower.includes('niagara') || lower.includes('smart')) {
    return LAUNCHER_GRID_CAPABILITIES[4];
  }
  if (lower.includes('quickstep') || lower.includes('aosp')) {
    return LAUNCHER_GRID_CAPABILITIES[5];
  }
  return {
    id: 'generic-android',
    launcherName: launcherName || 'Android Launcher',
    packageName: 'com.android.launcher3',
    supportsProviderQuery: false,
    supportsAccessibilityDetect: true,
    allowsCustomGrid: true,
    minCols: 3,
    maxCols: 8,
    minRows: 3,
    maxRows: 8,
    presets: [
      { cols: 4, rows: 5, label: '4 × 5' },
      { cols: 4, rows: 6, label: '4 × 6' },
      { cols: 5, rows: 4, label: '5 × 4' },
      { cols: 5, rows: 5, label: '5 × 5' },
      { cols: 5, rows: 6, label: '5 × 6' },
      { cols: 6, rows: 6, label: '6 × 6' },
    ],
    detectionNotes:
      'Standard Android launcher — Icon Sync probes Accessibility bounds and accepts manual grid reporting.',
  };
}

export function formatGridSourceLabel(source?: GridDetectionSource): string {
  switch (source) {
    case 'launcher-provider':
      return 'Launcher-reported';
    case 'auto-accessibility':
      return 'Auto-detected (Accessibility)';
    case 'oem-profile':
      return 'OEM profile';
    case 'user-reported':
      return 'User-reported';
    default:
      return 'Auto-detected';
  }
}

export function buildPlayStoreUrl(packageName: string): string {
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`;
}

export function cloneDeep<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

export function computeOccupancyGrid(
  page: HomeScreenPage,
  cols: number,
  rows: number,
  excludeId?: string
): boolean[][] {
  const grid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (const icon of page.icons) {
    if (icon.id === excludeId) continue;
    if (icon.row >= 0 && icon.row < rows && icon.col >= 0 && icon.col < cols) {
      grid[icon.row][icon.col] = true;
    }
  }

  for (const folder of page.folders) {
    if (folder.id === excludeId) continue;
    if (folder.row >= 0 && folder.row < rows && folder.col >= 0 && folder.col < cols) {
      grid[folder.row][folder.col] = true;
    }
  }

  for (const widget of page.widgets) {
    if (widget.id === excludeId) continue;
    for (let r = widget.row; r < widget.row + widget.spanY; r++) {
      for (let c = widget.col; c < widget.col + widget.spanX; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          grid[r][c] = true;
        }
      }
    }
  }

  return grid;
}

export function canPlaceAt(
  grid: boolean[][],
  cols: number,
  rows: number,
  col: number,
  row: number,
  spanX = 1,
  spanY = 1
): boolean {
  if (col < 0 || row < 0 || col + spanX > cols || row + spanY > rows) {
    return false;
  }
  for (let r = row; r < row + spanY; r++) {
    for (let c = col; c < col + spanX; c++) {
      if (grid[r][c]) return false;
    }
  }
  return true;
}

export function markOccupied(
  grid: boolean[][],
  col: number,
  row: number,
  spanX = 1,
  spanY = 1
): void {
  for (let r = row; r < row + spanY; r++) {
    for (let c = col; c < col + spanX; c++) {
      if (r >= 0 && r < grid.length && c >= 0 && c < grid[0].length) {
        grid[r][c] = true;
      }
    }
  }
}

export function findFirstOpenSlot(
  grid: boolean[][],
  cols: number,
  rows: number,
  spanX = 1,
  spanY = 1
): { col: number; row: number } | null {
  for (let r = 0; r <= rows - spanY; r++) {
    for (let c = 0; c <= cols - spanX; c++) {
      if (canPlaceAt(grid, cols, rows, c, r, spanX, spanY)) {
        return { col: c, row: r };
      }
    }
  }
  return null;
}

export function findNearestOpenSlot(
  grid: boolean[][],
  cols: number,
  rows: number,
  targetCol: number,
  targetRow: number,
  spanX = 1,
  spanY = 1
): { col: number; row: number } | null {
  let best: { col: number; row: number; dist: number } | null = null;
  for (let r = 0; r <= rows - spanY; r++) {
    for (let c = 0; c <= cols - spanX; c++) {
      if (canPlaceAt(grid, cols, rows, c, r, spanX, spanY)) {
        const dist = Math.abs(c - targetCol) + Math.abs(r - targetRow);
        if (!best || dist < best.dist) {
          best = { col: c, row: r, dist };
        }
      }
    }
  }
  return best ? { col: best.col, row: best.row } : null;
}

export function scaleCoordinate(
  coord: number,
  srcMax: number,
  dstMax: number,
  span = 1
): number {
  const usableDst = Math.max(0, dstMax - span);
  if (srcMax <= 1 || usableDst === 0) return 0;
  const ratio = coord / Math.max(1, srcMax - 1);
  return Math.max(0, Math.min(usableDst, Math.round(ratio * usableDst)));
}

const SHARED_TEXT_ENCODER = new TextEncoder();

function computeChecksumFromJson(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

export function computeChecksum(payload: unknown): string {
  return computeChecksumFromJson(JSON.stringify(payload));
}

export function generatePortableIconArtSvgDataUri(
  label: string,
  tint: string,
  iconKey: string
): string {
  const safeColor = sanitizeHexColor(tint, '#334155');
  const safeLabel = (sanitizeText(label, 24) || 'App')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const glyphText = safeLabel.slice(0, 2).toUpperCase();
  const safeKey = (sanitizeText(iconKey, 24) || 'app').replace(/[^a-zA-Z0-9-]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" data-icon-key="${safeKey}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="100%" stop-color="#000000" stop-opacity="0.16"/></linearGradient></defs><rect x="4" y="4" width="88" height="88" rx="24" fill="${safeColor}"/><rect x="4" y="4" width="88" height="88" rx="24" fill="url(#g)"/><text x="48" y="56" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="30" font-weight="700" fill="#ffffff">${glyphText}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function collectDeviceIconArtMap(
  device: DeviceProfile
): Record<string, IconArtEntry> {
  const assets: Record<string, IconArtEntry> = {};

  const recordApp = (app: Omit<AppIconItem, 'col' | 'row'>) => {
    const pkg = sanitizePackageName(app.packageName);
    const existing = assets[pkg];
    const customUri = sanitizeIconArtDataUri(app.customIconArt);
    if (existing && !customUri) return;
    assets[pkg] = {
      packageName: pkg,
      label: sanitizeText(app.label, 60) || 'App',
      iconKey: sanitizeText(app.iconKey, 40) || 'smartphone',
      tint: sanitizeHexColor(app.tint, '#334155'),
      dataUri:
        customUri ??
        generatePortableIconArtSvgDataUri(app.label, app.tint, app.iconKey),
    };
  };

  for (const d of device.dock) recordApp(d);
  for (const scr of device.screens) {
    for (const ic of scr.icons) recordApp(ic);
    for (const fl of scr.folders) {
      for (const app of fl.apps) recordApp(app);
    }
  }

  return assets;
}

export function estimateIconArtPayload(device: DeviceProfile): {
  uniqueIconCount: number;
  artBytes: number;
} {
  const assets = collectDeviceIconArtMap(device);
  const keys = Object.keys(assets);
  const artBytes =
    keys.length === 0
      ? 0
      : SHARED_TEXT_ENCODER.encode(JSON.stringify(assets)).length;
  return {
    uniqueIconCount: keys.length,
    artBytes,
  };
}

export function backupIncludesIconArt(
  backup?: LayoutBackupSnapshot | null
): boolean {
  if (!backup) return false;
  if (backup.includesIconArt === true) return true;
  if (backup.iconArtAssets && Object.keys(backup.iconArtAssets).length > 0) {
    return true;
  }
  for (const d of backup.dock ?? []) {
    if (d.customIconArt) return true;
  }
  for (const scr of backup.screens ?? []) {
    for (const ic of scr.icons ?? []) {
      if (ic.customIconArt) return true;
    }
    for (const fl of scr.folders ?? []) {
      for (const app of fl.apps ?? []) {
        if (app.customIconArt) return true;
      }
    }
  }
  return false;
}

export function getBackupIconArtCount(
  backup?: LayoutBackupSnapshot | null
): number {
  if (!backup || !backupIncludesIconArt(backup)) return 0;
  if (backup.iconArtAssets && Object.keys(backup.iconArtAssets).length > 0) {
    return Object.keys(backup.iconArtAssets).length;
  }
  const pkgs = new Set<string>();
  for (const d of backup.dock ?? []) pkgs.add(d.packageName);
  for (const scr of backup.screens ?? []) {
    for (const ic of scr.icons ?? []) pkgs.add(ic.packageName);
    for (const fl of scr.folders ?? []) {
      for (const app of fl.apps ?? []) pkgs.add(app.packageName);
    }
  }
  return pkgs.size;
}

export function computeBackupChecksum(
  screens: HomeScreenPage[],
  dock: DeviceProfile['dock'],
  gridCols: number,
  gridRows: number,
  iconArtAssets?: Record<string, IconArtEntry>
): string {
  const coreSerialized = JSON.stringify({ screens, dock });
  const hasArt = Boolean(iconArtAssets && Object.keys(iconArtAssets).length > 0);
  const baseInput = coreSerialized.endsWith('}')
    ? `${coreSerialized.slice(0, -1)},"gridCols":${gridCols},"gridRows":${gridRows}`
    : JSON.stringify({ screens, dock, gridCols, gridRows });

  const checksumInput = hasArt
    ? coreSerialized.endsWith('}')
      ? `${baseInput},"iconArtAssets":${JSON.stringify(iconArtAssets)}}`
      : JSON.stringify({ screens, dock, gridCols, gridRows, iconArtAssets })
    : coreSerialized.endsWith('}')
    ? `${baseInput}}`
    : baseInput;

  return computeChecksumFromJson(checksumInput);
}

function stripIconArtFromScreens(screens: HomeScreenPage[]): HomeScreenPage[] {
  return screens.map((scr) => ({
    ...scr,
    icons: scr.icons.map(({ customIconArt: _omitted, ...rest }) => rest),
    folders: scr.folders.map((fl) => ({
      ...fl,
      apps: fl.apps.map(({ customIconArt: _omitted, ...rest }) => rest),
    })),
  }));
}

function stripIconArtFromDock(
  dock: DeviceProfile['dock']
): DeviceProfile['dock'] {
  return dock.map(({ customIconArt: _omitted, ...rest }) => rest);
}

function computeStatsAndChecksum(
  screens: HomeScreenPage[],
  dock: DeviceProfile['dock'],
  gridCols: number,
  gridRows: number,
  iconArtAssets?: Record<string, IconArtEntry>
): { stats: BackupStats; checksum: string } {
  let iconCount = 0;
  let folderCount = 0;
  let nestedAppCount = 0;
  let widgetCount = 0;
  let syncedWidgetCount = 0;

  for (const scr of screens) {
    iconCount += scr.icons.length;
    folderCount += scr.folders.length;
    for (const f of scr.folders) {
      nestedAppCount += f.apps.length;
    }
    widgetCount += scr.widgets.length;
    for (const w of scr.widgets) {
      if (w.syncEnabled) syncedWidgetCount++;
    }
  }

  const hasArt = Boolean(iconArtAssets && Object.keys(iconArtAssets).length > 0);
  const coreSerialized = hasArt
    ? JSON.stringify({ screens, dock, iconArtAssets })
    : JSON.stringify({ screens, dock });

  return {
    stats: {
      screenCount: screens.length,
      iconCount,
      folderCount,
      nestedAppCount,
      widgetCount,
      syncedWidgetCount,
      dockCount: dock.length,
      iconArtCount: hasArt ? Object.keys(iconArtAssets!).length : 0,
      bytes: SHARED_TEXT_ENCODER.encode(coreSerialized).length,
    },
    checksum: computeBackupChecksum(screens, dock, gridCols, gridRows, iconArtAssets),
  };
}

export function computeBackupStats(
  screens: HomeScreenPage[],
  dock: DeviceProfile['dock']
): BackupStats {
  let iconCount = 0;
  let folderCount = 0;
  let nestedAppCount = 0;
  let widgetCount = 0;
  let syncedWidgetCount = 0;

  for (const scr of screens) {
    iconCount += scr.icons.length;
    folderCount += scr.folders.length;
    for (const f of scr.folders) {
      nestedAppCount += f.apps.length;
    }
    widgetCount += scr.widgets.length;
    for (const w of scr.widgets) {
      if (w.syncEnabled) syncedWidgetCount++;
    }
  }

  const serialized = JSON.stringify({ screens, dock });

  return {
    screenCount: screens.length,
    iconCount,
    folderCount,
    nestedAppCount,
    widgetCount,
    syncedWidgetCount,
    dockCount: dock.length,
    bytes: SHARED_TEXT_ENCODER.encode(serialized).length,
  };
}

export function buildBackupSnapshot(
  device: DeviceProfile,
  meta: {
    id?: string;
    name: string;
    notes: string;
    storage: 'cloud' | 'local';
    createdAt?: string;
    corruptChecksum?: boolean;
    includeIconArt?: boolean;
  }
): LayoutBackupSnapshot {
  const includeIconArt = Boolean(meta.includeIconArt);
  const rawScreens = cloneDeep(device.screens);
  const rawDock = cloneDeep(device.dock);
  const screens = includeIconArt ? rawScreens : stripIconArtFromScreens(rawScreens);
  const dock = includeIconArt ? rawDock : stripIconArtFromDock(rawDock);
  const iconArtAssets = includeIconArt ? collectDeviceIconArtMap(device) : undefined;

  const { stats, checksum: realChecksum } = computeStatsAndChecksum(
    screens,
    dock,
    device.gridCols,
    device.gridRows,
    iconArtAssets
  );

  return {
    id: meta.id ?? uid('bk'),
    name: meta.name.trim() || `${device.name} Backup`,
    notes: meta.notes.trim(),
    schemaVersion: '2.0',
    createdAt: meta.createdAt ?? new Date().toISOString(),
    storage: meta.storage,
    sourceDeviceId: device.id,
    sourceDeviceName: device.name,
    sourceLauncher: device.launcher,
    gridCols: device.gridCols,
    gridRows: device.gridRows,
    gridDetectionSource: device.gridDetectionSource ?? 'auto-accessibility',
    wallpaperId: device.wallpaperId,
    includesIconArt: includeIconArt,
    ...(includeIconArt && iconArtAssets ? { iconArtAssets } : {}),
    screens,
    dock,
    stats,
    checksum: meta.corruptChecksum ? 'DEAD0000' : realChecksum,
  };
}

export interface BackupValidationResult {
  valid: boolean;
  backup?: LayoutBackupSnapshot;
  error?: string;
  errorCode?: 'SYNTAX' | 'SCHEMA' | 'GRID_BOUNDS' | 'CHECKSUM_MISMATCH';
  repairable?: boolean;
  warnings?: string[];
}

export function validateBackupPayload(raw: unknown): BackupValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      error: 'File does not contain a valid JSON object.',
      errorCode: 'SCHEMA',
      repairable: false,
    };
  }
  // Strip prototype-pollution keys (__proto__, constructor, prototype) before inspecting fields
  const obj = stripDangerousKeys(raw) as Record<string, unknown>;
  if (!Array.isArray(obj.screens) || obj.screens.length === 0) {
    return {
      valid: false,
      error: 'Backup is missing a non-empty screens[] array.',
      errorCode: 'SCHEMA',
      repairable: false,
    };
  }

  const warnings: string[] = [];
  for (let i = 0; i < obj.screens.length; i++) {
    const screen = obj.screens[i];
    if (!screen || typeof screen !== 'object') {
      return {
        valid: false,
        error: `Screen entry at index ${i} is malformed.`,
        errorCode: 'SCHEMA',
        repairable: false,
      };
    }
    const s = screen as Record<string, unknown>;
    if (!Array.isArray(s.icons) || !Array.isArray(s.folders) || !Array.isArray(s.widgets)) {
      return {
        valid: false,
        error: `Screen "${String(s.name ?? i + 1)}" is missing icons[], folders[], or widgets[] arrays.`,
        errorCode: 'SCHEMA',
        repairable: true,
      };
    }
  }

  const screens = cloneDeep(obj.screens as HomeScreenPage[]);
  const dock = Array.isArray(obj.dock) ? cloneDeep(obj.dock as DeviceProfile['dock']) : [];
  const rawCols = typeof obj.gridCols === 'number' ? obj.gridCols : NaN;
  const rawRows = typeof obj.gridRows === 'number' ? obj.gridRows : NaN;

  // Detect grid size from placed coordinates if missing in file
  let maxObservedCol = 0;
  let maxObservedRow = 0;
  for (const s of screens) {
    for (const ic of s.icons) {
      maxObservedCol = Math.max(maxObservedCol, (ic.col ?? 0) + 1);
      maxObservedRow = Math.max(maxObservedRow, (ic.row ?? 0) + 1);
    }
    for (const f of s.folders) {
      maxObservedCol = Math.max(maxObservedCol, (f.col ?? 0) + 1);
      maxObservedRow = Math.max(maxObservedRow, (f.row ?? 0) + 1);
    }
    for (const w of s.widgets) {
      maxObservedCol = Math.max(maxObservedCol, (w.col ?? 0) + (w.spanX ?? 1));
      maxObservedRow = Math.max(maxObservedRow, (w.row ?? 0) + (w.spanY ?? 1));
    }
  }

  const gridCols =
    Number.isInteger(rawCols) && rawCols >= 3 && rawCols <= 8
      ? rawCols
      : Math.max(4, Math.min(8, maxObservedCol || 4));
  const gridRows =
    Number.isInteger(rawRows) && rawRows >= 3 && rawRows <= 8
      ? rawRows
      : Math.max(4, Math.min(8, maxObservedRow || 5));

  if (!Number.isInteger(rawCols) || !Number.isInteger(rawRows)) {
    warnings.push(
      `Backup lacked explicit grid dimensions; auto-inferred ${gridCols}×${gridRows} from item coordinates.`
    );
  }

  const rawIconArtAssets =
    obj.iconArtAssets && typeof obj.iconArtAssets === 'object' && !Array.isArray(obj.iconArtAssets)
      ? (obj.iconArtAssets as Record<string, unknown>)
      : undefined;
  let sanitizedIconArtAssets: Record<string, IconArtEntry> | undefined;
  if (rawIconArtAssets) {
    const cleanAssets: Record<string, IconArtEntry> = {};
    for (const [rawPkg, rawEntry] of Object.entries(rawIconArtAssets)) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const entry = rawEntry as Record<string, unknown>;
      const pkg = sanitizePackageName(entry.packageName ?? rawPkg);
      const safeUri = sanitizeIconArtDataUri(entry.dataUri);
      if (!safeUri) continue;
      cleanAssets[pkg] = {
        packageName: pkg,
        label: sanitizeText(entry.label, 60) || 'App',
        iconKey: sanitizeText(entry.iconKey, 40) || 'smartphone',
        tint: sanitizeHexColor(entry.tint, '#334155'),
        dataUri: safeUri,
      };
    }
    if (Object.keys(cleanAssets).length > 0) {
      sanitizedIconArtAssets = cleanAssets;
    }
  }

  for (const s of screens) {
    for (const ic of s.icons) {
      if (ic.customIconArt !== undefined) {
        ic.customIconArt = sanitizeIconArtDataUri(ic.customIconArt);
      }
    }
    for (const f of s.folders) {
      for (const app of f.apps) {
        if (app.customIconArt !== undefined) {
          app.customIconArt = sanitizeIconArtDataUri(app.customIconArt);
        }
      }
    }
  }
  for (const d of dock) {
    if (d.customIconArt !== undefined) {
      d.customIconArt = sanitizeIconArtDataUri(d.customIconArt);
    }
  }

  const { stats, checksum: expectedChecksum } = computeStatsAndChecksum(
    screens,
    dock,
    gridCols,
    gridRows,
    sanitizedIconArtAssets
  );

  if (typeof obj.checksum === 'string' && obj.checksum.trim() && obj.checksum !== expectedChecksum) {
    return {
      valid: false,
      error: `Checksum mismatch (file: ${obj.checksum}, expected: ${expectedChecksum}). The backup may have been manually edited or truncated.`,
      errorCode: 'CHECKSUM_MISMATCH',
      repairable: true,
      warnings,
    };
  }

  const includesIconArt =
    obj.includesIconArt === true || Boolean(sanitizedIconArtAssets);

  const normalized: LayoutBackupSnapshot = {
    id: typeof obj.id === 'string' && obj.id ? obj.id : uid('bk-imp'),
    name:
      typeof obj.name === 'string' && obj.name.trim()
        ? obj.name.trim()
        : 'Imported Backup File',
    notes: typeof obj.notes === 'string' ? obj.notes : '',
    schemaVersion: '2.0',
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    storage: obj.storage === 'cloud' ? 'cloud' : 'local',
    sourceDeviceId:
      typeof obj.sourceDeviceId === 'string' ? obj.sourceDeviceId : 'external-import',
    sourceDeviceName:
      typeof obj.sourceDeviceName === 'string'
        ? obj.sourceDeviceName
        : 'Imported Android Device',
    sourceLauncher:
      typeof obj.sourceLauncher === 'string' ? obj.sourceLauncher : 'Android Launcher',
    gridCols,
    gridRows,
    gridDetectionSource:
      typeof obj.gridDetectionSource === 'string'
        ? (obj.gridDetectionSource as GridDetectionSource)
        : 'user-reported',
    wallpaperId: typeof obj.wallpaperId === 'string' ? obj.wallpaperId : 'alpine-dusk',
    includesIconArt,
    ...(sanitizedIconArtAssets ? { iconArtAssets: sanitizedIconArtAssets } : {}),
    screens,
    dock,
    stats,
    checksum: expectedChecksum,
  };

  return { valid: true, backup: normalized, warnings };
}

/**
 * Attempts to normalize and repair a backup JSON object with missing arrays,
 * missing IDs, out-of-range grid dimensions, or a stale checksum.
 */
export function repairBackupPayload(raw: unknown): {
  repaired: boolean;
  backup?: LayoutBackupSnapshot;
  changes: string[];
  error?: string;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      repaired: false,
      changes: [],
      error: 'Root JSON value must be an object containing a screens[] array.',
    };
  }
  // Strip dangerous keys before cloning and repairing untrusted JSON payloads
  const obj = cloneDeep(stripDangerousKeys(raw) as Record<string, unknown>);
  const changes: string[] = [];

  if (!Array.isArray(obj.screens) || obj.screens.length === 0) {
    return {
      repaired: false,
      changes: [],
      error: 'Cannot repair: backup contains no screens[] entries.',
    };
  }

  const repairedScreens: HomeScreenPage[] = [];
  let maxCol = 4;
  let maxRow = 4;

  obj.screens.forEach((rawScr, idx) => {
    const s = (rawScr && typeof rawScr === 'object' ? rawScr : {}) as Record<string, unknown>;
    const icons = Array.isArray(s.icons) ? (s.icons as AppIconItem[]) : [];
    const folders = Array.isArray(s.folders) ? (s.folders as FolderItem[]) : [];
    const widgets = Array.isArray(s.widgets) ? (s.widgets as WidgetItem[]) : [];

    if (!Array.isArray(s.icons)) changes.push(`Initialized missing icons[] on screen ${idx + 1}`);
    if (!Array.isArray(s.folders)) changes.push(`Initialized missing folders[] on screen ${idx + 1}`);
    if (!Array.isArray(s.widgets)) changes.push(`Initialized missing widgets[] on screen ${idx + 1}`);

    for (const ic of icons) {
      if (!ic.id) ic.id = uid('ic');
      ic.label = sanitizeText(ic.label, 60) || 'App';
      ic.packageName = sanitizePackageName(ic.packageName);
      ic.tint = sanitizeHexColor(ic.tint, '#334155');
      if (ic.customIconArt !== undefined) {
        ic.customIconArt = sanitizeIconArtDataUri(ic.customIconArt);
      }
      if (ic.playStoreUrl) {
        ic.playStoreUrl = sanitizePlayStoreUrl(ic.playStoreUrl, ic.packageName);
      }
      maxCol = Math.max(maxCol, (ic.col ?? 0) + 1);
      maxRow = Math.max(maxRow, (ic.row ?? 0) + 1);
    }
    for (const f of folders) {
      if (!f.id) f.id = uid('fld');
      f.name = sanitizeText(f.name, 48) || 'Folder';
      f.tint = sanitizeHexColor(f.tint, '#334155');
      if (!Array.isArray(f.apps)) f.apps = [];
      for (const nested of f.apps) {
        nested.label = sanitizeText(nested.label, 60) || 'App';
        nested.packageName = sanitizePackageName(nested.packageName);
        nested.tint = sanitizeHexColor(nested.tint, '#334155');
        if (nested.customIconArt !== undefined) {
          nested.customIconArt = sanitizeIconArtDataUri(nested.customIconArt);
        }
      }
      maxCol = Math.max(maxCol, (f.col ?? 0) + 1);
      maxRow = Math.max(maxRow, (f.row ?? 0) + 1);
    }
    for (const w of widgets) {
      if (!w.id) w.id = uid('w');
      w.title = sanitizeText(w.title, 60) || 'Widget';
      maxCol = Math.max(maxCol, (w.col ?? 0) + (w.spanX ?? 1));
      maxRow = Math.max(maxRow, (w.row ?? 0) + (w.spanY ?? 1));
    }

    repairedScreens.push({
      id: typeof s.id === 'string' && s.id ? s.id : uid('scr'),
      name: typeof s.name === 'string' && s.name ? s.name : idx === 0 ? 'Home Screen' : `Screen ${idx + 1}`,
      isPrimary: idx === 0,
      order: idx,
      icons,
      folders,
      widgets,
    });
  });

  const gridCols =
    typeof obj.gridCols === 'number' && obj.gridCols >= 3 && obj.gridCols <= 8
      ? Math.round(obj.gridCols)
      : Math.min(8, Math.max(3, maxCol));
  const gridRows =
    typeof obj.gridRows === 'number' && obj.gridRows >= 3 && obj.gridRows <= 8
      ? Math.round(obj.gridRows)
      : Math.min(8, Math.max(3, maxRow));

  if (obj.gridCols !== gridCols || obj.gridRows !== gridRows) {
    changes.push(`Normalized grid dimensions to ${gridCols}×${gridRows}`);
  }

  const dock = Array.isArray(obj.dock) ? (obj.dock as DeviceProfile['dock']) : [];
  for (const d of dock) {
    if (d.customIconArt !== undefined) {
      d.customIconArt = sanitizeIconArtDataUri(d.customIconArt);
    }
  }

  let repairedIconArtAssets: Record<string, IconArtEntry> | undefined;
  if (obj.iconArtAssets && typeof obj.iconArtAssets === 'object' && !Array.isArray(obj.iconArtAssets)) {
    const cleanAssets: Record<string, IconArtEntry> = {};
    for (const [rawPkg, rawEntry] of Object.entries(obj.iconArtAssets as Record<string, unknown>)) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const entry = rawEntry as Record<string, unknown>;
      const pkg = sanitizePackageName(entry.packageName ?? rawPkg);
      const safeUri = sanitizeIconArtDataUri(entry.dataUri);
      if (!safeUri) continue;
      cleanAssets[pkg] = {
        packageName: pkg,
        label: sanitizeText(entry.label, 60) || 'App',
        iconKey: sanitizeText(entry.iconKey, 40) || 'smartphone',
        tint: sanitizeHexColor(entry.tint, '#334155'),
        dataUri: safeUri,
      };
    }
    if (Object.keys(cleanAssets).length > 0) {
      repairedIconArtAssets = cleanAssets;
    }
  }

  const { stats, checksum } = computeStatsAndChecksum(
    repairedScreens,
    dock,
    gridCols,
    gridRows,
    repairedIconArtAssets
  );
  if (obj.checksum !== checksum) {
    changes.push(`Recomputed FNV-1a integrity checksum (${checksum})`);
  }

  const includesIconArt =
    obj.includesIconArt === true || Boolean(repairedIconArtAssets);

  const backup: LayoutBackupSnapshot = {
    id: typeof obj.id === 'string' && obj.id ? obj.id : uid('bk-rep'),
    name:
      typeof obj.name === 'string' && obj.name.trim()
        ? obj.name.trim()
        : 'Repaired Backup Snapshot',
    notes: typeof obj.notes === 'string' ? obj.notes : 'Auto-repaired during import',
    schemaVersion: '2.0',
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    storage: 'local',
    sourceDeviceId:
      typeof obj.sourceDeviceId === 'string' ? obj.sourceDeviceId : 'repaired-import',
    sourceDeviceName:
      typeof obj.sourceDeviceName === 'string' ? obj.sourceDeviceName : 'Imported Device',
    sourceLauncher:
      typeof obj.sourceLauncher === 'string' ? obj.sourceLauncher : 'Android Launcher',
    gridCols,
    gridRows,
    gridDetectionSource: 'user-reported',
    wallpaperId: typeof obj.wallpaperId === 'string' ? obj.wallpaperId : 'alpine-dusk',
    includesIconArt,
    ...(repairedIconArtAssets ? { iconArtAssets: repairedIconArtAssets } : {}),
    screens: repairedScreens,
    dock,
    stats,
    checksum,
  };

  return { repaired: true, backup, changes };
}

/**
 * Probes the active device's launcher capabilities & placed item coordinates to
 * auto-detect its grid size, or returns a clear failure telling the user to report it manually.
 */
export function autoDetectDeviceGrid(
  device: DeviceProfile,
  options?: { simulateFailure?: boolean }
): {
  ok: boolean;
  cols: number;
  rows: number;
  source: GridDetectionSource;
  confidence: GridConfidence;
  summary: string;
  error?: string;
} {
  const cap = getLauncherCapability(device.launcher);

  if (options?.simulateFailure) {
    return {
      ok: false,
      cols: device.gridCols,
      rows: device.gridRows,
      source: 'user-reported',
      confidence: 'manual',
      summary: 'Simulated launcher grid probe failure.',
      error: `${device.launcher} did not respond to workspace bounds query (Accessibility node tree returned empty). Report your grid dimensions manually below.`,
    };
  }

  if (!cap.supportsProviderQuery && !cap.supportsAccessibilityDetect) {
    return {
      ok: false,
      cols: device.gridCols,
      rows: device.gridRows,
      source: 'user-reported',
      confidence: 'manual',
      summary: `${device.launcher} does not expose grid metadata to external apps.`,
      error: `${device.launcher} restricts automatic grid inspection. Use "Report Grid Manually" to enter your launcher's column × row layout (e.g., 5×4 or 6×6).`,
    };
  }

  // Inspect actual occupied bounding box across all screens
  let maxColNeeded = 0;
  let maxRowNeeded = 0;
  for (const scr of device.screens) {
    for (const ic of scr.icons) {
      maxColNeeded = Math.max(maxColNeeded, ic.col + 1);
      maxRowNeeded = Math.max(maxRowNeeded, ic.row + 1);
    }
    for (const fl of scr.folders) {
      maxColNeeded = Math.max(maxColNeeded, fl.col + 1);
      maxRowNeeded = Math.max(maxRowNeeded, fl.row + 1);
    }
    for (const w of scr.widgets) {
      maxColNeeded = Math.max(maxColNeeded, w.col + w.spanX);
      maxRowNeeded = Math.max(maxRowNeeded, w.row + w.spanY);
    }
  }

  const detectedCols = Math.max(device.gridCols, Math.min(cap.maxCols, maxColNeeded));
  const detectedRows = Math.max(device.gridRows, Math.min(cap.maxRows, maxRowNeeded));
  const source: GridDetectionSource = cap.supportsProviderQuery
    ? 'launcher-provider'
    : 'auto-accessibility';

  return {
    ok: true,
    cols: detectedCols,
    rows: detectedRows,
    source,
    confidence: 'verified',
    summary: cap.supportsProviderQuery
      ? `Launcher provider (${cap.packageName}) directly reported ${detectedCols}×${detectedRows} grid.`
      : `Accessibility workspace scan detected ${detectedCols}×${detectedRows} grid on ${device.launcher} (max occupied cell ${maxColNeeded}×${maxRowNeeded}).`,
  };
}

/**
 * Analyzes compatibility between a backup's source grid (e.g., 6×6) and a target device's
 * current grid (e.g., 5×4), reporting exact out-of-bounds impacts and recommended adaptation strategy.
 */
export function analyzeGridCompatibility(
  targetDevice: DeviceProfile,
  backup: LayoutBackupSnapshot
): GridCompatibilityAnalysis {
  const srcCols = backup.gridCols;
  const srcRows = backup.gridRows;
  const dstCols = targetDevice.gridCols;
  const dstRows = targetDevice.gridRows;
  const isExactMatch = srcCols === dstCols && srcRows === dstRows;

  let mismatchType: GridCompatibilityAnalysis['mismatchType'] = 'exact';
  if (!isExactMatch) {
    if (dstCols <= srcCols && dstRows <= srcRows) {
      mismatchType = 'shrink';
    } else if (dstCols >= srcCols && dstRows >= srcRows) {
      mismatchType = 'expand';
    } else {
      mismatchType = 'aspect-shift';
    }
  }

  let outOfBoundsIcons = 0;
  let outOfBoundsFolders = 0;
  let outOfBoundsWidgets = 0;
  let widgetsRequiringResize = 0;

  for (const scr of backup.screens) {
    for (const ic of scr.icons) {
      if (ic.col >= dstCols || ic.row >= dstRows) outOfBoundsIcons++;
    }
    for (const fl of scr.folders) {
      if (fl.col >= dstCols || fl.row >= dstRows) outOfBoundsFolders++;
    }
    for (const w of scr.widgets) {
      if (w.spanX > dstCols || w.spanY > dstRows) {
        widgetsRequiringResize++;
      }
      if (w.col >= dstCols || w.row >= dstRows || w.col + w.spanX > dstCols || w.row + w.spanY > dstRows) {
        outOfBoundsWidgets++;
      }
    }
  }

  const totalAffectedItems = outOfBoundsIcons + outOfBoundsFolders + outOfBoundsWidgets;
  const sourceCellsPerPage = srcCols * srcRows;
  const targetCellsPerPage = dstCols * dstRows;
  const cellCapacityDelta = targetCellsPerPage - sourceCellsPerPage;

  const targetCap = getLauncherCapability(targetDevice.launcher);
  const canResizeTargetLauncher =
    srcCols >= targetCap.minCols &&
    srcCols <= targetCap.maxCols &&
    srcRows >= targetCap.minRows &&
    srcRows <= targetCap.maxRows &&
    (targetCap.allowsCustomGrid ||
      targetCap.presets.some((p) => p.cols === srcCols && p.rows === srcRows));

  const resizeTargetReason = canResizeTargetLauncher
    ? `${targetDevice.launcher} supports ${srcCols}×${srcRows} directly — you can switch ${targetDevice.name} to ${srcCols}×${srcRows} for a 1:1 restore.`
    : `${targetDevice.launcher} only supports ${targetCap.minCols}×${targetCap.minRows} to ${targetCap.maxCols}×${targetCap.maxRows} (${targetCap.allowsCustomGrid ? 'custom' : 'fixed presets'}) — cannot natively switch to ${srcCols}×${srcRows}.`;

  let recommendedStrategy: GridAdaptationStrategy = 'auto-reflow';
  if (isExactMatch) {
    recommendedStrategy = 'auto-reflow';
  } else if (mismatchType === 'expand') {
    recommendedStrategy = 'proportional-scale';
  } else if (mismatchType === 'shrink' && cellCapacityDelta <= -10) {
    recommendedStrategy = 'preserve-pages';
  } else if (mismatchType === 'aspect-shift') {
    recommendedStrategy = 'proportional-scale';
  }

  const summary = isExactMatch
    ? `Exact ${dstCols}×${dstRows} grid match — all coordinates restore 1:1.`
    : mismatchType === 'shrink'
    ? `Shrinking ${srcCols}×${srcRows} (${sourceCellsPerPage} cells/page) into ${dstCols}×${dstRows} (${targetCellsPerPage} cells/page). ${totalAffectedItems} item${totalAffectedItems === 1 ? '' : 's'} sit outside target bounds.`
    : mismatchType === 'aspect-shift'
    ? `Aspect shift from ${srcCols}×${srcRows} to ${dstCols}×${dstRows} (${cellCapacityDelta >= 0 ? '+' : ''}${cellCapacityDelta} cells/page). ${totalAffectedItems} item${totalAffectedItems === 1 ? '' : 's'} need coordinate remapping.`
    : `Expanding ${srcCols}×${srcRows} into ${dstCols}×${dstRows} (+${cellCapacityDelta} extra cells/page). All items fit natively or can be proportionally scaled.`;

  return {
    isExactMatch,
    mismatchType,
    sourceGrid: { cols: srcCols, rows: srcRows },
    targetGrid: { cols: dstCols, rows: dstRows },
    sourceCellsPerPage,
    targetCellsPerPage,
    cellCapacityDelta,
    outOfBoundsIcons,
    outOfBoundsFolders,
    outOfBoundsWidgets,
    widgetsRequiringResize,
    totalAffectedItems,
    canResizeTargetLauncher,
    resizeTargetReason,
    recommendedStrategy,
    summary,
  };
}

/**
 * Reflows an existing device's layout when the user changes or reports a new grid density
 * (e.g., shrinking a live 6×6 device down to 5×4) so no icons/folders/widgets get orphaned off-screen.
 */
export function reflowDeviceToGrid(
  device: DeviceProfile,
  nextCols: number,
  nextRows: number,
  source: GridDetectionSource = 'user-reported'
): { nextDevice: DeviceProfile; relocatedCount: number; widgetsResized: number; overflowPagesAdded: number } {
  const safeCols = Math.max(3, Math.min(8, Math.round(nextCols)));
  const safeRows = Math.max(3, Math.min(8, Math.round(nextRows)));
  const next = cloneDeep(device);
  next.gridCols = safeCols;
  next.gridRows = safeRows;
  next.gridDetectionSource = source;
  next.gridConfidence = source === 'user-reported' ? 'manual' : 'verified';
  next.gridDetectedAt = new Date().toISOString();

  let relocatedCount = 0;
  let widgetsResized = 0;
  let overflowPagesAdded = 0;

  const updatedScreens: HomeScreenPage[] = [];

  for (const scr of next.screens) {
    const newPage: HomeScreenPage = {
      ...scr,
      icons: [],
      folders: [],
      widgets: [],
    };
    const grid = computeOccupancyGrid(newPage, safeCols, safeRows);
    const overflowWidgets: WidgetItem[] = [];
    const overflowFolders: FolderItem[] = [];
    const overflowIcons: AppIconItem[] = [];

    for (const w of scr.widgets) {
      const spanX = Math.min(w.spanX, safeCols);
      const spanY = Math.min(w.spanY, safeRows);
      if (spanX !== w.spanX || spanY !== w.spanY) widgetsResized++;
      const adjusted = { ...w, spanX, spanY };
      if (canPlaceAt(grid, safeCols, safeRows, adjusted.col, adjusted.row, spanX, spanY)) {
        markOccupied(grid, adjusted.col, adjusted.row, spanX, spanY);
        newPage.widgets.push(adjusted);
      } else {
        const slot = findNearestOpenSlot(grid, safeCols, safeRows, adjusted.col, adjusted.row, spanX, spanY);
        if (slot) {
          adjusted.col = slot.col;
          adjusted.row = slot.row;
          markOccupied(grid, slot.col, slot.row, spanX, spanY);
          newPage.widgets.push(adjusted);
          relocatedCount++;
        } else {
          overflowWidgets.push(adjusted);
        }
      }
    }

    for (const fl of scr.folders) {
      if (canPlaceAt(grid, safeCols, safeRows, fl.col, fl.row, 1, 1)) {
        markOccupied(grid, fl.col, fl.row, 1, 1);
        newPage.folders.push(fl);
      } else {
        const slot = findNearestOpenSlot(grid, safeCols, safeRows, fl.col, fl.row, 1, 1);
        if (slot) {
          fl.col = slot.col;
          fl.row = slot.row;
          markOccupied(grid, slot.col, slot.row, 1, 1);
          newPage.folders.push(fl);
          relocatedCount++;
        } else {
          overflowFolders.push(fl);
        }
      }
    }

    for (const ic of scr.icons) {
      if (canPlaceAt(grid, safeCols, safeRows, ic.col, ic.row, 1, 1)) {
        markOccupied(grid, ic.col, ic.row, 1, 1);
        newPage.icons.push(ic);
      } else {
        const slot = findNearestOpenSlot(grid, safeCols, safeRows, ic.col, ic.row, 1, 1);
        if (slot) {
          ic.col = slot.col;
          ic.row = slot.row;
          markOccupied(grid, slot.col, slot.row, 1, 1);
          newPage.icons.push(ic);
          relocatedCount++;
        } else {
          overflowIcons.push(ic);
        }
      }
    }

    updatedScreens.push(newPage);

    let partIdx = 2;
    while (overflowWidgets.length > 0 || overflowFolders.length > 0 || overflowIcons.length > 0) {
      overflowPagesAdded++;
      const extra: HomeScreenPage = {
        id: uid('scr'),
        name: `${scr.name} (Part ${partIdx++})`,
        isPrimary: false,
        order: updatedScreens.length,
        icons: [],
        folders: [],
        widgets: [],
      };
      const exGrid = computeOccupancyGrid(extra, safeCols, safeRows);

      for (let i = overflowWidgets.length - 1; i >= 0; i--) {
        const w = overflowWidgets[i];
        const slot = findFirstOpenSlot(exGrid, safeCols, safeRows, w.spanX, w.spanY);
        if (slot) {
          w.col = slot.col;
          w.row = slot.row;
          markOccupied(exGrid, slot.col, slot.row, w.spanX, w.spanY);
          extra.widgets.push(w);
          overflowWidgets.splice(i, 1);
          relocatedCount++;
        }
      }
      for (let i = overflowFolders.length - 1; i >= 0; i--) {
        const fl = overflowFolders[i];
        const slot = findFirstOpenSlot(exGrid, safeCols, safeRows, 1, 1);
        if (slot) {
          fl.col = slot.col;
          fl.row = slot.row;
          markOccupied(exGrid, slot.col, slot.row, 1, 1);
          extra.folders.push(fl);
          overflowFolders.splice(i, 1);
          relocatedCount++;
        }
      }
      for (let i = overflowIcons.length - 1; i >= 0; i--) {
        const ic = overflowIcons[i];
        const slot = findFirstOpenSlot(exGrid, safeCols, safeRows, 1, 1);
        if (slot) {
          ic.col = slot.col;
          ic.row = slot.row;
          markOccupied(exGrid, slot.col, slot.row, 1, 1);
          extra.icons.push(ic);
          overflowIcons.splice(i, 1);
          relocatedCount++;
        }
      }
      updatedScreens.push(extra);
      if (overflowPagesAdded > 8) break;
    }
  }

  next.screens = updatedScreens.map((s, idx) => ({ ...s, order: idx, isPrimary: idx === 0 }));
  return { nextDevice: next, relocatedCount, widgetsResized, overflowPagesAdded };
}

function collectDevicePackages(device: DeviceProfile): Set<string> {
  const pkgs = new Set<string>();
  for (const d of device.dock) pkgs.add(d.packageName);
  for (const s of device.screens) {
    for (const ic of s.icons) pkgs.add(ic.packageName);
    for (const fl of s.folders) {
      for (const a of fl.apps) pkgs.add(a.packageName);
    }
  }
  return pkgs;
}

function getInstalledPackageSet(device: DeviceProfile): Set<string> {
  const set = new Set<string>(device.installedPackages ?? []);
  for (const d of device.dock) {
    if (!d.isPlaceholder) set.add(d.packageName);
  }
  for (const s of device.screens) {
    for (const ic of s.icons) {
      if (!ic.isPlaceholder) set.add(ic.packageName);
    }
    for (const fl of s.folders) {
      for (const a of fl.apps) {
        if (!a.isPlaceholder) set.add(a.packageName);
      }
    }
  }
  return set;
}

/**
 * Computes both the resulting DeviceProfile and an exact diff report for either
 * Replace or Merge restoration modes, including full cross-grid adaptation
 * (e.g. 6×6 into 5×4, 4×5 into 4×6, etc.) and uninstalled-app handling.
 */
export function computeRestoreResult(
  targetDevice: DeviceProfile,
  backup: LayoutBackupSnapshot,
  mode: RestoreMode,
  options: MergeOptions
): { nextDevice: DeviceProfile; report: RestoreDiffReport } {
  const gridStrategy: GridAdaptationStrategy = options.gridStrategy ?? 'auto-reflow';
  const targetGridBefore = { cols: targetDevice.gridCols, rows: targetDevice.gridRows };
  const sourceGrid = { cols: backup.gridCols, rows: backup.gridRows };

  // If strategy is resize-target-grid, adopt the backup's grid dimensions on target device
  const cols = gridStrategy === 'resize-target-grid' ? backup.gridCols : targetDevice.gridCols;
  const rows = gridStrategy === 'resize-target-grid' ? backup.gridRows : targetDevice.gridRows;
  const targetGridAfter = { cols, rows };

  const screensBefore = targetDevice.screens.length;
  const installedSet = getInstalledPackageSet(targetDevice);
  const missingStrategy = options.missingAppStrategy ?? 'placeholder';
  const createPlaceholders = missingStrategy === 'placeholder' || missingStrategy === 'guided';

  const hasIconArtInBackup = backupIncludesIconArt(backup);
  const shouldImportIconArt =
    hasIconArtInBackup && options.importIconArt !== false;
  const iconArtSkipped = hasIconArtInBackup && !shouldImportIconArt;

  const targetLocalStyleByPkg = new Map<
    string,
    { iconKey: string; tint: string; customIconArt?: string }
  >();
  const recordTargetStyle = (app: Omit<AppIconItem, 'col' | 'row'>) => {
    if (!targetLocalStyleByPkg.has(app.packageName)) {
      targetLocalStyleByPkg.set(app.packageName, {
        iconKey: app.iconKey,
        tint: app.tint,
        customIconArt: app.customIconArt,
      });
    }
  };
  for (const d of targetDevice.dock) recordTargetStyle(d);
  for (const scr of targetDevice.screens) {
    for (const ic of scr.icons) recordTargetStyle(ic);
    for (const fl of scr.folders) {
      for (const app of fl.apps) recordTargetStyle(app);
    }
  }

  let iconsAdded = 0;
  let iconsSkippedDuplicate = 0;
  let placeholdersCreated = 0;
  let missingAppsSkipped = 0;
  let foldersCreated = 0;
  let foldersMerged = 0;
  let nestedAppsMerged = 0;
  let widgetsPlaced = 0;
  let widgetsUpdated = 0;
  let widgetsResized = 0;
  let reflowedItems = 0;
  let outOfBoundsRelocated = 0;
  let itemsDroppedByCrop = 0;
  let overflowScreensCreated = 0;
  let iconArtImported = 0;
  const importedArtPackages = new Set<string>();
  const notes: string[] = [];

  const resolveRestoredAppAppearance = <
    T extends Omit<AppIconItem, 'col' | 'row'>
  >(
    app: T
  ): T => {
    const cloned = cloneDeep(app);
    if (shouldImportIconArt) {
      const asset = backup.iconArtAssets?.[cloned.packageName];
      const hasAsset = Boolean(asset || cloned.customIconArt);
      if (asset) {
        cloned.iconKey = asset.iconKey || cloned.iconKey;
        cloned.tint = asset.tint || cloned.tint;
      }
      if (hasAsset && !importedArtPackages.has(cloned.packageName)) {
        importedArtPackages.add(cloned.packageName);
        iconArtImported++;
      }
      return cloned;
    }

    const localStyle = targetLocalStyleByPkg.get(cloned.packageName);
    if (localStyle) {
      cloned.iconKey = localStyle.iconKey;
      cloned.tint = localStyle.tint;
      if (localStyle.customIconArt) {
        cloned.customIconArt = localStyle.customIconArt;
      } else {
        delete cloned.customIconArt;
      }
    } else {
      delete cloned.customIconArt;
    }
    return cloned;
  };

  const missingMap = new Map<string, MissingAppEntry>();

  const registerMissing = (
    app: Omit<AppIconItem, 'col' | 'row'>,
    targetLocation: string
  ) => {
    if (!missingMap.has(app.packageName)) {
      missingMap.set(app.packageName, {
        packageName: app.packageName,
        label: app.label,
        iconKey: app.iconKey,
        tint: app.tint,
        category: app.category,
        playStoreUrl: buildPlayStoreUrl(app.packageName),
        targetLocation,
        installed: false,
      });
    }
  };

  const mapDesiredCoords = (
    srcCol: number,
    srcRow: number,
    spanX = 1,
    spanY = 1
  ): { col: number; row: number; wasOutOfBounds: boolean } => {
    const wasOutOfBounds =
      srcCol < 0 || srcRow < 0 || srcCol + spanX > cols || srcRow + spanY > rows;
    if (gridStrategy === 'proportional-scale') {
      return {
        col: scaleCoordinate(srcCol, sourceGrid.cols, cols, spanX),
        row: scaleCoordinate(srcRow, sourceGrid.rows, rows, spanY),
        wasOutOfBounds,
      };
    }
    return { col: srcCol, row: srcRow, wasOutOfBounds };
  };

  const drainOverflowIntoPages = (
    targetScreens: HomeScreenPage[],
    overflowWidgets: WidgetItem[],
    overflowFolders: FolderItem[],
    overflowIcons: AppIconItem[],
    baseName: string
  ) => {
    let partCounter = 1;
    while (
      overflowWidgets.length > 0 ||
      overflowFolders.length > 0 ||
      overflowIcons.length > 0
    ) {
      overflowScreensCreated++;
      partCounter++;
      const extraPage: HomeScreenPage = {
        id: uid('scr'),
        name:
          gridStrategy === 'preserve-pages'
            ? `${baseName} (Part ${partCounter})`
            : `Overflow Screen ${overflowScreensCreated}`,
        isPrimary: false,
        order: targetScreens.length,
        icons: [],
        folders: [],
        widgets: [],
      };
      const grid = computeOccupancyGrid(extraPage, cols, rows);

      for (let i = overflowWidgets.length - 1; i >= 0; i--) {
        const w = overflowWidgets[i];
        const slot = findFirstOpenSlot(grid, cols, rows, w.spanX, w.spanY);
        if (slot) {
          w.col = slot.col;
          w.row = slot.row;
          markOccupied(grid, slot.col, slot.row, w.spanX, w.spanY);
          extraPage.widgets.push(w);
          overflowWidgets.splice(i, 1);
          widgetsPlaced++;
          reflowedItems++;
        }
      }

      for (let i = overflowFolders.length - 1; i >= 0; i--) {
        const f = overflowFolders[i];
        const slot = findFirstOpenSlot(grid, cols, rows, 1, 1);
        if (slot) {
          f.col = slot.col;
          f.row = slot.row;
          markOccupied(grid, slot.col, slot.row, 1, 1);
          extraPage.folders.push(f);
          overflowFolders.splice(i, 1);
          foldersCreated++;
          reflowedItems++;
        }
      }

      for (let i = overflowIcons.length - 1; i >= 0; i--) {
        const ic = overflowIcons[i];
        const slot = findFirstOpenSlot(grid, cols, rows, 1, 1);
        if (slot) {
          ic.col = slot.col;
          ic.row = slot.row;
          markOccupied(grid, slot.col, slot.row, 1, 1);
          extraPage.icons.push(ic);
          overflowIcons.splice(i, 1);
          if (ic.isPlaceholder) placeholdersCreated++;
          else iconsAdded++;
          reflowedItems++;
        }
      }

      targetScreens.push(extraPage);
      if (overflowScreensCreated > 10) break;
    }
  };

  if (mode === 'replace') {
    const nextScreens: HomeScreenPage[] = [];
    const globalOverflowIcons: AppIconItem[] = [];
    const globalOverflowFolders: FolderItem[] = [];
    const globalOverflowWidgets: WidgetItem[] = [];

    backup.screens.forEach((srcScreen, idx) => {
      const page: HomeScreenPage = {
        id: uid('scr'),
        name: srcScreen.name,
        isPrimary: idx === 0,
        order: nextScreens.length,
        icons: [],
        folders: [],
        widgets: [],
      };
      const grid = computeOccupancyGrid(page, cols, rows);
      const pageOverflowWidgets: WidgetItem[] = [];
      const pageOverflowFolders: FolderItem[] = [];
      const pageOverflowIcons: AppIconItem[] = [];

      // 1. Place widgets first (preserve multi-cell footprint, clamp spans to target grid)
      for (const w of srcScreen.widgets) {
        const clampedSpanX = Math.min(w.spanX, cols);
        const clampedSpanY = Math.min(w.spanY, rows);
        if (clampedSpanX !== w.spanX || clampedSpanY !== w.spanY) {
          widgetsResized++;
        }

        const mapped = mapDesiredCoords(w.col, w.row, clampedSpanX, clampedSpanY);
        if (gridStrategy === 'crop-within-bounds' && mapped.wasOutOfBounds) {
          itemsDroppedByCrop++;
          continue;
        }

        const clonedWidget: WidgetItem = {
          ...cloneDeep(w),
          id: uid('w'),
          spanX: clampedSpanX,
          spanY: clampedSpanY,
        };

        if (canPlaceAt(grid, cols, rows, mapped.col, mapped.row, clampedSpanX, clampedSpanY)) {
          clonedWidget.col = mapped.col;
          clonedWidget.row = mapped.row;
          markOccupied(grid, mapped.col, mapped.row, clampedSpanX, clampedSpanY);
          page.widgets.push(clonedWidget);
          widgetsPlaced++;
          if (
            clampedSpanX !== w.spanX ||
            clampedSpanY !== w.spanY ||
            mapped.col !== w.col ||
            mapped.row !== w.row
          ) {
            reflowedItems++;
          }
          if (mapped.wasOutOfBounds) outOfBoundsRelocated++;
        } else {
          const slot =
            gridStrategy === 'proportional-scale'
              ? findNearestOpenSlot(grid, cols, rows, mapped.col, mapped.row, clampedSpanX, clampedSpanY)
              : findFirstOpenSlot(grid, cols, rows, clampedSpanX, clampedSpanY);
          if (slot) {
            clonedWidget.col = slot.col;
            clonedWidget.row = slot.row;
            markOccupied(grid, slot.col, slot.row, clampedSpanX, clampedSpanY);
            page.widgets.push(clonedWidget);
            widgetsPlaced++;
            reflowedItems++;
            if (mapped.wasOutOfBounds) outOfBoundsRelocated++;
          } else {
            if (mapped.wasOutOfBounds) outOfBoundsRelocated++;
            if (gridStrategy === 'preserve-pages') pageOverflowWidgets.push(clonedWidget);
            else globalOverflowWidgets.push(clonedWidget);
          }
        }
      }

      // 2. Place folders
      for (const f of srcScreen.folders) {
        const mapped = mapDesiredCoords(f.col, f.row, 1, 1);
        if (gridStrategy === 'crop-within-bounds' && mapped.wasOutOfBounds) {
          itemsDroppedByCrop++;
          continue;
        }

        const processedApps: Omit<AppIconItem, 'col' | 'row'>[] = [];
        for (const app of f.apps) {
          const isInstalled = installedSet.has(app.packageName);
          const styledApp = resolveRestoredAppAppearance(app);
          if (isInstalled) {
            processedApps.push({ ...styledApp, id: uid('fa'), isPlaceholder: false });
          } else {
            registerMissing(styledApp, `${srcScreen.name} → Folder "${f.name}"`);
            if (createPlaceholders) {
              processedApps.push({
                ...styledApp,
                id: uid('fa'),
                isPlaceholder: true,
                playStoreUrl: buildPlayStoreUrl(styledApp.packageName),
              });
              placeholdersCreated++;
            } else {
              missingAppsSkipped++;
            }
          }
        }

        if (processedApps.length === 0 && f.apps.length > 0) {
          continue;
        }

        const clonedFolder: FolderItem = {
          ...cloneDeep(f),
          id: uid('fld'),
          apps: processedApps,
        };
        if (canPlaceAt(grid, cols, rows, mapped.col, mapped.row, 1, 1)) {
          clonedFolder.col = mapped.col;
          clonedFolder.row = mapped.row;
          markOccupied(grid, mapped.col, mapped.row, 1, 1);
          page.folders.push(clonedFolder);
          foldersCreated++;
          if (mapped.col !== f.col || mapped.row !== f.row) reflowedItems++;
          if (mapped.wasOutOfBounds) outOfBoundsRelocated++;
        } else {
          const slot =
            gridStrategy === 'proportional-scale'
              ? findNearestOpenSlot(grid, cols, rows, mapped.col, mapped.row, 1, 1)
              : findFirstOpenSlot(grid, cols, rows, 1, 1);
          if (slot) {
            clonedFolder.col = slot.col;
            clonedFolder.row = slot.row;
            markOccupied(grid, slot.col, slot.row, 1, 1);
            page.folders.push(clonedFolder);
            foldersCreated++;
            reflowedItems++;
            if (mapped.wasOutOfBounds) outOfBoundsRelocated++;
          } else {
            if (mapped.wasOutOfBounds) outOfBoundsRelocated++;
            if (gridStrategy === 'preserve-pages') pageOverflowFolders.push(clonedFolder);
            else globalOverflowFolders.push(clonedFolder);
          }
        }
      }

      // 3. Place icons
      for (const ic of srcScreen.icons) {
        const mapped = mapDesiredCoords(ic.col, ic.row, 1, 1);
        if (gridStrategy === 'crop-within-bounds' && mapped.wasOutOfBounds) {
          itemsDroppedByCrop++;
          continue;
        }

        const isInstalled = installedSet.has(ic.packageName);
        if (!isInstalled) {
          registerMissing(ic, `${srcScreen.name} · Slot (${ic.col + 1}, ${ic.row + 1})`);
          if (!createPlaceholders) {
            missingAppsSkipped++;
            continue;
          }
        }

        const styledIcon = resolveRestoredAppAppearance(ic);
        const clonedIcon: AppIconItem = {
          ...styledIcon,
          id: uid('ic'),
          isPlaceholder: !isInstalled,
          playStoreUrl: !isInstalled ? buildPlayStoreUrl(styledIcon.packageName) : undefined,
        };

        if (canPlaceAt(grid, cols, rows, mapped.col, mapped.row, 1, 1)) {
          clonedIcon.col = mapped.col;
          clonedIcon.row = mapped.row;
          markOccupied(grid, mapped.col, mapped.row, 1, 1);
          page.icons.push(clonedIcon);
          if (isInstalled) iconsAdded++;
          else placeholdersCreated++;
          if (mapped.col !== ic.col || mapped.row !== ic.row) reflowedItems++;
          if (mapped.wasOutOfBounds) outOfBoundsRelocated++;
        } else {
          const slot =
            gridStrategy === 'proportional-scale'
              ? findNearestOpenSlot(grid, cols, rows, mapped.col, mapped.row, 1, 1)
              : findFirstOpenSlot(grid, cols, rows, 1, 1);
          if (slot) {
            clonedIcon.col = slot.col;
            clonedIcon.row = slot.row;
            markOccupied(grid, slot.col, slot.row, 1, 1);
            page.icons.push(clonedIcon);
            if (isInstalled) iconsAdded++;
            else placeholdersCreated++;
            reflowedItems++;
            if (mapped.wasOutOfBounds) outOfBoundsRelocated++;
          } else {
            if (mapped.wasOutOfBounds) outOfBoundsRelocated++;
            if (gridStrategy === 'preserve-pages') pageOverflowIcons.push(clonedIcon);
            else globalOverflowIcons.push(clonedIcon);
          }
        }
      }

      nextScreens.push(page);

      if (gridStrategy === 'preserve-pages') {
        drainOverflowIntoPages(
          nextScreens,
          pageOverflowWidgets,
          pageOverflowFolders,
          pageOverflowIcons,
          srcScreen.name
        );
      }
    });

    if (gridStrategy !== 'preserve-pages') {
      drainOverflowIntoPages(
        nextScreens,
        globalOverflowWidgets,
        globalOverflowFolders,
        globalOverflowIcons,
        'Overflow'
      );
    }

    // Re-index screen order cleanly
    nextScreens.forEach((s, idx) => {
      s.order = idx;
      s.isPrimary = idx === 0;
    });

    // Process dock icons for missing apps as well
    const nextDock: DeviceProfile['dock'] = [];
    for (const d of backup.dock.slice(0, Math.max(4, cols))) {
      const isInstalled = installedSet.has(d.packageName);
      const styledDock = resolveRestoredAppAppearance(d);
      if (isInstalled) {
        nextDock.push({ ...styledDock, isPlaceholder: false });
      } else {
        registerMissing(styledDock, 'Pinned Bottom Dock');
        if (createPlaceholders) {
          nextDock.push({
            ...styledDock,
            isPlaceholder: true,
            playStoreUrl: buildPlayStoreUrl(styledDock.packageName),
          });
          placeholdersCreated++;
        } else {
          missingAppsSkipped++;
        }
      }
    }

    if (gridStrategy === 'resize-target-grid' && (targetGridBefore.cols !== cols || targetGridBefore.rows !== rows)) {
      notes.push(
        `Switched ${targetDevice.name} launcher grid from ${targetGridBefore.cols}×${targetGridBefore.rows} to ${cols}×${rows} for exact 1:1 restoration.`
      );
    } else if (backup.gridCols !== cols || backup.gridRows !== rows) {
      notes.push(
        `Adapted ${backup.gridCols}×${backup.gridRows} backup into ${cols}×${rows} target using "${gridStrategy}" (${reflowedItems} remapped, ${widgetsResized} widget${widgetsResized === 1 ? '' : 's'} resized${itemsDroppedByCrop > 0 ? `, ${itemsDroppedByCrop} cropped` : ''}).`
      );
    } else {
      notes.push(`Exact ${cols}×${rows} grid coordinates restored across ${nextScreens.length} screens.`);
    }

    if (shouldImportIconArt && iconArtImported > 0) {
      notes.push(
        `Imported bundled icon art for ${iconArtImported} unique app${iconArtImported === 1 ? '' : 's'}.`
      );
    } else if (iconArtSkipped) {
      notes.push(
        'Skipped bundled icon art per import settings — preserved target device icon styles.'
      );
    } else if (!hasIconArtInBackup) {
      notes.push(
        'Backup contains layout coordinates only (no bundled icon art) — using target device icons.'
      );
    }

    const missingApps = Array.from(missingMap.values());
    if (missingApps.length > 0) {
      notes.push(
        createPlaceholders
          ? `${missingApps.length} uninstalled app${missingApps.length === 1 ? '' : 's'} placed as dummy placeholder icon${missingApps.length === 1 ? '' : 's'} with Play Store install links.`
          : `Skipped ${missingApps.length} uninstalled app${missingApps.length === 1 ? '' : 's'} and prepared a downloadable Play Store install list.`
      );
    }

    const nextDevice: DeviceProfile = {
      ...cloneDeep(targetDevice),
      gridCols: cols,
      gridRows: rows,
      gridDetectionSource:
        gridStrategy === 'resize-target-grid'
          ? 'user-reported'
          : targetDevice.gridDetectionSource,
      gridConfidence:
        gridStrategy === 'resize-target-grid' ? 'manual' : targetDevice.gridConfidence,
      screens: nextScreens,
      dock: nextDock.length > 0 ? nextDock : cloneDeep(targetDevice.dock),
      lastScannedAt: new Date().toISOString(),
    };

    return {
      nextDevice,
      report: {
        mode,
        missingAppStrategy: missingStrategy,
        gridStrategy,
        sourceGrid,
        targetGridBefore,
        targetGridAfter,
        targetDeviceName: targetDevice.name,
        backupName: backup.name,
        screensBefore,
        screensAfter: nextScreens.length,
        iconsAdded,
        iconsSkippedDuplicate: 0,
        placeholdersCreated,
        missingAppsSkipped,
        missingApps,
        foldersCreated,
        foldersMerged: 0,
        nestedAppsMerged: 0,
        widgetsPlaced,
        widgetsUpdated: 0,
        widgetsResized,
        reflowedItems,
        outOfBoundsRelocated,
        itemsDroppedByCrop,
        overflowScreensCreated,
        iconArtImported,
        iconArtSkipped,
        notes,
      },
    };
  }

  // MERGE MODE
  let nextDevice = cloneDeep(targetDevice);
  if (gridStrategy === 'resize-target-grid' && (targetGridBefore.cols !== cols || targetGridBefore.rows !== rows)) {
    const resized = reflowDeviceToGrid(nextDevice, cols, rows, 'user-reported');
    nextDevice = resized.nextDevice;
    reflowedItems += resized.relocatedCount;
    widgetsResized += resized.widgetsResized;
  }

  const existingPackages = collectDevicePackages(nextDevice);
  const folderByName = new Map<string, FolderItem>();
  const widgetBySyncKey = new Map<string, WidgetItem>();

  for (const scr of nextDevice.screens) {
    for (const fl of scr.folders) {
      folderByName.set(fl.name.trim().toLowerCase(), fl);
    }
    for (const w of scr.widgets) {
      widgetBySyncKey.set(w.syncKey, w);
    }
  }

  const pendingWidgets: { preferredPage: number; widget: WidgetItem; wasOutOfBounds: boolean }[] = [];
  const pendingFolders: { preferredPage: number; folder: FolderItem; wasOutOfBounds: boolean }[] = [];
  const pendingIcons: { preferredPage: number; icon: AppIconItem; wasOutOfBounds: boolean }[] = [];

  backup.screens.forEach((srcScreen, pageIdx) => {
    // Widgets
    for (const w of srcScreen.widgets) {
      const existingW = widgetBySyncKey.get(w.syncKey);
      if (existingW) {
        if (options.syncWidgetsOnImport) {
          existingW.config = cloneDeep(w.config);
          existingW.syncEnabled = w.syncEnabled;
          existingW.updatedAt = new Date().toISOString();
          widgetsUpdated++;
        }
      } else {
        const clampedSpanX = Math.min(w.spanX, cols);
        const clampedSpanY = Math.min(w.spanY, rows);
        const mapped = mapDesiredCoords(w.col, w.row, clampedSpanX, clampedSpanY);
        if (gridStrategy === 'crop-within-bounds' && mapped.wasOutOfBounds) {
          itemsDroppedByCrop++;
          continue;
        }
        if (clampedSpanX !== w.spanX || clampedSpanY !== w.spanY) widgetsResized++;
        const clonedW: WidgetItem = {
          ...cloneDeep(w),
          id: uid('w'),
          col: mapped.col,
          row: mapped.row,
          spanX: clampedSpanX,
          spanY: clampedSpanY,
        };
        pendingWidgets.push({
          preferredPage: pageIdx,
          widget: clonedW,
          wasOutOfBounds: mapped.wasOutOfBounds,
        });
      }
    }

    // Folders
    for (const fl of srcScreen.folders) {
      const key = fl.name.trim().toLowerCase();
      const targetFolder = options.mergeMatchingFolders ? folderByName.get(key) : undefined;
      if (targetFolder) {
        const folderPkgs = new Set(targetFolder.apps.map((a) => a.packageName));
        let addedAny = false;
        for (const app of fl.apps) {
          if (folderPkgs.has(app.packageName)) {
            iconsSkippedDuplicate++;
            continue;
          }
          if (options.deduplicateApps && existingPackages.has(app.packageName)) {
            iconsSkippedDuplicate++;
            continue;
          }
          const isInstalled = installedSet.has(app.packageName);
          if (!isInstalled) {
            registerMissing(app, `Folder "${targetFolder.name}"`);
            if (!createPlaceholders) {
              missingAppsSkipped++;
              continue;
            }
            placeholdersCreated++;
          }
          const styledApp = resolveRestoredAppAppearance(app);
          targetFolder.apps.push({
            ...styledApp,
            id: uid('fa'),
            isPlaceholder: !isInstalled,
            playStoreUrl: !isInstalled ? buildPlayStoreUrl(styledApp.packageName) : undefined,
          });
          folderPkgs.add(styledApp.packageName);
          existingPackages.add(styledApp.packageName);
          nestedAppsMerged++;
          addedAny = true;
        }
        if (addedAny) {
          foldersMerged++;
        }
      } else {
        const mapped = mapDesiredCoords(fl.col, fl.row, 1, 1);
        if (gridStrategy === 'crop-within-bounds' && mapped.wasOutOfBounds) {
          itemsDroppedByCrop++;
          continue;
        }
        const keptApps: Omit<AppIconItem, 'col' | 'row'>[] = [];
        for (const app of fl.apps) {
          if (options.deduplicateApps && existingPackages.has(app.packageName)) {
            iconsSkippedDuplicate++;
            continue;
          }
          const isInstalled = installedSet.has(app.packageName);
          if (!isInstalled) {
            registerMissing(app, `${srcScreen.name} → Folder "${fl.name}"`);
            if (!createPlaceholders) {
              missingAppsSkipped++;
              continue;
            }
            placeholdersCreated++;
          }
          existingPackages.add(app.packageName);
          const styledApp = resolveRestoredAppAppearance(app);
          keptApps.push({
            ...styledApp,
            id: uid('fa'),
            isPlaceholder: !isInstalled,
            playStoreUrl: !isInstalled ? buildPlayStoreUrl(styledApp.packageName) : undefined,
          });
        }
        if (keptApps.length > 0) {
          pendingFolders.push({
            preferredPage: pageIdx,
            folder: { ...cloneDeep(fl), id: uid('fld'), col: mapped.col, row: mapped.row, apps: keptApps },
            wasOutOfBounds: mapped.wasOutOfBounds,
          });
        }
      }
    }

    // Top-level icons
    for (const ic of srcScreen.icons) {
      if (options.deduplicateApps && existingPackages.has(ic.packageName)) {
        iconsSkippedDuplicate++;
        continue;
      }
      const mapped = mapDesiredCoords(ic.col, ic.row, 1, 1);
      if (gridStrategy === 'crop-within-bounds' && mapped.wasOutOfBounds) {
        itemsDroppedByCrop++;
        continue;
      }
      const isInstalled = installedSet.has(ic.packageName);
      if (!isInstalled) {
        registerMissing(ic, `${srcScreen.name} · Slot (${ic.col + 1}, ${ic.row + 1})`);
        if (!createPlaceholders) {
          missingAppsSkipped++;
          continue;
        }
      }
      existingPackages.add(ic.packageName);
      const styledIcon = resolveRestoredAppAppearance(ic);
      pendingIcons.push({
        preferredPage: pageIdx,
        icon: {
          ...styledIcon,
          id: uid('ic'),
          col: mapped.col,
          row: mapped.row,
          isPlaceholder: !isInstalled,
          playStoreUrl: !isInstalled ? buildPlayStoreUrl(styledIcon.packageName) : undefined,
        },
        wasOutOfBounds: mapped.wasOutOfBounds,
      });
    }
  });

  const getOrCreateOverflowPage = (labelHint?: string): HomeScreenPage => {
    overflowScreensCreated++;
    const page: HomeScreenPage = {
      id: uid('scr'),
      name: labelHint ? `${labelHint} (Overflow)` : `Migrated Screen ${overflowScreensCreated}`,
      isPrimary: false,
      order: nextDevice.screens.length,
      icons: [],
      folders: [],
      widgets: [],
    };
    nextDevice.screens.push(page);
    return page;
  };

  const placeItemOnScreens = (
    preferredIdx: number,
    preferredCol: number,
    preferredRow: number,
    spanX: number,
    spanY: number,
    wasOutOfBounds: boolean,
    attach: (page: HomeScreenPage, col: number, row: number) => void
  ): boolean => {
    const startIdx = Math.min(preferredIdx, nextDevice.screens.length - 1);
    const candidateIndices =
      gridStrategy === 'preserve-pages'
        ? [startIdx]
        : [
            startIdx,
            ...nextDevice.screens.map((_, i) => i).filter((i) => i !== startIdx),
          ];

    for (const idx of candidateIndices) {
      const page = nextDevice.screens[idx];
      const grid = computeOccupancyGrid(page, cols, rows);
      if (
        idx === preferredIdx &&
        canPlaceAt(grid, cols, rows, preferredCol, preferredRow, spanX, spanY)
      ) {
        attach(page, preferredCol, preferredRow);
        if (wasOutOfBounds) outOfBoundsRelocated++;
        return true;
      }
      const slot =
        gridStrategy === 'proportional-scale'
          ? findNearestOpenSlot(grid, cols, rows, preferredCol, preferredRow, spanX, spanY)
          : findFirstOpenSlot(grid, cols, rows, spanX, spanY);
      if (slot) {
        attach(page, slot.col, slot.row);
        reflowedItems++;
        if (wasOutOfBounds) outOfBoundsRelocated++;
        return true;
      }
    }

    if (options.overflowToNewScreen || gridStrategy === 'preserve-pages') {
      const srcName = backup.screens[preferredIdx]?.name;
      const newPage = getOrCreateOverflowPage(
        gridStrategy === 'preserve-pages' ? srcName : undefined
      );
      const grid = computeOccupancyGrid(newPage, cols, rows);
      const slot = findFirstOpenSlot(grid, cols, rows, spanX, spanY);
      if (slot) {
        attach(newPage, slot.col, slot.row);
        reflowedItems++;
        if (wasOutOfBounds) outOfBoundsRelocated++;
        return true;
      }
    }
    return false;
  };

  for (const { preferredPage, widget, wasOutOfBounds } of pendingWidgets) {
    const placed = placeItemOnScreens(
      preferredPage,
      widget.col,
      widget.row,
      widget.spanX,
      widget.spanY,
      wasOutOfBounds,
      (page, c, r) => {
        widget.col = c;
        widget.row = r;
        page.widgets.push(widget);
      }
    );
    if (placed) widgetsPlaced++;
  }

  for (const { preferredPage, folder, wasOutOfBounds } of pendingFolders) {
    const placed = placeItemOnScreens(
      preferredPage,
      folder.col,
      folder.row,
      1,
      1,
      wasOutOfBounds,
      (page, c, r) => {
        folder.col = c;
        folder.row = r;
        page.folders.push(folder);
      }
    );
    if (placed) foldersCreated++;
  }

  for (const { preferredPage, icon, wasOutOfBounds } of pendingIcons) {
    const placed = placeItemOnScreens(
      preferredPage,
      icon.col,
      icon.row,
      1,
      1,
      wasOutOfBounds,
      (page, c, r) => {
        icon.col = c;
        icon.row = r;
        page.icons.push(icon);
      }
    );
    if (placed) {
      if (icon.isPlaceholder) placeholdersCreated++;
      else iconsAdded++;
    }
  }

  // In Merge mode, if icon art import is enabled, also apply backup icon art onto matching existing icons
  if (shouldImportIconArt) {
    const backupIconByPkg = new Map<string, Omit<AppIconItem, 'col' | 'row'>>();
    for (const d of backup.dock) backupIconByPkg.set(d.packageName, d);
    for (const scr of backup.screens) {
      for (const ic of scr.icons) backupIconByPkg.set(ic.packageName, ic);
      for (const fl of scr.folders) {
        for (const app of fl.apps) backupIconByPkg.set(app.packageName, app);
      }
    }

    const syncExistingAppArt = <T extends Omit<AppIconItem, 'col' | 'row'>>(app: T): T => {
      const bkIcon = backupIconByPkg.get(app.packageName);
      const bkAsset = backup.iconArtAssets?.[app.packageName];
      if (!bkIcon && !bkAsset) return app;
      const next = { ...app };
      if (bkIcon?.customIconArt) {
        next.customIconArt = bkIcon.customIconArt;
      }
      if (bkAsset) {
        next.iconKey = bkAsset.iconKey || next.iconKey;
        next.tint = bkAsset.tint || next.tint;
      }
      if (!importedArtPackages.has(app.packageName)) {
        importedArtPackages.add(app.packageName);
        iconArtImported++;
      }
      return next;
    };

    nextDevice.dock = nextDevice.dock.map(syncExistingAppArt);
    nextDevice.screens = nextDevice.screens.map((scr) => ({
      ...scr,
      icons: scr.icons.map(syncExistingAppArt),
      folders: scr.folders.map((fl) => ({
        ...fl,
        apps: fl.apps.map(syncExistingAppArt),
      })),
    }));
  }

  const missingApps = Array.from(missingMap.values());

  if (backup.gridCols !== targetGridBefore.cols || backup.gridRows !== targetGridBefore.rows) {
    notes.push(
      `Cross-grid merge (${backup.gridCols}×${backup.gridRows} → ${cols}×${rows}) using "${gridStrategy}" strategy (${outOfBoundsRelocated} out-of-bounds item${outOfBoundsRelocated === 1 ? '' : 's'} remapped${widgetsResized > 0 ? `, ${widgetsResized} widget${widgetsResized === 1 ? '' : 's'} resized` : ''}${itemsDroppedByCrop > 0 ? `, ${itemsDroppedByCrop} cropped` : ''}).`
    );
  }
  if (foldersMerged > 0) {
    notes.push(
      `Combined ${nestedAppsMerged} unique app${nestedAppsMerged === 1 ? '' : 's'} into ${foldersMerged} existing folder${foldersMerged === 1 ? '' : 's'}.`
    );
  }
  if (shouldImportIconArt && iconArtImported > 0) {
    notes.push(
      `Imported bundled icon art for ${iconArtImported} app${iconArtImported === 1 ? '' : 's'}.`
    );
  } else if (iconArtSkipped) {
    notes.push(
      'Skipped bundled icon art per import settings — kept target device icon styles.'
    );
  } else if (!hasIconArtInBackup) {
    notes.push(
      'Backup contains layout coordinates only (no bundled icon art) — using target device icons.'
    );
  }
  if (missingApps.length > 0) {
    notes.push(
      createPlaceholders
        ? `${missingApps.length} uninstalled app${missingApps.length === 1 ? '' : 's'} placed as placeholder icon${missingApps.length === 1 ? '' : 's'} with Play Store install links.`
        : `Skipped ${missingApps.length} uninstalled app${missingApps.length === 1 ? '' : 's'} and prepared a downloadable Play Store install file.`
    );
  }
  if (iconsSkippedDuplicate > 0) {
    notes.push(
      `Skipped ${iconsSkippedDuplicate} app${iconsSkippedDuplicate === 1 ? '' : 's'} already placed on ${targetDevice.name}.`
    );
  }
  if (overflowScreensCreated > 0) {
    notes.push(
      `Created ${overflowScreensCreated} supplemental screen${overflowScreensCreated === 1 ? '' : 's'} to avoid overwriting occupied slots.`
    );
  }
  if (widgetsUpdated > 0) {
    notes.push(
      `Synchronized configuration for ${widgetsUpdated} matching app widget${widgetsUpdated === 1 ? '' : 's'}.`
    );
  }
  if (notes.length === 0) {
    notes.push('All items from backup merged cleanly into open slots without conflicts.');
  }

  nextDevice.lastScannedAt = new Date().toISOString();

  return {
    nextDevice,
    report: {
      mode,
      missingAppStrategy: missingStrategy,
      gridStrategy,
      sourceGrid,
      targetGridBefore,
      targetGridAfter,
      targetDeviceName: targetDevice.name,
      backupName: backup.name,
      screensBefore,
      screensAfter: nextDevice.screens.length,
      iconsAdded,
      iconsSkippedDuplicate,
      placeholdersCreated,
      missingAppsSkipped,
      missingApps,
      foldersCreated,
      foldersMerged,
      nestedAppsMerged,
      widgetsPlaced,
      widgetsUpdated,
      widgetsResized,
      reflowedItems,
      outOfBoundsRelocated,
      itemsDroppedByCrop,
      overflowScreensCreated,
      iconArtImported,
      iconArtSkipped,
      notes,
    },
  };
}

/**
 * Runs a deep under-the-hood integrity check across all devices and stored backups
 * for the Developer Tools page.
 */
export function auditWorkspaceIntegrity(
  devices: DeviceProfile[],
  backups: LayoutBackupSnapshot[]
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  for (const dev of devices) {
    const installedSet = new Set(dev.installedPackages ?? []);
    const seenPackages = new Map<string, string>();

    for (const scr of dev.screens) {
      const cellMap = new Map<string, string[]>();

      const recordCell = (col: number, row: number, label: string) => {
        const key = `${col},${row}`;
        const list = cellMap.get(key) ?? [];
        list.push(label);
        cellMap.set(key, list);
      };

      for (const ic of scr.icons) {
        if (ic.col < 0 || ic.row < 0 || ic.col >= dev.gridCols || ic.row >= dev.gridRows) {
          findings.push({
            id: `oob-${dev.id}-${ic.id}`,
            severity: 'error',
            category: 'out-of-bounds',
            targetType: 'device',
            targetId: dev.id,
            targetName: dev.name,
            summary: `Icon "${ic.label}" is out of ${dev.gridCols}×${dev.gridRows} bounds`,
            details: `Located at (${ic.col + 1}, ${ic.row + 1}) on "${scr.name}" while grid is ${dev.gridCols}×${dev.gridRows}.`,
            autoFixable: true,
          });
        } else {
          recordCell(ic.col, ic.row, `Icon "${ic.label}"`);
        }

        if (ic.isPlaceholder && installedSet.has(ic.packageName)) {
          findings.push({
            id: `stale-${dev.id}-${ic.id}`,
            severity: 'warning',
            category: 'stale-placeholder',
            targetType: 'device',
            targetId: dev.id,
            targetName: dev.name,
            summary: `Placeholder "${ic.label}" is already installed`,
            details: `${ic.packageName} exists in installedPackages on ${dev.name} and can be promoted to a live icon.`,
            autoFixable: true,
          });
        }

        if (seenPackages.has(ic.packageName)) {
          findings.push({
            id: `dup-${dev.id}-${ic.id}`,
            severity: 'warning',
            category: 'duplicate-package',
            targetType: 'device',
            targetId: dev.id,
            targetName: dev.name,
            summary: `Duplicate shortcut for "${ic.label}"`,
            details: `${ic.packageName} appears on both "${seenPackages.get(ic.packageName)}" and "${scr.name}".`,
            autoFixable: false,
          });
        } else {
          seenPackages.set(ic.packageName, scr.name);
        }
      }

      for (const fl of scr.folders) {
        if (fl.col < 0 || fl.row < 0 || fl.col >= dev.gridCols || fl.row >= dev.gridRows) {
          findings.push({
            id: `oob-${dev.id}-${fl.id}`,
            severity: 'error',
            category: 'out-of-bounds',
            targetType: 'device',
            targetId: dev.id,
            targetName: dev.name,
            summary: `Folder "${fl.name}" is out of ${dev.gridCols}×${dev.gridRows} bounds`,
            details: `Located at (${fl.col + 1}, ${fl.row + 1}) on "${scr.name}".`,
            autoFixable: true,
          });
        } else {
          recordCell(fl.col, fl.row, `Folder "${fl.name}"`);
        }
      }

      for (const w of scr.widgets) {
        if (
          w.col < 0 ||
          w.row < 0 ||
          w.col + w.spanX > dev.gridCols ||
          w.row + w.spanY > dev.gridRows
        ) {
          findings.push({
            id: `oob-${dev.id}-${w.id}`,
            severity: 'error',
            category: 'out-of-bounds',
            targetType: 'device',
            targetId: dev.id,
            targetName: dev.name,
            summary: `Widget "${w.title}" (${w.spanX}×${w.spanY}) overflows ${dev.gridCols}×${dev.gridRows} grid`,
            details: `Anchored at (${w.col + 1}, ${w.row + 1}) on "${scr.name}".`,
            autoFixable: true,
          });
        }
        for (let r = w.row; r < Math.min(dev.gridRows, w.row + w.spanY); r++) {
          for (let c = w.col; c < Math.min(dev.gridCols, w.col + w.spanX); c++) {
            if (r >= 0 && c >= 0) recordCell(c, r, `Widget "${w.title}"`);
          }
        }
      }

      for (const [cellKey, occupants] of cellMap.entries()) {
        if (occupants.length > 1) {
          const [cStr, rStr] = cellKey.split(',');
          findings.push({
            id: `col-${dev.id}-${scr.id}-${cellKey}`,
            severity: 'error',
            category: 'collision',
            targetType: 'device',
            targetId: dev.id,
            targetName: dev.name,
            summary: `Cell overlap at (${Number(cStr) + 1}, ${Number(rStr) + 1}) on "${scr.name}"`,
            details: `Occupied simultaneously by: ${occupants.join(' & ')}.`,
            autoFixable: true,
          });
        }
      }
    }
  }

  for (const bk of backups) {
    const expected = computeBackupChecksum(
      bk.screens,
      bk.dock,
      bk.gridCols,
      bk.gridRows,
      bk.iconArtAssets
    );
    if (bk.checksum !== expected) {
      findings.push({
        id: `chk-${bk.id}`,
        severity: 'error',
        category: 'checksum',
        targetType: 'backup',
        targetId: bk.id,
        targetName: bk.name,
        summary: `Checksum mismatch on backup "${bk.name}"`,
        details: `Stored checksum ${bk.checksum} does not match recomputed FNV-1a ${expected}.`,
        autoFixable: true,
      });
    }
  }

  return findings;
}

/**
 * Marks a missing package as installed on a device and converts every matching
 * dummy placeholder icon (on home screens, inside folders, or in the dock) into a live active icon.
 */
export function markPackageInstalledOnDevice(
  device: DeviceProfile,
  packageName: string
): DeviceProfile {
  const next = cloneDeep(device);
  const installed = new Set(next.installedPackages ?? []);
  installed.add(packageName);
  next.installedPackages = Array.from(installed);

  next.dock = next.dock.map((d) =>
    d.packageName === packageName ? { ...d, isPlaceholder: false } : d
  );

  next.screens = next.screens.map((scr) => ({
    ...scr,
    icons: scr.icons.map((ic) =>
      ic.packageName === packageName ? { ...ic, isPlaceholder: false } : ic
    ),
    folders: scr.folders.map((fl) => ({
      ...fl,
      apps: fl.apps.map((a) =>
        a.packageName === packageName ? { ...a, isPlaceholder: false } : a
      ),
    })),
  }));

  return next;
}

/**
 * Propagates a synchronized widget's config across all linked Android devices
 * that have that widget enabled for sync (preserving each device's local grid coordinates & span).
 */
export function propagateSyncedWidget(
  devices: DeviceProfile[],
  sourceWidget: WidgetItem,
  sourceDeviceId: string
): { devices: DeviceProfile[]; syncedDevicesCount: number; pausedDevicesCount: number } {
  const now = new Date().toISOString();
  let syncedDevicesCount = 0;
  let pausedDevicesCount = 0;

  const updated = devices.map((device) => {
    let deviceTouched = false;
    let devicePaused = false;
    const nextScreens = device.screens.map((screen) => {
      const nextWidgets = screen.widgets.map((w) => {
        if (w.syncKey !== sourceWidget.syncKey) return w;
        if (device.id === sourceDeviceId && w.id === sourceWidget.id) {
          return {
            ...sourceWidget,
            updatedAt: now,
            updatedByDeviceId: sourceDeviceId,
          };
        }
        if (sourceWidget.syncEnabled && w.syncEnabled) {
          deviceTouched = true;
          return {
            ...w,
            config: cloneDeep(sourceWidget.config),
            updatedAt: now,
            updatedByDeviceId: sourceDeviceId,
          };
        }
        if (sourceWidget.syncEnabled && !w.syncEnabled) {
          devicePaused = true;
        }
        return w;
      });
      return { ...screen, widgets: nextWidgets };
    });

    if (deviceTouched) syncedDevicesCount++;
    if (devicePaused) pausedDevicesCount++;
    return { ...device, screens: nextScreens };
  });

  return { devices: updated, syncedDevicesCount, pausedDevicesCount };
}

/**
 * Adds a synchronized widget onto a target device that does not yet have it,
 * automatically fitting its span to the target device grid.
 */
export function pushWidgetToDevice(
  device: DeviceProfile,
  sourceWidget: WidgetItem
): DeviceProfile {
  const next = cloneDeep(device);
  const cols = next.gridCols;
  const rows = next.gridRows;
  const spanX = Math.min(sourceWidget.spanX, cols);
  const spanY = Math.min(sourceWidget.spanY, rows);

  const newWidget: WidgetItem = {
    ...cloneDeep(sourceWidget),
    id: uid('w'),
    spanX,
    spanY,
    syncEnabled: true,
    updatedAt: new Date().toISOString(),
  };

  for (const page of next.screens) {
    const grid = computeOccupancyGrid(page, cols, rows);
    const slot = findFirstOpenSlot(grid, cols, rows, spanX, spanY);
    if (slot) {
      newWidget.col = slot.col;
      newWidget.row = slot.row;
      page.widgets.push(newWidget);
      return next;
    }
  }

  newWidget.col = 0;
  newWidget.row = 0;
  next.screens.push({
    id: uid('scr'),
    name: `Widgets Screen ${next.screens.length}`,
    isPrimary: false,
    order: next.screens.length,
    icons: [],
    folders: [],
    widgets: [newWidget],
  });
  return next;
}
