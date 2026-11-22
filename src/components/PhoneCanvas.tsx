import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Signal,
  Wifi,
  X,
} from 'lucide-react';
import {
  DeviceProfile,
  FolderItem,
  HomeScreenPage,
  SelectionTarget,
  WidgetItem,
} from '../types/layout';
import { WALLPAPERS } from '../data/catalog';
import { computeOccupancyGrid } from '../engine/layoutEngine';
import { AndroidIcon } from './AndroidIcon';
import { AndroidWidgetTile } from './AndroidWidgetTile';

interface PhoneCanvasProps {
  device: DeviceProfile;
  activeScreenIndex: number;
  selection: SelectionTarget;
  isScanning: boolean;
  onChangeScreen: (index: number) => void;
  onAddScreen: () => void;
  onSelect: (target: SelectionTarget) => void;
  onQuickWidgetInteract: (widget: WidgetItem) => void;
  onExtractAppFromFolder: (folderId: string, appId: string) => void;
  onMarkPackageInstalled?: (packageName: string) => void;
}

export function PhoneCanvas({
  device,
  activeScreenIndex,
  selection,
  isScanning,
  onChangeScreen,
  onAddScreen,
  onSelect,
  onQuickWidgetInteract,
  onExtractAppFromFolder,
  onMarkPackageInstalled,
}: PhoneCanvasProps) {
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [wallpaperFailed, setWallpaperFailed] = useState(false);

  const safeIndex = Math.min(activeScreenIndex, Math.max(0, device.screens.length - 1));
  const currentScreen: HomeScreenPage | undefined = device.screens[safeIndex];
  const wallpaper = WALLPAPERS.find((w) => w.id === device.wallpaperId) ?? WALLPAPERS[0];

  useEffect(() => {
    setWallpaperFailed(false);
  }, [wallpaper.id]);

  const { emptyCells, outOfBoundsCount } = useMemo(() => {
    if (!currentScreen) {
      return { emptyCells: [] as { col: number; row: number }[], outOfBoundsCount: 0 };
    }
    const occupancy = computeOccupancyGrid(currentScreen, device.gridCols, device.gridRows);
    const cells: { col: number; row: number }[] = [];
    for (let r = 0; r < device.gridRows; r++) {
      for (let c = 0; c < device.gridCols; c++) {
        if (!occupancy[r][c]) {
          cells.push({ col: c, row: r });
        }
      }
    }
    let oob = 0;
    for (const i of currentScreen.icons) {
      if (i.col >= device.gridCols || i.row >= device.gridRows) oob++;
    }
    for (const f of currentScreen.folders) {
      if (f.col >= device.gridCols || f.row >= device.gridRows) oob++;
    }
    for (const w of currentScreen.widgets) {
      if (
        w.col >= device.gridCols ||
        w.row >= device.gridRows ||
        w.col + w.spanX > device.gridCols ||
        w.row + w.spanY > device.gridRows
      ) {
        oob++;
      }
    }
    return { emptyCells: cells, outOfBoundsCount: oob };
  }, [currentScreen, device.gridCols, device.gridRows]);

  if (!currentScreen) {
    return null;
  }

  const openFolder: FolderItem | undefined = currentScreen.folders.find(
    (f) => f.id === openFolderId
  );

  const isTablet = device.formFactor === 'tablet';
  const isDenseGrid = device.gridCols >= 6 || device.gridRows >= 6;

  return (
    <div className="flex flex-col items-center">
      {/* Screen switcher strip above device */}
      <div className="w-full max-w-[440px] flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {device.screens.map((scr, idx) => {
            const active = idx === safeIndex;
            return (
              <button
                key={scr.id}
                type="button"
                onClick={() => {
                  setOpenFolderId(null);
                  onChangeScreen(idx);
                  onSelect({ type: 'screen', id: scr.id });
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#111827] text-white'
                    : 'bg-white text-[#4B5563] border border-[#E4E7EC] hover:text-[#111827] hover:border-[#CBD5E1]'
                }`}
              >
                {scr.isPrimary ? `Home · ${scr.name}` : `${idx + 1}. ${scr.name}`}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setOpenFolderId(null);
              onAddScreen();
            }}
            title="Add supplemental screen"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white text-[#166534] border border-dashed border-[#166534]/40 hover:bg-[#166534]/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Screen
          </button>
        </div>
      </div>

      {/* Physical Android hardware frame */}
      <div
        className={`relative w-full ${
          isTablet ? 'max-w-[430px]' : 'max-w-[368px]'
        } rounded-[40px] p-[10px] bg-[#181B20] shadow-[0_24px_56px_-18px_rgba(15,23,42,0.34)] border border-[#2C313A]`}
      >
        {/* Inner screen viewport */}
        <div
          className="relative w-full rounded-[31px] overflow-hidden select-none flex flex-col justify-between"
          style={{
            minHeight: isTablet ? '580px' : '648px',
            background: wallpaper.fallbackGradient,
          }}
        >
          {/* Generated wallpaper image with zero-broken-image fallback */}
          {!wallpaperFailed && (
            <img
              key={wallpaper.id}
              src={wallpaper.imageUrl}
              alt={`${wallpaper.name} wallpaper`}
              decoding="async"
              fetchPriority="high"
              referrerPolicy="no-referrer"
              onError={() => setWallpaperFailed(true)}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          )}

          {/* Measured scrim for crisp 4.5:1 label readability */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(180deg, rgba(15,23,42,0.44) 0%, rgba(15,23,42,0.18) 38%, rgba(15,23,42,0.38) 78%, rgba(15,23,42,0.62) 100%)',
            }}
          />

          {/* Scan sweep animation overlay */}
          {isScanning && (
            <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
              <div className="w-full h-24 bg-gradient-to-b from-transparent via-emerald-400/35 to-emerald-300/70 border-b-2 border-emerald-300 animate-scan-sweep" />
              <div className="absolute inset-x-4 top-12 rounded-xl bg-[#111827]/90 backdrop-blur-md border border-emerald-400/40 px-3.5 py-2.5 text-center">
                <p className="text-xs font-medium text-white">
                  Reading Launcher Grid, Folders & Bound Widgets
                </p>
                <p className="text-[11px] font-mono text-emerald-300 tabular-nums mt-0.5">
                  {device.launcher} · {device.gridCols}×{device.gridRows} · {device.screens.length} screens
                </p>
              </div>
            </div>
          )}

          {/* Android Status Bar */}
          <div className="relative z-10 flex items-center justify-between px-5 pt-3 pb-2 text-[11px] font-medium text-white">
            <span className="font-mono tabular-nums tracking-tight">7:05</span>
            <div className="w-3.5 h-3.5 rounded-full bg-[#0B0D10] border border-white/10" aria-hidden="true" />
            <div className="flex items-center gap-1.5 text-white/95">
              <Signal className="w-3 h-3" />
              <Wifi className="w-3 h-3" />
              <span className="font-mono text-[10px] tabular-nums">92%</span>
            </div>
          </div>

          {/* Interactive Launcher Grid */}
          <div className="relative z-10 flex-1 px-3 py-1.5 flex flex-col">
            {outOfBoundsCount > 0 && (
              <div className="mb-1.5 px-2.5 py-1 rounded-lg bg-[#FEF2F2]/95 border border-[#FECACA] text-[10px] font-medium text-[#991B1B] text-center">
                {outOfBoundsCount} item{outOfBoundsCount === 1 ? '' : 's'} outside {device.gridCols}×{device.gridRows} bounds — open Developer Tools to auto-fix
              </div>
            )}
            <div
              className={`grid flex-1 ${isDenseGrid ? 'gap-1' : 'gap-2'}`}
              style={{
                gridTemplateColumns: `repeat(${device.gridCols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${device.gridRows}, minmax(${device.gridRows >= 6 ? '54px' : '68px'}, 1fr))`,
              }}
            >
              {/* Clickable empty grid cells */}
              {emptyCells.map(({ col, row }) => {
                const isCellSelected =
                  selection.type === 'empty-cell' &&
                  selection.col === col &&
                  selection.row === row;
                return (
                  <button
                    key={`empty-${col}-${row}`}
                    type="button"
                    onClick={() => {
                      setOpenFolderId(null);
                      onSelect({ type: 'empty-cell', col, row });
                    }}
                    style={{
                      gridColumn: `${col + 1} / span 1`,
                      gridRow: `${row + 1} / span 1`,
                    }}
                    title={`Empty slot (${col + 1}, ${row + 1}) — click to place app, folder, or widget`}
                    className={`rounded-2xl border border-dashed flex items-center justify-center transition-colors cursor-pointer ${
                      isCellSelected
                        ? 'border-emerald-300 bg-emerald-400/20 text-emerald-100'
                        : 'border-white/0 hover:border-white/30 hover:bg-white/10 text-transparent hover:text-white/80'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                );
              })}

              {/* App Widgets */}
              {currentScreen.widgets
                .filter((w) => w.col < device.gridCols && w.row < device.gridRows)
                .map((widget) => (
                  <div
                    key={widget.id}
                    style={{
                      gridColumn: `${widget.col + 1} / span ${Math.max(1, Math.min(widget.spanX, device.gridCols - widget.col))}`,
                      gridRow: `${widget.row + 1} / span ${Math.max(1, Math.min(widget.spanY, device.gridRows - widget.row))}`,
                    }}
                  >
                    <AndroidWidgetTile
                      widget={widget}
                      isSelected={selection.type === 'widget' && selection.id === widget.id}
                      onSelect={() => {
                        setOpenFolderId(null);
                        onSelect({ type: 'widget', id: widget.id });
                      }}
                      onQuickInteract={onQuickWidgetInteract}
                    />
                  </div>
                ))}

              {/* App Icons */}
              {currentScreen.icons
                .filter((ic) => ic.col < device.gridCols && ic.row < device.gridRows)
                .map((icon) => {
                  const isSelected = selection.type === 'icon' && selection.id === icon.id;
                  return (
                    <button
                      key={icon.id}
                      type="button"
                      onClick={() => {
                        setOpenFolderId(null);
                        onSelect({ type: 'icon', id: icon.id });
                      }}
                      style={{
                        gridColumn: `${icon.col + 1} / span 1`,
                        gridRow: `${icon.row + 1} / span 1`,
                      }}
                      className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl p-0.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-white/20 ring-2 ring-[#4ADE80]'
                          : 'hover:bg-white/10'
                      }`}
                    >
                      <AndroidIcon
                        iconKey={icon.iconKey}
                        tint={icon.tint}
                        size={device.gridCols >= 6 ? 'sm' : 'md'}
                        isPlaceholder={Boolean(icon.isPlaceholder)}
                        customIconArt={icon.customIconArt}
                      />
                      <span
                        className={`${
                          device.gridCols >= 6 ? 'text-[9px]' : 'text-[11px]'
                        } font-medium leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] truncate w-full text-center ${
                          icon.isPlaceholder ? 'text-white/75 italic' : 'text-white'
                        }`}
                      >
                        {icon.label}
                      </span>
                    </button>
                  );
                })}

              {/* Icon Folders */}
              {currentScreen.folders
                .filter((f) => f.col < device.gridCols && f.row < device.gridRows)
                .map((folder) => {
                  const isSelected = selection.type === 'folder' && selection.id === folder.id;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        onSelect({ type: 'folder', id: folder.id });
                        setOpenFolderId(folder.id);
                      }}
                      style={{
                        gridColumn: `${folder.col + 1} / span 1`,
                        gridRow: `${folder.row + 1} / span 1`,
                      }}
                      className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl p-0.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-white/20 ring-2 ring-[#4ADE80]'
                          : 'hover:bg-white/10'
                      }`}
                    >
                      <div
                        className={`${
                          device.gridCols >= 6 ? 'w-9 h-9 rounded-[12px] p-1' : 'w-11 h-11 rounded-[15px] p-1.5'
                        } bg-white/25 backdrop-blur-md border border-white/30 grid grid-cols-2 gap-0.5 place-items-center shadow-sm`}
                      >
                        {folder.apps.slice(0, 4).map((app) => (
                          <AndroidIcon
                            key={app.id}
                            iconKey={app.iconKey}
                            tint={app.tint}
                            size="xs"
                            isPlaceholder={Boolean(app.isPlaceholder)}
                            customIconArt={app.customIconArt}
                          />
                        ))}
                      </div>
                      <span
                        className={`${
                          device.gridCols >= 6 ? 'text-[9px]' : 'text-[11px]'
                        } font-medium text-white leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] truncate w-full text-center`}
                      >
                        {folder.name}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Page indicator + arrows */}
          <div className="relative z-10 flex items-center justify-center gap-3 py-1.5">
            <button
              type="button"
              onClick={() => {
                setOpenFolderId(null);
                onChangeScreen(Math.max(0, safeIndex - 1));
              }}
              disabled={safeIndex === 0}
              aria-label="Previous screen"
              className="p-1 text-white/75 hover:text-white disabled:opacity-25 cursor-pointer disabled:cursor-default"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1.5">
              {device.screens.map((scr, idx) => (
                <button
                  key={scr.id}
                  type="button"
                  onClick={() => {
                    setOpenFolderId(null);
                    onChangeScreen(idx);
                  }}
                  aria-label={`Switch to ${scr.name}`}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    idx === safeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/75'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpenFolderId(null);
                onChangeScreen(Math.min(device.screens.length - 1, safeIndex + 1));
              }}
              disabled={safeIndex === device.screens.length - 1}
              aria-label="Next screen"
              className="p-1 text-white/75 hover:text-white disabled:opacity-25 cursor-pointer disabled:cursor-default"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Android Dock & Search Pill */}
          <div className="relative z-10 px-3.5 pb-4 pt-1 space-y-2.5">
            <div className="rounded-[22px] bg-black/32 backdrop-blur-md border border-white/15 px-3 py-2 flex items-center justify-around">
              {device.dock.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => {
                    setOpenFolderId(null);
                    onSelect({ type: 'dock', id: app.id });
                  }}
                  title={`${app.label} (Pinned Dock)`}
                  className={`p-1 rounded-xl transition-transform hover:scale-105 cursor-pointer ${
                    selection.type === 'dock' && selection.id === app.id
                      ? 'ring-2 ring-[#4ADE80]'
                      : ''
                  }`}
                >
                  <AndroidIcon
                    iconKey={app.iconKey}
                    tint={app.tint}
                    size="md"
                    isPlaceholder={Boolean(app.isPlaceholder)}
                    customIconArt={app.customIconArt}
                  />
                </button>
              ))}
            </div>

            <div className="h-9 rounded-full bg-white/88 backdrop-blur-md px-3.5 flex items-center justify-between text-[#4B5563] text-xs">
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-[#166534]" />
                <span className="font-medium text-[#374151]">Search apps & widgets</span>
              </div>
              <span className="font-mono text-[10px] text-[#6B7280] tabular-nums">
                {device.gridCols}×{device.gridRows}
              </span>
            </div>

            <div className="flex justify-center pt-0.5">
              <div className="w-24 h-1 rounded-full bg-white/75" aria-hidden="true" />
            </div>
          </div>

          {/* Frosted Android Folder Modal Overlay inside phone */}
          {openFolder && (
            <div
              className="absolute inset-0 z-20 bg-black/55 backdrop-blur-sm flex items-center justify-center p-5"
              onClick={() => setOpenFolderId(null)}
            >
              <div
                className="w-full rounded-[26px] bg-[#161B22]/92 backdrop-blur-xl border border-white/20 p-4 text-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold tracking-tight">{openFolder.name}</h4>
                    <p className="text-[11px] text-white/60 font-mono tabular-nums">
                      {openFolder.apps.length} app{openFolder.apps.length === 1 ? '' : 's'} · Slot ({openFolder.col + 1}, {openFolder.row + 1})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenFolderId(null)}
                    aria-label="Close folder"
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 py-1">
                  {openFolder.apps.map((app) => (
                    <div
                      key={app.id}
                      className="flex flex-col items-center gap-1.5 group relative"
                    >
                      <AndroidIcon
                        iconKey={app.iconKey}
                        tint={app.tint}
                        size="md"
                        isPlaceholder={Boolean(app.isPlaceholder)}
                        customIconArt={app.customIconArt}
                      />
                      <span
                        className={`text-[11px] truncate w-full text-center ${
                          app.isPlaceholder ? 'text-white/70 italic' : 'text-white/90'
                        }`}
                      >
                        {app.label}
                      </span>
                      {app.isPlaceholder && onMarkPackageInstalled ? (
                        <button
                          type="button"
                          onClick={() => onMarkPackageInstalled(app.packageName)}
                          className="text-[10px] text-amber-300 hover:text-amber-200 underline cursor-pointer"
                        >
                          Install
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onExtractAppFromFolder(openFolder.id, app.id)}
                          title="Move out to home screen"
                          className="text-[10px] text-emerald-300 hover:text-emerald-200 underline cursor-pointer"
                        >
                          Move out
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
