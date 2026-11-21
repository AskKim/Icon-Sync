/**
 * @file src/components/AddDeviceModal.tsx
 * @license GPL-3.0-or-later
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ============================================================================
 * ADD CUSTOM ANDROID DEVICE / LAUNCHER PROFILE MODAL
 * ============================================================================
 *
 * PLAIN-ENGLISH OVERVIEW:
 * Lets users register any Android phone, tablet, or custom/Mini launcher
 * directly inside Icon Sync (for example, a 5x4 Mini Launcher phone) without
 * editing source code. The new device immediately supports layout editing,
 * backups, and cross-grid imports (such as importing a 6x6 Nova backup into
 * a newly registered 5x4 Mini Launcher device).
 */

import React, { useState } from 'react';
import { Plus, Smartphone, X } from 'lucide-react';
import { DeviceProfile } from '../types/layout';
import { WALLPAPERS } from '../data/catalog';
import { LAUNCHER_GRID_CAPABILITIES, uid } from '../engine/layoutEngine';
import { clampGridDimension, sanitizeText } from '../utils/sanitize';

interface AddDeviceModalProps {
  onClose: () => void;
  onCreateDevice: (device: DeviceProfile) => void;
}

const QUICK_DEVICE_PRESETS: {
  label: string;
  name: string;
  modelCode: string;
  manufacturer: string;
  androidVersion: string;
  launcher: string;
  formFactor: 'phone' | 'tablet';
  gridCols: number;
  gridRows: number;
}[] = [
  {
    label: 'Mini Launcher Phone (5×4)',
    name: 'Compact Mini Phone',
    modelCode: 'MINI-5X4',
    manufacturer: 'Custom Android',
    androidVersion: 'Android 15',
    launcher: 'Mini / Minimalist Launcher',
    formFactor: 'phone',
    gridCols: 5,
    gridRows: 4,
  },
  {
    label: 'Lawnchair 14 (5×5)',
    name: 'Pixel 8a (Lawnchair)',
    modelCode: 'GKV4X',
    manufacturer: 'Google',
    androidVersion: 'Android 15',
    launcher: 'Lawnchair 14',
    formFactor: 'phone',
    gridCols: 5,
    gridRows: 5,
  },
  {
    label: 'Nova Power Phone (6×6)',
    name: 'OnePlus 13 (Nova)',
    modelCode: 'CPH2655',
    manufacturer: 'OnePlus',
    androidVersion: 'Android 15 · OxygenOS 15',
    launcher: 'Nova Launcher 8',
    formFactor: 'phone',
    gridCols: 6,
    gridRows: 6,
  },
];

