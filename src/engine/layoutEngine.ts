import {
  AppIconItem,
  BackupStats,
  DeviceProfile,
  FolderItem,
  HomeScreenPage,
  LayoutBackupSnapshot,
  MergeOptions,
  RestoreDiffReport,
  RestoreMode,
  WidgetItem,
} from '../types/layout';

export function cloneDeep<T>(value: T): T {
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

export function computeChecksum(payload: unknown): string {
  const str = JSON.stringify(payload);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
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
    syncedWidgetCount += scr.widgets.filter((w) => w.syncEnabled).length;
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
    bytes: new TextEncoder().encode(serialized).length,
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
  }
): LayoutBackupSnapshot {
  const screens = cloneDeep(device.screens);
  const dock = cloneDeep(device.dock);
  const stats = computeBackupStats(screens, dock);
  const checksum = computeChecksum({ screens, dock, gridCols: device.gridCols, gridRows: device.gridRows });

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
    wallpaperId: device.wallpaperId,
    screens,
    dock,
    stats,
    checksum,
  };
}

export function validateBackupPayload(raw: unknown): {
  valid: boolean;
  backup?: LayoutBackupSnapshot;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'File does not contain a valid JSON object.' };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.screens) || obj.screens.length === 0) {
    return { valid: false, error: 'Backup is missing a valid screens[] array.' };
  }
  for (const screen of obj.screens) {
    if (!screen || typeof screen !== 'object') {
      return { valid: false, error: 'Encountered malformed screen entry in backup.' };
    }
    const s = screen as Record<string, unknown>;
    if (!Array.isArray(s.icons) || !Array.isArray(s.folders) || !Array.isArray(s.widgets)) {
      return { valid: false, error: 'Each screen must define icons, folders, and widgets arrays.' };
    }
  }
  const screens = cloneDeep(obj.screens as HomeScreenPage[]);
  const dock = Array.isArray(obj.dock) ? cloneDeep(obj.dock as DeviceProfile['dock']) : [];
  const gridCols = typeof obj.gridCols === 'number' && obj.gridCols >= 3 && obj.gridCols <= 8 ? obj.gridCols : 4;
  const gridRows = typeof obj.gridRows === 'number' && obj.gridRows >= 4 && obj.gridRows <= 8 ? obj.gridRows : 5;
  const stats = computeBackupStats(screens, dock);

  const normalized: LayoutBackupSnapshot = {
    id: typeof obj.id === 'string' && obj.id ? obj.id : uid('bk-imp'),
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Imported Backup File',
    notes: typeof obj.notes === 'string' ? obj.notes : '',
    schemaVersion: '2.0',
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    storage: obj.storage === 'cloud' ? 'cloud' : 'local',
    sourceDeviceId: typeof obj.sourceDeviceId === 'string' ? obj.sourceDeviceId : 'external-import',
    sourceDeviceName: typeof obj.sourceDeviceName === 'string' ? obj.sourceDeviceName : 'Imported Android Device',
    sourceLauncher: typeof obj.sourceLauncher === 'string' ? obj.sourceLauncher : 'Android Launcher',
    gridCols,
    gridRows,
    wallpaperId: typeof obj.wallpaperId === 'string' ? obj.wallpaperId : 'alpine-dusk',
    screens,
    dock,
    stats,
    checksum: typeof obj.checksum === 'string' ? obj.checksum : computeChecksum({ screens, dock, gridCols, gridRows }),
  };

  return { valid: true, backup: normalized };
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

/**
 * Computes both the resulting DeviceProfile and an exact diff report for either
 * Replace or Merge restoration modes.
 */
