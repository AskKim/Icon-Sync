import React, { useState } from 'react';
import {
  Check,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
} from 'lucide-react';
import {
  DeviceProfile,
  WidgetItem,
  WidgetSyncPolicy,
} from '../types/layout';

interface WidgetSyncViewProps {
  devices: DeviceProfile[];
  policy: WidgetSyncPolicy;
  onUpdatePolicy: (policy: WidgetSyncPolicy) => void;
  onSyncWidgetAcrossDevices: (widget: WidgetItem, sourceDeviceId: string) => void;
  onPushWidgetToDevice: (targetDeviceId: string, sourceWidget: WidgetItem) => void;
  onToggleWidgetSyncOnDevice: (deviceId: string, widgetId: string) => void;
  onSyncAllNow: () => void;
}

interface GroupedWidgetRow {
  syncKey: string;
  title: string;
  provider: string;
  representative: WidgetItem;
  representativeDeviceId: string;
  placements: {
    device: DeviceProfile;
    screenName: string;
    widget: WidgetItem;
  }[];
}

export function WidgetSyncView({
  devices,
  policy,
  onUpdatePolicy,
  onSyncWidgetAcrossDevices,
  onPushWidgetToDevice,
  onToggleWidgetSyncOnDevice,
  onSyncAllNow,
}: WidgetSyncViewProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newTaskDraft, setNewTaskDraft] = useState('');

  // Group all widgets across all registered devices by syncKey
  const groupedMap = new Map<string, GroupedWidgetRow>();
  for (const device of devices) {
    for (const screen of device.screens) {
      for (const widget of screen.widgets) {
        const existing = groupedMap.get(widget.syncKey);
        if (!existing) {
          groupedMap.set(widget.syncKey, {
            syncKey: widget.syncKey,
            title: widget.title,
            provider: widget.provider,
            representative: widget,
            representativeDeviceId: device.id,
            placements: [{ device, screenName: screen.name, widget }],
          });
        } else {
          existing.placements.push({ device, screenName: screen.name, widget });
          if (new Date(widget.updatedAt) > new Date(existing.representative.updatedAt)) {
            existing.representative = widget;
            existing.representativeDeviceId = device.id;
          }
        }
      }
    }
  }

  const rows = Array.from(groupedMap.values());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Cross-Device App Widget Sync
          </h1>
          <p className="text-sm text-[#4B5563] mt-1">
            Keep Android widget settings, checklists, cities, and playback states aligned across phones and tablets while preserving each device’s grid span.
          </p>
        </div>
        <button
          type="button"
          onClick={onSyncAllNow}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync All Widgets Now
        </button>
      </div>

      {/* Sync Policy Strip */}
      <div className="bg-white border border-[#E4E7EC] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <SlidersHorizontal className="w-4 h-4 text-[#166534] mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#111827]">Conflict Resolution & Sync Policy</p>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Last synchronized{' '}
              <span className="font-mono tabular-nums text-[#374151]">
                {new Date(policy.lastSyncAt).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#4B5563]">On conflict:</label>
            <select
              value={policy.conflictStrategy}
              onChange={(e) =>
                onUpdatePolicy({
                  ...policy,
                  conflictStrategy: e.target.value as WidgetSyncPolicy['conflictStrategy'],
                })
              }
              className="px-3 py-1.5 text-xs bg-[#F9FAFB] border border-[#E4E7EC] rounded-lg text-[#111827]"
            >
              <option value="newest">Newest edit wins</option>
              <option value="primary_device">Primary device authoritative</option>
              <option value="manual">Manual review</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs text-[#111827] font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={policy.autoSyncEnabled}
              onChange={(e) =>
                onUpdatePolicy({ ...policy, autoSyncEnabled: e.target.checked })
              }
              className="w-4 h-4 accent-[#166534]"
            />
            Auto-sync widget edits
          </label>
        </div>
      </div>

      {/* Widget Matrix */}
      <div className="bg-white border border-[#E4E7EC] rounded-2xl divide-y divide-[#F1F3F6] overflow-hidden">
        {rows.map((row) => {
          const isEditing = editingKey === row.syncKey;
          const rep = row.representative;

          return (
            <div key={row.syncKey} className="p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-sm font-semibold text-[#111827]">{row.title}</h3>
                    <span className="text-xs text-[#6B7280] font-mono truncate">
                      {row.provider}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#6B7280] mt-1 flex-wrap">
                    <span>
                      Installed on{' '}
                      <strong className="font-mono tabular-nums text-[#111827]">
                        {row.placements.length}/{devices.length}
                      </strong>{' '}
                      devices
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Active state:{' '}
                      <span className="text-[#374151] font-medium">
                        {rep.kind === 'weather' &&
                          `${rep.config.city ?? 'San Francisco'} (°${rep.config.unit ?? 'F'})`}
                        {rep.kind === 'tasks' &&
                          `${(rep.config.tasks ?? []).filter((t) => t.done).length}/${(rep.config.tasks ?? []).length} completed`}
                        {rep.kind === 'calendar' &&
                          `${rep.config.calendarAccount ?? 'Work'} (${(rep.config.events ?? []).length} events)`}
                        {rep.kind === 'clock' &&
                          `${rep.config.primaryZone ?? 'PST'} / ${rep.config.secondaryZone ?? 'UTC'}`}
                        {rep.kind === 'music' &&
                          `${rep.config.trackTitle ?? 'Paused'} (${rep.config.isPlaying ? 'Playing' : 'Paused'})`}
                        {rep.kind === 'battery' &&
                          `${rep.config.wearableName ?? 'Buds'} (${rep.config.wearablePercent ?? 84}%)`}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingKey(isEditing ? null : row.syncKey)}
                    className="px-3 py-1.5 text-xs font-medium text-[#111827] bg-[#F9FAFB] hover:bg-[#F3F4F6] border border-[#E4E7EC] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {isEditing ? 'Close Config' : 'Edit & Propagate'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSyncWidgetAcrossDevices(
                        { ...rep, syncEnabled: true },
                        row.representativeDeviceId
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#166534] bg-[#166534]/10 hover:bg-[#166534]/15 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Push State
                  </button>
                </div>
              </div>

              {/* Per-device placement & span grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {devices.map((device) => {
                  const placed = row.placements.find((p) => p.device.id === device.id);
                  if (placed) {
                    return (
                      <div
                        key={device.id}
                        className="px-3.5 py-2.5 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-[#111827]">
                            <Smartphone className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                            <span className="truncate">{device.name}</span>
                          </div>
                          <p className="text-[11px] text-[#6B7280] font-mono tabular-nums mt-0.5 truncate">
                            {placed.screenName} · Span {placed.widget.spanX}×{placed.widget.spanY}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onToggleWidgetSyncOnDevice(device.id, placed.widget.id)
                          }
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            placed.widget.syncEnabled
                              ? 'bg-[#166534] text-white'
                              : 'bg-white border border-[#D1D5DB] text-[#6B7280]'
                          }`}
                        >
                          {placed.widget.syncEnabled ? 'Synced' : 'Paused'}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={device.id}
                      className="px-3.5 py-2.5 rounded-xl border border-dashed border-[#D1D5DB] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#6B7280] truncate">{device.name}</p>
                        <p className="text-[11px] text-[#9CA3AF] mt-0.5">Not placed yet</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onPushWidgetToDevice(device.id, rep)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#166534] hover:bg-[#166534]/10 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Inline Shared Widget Configuration Editor */}
              {isEditing && (
                <div className="p-4 rounded-xl bg-[#FAFBFD] border border-[#E4E7EC] space-y-3">
                  <p className="text-xs font-semibold text-[#111827]">
                    Shared Widget Configuration (changes propagate to all synced devices)
                  </p>

                  {rep.kind === 'weather' && (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={rep.config.city ?? ''}
                        onChange={(e) =>
                          onSyncWidgetAcrossDevices(
                            {
                              ...rep,
                              syncEnabled: true,
                              config: { ...rep.config, city: e.target.value },
                            },
                            row.representativeDeviceId
                          )
                        }
                        placeholder="City name"
                        className="flex-1 px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg"
                      />
                      <div className="flex gap-2">
                        {(['F', 'C'] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            onClick={() =>
                              onSyncWidgetAcrossDevices(
                                {
                                  ...rep,
                                  syncEnabled: true,
                                  config: { ...rep.config, unit },
                                },
                                row.representativeDeviceId
                              )
                            }
                            className={`px-3.5 py-2 text-xs font-medium rounded-lg border cursor-pointer ${
                              rep.config.unit === unit
                                ? 'bg-[#111827] text-white border-[#111827]'
                                : 'bg-white text-[#374151] border-[#E4E7EC]'
                            }`}
                          >
                            °{unit}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {rep.kind === 'tasks' && (
                    <div className="space-y-2.5">
                      <div className="space-y-1.5">
                        {(rep.config.tasks ?? []).map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => {
                              const nextTasks = (rep.config.tasks ?? []).map((t) =>
                                t.id === task.id ? { ...t, done: !t.done } : t
                              );
                              onSyncWidgetAcrossDevices(
                                {
                                  ...rep,
                                  syncEnabled: true,
                                  config: { ...rep.config, tasks: nextTasks },
                                },
                                row.representativeDeviceId
                              );
                            }}
                            className="w-full px-3 py-2 bg-white border border-[#E4E7EC] rounded-lg flex items-center gap-2.5 text-left text-xs cursor-pointer hover:border-[#166534]"
                          >
                            <span
                              className={`w-4 h-4 rounded flex items-center justify-center border ${
                                task.done
                                  ? 'bg-[#166534] border-[#166534] text-white'
                                  : 'border-[#CBD5E1]'
                              }`}
                            >
                              {task.done && <Check className="w-3 h-3" />}
                            </span>
                            <span className={task.done ? 'line-through text-[#9CA3AF]' : 'text-[#111827]'}>
                              {task.text}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newTaskDraft}
                          onChange={(e) => setNewTaskDraft(e.target.value)}
                          placeholder="Add new task to sync across devices..."
                          className="flex-1 px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!newTaskDraft.trim()) return;
                            const nextTasks = [
                              ...(rep.config.tasks ?? []),
                              { id: `t-${Date.now()}`, text: newTaskDraft.trim(), done: false },
                            ];
                            setNewTaskDraft('');
                            onSyncWidgetAcrossDevices(
                              {
                                ...rep,
                                syncEnabled: true,
                                config: { ...rep.config, tasks: nextTasks },
                              },
                              row.representativeDeviceId
                            );
                          }}
                          className="px-3.5 py-2 text-xs font-medium text-white bg-[#166534] rounded-lg cursor-pointer"
                        >
                          Add & Sync
                        </button>
                      </div>
                    </div>
                  )}

                  {rep.kind === 'calendar' && (
                    <input
                      type="text"
                      value={rep.config.calendarAccount ?? ''}
                      onChange={(e) =>
                        onSyncWidgetAcrossDevices(
                          {
                            ...rep,
                            syncEnabled: true,
                            config: { ...rep.config, calendarAccount: e.target.value },
                          },
                          row.representativeDeviceId
                        )
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg"
                      placeholder="Calendar account label"
                    />
                  )}

                  {rep.kind === 'clock' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        value={rep.config.primaryZone ?? ''}
                        onChange={(e) =>
                          onSyncWidgetAcrossDevices(
                            {
                              ...rep,
                              syncEnabled: true,
                              config: { ...rep.config, primaryZone: e.target.value },
                            },
                            row.representativeDeviceId
                          )
                        }
                        className="px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg"
                        placeholder="Primary zone"
                      />
                      <input
                        type="text"
                        value={rep.config.secondaryZone ?? ''}
                        onChange={(e) =>
                          onSyncWidgetAcrossDevices(
                            {
                              ...rep,
                              syncEnabled: true,
                              config: { ...rep.config, secondaryZone: e.target.value },
                            },
                            row.representativeDeviceId
                          )
                        }
                        className="px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg"
                        placeholder="Secondary zone"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onSyncWidgetAcrossDevices(
                            {
                              ...rep,
                              syncEnabled: true,
                              config: { ...rep.config, use24Hour: !rep.config.use24Hour },
                            },
                            row.representativeDeviceId
                          )
                        }
                        className="px-3 py-2 text-xs font-medium bg-white border border-[#E4E7EC] rounded-lg text-[#111827] hover:border-[#166534] cursor-pointer"
                      >
                        Format: {rep.config.use24Hour ? '24-Hour' : '12-Hour'}
                      </button>
                    </div>
                  )}

                  {rep.kind === 'music' && (
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="text"
                        value={rep.config.trackTitle ?? ''}
                        onChange={(e) =>
                          onSyncWidgetAcrossDevices(
                            {
                              ...rep,
                              syncEnabled: true,
                              config: { ...rep.config, trackTitle: e.target.value },
                            },
                            row.representativeDeviceId
                          )
                        }
                        className="flex-1 px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onSyncWidgetAcrossDevices(
                            {
                              ...rep,
                              syncEnabled: true,
                              config: { ...rep.config, isPlaying: !rep.config.isPlaying },
                            },
                            row.representativeDeviceId
                          )
                        }
                        className="px-4 py-2 text-xs font-medium bg-[#111827] text-white rounded-lg cursor-pointer"
                      >
                        {rep.config.isPlaying ? 'Pause Across Devices' : 'Play Across Devices'}
                      </button>
                    </div>
                  )}

                  {rep.kind === 'battery' && (
                    <input
                      type="text"
                      value={rep.config.wearableName ?? ''}
                      onChange={(e) =>
                        onSyncWidgetAcrossDevices(
                          {
                            ...rep,
                            syncEnabled: true,
                            config: { ...rep.config, wearableName: e.target.value },
                          },
                          row.representativeDeviceId
                        )
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg"
                      placeholder="Tracked accessory name"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
