import React, { useState } from 'react';
import {
  ArrowRightLeft,
  FolderPlus,
  LayoutGrid,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  AppCatalogEntry,
  DeviceProfile,
  FolderItem,
  HomeScreenPage,
  SelectionTarget,
  WidgetItem,
} from '../types/layout';
import {
  ANDROID_APP_CATALOG,
  WALLPAPERS,
  WIDGET_TEMPLATES,
  WidgetTemplate,
} from '../data/catalog';
import { AndroidIcon } from './AndroidIcon';

interface InspectorPanelProps {
  device: DeviceProfile;
  activeScreenIndex: number;
  selection: SelectionTarget;
  onUpdateDevice: (next: DeviceProfile) => void;
  onUpdateWidgetWithSync: (widget: WidgetItem, propagate: boolean) => void;
  onPlaceAppAt: (app: AppCatalogEntry, col: number, row: number) => void;
  onCreateFolderAt: (name: string, col: number, row: number) => void;
  onPlaceWidgetAt: (template: WidgetTemplate, col: number, row: number) => void;
  onDeleteScreen: (screenId: string) => void;
  onSelect: (target: SelectionTarget) => void;
}

export function InspectorPanel({
  device,
  activeScreenIndex,
  selection,
  onUpdateDevice,
  onUpdateWidgetWithSync,
  onPlaceAppAt,
  onCreateFolderAt,
  onPlaceWidgetAt,
  onDeleteScreen,
  onSelect,
}: InspectorPanelProps) {
  const [drawerTab, setDrawerTab] = useState<'apps' | 'widgets' | 'folder'>('apps');
  const [searchQuery, setSearchQuery] = useState('');
  const [newFolderName, setNewFolderName] = useState('Utilities');
  const [newTaskText, setNewTaskText] = useState('');

  const safeIndex = Math.min(activeScreenIndex, Math.max(0, device.screens.length - 1));
  const currentScreen: HomeScreenPage = device.screens[safeIndex];

  const selectedIcon =
    selection.type === 'icon'
      ? currentScreen.icons.find((i) => i.id === selection.id)
      : undefined;
  const selectedFolder =
    selection.type === 'folder'
      ? currentScreen.folders.find((f) => f.id === selection.id)
      : undefined;
  const selectedWidget =
    selection.type === 'widget'
      ? currentScreen.widgets.find((w) => w.id === selection.id)
      : undefined;
  const selectedDock =
    selection.type === 'dock'
      ? device.dock.find((d) => d.id === selection.id)
      : undefined;

  const updateCurrentScreen = (updater: (scr: HomeScreenPage) => HomeScreenPage) => {
    const nextScreens = device.screens.map((s, idx) =>
      idx === safeIndex ? updater(s) : s
    );
    onUpdateDevice({ ...device, screens: nextScreens });
  };

  const handleMoveIconToScreen = (iconId: string, targetScreenId: string) => {
    const icon = currentScreen.icons.find((i) => i.id === iconId);
    if (!icon || targetScreenId === currentScreen.id) return;
    const nextScreens = device.screens.map((scr) => {
      if (scr.id === currentScreen.id) {
        return { ...scr, icons: scr.icons.filter((i) => i.id !== iconId) };
      }
      if (scr.id === targetScreenId) {
        return { ...scr, icons: [...scr.icons, { ...icon, col: 0, row: device.gridRows - 1 }] };
      }
      return scr;
    });
    onUpdateDevice({ ...device, screens: nextScreens });
    onSelect({ type: 'screen', id: currentScreen.id });
  };

  const handleMoveIconIntoFolder = (iconId: string, folderId: string) => {
    const icon = currentScreen.icons.find((i) => i.id === iconId);
    if (!icon) return;
    updateCurrentScreen((scr) => ({
      ...scr,
      icons: scr.icons.filter((i) => i.id !== iconId),
      folders: scr.folders.map((f) =>
        f.id === folderId
          ? {
              ...f,
              apps: [
                ...f.apps,
                {
                  id: icon.id,
                  packageName: icon.packageName,
                  label: icon.label,
                  iconKey: icon.iconKey,
                  tint: icon.tint,
                  category: icon.category,
                },
              ],
            }
          : f
      ),
    }));
    onSelect({ type: 'folder', id: folderId });
  };

  const handleDeleteIcon = (iconId: string) => {
    updateCurrentScreen((scr) => ({
      ...scr,
      icons: scr.icons.filter((i) => i.id !== iconId),
    }));
    onSelect({ type: 'screen', id: currentScreen.id });
  };

  const handleUpdateFolder = (folderId: string, patch: Partial<FolderItem>) => {
    updateCurrentScreen((scr) => ({
      ...scr,
      folders: scr.folders.map((f) => (f.id === folderId ? { ...f, ...patch } : f)),
    }));
  };

  const handleDeleteFolder = (folderId: string) => {
    updateCurrentScreen((scr) => ({
      ...scr,
      folders: scr.folders.filter((f) => f.id !== folderId),
    }));
    onSelect({ type: 'screen', id: currentScreen.id });
  };

  const handleDeleteWidget = (widgetId: string) => {
    updateCurrentScreen((scr) => ({
      ...scr,
      widgets: scr.widgets.filter((w) => w.id !== widgetId),
    }));
    onSelect({ type: 'screen', id: currentScreen.id });
  };

  const filteredCatalog = ANDROID_APP_CATALOG.filter(
    (a) =>
      a.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.packageName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Empty cell placement view
  if (selection.type === 'empty-cell' && selection.col !== undefined && selection.row !== undefined) {
    const targetCol = selection.col;
    const targetRow = selection.row;

    return (
      <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-[#F1F3F6] pb-4">
          <div>
            <h3 className="text-base font-semibold text-[#111827]">
              Place Item at Grid ({targetCol + 1}, {targetRow + 1})
            </h3>
            <p className="text-xs text-[#6B7280] mt-1">
              {currentScreen.name} · {device.name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect({ type: 'screen', id: currentScreen.id })}
            className="text-xs font-medium text-[#4B5563] hover:text-[#111827] cursor-pointer"
          >
            Back to Screen
          </button>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F3F4F6] rounded-lg">
          {(['apps', 'widgets', 'folder'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setDrawerTab(tab)}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors capitalize cursor-pointer ${
                drawerTab === tab
                  ? 'bg-white text-[#111827] shadow-xs'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              {tab === 'apps' ? 'App Icon' : tab === 'widgets' ? 'App Widget' : 'New Folder'}
            </button>
          ))}
        </div>

        {drawerTab === 'apps' && (
          <div className="space-y-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Android packages or labels..."
              className="w-full px-3.5 py-2 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
            />
            <div className="max-h-[340px] overflow-y-auto divide-y divide-[#F3F4F6]">
              {filteredCatalog.map((app) => (
                <button
                  key={app.packageName}
                  type="button"
                  onClick={() => onPlaceAppAt(app, targetCol, targetRow)}
                  className="w-full py-2.5 px-2 flex items-center justify-between gap-3 hover:bg-[#F9FAFB] transition-colors text-left rounded-lg cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <AndroidIcon iconKey={app.iconKey} tint={app.tint} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#111827] truncate">{app.label}</p>
                      <p className="text-[11px] font-mono text-[#6B7280] truncate">{app.packageName}</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-[#166534] shrink-0">Place</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {drawerTab === 'widgets' && (
          <div className="space-y-2.5">
            {WIDGET_TEMPLATES.map((tpl) => (
              <div
                key={tpl.syncKey}
                className="p-3.5 border border-[#E4E7EC] rounded-xl flex items-center justify-between gap-3 hover:border-[#CBD5E1] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#111827]">{tpl.title}</p>
                  <p className="text-[11px] font-mono text-[#6B7280] truncate mt-0.5">
                    {tpl.defaultSpanX}×{tpl.defaultSpanY} · {tpl.provider}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onPlaceWidgetAt(tpl, targetCol, targetRow)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Add Widget
                </button>
              </div>
            ))}
          </div>
        )}

        {drawerTab === 'folder' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Folder Name
              </label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. Travel, Productivity, Audio"
                className="w-full px-3.5 py-2 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
              />
            </div>
            <button
              type="button"
              onClick={() => onCreateFolderAt(newFolderName.trim() || 'New Folder', targetCol, targetRow)}
              className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#166534] hover:bg-[#14532D] rounded-lg inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
              Create Folder at ({targetCol + 1}, {targetRow + 1})
            </button>
          </div>
        )}
      </div>
    );
  }

  // Selected Icon Inspector
  if (selectedIcon) {
    return (
      <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-[#F1F3F6] pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <AndroidIcon iconKey={selectedIcon.iconKey} tint={selectedIcon.tint} size="md" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-[#111827] truncate">{selectedIcon.label}</h3>
              <p className="text-xs font-mono text-[#6B7280] truncate">{selectedIcon.packageName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelect({ type: 'screen', id: currentScreen.id })}
            className="text-xs font-medium text-[#4B5563] hover:text-[#111827] shrink-0 cursor-pointer"
          >
            Done
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1">Column</label>
            <input
              type="number"
              min={1}
              max={device.gridCols}
              value={selectedIcon.col + 1}
              onChange={(e) => {
                const nextCol = Math.max(0, Math.min(device.gridCols - 1, Number(e.target.value) - 1));
                updateCurrentScreen((scr) => ({
                  ...scr,
                  icons: scr.icons.map((ic) =>
                    ic.id === selectedIcon.id ? { ...ic, col: nextCol } : ic
                  ),
                }));
              }}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1">Row</label>
            <input
              type="number"
              min={1}
              max={device.gridRows}
              value={selectedIcon.row + 1}
              onChange={(e) => {
                const nextRow = Math.max(0, Math.min(device.gridRows - 1, Number(e.target.value) - 1));
                updateCurrentScreen((scr) => ({
                  ...scr,
                  icons: scr.icons.map((ic) =>
                    ic.id === selectedIcon.id ? { ...ic, row: nextRow } : ic
                  ),
                }));
              }}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
            />
          </div>
        </div>

        {currentScreen.folders.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">
              Move into Icon Folder
            </label>
            <div className="flex flex-wrap gap-2">
              {currentScreen.folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => handleMoveIconIntoFolder(selectedIcon.id, folder.id)}
                  className="px-3 py-1.5 text-xs font-medium text-[#374151] bg-[#F9FAFB] border border-[#E4E7EC] hover:border-[#166534] hover:text-[#166534] rounded-lg transition-colors cursor-pointer"
                >
                  Move to {folder.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {device.screens.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">
              Move to Supplemental Screen
            </label>
            <div className="flex flex-wrap gap-2">
              {device.screens
                .filter((s) => s.id !== currentScreen.id)
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleMoveIconToScreen(selectedIcon.id, s.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#374151] bg-[#F9FAFB] border border-[#E4E7EC] hover:border-[#111827] rounded-lg transition-colors cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                    {s.name}
                  </button>
                ))}
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-[#F1F3F6] flex justify-end">
          <button
            type="button"
            onClick={() => handleDeleteIcon(selectedIcon.id)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove Icon
          </button>
        </div>
      </div>
    );
  }

  // Selected Folder Inspector
  if (selectedFolder) {
    const existingPkgs = new Set(selectedFolder.apps.map((a) => a.packageName));
    const addableApps = ANDROID_APP_CATALOG.filter((a) => !existingPkgs.has(a.packageName)).slice(0, 8);

    return (
      <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 border-b border-[#F1F3F6] pb-4">
          <div>
            <h3 className="text-base font-semibold text-[#111827]">Icon Folder</h3>
            <p className="text-xs text-[#6B7280] font-mono tabular-nums mt-0.5">
              Slot ({selectedFolder.col + 1}, {selectedFolder.row + 1}) · {selectedFolder.apps.length} apps
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect({ type: 'screen', id: currentScreen.id })}
            className="text-xs font-medium text-[#4B5563] hover:text-[#111827] cursor-pointer"
          >
            Done
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Folder Label</label>
          <input
            type="text"
            value={selectedFolder.name}
            onChange={(e) => handleUpdateFolder(selectedFolder.id, { name: e.target.value })}
            className="w-full px-3.5 py-2 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
          />
          <p className="text-[11px] text-[#6B7280] mt-1">
            During Merge imports, matching folder labels combine unique apps automatically.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-[#374151] mb-2">Apps Inside Folder</p>
          <div className="divide-y divide-[#F3F4F6] border border-[#E4E7EC] rounded-xl overflow-hidden">
            {selectedFolder.apps.map((app) => (
              <div key={app.id} className="px-3 py-2 flex items-center justify-between gap-2 bg-white">
                <div className="flex items-center gap-2.5 min-w-0">
                  <AndroidIcon iconKey={app.iconKey} tint={app.tint} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#111827] truncate">{app.label}</p>
                    <p className="text-[10px] font-mono text-[#6B7280] truncate">{app.packageName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateFolder(selectedFolder.id, {
                      apps: selectedFolder.apps.filter((a) => a.id !== app.id),
                    })
                  }
                  className="text-xs text-[#DC2626] hover:underline shrink-0 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ))}
            {selectedFolder.apps.length === 0 && (
              <p className="px-3 py-4 text-xs text-[#6B7280] text-center">
                No apps in this folder yet.
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[#374151] mb-2">Add App to Folder</p>
          <div className="grid grid-cols-2 gap-2">
            {addableApps.map((app) => (
              <button
                key={app.packageName}
                type="button"
                onClick={() =>
                  handleUpdateFolder(selectedFolder.id, {
                    apps: [
                      ...selectedFolder.apps,
                      { id: `fa-${Date.now()}-${app.iconKey}`, ...app },
                    ],
                  })
                }
                className="flex items-center gap-2 px-2.5 py-2 text-left rounded-lg border border-[#E4E7EC] hover:border-[#166534] hover:bg-[#F9FAFB] transition-colors cursor-pointer"
              >
                <AndroidIcon iconKey={app.iconKey} tint={app.tint} size="xs" />
                <span className="text-xs text-[#111827] truncate">{app.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-[#F1F3F6] flex justify-end">
          <button
            type="button"
            onClick={() => handleDeleteFolder(selectedFolder.id)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Folder
          </button>
        </div>
      </div>
    );
  }

  // Selected Widget Inspector
  if (selectedWidget) {
    return (
      <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 border-b border-[#F1F3F6] pb-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[#111827]">{selectedWidget.title}</h3>
            <p className="text-[11px] font-mono text-[#6B7280] truncate mt-0.5">
              {selectedWidget.provider}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect({ type: 'screen', id: currentScreen.id })}
            className="text-xs font-medium text-[#4B5563] hover:text-[#111827] shrink-0 cursor-pointer"
          >
            Done
          </button>
        </div>

        {/* Cross-device sync switch */}
        <div className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC]">
          <div>
            <p className="text-sm font-medium text-[#111827]">Cross-Device Widget Sync</p>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Propagate configuration & live state changes to linked Android devices
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={selectedWidget.syncEnabled}
            onClick={() =>
              onUpdateWidgetWithSync(
                { ...selectedWidget, syncEnabled: !selectedWidget.syncEnabled },
                !selectedWidget.syncEnabled
              )
            }
            className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
              selectedWidget.syncEnabled ? 'bg-[#166534]' : 'bg-[#D1D5DB]'
            }`}
          >
            <span
              className={`block w-4.5 h-4.5 rounded-full bg-white shadow-xs transition-transform ${
                selectedWidget.syncEnabled ? 'translate-x-5.5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Widget-specific live editable settings */}
        {selectedWidget.kind === 'weather' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Tracked City</label>
              <input
                type="text"
                value={selectedWidget.config.city ?? ''}
                onChange={(e) =>
                  onUpdateWidgetWithSync(
                    {
                      ...selectedWidget,
                      config: { ...selectedWidget.config, city: e.target.value },
                    },
                    selectedWidget.syncEnabled
                  )
                }
                className="w-full px-3.5 py-2 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
              />
            </div>
            <div className="flex items-center gap-2">
              {(['F', 'C'] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() =>
                    onUpdateWidgetWithSync(
                      {
                        ...selectedWidget,
                        config: { ...selectedWidget.config, unit },
                      },
                      selectedWidget.syncEnabled
                    )
                  }
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    selectedWidget.config.unit === unit
                      ? 'bg-[#111827] text-white border-[#111827]'
                      : 'bg-white text-[#374151] border-[#E4E7EC]'
                  }`}
                >
                  Degrees °{unit}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedWidget.kind === 'tasks' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Checklist Title</label>
              <input
                type="text"
                value={selectedWidget.config.listTitle ?? ''}
                onChange={(e) =>
                  onUpdateWidgetWithSync(
                    {
                      ...selectedWidget,
                      config: { ...selectedWidget.config, listTitle: e.target.value },
                    },
                    selectedWidget.syncEnabled
                  )
                }
                className="w-full px-3.5 py-2 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                placeholder="Add synced checklist item..."
                className="flex-1 px-3 py-2 text-xs bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newTaskText.trim()) return;
                  const nextTasks = [
                    ...(selectedWidget.config.tasks ?? []),
                    { id: `t-${Date.now()}`, text: newTaskText.trim(), done: false },
                  ];
                  setNewTaskText('');
                  onUpdateWidgetWithSync(
                    { ...selectedWidget, config: { ...selectedWidget.config, tasks: nextTasks } },
                    selectedWidget.syncEnabled
                  );
                }}
                className="px-3 py-2 text-xs font-medium text-white bg-[#166534] rounded-lg cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {selectedWidget.kind === 'calendar' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Calendar Source</label>
              <input
                type="text"
                value={selectedWidget.config.calendarAccount ?? ''}
                onChange={(e) =>
                  onUpdateWidgetWithSync(
                    {
                      ...selectedWidget,
                      config: { ...selectedWidget.config, calendarAccount: e.target.value },
                    },
                    selectedWidget.syncEnabled
                  )
                }
                className="w-full px-3.5 py-2 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
              />
            </div>
          </div>
        )}

        {selectedWidget.kind === 'clock' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">Primary Zone</label>
                <input
                  type="text"
                  value={selectedWidget.config.primaryZone ?? ''}
                  onChange={(e) =>
                    onUpdateWidgetWithSync(
                      {
                        ...selectedWidget,
                        config: { ...selectedWidget.config, primaryZone: e.target.value },
                      },
                      selectedWidget.syncEnabled
                    )
                  }
                  className="w-full px-3 py-2 text-xs bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">Secondary Zone</label>
                <input
                  type="text"
                  value={selectedWidget.config.secondaryZone ?? ''}
                  onChange={(e) =>
                    onUpdateWidgetWithSync(
                      {
                        ...selectedWidget,
                        config: { ...selectedWidget.config, secondaryZone: e.target.value },
                      },
                      selectedWidget.syncEnabled
                    )
                  }
                  className="w-full px-3 py-2 text-xs bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {/* Footprint & Coordinates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1">Width Span</label>
            <select
              value={selectedWidget.spanX}
              onChange={(e) =>
                onUpdateWidgetWithSync(
                  { ...selectedWidget, spanX: Number(e.target.value) },
                  false
                )
              }
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
            >
              {Array.from({ length: device.gridCols }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} col{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1">Height Span</label>
            <select
              value={selectedWidget.spanY}
              onChange={(e) =>
                onUpdateWidgetWithSync(
                  { ...selectedWidget, spanY: Number(e.target.value) },
                  false
                )
              }
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} row{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-[#F1F3F6] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onUpdateWidgetWithSync(selectedWidget, true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#166534] bg-[#166534]/10 hover:bg-[#166534]/15 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Now Across Devices
          </button>
          <button
            type="button"
            onClick={() => handleDeleteWidget(selectedWidget.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        </div>
      </div>
    );
  }

  // Selected Dock item
  if (selectedDock) {
    return (
      <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[#F1F3F6] pb-4">
          <div className="flex items-center gap-3">
            <AndroidIcon iconKey={selectedDock.iconKey} tint={selectedDock.tint} size="md" />
            <div>
              <h3 className="text-base font-semibold text-[#111827]">{selectedDock.label}</h3>
              <p className="text-xs text-[#6B7280]">Pinned Bottom Dock · {selectedDock.packageName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelect({ type: 'screen', id: currentScreen.id })}
            className="text-xs font-medium text-[#4B5563] hover:text-[#111827] cursor-pointer"
          >
            Done
          </button>
        </div>
        <p className="text-xs text-[#4B5563] leading-relaxed">
          Pinned dock icons persist across all supplemental screens and are captured automatically in both Local and Cloud backups.
        </p>
      </div>
    );
  }

  // Default: Screen & Device Layout Overview Inspector
  const totalIcons = device.screens.reduce((acc, s) => acc + s.icons.length, 0);
  const totalFolders = device.screens.reduce((acc, s) => acc + s.folders.length, 0);
  const totalNested = device.screens.reduce(
    (acc, s) => acc + s.folders.reduce((fa, f) => fa + f.apps.length, 0),
    0
  );
  const totalWidgets = device.screens.reduce((acc, s) => acc + s.widgets.length, 0);

  return (
    <div className="bg-white border border-[#E4E7EC] rounded-2xl p-6 space-y-6">
      <div className="border-b border-[#F1F3F6] pb-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-[#111827]">
            {currentScreen.isPrimary ? 'Primary Home Screen' : 'Supplemental Screen'}
          </h3>
          {!currentScreen.isPrimary && device.screens.length > 1 && (
            <button
              type="button"
              onClick={() => onDeleteScreen(currentScreen.id)}
              className="text-xs font-medium text-[#DC2626] hover:underline cursor-pointer"
            >
              Remove Page
            </button>
          )}
        </div>
        <p className="text-xs text-[#6B7280] mt-1">
          Click any icon, folder, widget, or empty slot on the device screen to inspect or edit coordinates.
        </p>
      </div>

      {/* Screen Title & Grid Config */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Screen Name</label>
          <input
            type="text"
            value={currentScreen.name}
            onChange={(e) =>
              updateCurrentScreen((scr) => ({ ...scr, name: e.target.value }))
            }
            className="w-full px-3.5 py-2 text-sm bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">
            Launcher Grid Density
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { cols: 4, rows: 5, label: '4 × 5' },
              { cols: 5, rows: 5, label: '5 × 5' },
              { cols: 5, rows: 6, label: '5 × 6' },
            ].map((opt) => {
              const active = device.gridCols === opt.cols && device.gridRows === opt.rows;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() =>
                    onUpdateDevice({
                      ...device,
                      gridCols: opt.cols,
                      gridRows: opt.rows,
                    })
                  }
                  className={`py-2 px-3 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#111827] text-white border-[#111827]'
                      : 'bg-white text-[#374151] border-[#E4E7EC] hover:border-[#9CA3AF]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">
            Device Wallpaper Preview
          </label>
          <div className="grid grid-cols-3 gap-2">
            {WALLPAPERS.map((wp) => {
              const active = device.wallpaperId === wp.id;
              return (
                <button
                  key={wp.id}
                  type="button"
                  onClick={() => onUpdateDevice({ ...device, wallpaperId: wp.id })}
                  className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left truncate transition-colors cursor-pointer ${
                    active
                      ? 'border-[#166534] bg-[#166534]/5 text-[#166534]'
                      : 'border-[#E4E7EC] text-[#4B5563] hover:border-[#9CA3AF]'
                  }`}
                >
                  {wp.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Clean unboxed inventory table */}
      <div className="pt-4 border-t border-[#F1F3F6]">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#111827] mb-3">
          <LayoutGrid className="w-3.5 h-3.5 text-[#166534]" />
          Captured Inventory on {device.name}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-2">
            <dt className="text-[#6B7280]">Screens</dt>
            <dd className="font-mono font-medium text-[#111827] tabular-nums">{device.screens.length}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-2">
            <dt className="text-[#6B7280]">Top-Level Icons</dt>
            <dd className="font-mono font-medium text-[#111827] tabular-nums">{totalIcons}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-2">
            <dt className="text-[#6B7280]">Icon Folders</dt>
            <dd className="font-mono font-medium text-[#111827] tabular-nums">
              {totalFolders} ({totalNested} apps)
            </dd>
          </div>
          <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-2">
            <dt className="text-[#6B7280]">App Widgets</dt>
            <dd className="font-mono font-medium text-[#111827] tabular-nums">{totalWidgets}</dd>
          </div>
        </dl>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={() => onSelect({ type: 'empty-cell', col: 0, row: device.gridRows - 1 })}
          className="w-full py-2.5 px-4 text-xs font-medium text-[#111827] bg-[#F9FAFB] hover:bg-[#F3F4F6] border border-[#E4E7EC] rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Open App & Widget Drawer
        </button>
      </div>
    </div>
  );
}