export function computeRestoreResult(
  targetDevice: DeviceProfile,
  backup: LayoutBackupSnapshot,
  mode: RestoreMode,
  options: MergeOptions
): { nextDevice: DeviceProfile; report: RestoreDiffReport } {
  const cols = targetDevice.gridCols;
  const rows = targetDevice.gridRows;
  const screensBefore = targetDevice.screens.length;

  let iconsAdded = 0;
  let iconsSkippedDuplicate = 0;
  let foldersCreated = 0;
  let foldersMerged = 0;
  let nestedAppsMerged = 0;
  let widgetsPlaced = 0;
  let widgetsUpdated = 0;
  let reflowedItems = 0;
  let overflowScreensCreated = 0;
  const notes: string[] = [];

  if (mode === 'replace') {
    const nextScreens: HomeScreenPage[] = [];
    const overflowIcons: AppIconItem[] = [];
    const overflowFolders: FolderItem[] = [];
    const overflowWidgets: WidgetItem[] = [];

    backup.screens.forEach((srcScreen, idx) => {
      const page: HomeScreenPage = {
        id: uid('scr'),
        name: srcScreen.name,
        isPrimary: idx === 0,
        order: idx,
        icons: [],
        folders: [],
        widgets: [],
      };
      const grid = computeOccupancyGrid(page, cols, rows);

      // 1. Place widgets first (preserve multi-cell footprint, clamp spans to target grid)
      for (const w of srcScreen.widgets) {
        const clampedSpanX = Math.min(w.spanX, cols);
        const clampedSpanY = Math.min(w.spanY, rows);
        const clonedWidget: WidgetItem = {
          ...cloneDeep(w),
          id: uid('w'),
          spanX: clampedSpanX,
          spanY: clampedSpanY,
        };
        if (canPlaceAt(grid, cols, rows, w.col, w.row, clampedSpanX, clampedSpanY)) {
          clonedWidget.col = w.col;
          clonedWidget.row = w.row;
          markOccupied(grid, w.col, w.row, clampedSpanX, clampedSpanY);
          page.widgets.push(clonedWidget);
          widgetsPlaced++;
          if (clampedSpanX !== w.spanX || clampedSpanY !== w.spanY) {
            reflowedItems++;
          }
        } else {
          const slot = findFirstOpenSlot(grid, cols, rows, clampedSpanX, clampedSpanY);
          if (slot) {
            clonedWidget.col = slot.col;
            clonedWidget.row = slot.row;
            markOccupied(grid, slot.col, slot.row, clampedSpanX, clampedSpanY);
            page.widgets.push(clonedWidget);
            widgetsPlaced++;
            reflowedItems++;
          } else {
            overflowWidgets.push(clonedWidget);
          }
        }
      }

      // 2. Place folders
      for (const f of srcScreen.folders) {
        const clonedFolder: FolderItem = { ...cloneDeep(f), id: uid('fld') };
        if (canPlaceAt(grid, cols, rows, f.col, f.row, 1, 1)) {
          markOccupied(grid, f.col, f.row, 1, 1);
          page.folders.push(clonedFolder);
          foldersCreated++;
        } else {
          const slot = findFirstOpenSlot(grid, cols, rows, 1, 1);
          if (slot) {
            clonedFolder.col = slot.col;
            clonedFolder.row = slot.row;
            markOccupied(grid, slot.col, slot.row, 1, 1);
            page.folders.push(clonedFolder);
            foldersCreated++;
            reflowedItems++;
          } else {
            overflowFolders.push(clonedFolder);
          }
        }
      }

      // 3. Place icons
      for (const ic of srcScreen.icons) {
        const clonedIcon: AppIconItem = { ...cloneDeep(ic), id: uid('ic') };
        if (canPlaceAt(grid, cols, rows, ic.col, ic.row, 1, 1)) {
          markOccupied(grid, ic.col, ic.row, 1, 1);
          page.icons.push(clonedIcon);
          iconsAdded++;
        } else {
          const slot = findFirstOpenSlot(grid, cols, rows, 1, 1);
          if (slot) {
            clonedIcon.col = slot.col;
            clonedIcon.row = slot.row;
            markOccupied(grid, slot.col, slot.row, 1, 1);
            page.icons.push(clonedIcon);
            iconsAdded++;
            reflowedItems++;
          } else {
            overflowIcons.push(clonedIcon);
          }
        }
      }

      nextScreens.push(page);
    });

    // Place any reflowed overflow items onto extra supplemental pages so nothing is dropped
    while (overflowWidgets.length > 0 || overflowFolders.length > 0 || overflowIcons.length > 0) {
      overflowScreensCreated++;
      const extraPage: HomeScreenPage = {
        id: uid('scr'),
        name: `Overflow Screen ${overflowScreensCreated}`,
        isPrimary: false,
        order: nextScreens.length,
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
          iconsAdded++;
          reflowedItems++;
        }
      }

      nextScreens.push(extraPage);
      if (overflowScreensCreated > 6) break;
    }

    if (backup.gridCols !== cols || backup.gridRows !== rows) {
      notes.push(
        `Adapted layout from ${backup.gridCols}×${backup.gridRows} to ${cols}×${rows} grid (${reflowedItems} item${reflowedItems === 1 ? '' : 's'} reflowed).`
      );
    } else {
      notes.push(`Exact ${cols}×${rows} grid coordinates restored across ${nextScreens.length} screens.`);
    }

    const nextDevice: DeviceProfile = {
      ...cloneDeep(targetDevice),
      screens: nextScreens,
      dock: cloneDeep(backup.dock).slice(0, Math.max(4, cols)),
      lastScannedAt: new Date().toISOString(),
    };

    return {
      nextDevice,
      report: {
        mode,
        targetDeviceName: targetDevice.name,
        backupName: backup.name,
        screensBefore,
        screensAfter: nextScreens.length,
        iconsAdded,
        iconsSkippedDuplicate: 0,
        foldersCreated,
        foldersMerged: 0,
        nestedAppsMerged: 0,
        widgetsPlaced,
        widgetsUpdated: 0,
        reflowedItems,
        overflowScreensCreated,
        notes,
      },
    };
  }

  // MERGE MODE
  const nextDevice = cloneDeep(targetDevice);
  const existingPackages = collectDevicePackages(nextDevice);

  // Build index of existing folders by lowercase name
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

  // Ensure matching number of pages if backup has more pages
  const pendingWidgets: { preferredPage: number; widget: WidgetItem }[] = [];
  const pendingFolders: { preferredPage: number; folder: FolderItem }[] = [];
  const pendingIcons: { preferredPage: number; icon: AppIconItem }[] = [];

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
        const clonedW: WidgetItem = {
          ...cloneDeep(w),
          id: uid('w'),
          spanX: Math.min(w.spanX, cols),
          spanY: Math.min(w.spanY, rows),
        };
        pendingWidgets.push({ preferredPage: pageIdx, widget: clonedW });
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
          targetFolder.apps.push({ ...cloneDeep(app), id: uid('fa') });
          folderPkgs.add(app.packageName);
          existingPackages.add(app.packageName);
          nestedAppsMerged++;
          addedAny = true;
        }
        if (addedAny) {
          foldersMerged++;
        }
      } else {
        const clonedFolder: FolderItem = {
          ...cloneDeep(fl),
          id: uid('fld'),
          apps: fl.apps
            .filter((app) => {
              if (options.deduplicateApps && existingPackages.has(app.packageName)) {
                iconsSkippedDuplicate++;
                return false;
              }
              existingPackages.add(app.packageName);
              return true;
            })
            .map((a) => ({ ...cloneDeep(a), id: uid('fa') })),
        };
        if (clonedFolder.apps.length > 0) {
          pendingFolders.push({ preferredPage: pageIdx, folder: clonedFolder });
        }
      }
    }

    // Top-level icons
    for (const ic of srcScreen.icons) {
      if (options.deduplicateApps && existingPackages.has(ic.packageName)) {
        iconsSkippedDuplicate++;
        continue;
      }
      existingPackages.add(ic.packageName);
      pendingIcons.push({ preferredPage: pageIdx, icon: { ...cloneDeep(ic), id: uid('ic') } });
    }
  });

  // Helper to get or create a page index
  const getOrCreateOverflowPage = (): HomeScreenPage => {
    overflowScreensCreated++;
    const page: HomeScreenPage = {
      id: uid('scr'),
      name: `Migrated Screen ${overflowScreensCreated}`,
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
    attach: (page: HomeScreenPage, col: number, row: number) => void
  ): boolean => {
    const startIdx = Math.min(preferredIdx, nextDevice.screens.length - 1);
    const candidateIndices = [
      startIdx,
      ...nextDevice.screens.map((_, i) => i).filter((i) => i !== startIdx),
    ];

    for (const idx of candidateIndices) {
      const page = nextDevice.screens[idx];
      const grid = computeOccupancyGrid(page, cols, rows);
      if (idx === preferredIdx && canPlaceAt(grid, cols, rows, preferredCol, preferredRow, spanX, spanY)) {
        attach(page, preferredCol, preferredRow);
        return true;
      }
      const slot = findFirstOpenSlot(grid, cols, rows, spanX, spanY);
      if (slot) {
        attach(page, slot.col, slot.row);
        reflowedItems++;
        return true;
      }
    }

    if (options.overflowToNewScreen) {
      const newPage = getOrCreateOverflowPage();
      const grid = computeOccupancyGrid(newPage, cols, rows);
      const slot = findFirstOpenSlot(grid, cols, rows, spanX, spanY);
      if (slot) {
        attach(newPage, slot.col, slot.row);
        reflowedItems++;
        return true;
      }
    }
    return false;
  };

  for (const { preferredPage, widget } of pendingWidgets) {
    const placed = placeItemOnScreens(
      preferredPage,
      widget.col,
      widget.row,
      widget.spanX,
      widget.spanY,
      (page, c, r) => {
        widget.col = c;
        widget.row = r;
        page.widgets.push(widget);
      }
    );
    if (placed) widgetsPlaced++;
  }

  for (const { preferredPage, folder } of pendingFolders) {
    const placed = placeItemOnScreens(
      preferredPage,
      folder.col,
      folder.row,
      1,
      1,
      (page, c, r) => {
        folder.col = c;
        folder.row = r;
        page.folders.push(folder);
      }
    );
    if (placed) foldersCreated++;
  }

  for (const { preferredPage, icon } of pendingIcons) {
    const placed = placeItemOnScreens(
      preferredPage,
      icon.col,
      icon.row,
      1,
      1,
      (page, c, r) => {
        icon.col = c;
        icon.row = r;
        page.icons.push(icon);
      }
    );
    if (placed) iconsAdded++;
  }

  if (foldersMerged > 0) {
    notes.push(`Combined ${nestedAppsMerged} unique app${nestedAppsMerged === 1 ? '' : 's'} into ${foldersMerged} existing folder${foldersMerged === 1 ? '' : 's'}.`);
  }
  if (iconsSkippedDuplicate > 0) {
    notes.push(`Skipped ${iconsSkippedDuplicate} app${iconsSkippedDuplicate === 1 ? '' : 's'} already installed on ${targetDevice.name}.`);
  }
  if (overflowScreensCreated > 0) {
    notes.push(`Created ${overflowScreensCreated} supplemental screen${overflowScreensCreated === 1 ? '' : 's'} to avoid overwriting occupied slots.`);
  }
  if (widgetsUpdated > 0) {
    notes.push(`Synchronized configuration for ${widgetsUpdated} matching app widget${widgetsUpdated === 1 ? '' : 's'}.`);
  }
  if (notes.length === 0) {
    notes.push('All items from backup merged cleanly into open slots without conflicts.');
  }

  nextDevice.lastScannedAt = new Date().toISOString();

  return {
    nextDevice,
    report: {
      mode,
      targetDeviceName: targetDevice.name,
      backupName: backup.name,
      screensBefore,
      screensAfter: nextDevice.screens.length,
      iconsAdded,
      iconsSkippedDuplicate,
      foldersCreated,
      foldersMerged,
      nestedAppsMerged,
      widgetsPlaced,
      widgetsUpdated,
      reflowedItems,
      overflowScreensCreated,
      notes,
    },
  };
}

/**
 * Propagates a synchronized widget's config across all linked Android devices
 * that have that widget enabled for sync (preserving each device's local grid coordinates & span).
 */
export function propagateSyncedWidget(
  devices: DeviceProfile[],
  sourceWidget: WidgetItem,
  sourceDeviceId: string
): { devices: DeviceProfile[]; syncedDevicesCount: number } {
  const now = new Date().toISOString();
  let syncedDevicesCount = 0;

  const updated = devices.map((device) => {
    let deviceTouched = false;
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
        return w;
      });
      return { ...screen, widgets: nextWidgets };
    });

    if (deviceTouched) syncedDevicesCount++;
    return { ...device, screens: nextScreens };
  });

  return { devices: updated, syncedDevicesCount };
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

  // Create a new supplemental screen if all current screens are full
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
