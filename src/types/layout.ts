export type AppCategory =
  | 'Communication'
  | 'Productivity'
  | 'Media'
  | 'Navigation'
  | 'Utilities'
  | 'Finance'
  | 'Photography';

export interface AppCatalogEntry {
  packageName: string;
  label: string;
  iconKey: string;
  tint: string;
  category: AppCategory;
}

export interface AppIconItem {
  id: string;
  packageName: string;
  label: string;
  iconKey: string;
  tint: string;
  category: AppCategory;
  col: number;
  row: number;
  isPlaceholder?: boolean;
  playStoreUrl?: string;
}

export interface FolderItem {
  id: string;
  name: string;
  col: number;
  row: number;
  tint: string;
  apps: Omit<AppIconItem, 'col' | 'row'>[];
}

export type WidgetKind =
  | 'weather'
  | 'calendar'
  | 'tasks'
  | 'clock'
  | 'music'
  | 'battery';

export interface TaskWidgetItem {
  id: string;
  text: string;
  done: boolean;
}

export interface WidgetStateConfig {
  // Weather
  city?: string;
  unit?: 'F' | 'C';
  tempF?: number;
  condition?: string;
  // Calendar
  calendarAccount?: string;
  showDeclined?: boolean;
  events?: { time: string; title: string; location: string }[];
  // Tasks
  listTitle?: string;
  tasks?: TaskWidgetItem[];
  // Clock
  primaryZone?: string;
  secondaryZone?: string;
  use24Hour?: boolean;
  // Music
  trackTitle?: string;
  artist?: string;
  isPlaying?: boolean;
  // Battery
  showConnectedWearables?: boolean;
  wearableName?: string;
  wearablePercent?: number;
}

export interface WidgetItem {
  id: string;
  syncKey: string;
  provider: string;
  title: string;
  kind: WidgetKind;
  col: number;
  row: number;
  spanX: number;
  spanY: number;
  syncEnabled: boolean;
  updatedAt: string;
  updatedByDeviceId: string;
  config: WidgetStateConfig;
}

export interface HomeScreenPage {
  id: string;
  name: string;
  isPrimary: boolean;
  order: number;
  icons: AppIconItem[];
  folders: FolderItem[];
  widgets: WidgetItem[];
}

export type GridDetectionSource =
  | 'launcher-provider'
  | 'auto-accessibility'
  | 'oem-profile'
  | 'user-reported';

export type GridConfidence = 'verified' | 'estimated' | 'manual';

export interface GridDimensions {
  cols: number;
  rows: number;
}

export interface LauncherGridCapability {
  id: string;
  launcherName: string;
  packageName: string;
  supportsProviderQuery: boolean;
  supportsAccessibilityDetect: boolean;
  allowsCustomGrid: boolean;
  minCols: number;
  maxCols: number;
  minRows: number;
  maxRows: number;
  presets: { cols: number; rows: number; label: string }[];
  detectionNotes: string;
}

export type GridAdaptationStrategy =
  | 'auto-reflow'
  | 'proportional-scale'
  | 'preserve-pages'
  | 'resize-target-grid'
  | 'crop-within-bounds';

export interface GridCompatibilityAnalysis {
  isExactMatch: boolean;
  mismatchType: 'exact' | 'shrink' | 'expand' | 'aspect-shift';
  sourceGrid: GridDimensions;
  targetGrid: GridDimensions;
  sourceCellsPerPage: number;
  targetCellsPerPage: number;
  cellCapacityDelta: number;
  outOfBoundsIcons: number;
  outOfBoundsFolders: number;
  outOfBoundsWidgets: number;
  widgetsRequiringResize: number;
  totalAffectedItems: number;
  canResizeTargetLauncher: boolean;
  resizeTargetReason: string;
  recommendedStrategy: GridAdaptationStrategy;
  summary: string;
}

export interface DeviceProfile {
  id: string;
  name: string;
  modelCode?: string;
  manufacturer: string;
  androidVersion: string;
  launcher: string;
  formFactor: 'phone' | 'tablet';
  gridCols: number;
  gridRows: number;
  gridDetectionSource?: GridDetectionSource;
  gridConfidence?: GridConfidence;
  gridDetectedAt?: string;
  wallpaperId: string;
  lastScannedAt: string;
  installedPackages: string[];
  screens: HomeScreenPage[];
  dock: Omit<AppIconItem, 'col' | 'row'>[];
}

export interface BackupStats {
  screenCount: number;
  iconCount: number;
  folderCount: number;
  nestedAppCount: number;
  widgetCount: number;
  syncedWidgetCount: number;
  dockCount: number;
  bytes: number;
}

export interface LayoutBackupSnapshot {
  id: string;
  name: string;
  notes: string;
  schemaVersion: '2.0';
  createdAt: string;
  storage: 'cloud' | 'local';
  sourceDeviceId: string;
  sourceDeviceName: string;
  sourceLauncher: string;
  gridCols: number;
  gridRows: number;
  gridDetectionSource?: GridDetectionSource;
  wallpaperId: string;
  screens: HomeScreenPage[];
  dock: Omit<AppIconItem, 'col' | 'row'>[];
  stats: BackupStats;
  checksum: string;
}

export type RestoreMode = 'replace' | 'merge';

export type MissingAppStrategy = 'placeholder' | 'guided' | 'skip';

export interface MissingAppEntry {
  packageName: string;
  label: string;
  iconKey: string;
  tint: string;
  category: AppCategory;
  playStoreUrl: string;
  targetLocation: string;
  installed?: boolean;
}

export interface MergeOptions {
  deduplicateApps: boolean;
  mergeMatchingFolders: boolean;
  syncWidgetsOnImport: boolean;
  overflowToNewScreen: boolean;
  missingAppStrategy: MissingAppStrategy;
  gridStrategy?: GridAdaptationStrategy;
}

export interface RestoreDiffReport {
  mode: RestoreMode;
  missingAppStrategy: MissingAppStrategy;
  gridStrategy: GridAdaptationStrategy;
  sourceGrid: GridDimensions;
  targetGridBefore: GridDimensions;
  targetGridAfter: GridDimensions;
  targetDeviceName: string;
  backupName: string;
  screensBefore: number;
  screensAfter: number;
  iconsAdded: number;
  iconsSkippedDuplicate: number;
  placeholdersCreated: number;
  missingAppsSkipped: number;
  missingApps: MissingAppEntry[];
  foldersCreated: number;
  foldersMerged: number;
  nestedAppsMerged: number;
  widgetsPlaced: number;
  widgetsUpdated: number;
  widgetsResized: number;
  reflowedItems: number;
  outOfBoundsRelocated: number;
  itemsDroppedByCrop: number;
  overflowScreensCreated: number;
  notes: string[];
}

export interface WidgetSyncPolicy {
  conflictStrategy: 'newest' | 'primary_device' | 'manual';
  autoSyncEnabled: boolean;
  lastSyncAt: string;
}

export interface SelectionTarget {
  type: 'screen' | 'icon' | 'folder' | 'widget' | 'dock' | 'empty-cell';
  id?: string;
  col?: number;
  row?: number;
}

export interface WallpaperOption {
  id: string;
  name: string;
  imageUrl: string;
  fallbackGradient: string;
  surfaceTone: 'light' | 'dark';
}
