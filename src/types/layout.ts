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

export interface DeviceProfile {
  id: string;
  name: string;
  manufacturer: string;
  androidVersion: string;
  launcher: string;
  formFactor: 'phone' | 'tablet';
  gridCols: number;
  gridRows: number;
  wallpaperId: string;
  lastScannedAt: string;
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
  wallpaperId: string;
  screens: HomeScreenPage[];
  dock: Omit<AppIconItem, 'col' | 'row'>[];
  stats: BackupStats;
  checksum: string;
}

export type RestoreMode = 'replace' | 'merge';

export interface MergeOptions {
  deduplicateApps: boolean;
  mergeMatchingFolders: boolean;
  syncWidgetsOnImport: boolean;
  overflowToNewScreen: boolean;
}

export interface RestoreDiffReport {
  mode: RestoreMode;
  targetDeviceName: string;
  backupName: string;
  screensBefore: number;
  screensAfter: number;
  iconsAdded: number;
  iconsSkippedDuplicate: number;
  foldersCreated: number;
  foldersMerged: number;
  nestedAppsMerged: number;
  widgetsPlaced: number;
  widgetsUpdated: number;
  reflowedItems: number;
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