export function AddDeviceModal({ onClose, onCreateDevice }: AddDeviceModalProps) {
  const [name, setName] = useState('Compact Mini Phone');
  const [modelCode, setModelCode] = useState('MINI-5X4');
  const [manufacturer, setManufacturer] = useState('Custom Android');
  const [androidVersion, setAndroidVersion] = useState('Android 15');
  const [launcher, setLauncher] = useState('Mini / Minimalist Launcher');
  const [formFactor, setFormFactor] = useState<'phone' | 'tablet'>('phone');
  const [gridCols, setGridCols] = useState<number>(5);
  const [gridRows, setGridRows] = useState<number>(4);
  const [wallpaperId, setWallpaperId] = useState<string>(WALLPAPERS[0].id);

  const handleApplyPreset = (preset: (typeof QUICK_DEVICE_PRESETS)[number]) => {
    setName(preset.name);
    setModelCode(preset.modelCode);
    setManufacturer(preset.manufacturer);
    setAndroidVersion(preset.androidVersion);
    setLauncher(preset.launcher);
    setFormFactor(preset.formFactor);
    setGridCols(preset.gridCols);
    setGridRows(preset.gridRows);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const safeName = sanitizeText(name, 60) || 'Custom Android Device';
    const safeModel = sanitizeText(modelCode, 32);
    const safeManufacturer = sanitizeText(manufacturer, 40) || 'Android';
    const safeAndroid = sanitizeText(androidVersion, 40) || 'Android 15';
    const safeLauncher = sanitizeText(launcher, 60) || 'Custom Launcher';
    const safeCols = clampGridDimension(gridCols, 4);
    const safeRows = clampGridDimension(gridRows, 5);
    const now = new Date().toISOString();

    const newDevice: DeviceProfile = {
      id: uid('dev'),
      name: safeName,
      modelCode: safeModel || undefined,
      manufacturer: safeManufacturer,
      androidVersion: safeAndroid,
      launcher: safeLauncher,
      formFactor,
      gridCols: safeCols,
      gridRows: safeRows,
      gridDetectionSource: 'user-reported',
      gridConfidence: 'manual',
      gridDetectedAt: now,
      wallpaperId,
      lastScannedAt: now,
      // Starter core packages so restored backups show a realistic installed vs missing split
      installedPackages: [
        'com.google.android.dialer',
        'com.google.android.apps.messaging',
        'com.android.chrome',
        'com.google.android.gm',
        'com.google.android.apps.maps',
        'com.google.android.calendar',
        'com.google.android.GoogleCamera',
        'com.whatsapp',
        'com.spotify.music',
      ],
      dock: [
        {
          id: uid('dk'),
          packageName: 'com.google.android.dialer',
          label: 'Phone',
          iconKey: 'phone',
          tint: '#16A34A',
          category: 'Communication',
        },
        {
          id: uid('dk'),
          packageName: 'com.google.android.apps.messaging',
          label: 'Messages',
          iconKey: 'messages',
          tint: '#2563EB',
          category: 'Communication',
        },
        {
          id: uid('dk'),
          packageName: 'com.android.chrome',
          label: 'Chrome',
          iconKey: 'chrome',
          tint: '#0EA5E9',
          category: 'Utilities',
        },
        {
          id: uid('dk'),
          packageName: 'com.google.android.GoogleCamera',
          label: 'Camera',
          iconKey: 'camera',
          tint: '#475569',
          category: 'Media',
        },
      ],
      screens: [
        {
          id: uid('scr'),
          name: 'Primary Home',
          isPrimary: true,
          order: 0,
          icons: [
            {
              id: uid('ic'),
              packageName: 'com.google.android.gm',
              label: 'Gmail',
              iconKey: 'mail',
              tint: '#DC2626',
              category: 'Productivity',
              col: 0,
              row: 0,
            },
            {
              id: uid('ic'),
              packageName: 'com.google.android.apps.maps',
              label: 'Maps',
              iconKey: 'maps',
              tint: '#15803D',
              category: 'Utilities',
              col: 1,
              row: 0,
            },
            {
              id: uid('ic'),
              packageName: 'com.whatsapp',
              label: 'WhatsApp',
              iconKey: 'whatsapp',
              tint: '#16A34A',
              category: 'Communication',
              col: 2,
              row: 0,
            },
          ],
          folders: [],
          widgets: [],
        },
      ],
    };

    onCreateDevice(newDevice);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#111827]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white border border-[#E4E7EC] rounded-2xl shadow-xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#F1F3F6] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-4 h-4 text-[#166534]" />
            <div>
              <h2 className="text-base font-semibold text-[#111827]">
                Register Android Device / Custom Launcher
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Report any grid density (3×3 to 8×8) for stock, Nova, Lawnchair, or Mini launchers.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add device modal"
            className="w-9 h-9 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] hover:text-[#111827] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Quick Presets */}
          <div>
            <p className="text-xs font-semibold text-[#374151] mb-2">Quick Starting Templates</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_DEVICE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="px-3 py-1.5 text-xs font-medium text-[#111827] bg-[#F3F4F6] hover:bg-[#E5E7EB] rounded-lg transition-colors cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Device Name
              </label>
              <input
                type="text"
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Galaxy A16 Mini"
                className="w-full px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Model Code (Optional)
              </label>
              <input
                type="text"
                maxLength={32}
                value={modelCode}
                onChange={(e) => setModelCode(e.target.value)}
                placeholder="e.g., SM-A166U"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Launcher Profile
              </label>
              <select
                value={launcher}
                onChange={(e) => setLauncher(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
              >
                {LAUNCHER_GRID_CAPABILITIES.map((cap) => (
                  <option key={cap.launcherName} value={cap.launcherName}>
                    {cap.launcherName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Android Version
              </label>
              <input
                type="text"
                maxLength={40}
                value={androidVersion}
                onChange={(e) => setAndroidVersion(e.target.value)}
                placeholder="Android 15"
                className="w-full px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Grid Columns (3–8)
              </label>
              <input
                type="number"
                min={3}
                max={8}
                value={gridCols}
                onChange={(e) => setGridCols(clampGridDimension(e.target.value, 5))}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Grid Rows (3–8)
              </label>
              <input
                type="number"
                min={3}
                max={8}
                value={gridRows}
                onChange={(e) => setGridRows(clampGridDimension(e.target.value, 4))}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Form Factor
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['phone', 'tablet'] as const).map((ff) => (
                  <button
                    key={ff}
                    type="button"
                    onClick={() => setFormFactor(ff)}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors capitalize cursor-pointer ${
                      formFactor === ff
                        ? 'bg-[#111827] text-white border-[#111827]'
                        : 'bg-white text-[#374151] border-[#E4E7EC] hover:border-[#9CA3AF]'
                    }`}
                  >
                    {ff}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Wallpaper Theme
              </label>
              <select
                value={wallpaperId}
                onChange={(e) => setWallpaperId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#166534]"
              >
                {WALLPAPERS.map((wp) => (
                  <option key={wp.id} value={wp.id}>
                    {wp.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-[#F1F3F6] flex items-center justify-between gap-3">
            <span className="text-xs text-[#6B7280] font-mono tabular-nums">
              Configured grid: {gridCols}×{gridRows} ({gridCols * gridRows} cells/page)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[#374151] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Device Profile
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
