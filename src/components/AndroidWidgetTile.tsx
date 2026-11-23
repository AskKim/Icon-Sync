import React from 'react';
import {
  BatteryCharging,
  Calendar,
  Check,
  CloudSun,
  Clock,
  Pause,
  Play,
  RefreshCw,
} from 'lucide-react';
import { WidgetItem } from '../types/layout';

interface AndroidWidgetTileProps {
  widget: WidgetItem;
  isSelected: boolean;
  onSelect: () => void;
  onQuickInteract?: (updatedWidget: WidgetItem) => void;
}

export function AndroidWidgetTile({
  widget,
  isSelected,
  onSelect,
  onQuickInteract,
}: AndroidWidgetTileProps) {
  const { kind, config } = widget;

  const handleToggleUnit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onQuickInteract) return;
    const nextUnit = config.unit === 'C' ? 'F' : 'C';
    onQuickInteract({
      ...widget,
      config: { ...config, unit: nextUnit },
    });
  };

  const handleToggleTask = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    if (!onQuickInteract || !config.tasks) return;
    const nextTasks = config.tasks.map((t) =>
      t.id === taskId ? { ...t, done: !t.done } : t
    );
    onQuickInteract({
      ...widget,
      config: { ...config, tasks: nextTasks },
    });
  };

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onQuickInteract) return;
    onQuickInteract({
      ...widget,
      config: { ...config, isPlaying: !config.isPlaying },
    });
  };

  const displayTemp = () => {
    const f = config.tempF ?? 62;
    if (config.unit === 'C') {
      return `${Math.round(((f - 32) * 5) / 9)}°C`;
    }
    return `${f}°F`;
  };

  return (
    <div
      className={`group relative w-full h-full rounded-[20px] px-3 py-2.5 text-left transition-all duration-150 overflow-hidden select-none backdrop-blur-md bg-[#111827]/72 text-white border ${
        isSelected
          ? 'border-[#4ADE80] ring-2 ring-[#4ADE80]/50'
          : 'border-white/15 hover:border-white/35'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Select ${widget.title} widget`}
        className="absolute inset-0 z-0 rounded-[20px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80]"
      />

      {widget.syncEnabled && (
        <span
          title="Cross-device sync enabled"
          className="pointer-events-none relative z-10 float-right flex items-center gap-1 text-[10px] font-medium text-emerald-300/90"
        >
          <RefreshCw className="w-2.5 h-2.5" />
        </span>
      )}

      {kind === 'weather' && (
        <div className="relative z-10 h-full flex items-center justify-between gap-2 pr-4 pointer-events-none">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-white/75 truncate">
              <CloudSun className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="truncate">{config.city ?? 'San Francisco'}</span>
            </div>
            <p className="text-[11px] text-white/60 truncate mt-0.5">
              {config.condition ?? 'Partly Cloudy'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleUnit}
            title="Toggle °F / °C (syncs across devices)"
            className="pointer-events-auto relative z-20 text-xl font-semibold tracking-tight tabular-nums text-white hover:text-emerald-200 transition-colors shrink-0 px-1.5 py-0.5 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            {displayTemp()}
          </button>
        </div>
      )}

      {kind === 'tasks' && (
        <div className="relative z-10 h-full flex flex-col justify-between pointer-events-none">
          <div className="text-[11px] font-semibold text-white/90 truncate pr-5">
            {config.listTitle ?? 'Focus Tasks'}
          </div>
          <div className="space-y-1 mt-1 overflow-hidden">
            {(config.tasks ?? []).slice(0, 3).map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={(e) => handleToggleTask(e, task.id)}
                className="pointer-events-auto relative z-20 w-full flex items-center gap-2 text-left text-[11px] leading-tight py-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
              >
                <span
                  className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center shrink-0 border ${
                    task.done
                      ? 'bg-emerald-500 border-emerald-400 text-white'
                      : 'border-white/40 bg-transparent'
                  }`}
                >
                  {task.done && <Check className="w-2.5 h-2.5" />}
                </span>
                <span
                  className={`truncate ${
                    task.done ? 'line-through text-white/45' : 'text-white/90'
                  }`}
                >
                  {task.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {kind === 'calendar' && (
        <div className="relative z-10 h-full flex flex-col justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/90 pr-5">
            <Calendar className="w-3 h-3 text-sky-300 shrink-0" />
            <span className="truncate">{config.calendarAccount ?? 'Agenda'}</span>
          </div>
          <div className="space-y-1.5 mt-1 overflow-hidden">
            {(config.events ?? []).slice(0, 3).map((ev, idx) => (
              <div key={idx} className="flex items-baseline gap-2 text-[11px] leading-tight">
                <span className="font-mono text-[10px] text-sky-200/90 tabular-nums shrink-0">
                  {ev.time}
                </span>
                <span className="text-white/90 truncate">{ev.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {kind === 'clock' && (
        <div className="relative z-10 h-full flex flex-col justify-center pr-3 pointer-events-none">
          <div className="flex items-center gap-1 text-[10px] text-white/65 truncate">
            <Clock className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{(config.primaryZone ?? 'PST').split('·')[0].trim()}</span>
          </div>
          <div className="text-base font-semibold font-mono tabular-nums leading-tight mt-0.5">
            {config.use24Hour ? '07:05' : '7:05 AM'}
          </div>
          <div className="text-[10px] text-white/60 font-mono tabular-nums truncate">
            {(config.secondaryZone ?? 'UTC').split('·')[0].trim()} {config.use24Hour ? '15:05' : '3:05 PM'}
          </div>
        </div>
      )}

      {kind === 'music' && (
        <div className="relative z-10 h-full flex items-center justify-between gap-2.5 pr-4 pointer-events-none">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">
              {config.trackTitle ?? 'Kiasmos — Blurred'}
            </p>
            <p className="text-[10px] text-white/65 truncate mt-0.5">
              {config.artist ?? 'Spotify'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={config.isPlaying ? 'Pause track' : 'Play track'}
            className="pointer-events-auto relative z-20 w-8 h-8 rounded-full bg-white text-[#111827] flex items-center justify-center shrink-0 hover:bg-emerald-100 transition-colors cursor-pointer"
          >
            {config.isPlaying ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 ml-0.5" />
            )}
          </button>
        </div>
      )}

      {kind === 'battery' && (
        <div className="relative z-10 h-full flex flex-col justify-center pr-3 pointer-events-none">
          <div className="flex items-center gap-1 text-[10px] text-emerald-300">
            <BatteryCharging className="w-3 h-3 shrink-0" />
            <span className="font-mono tabular-nums">92%</span>
          </div>
          {config.showConnectedWearables && (
            <div className="text-[10px] text-white/75 truncate mt-0.5">
              {config.wearableName ?? 'Buds'} · <span className="font-mono tabular-nums">{config.wearablePercent ?? 84}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
