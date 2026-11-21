import {
  AppCatalogEntry,
  DeviceProfile,
  LayoutBackupSnapshot,
  WallpaperOption,
  WidgetItem,
  WidgetKind,
} from '../types/layout';
import { buildBackupSnapshot } from '../engine/layoutEngine';

export const WALLPAPERS: WallpaperOption[] = [
  {
    id: 'alpine-dusk',
    name: 'Alpine Topographic',
    imageUrl: '/src/assets/images/wallpaper_alpine_dusk_1795273635186.jpg',
    fallbackGradient: 'linear-gradient(160deg, #9db4b2 0%, #556b73 52%, #2c3e35 100%)',
    surfaceTone: 'dark',
  },
  {
    id: 'botanical-stone',
    name: 'River Basalt',
    imageUrl: '/src/assets/images/wallpaper_botanical_stone_1795273634834.jpg',
    fallbackGradient: 'linear-gradient(165deg, #d7cfc2 0%, #b7ab98 60%, #4b4742 100%)',
    surfaceTone: 'light',
  },
  {
    id: 'architectural-glass',
    name: 'Fluted Glass',
    imageUrl: '/src/assets/images/wallpaper_architectural_glass_1795273636000.jpg',
    fallbackGradient: 'linear-gradient(160deg, #d2d9db 0%, #aeb9bd 50%, #7d878c 100%)',
    surfaceTone: 'light',
  },
];

export const ANDROID_APP_CATALOG: AppCatalogEntry[] = [
  { packageName: 'com.google.android.dialer', label: 'Phone', iconKey: 'phone', tint: '#1D4ED8', category: 'Communication' },
  { packageName: 'com.google.android.apps.messaging', label: 'Messages', iconKey: 'message-square', tint: '#2563EB', category: 'Communication' },
  { packageName: 'com.android.chrome', label: 'Chrome', iconKey: 'globe', tint: '#0F766E', category: 'Utilities' },
  { packageName: 'com.google.android.GoogleCamera', label: 'Camera', iconKey: 'camera', tint: '#334155', category: 'Photography' },
  { packageName: 'com.google.android.gm', label: 'Gmail', iconKey: 'mail', tint: '#B91C1C', category: 'Communication' },
  { packageName: 'com.google.android.calendar', label: 'Calendar', iconKey: 'calendar', tint: '#1D4ED8', category: 'Productivity' },
  { packageName: 'com.google.android.apps.maps', label: 'Maps', iconKey: 'map-pin', tint: '#15803D', category: 'Navigation' },
  { packageName: 'com.google.android.apps.photos', label: 'Photos', iconKey: 'image', tint: '#B45309', category: 'Photography' },
  { packageName: 'com.whatsapp', label: 'WhatsApp', iconKey: 'message-circle', tint: '#15803D', category: 'Communication' },
  { packageName: 'org.thoughtcrime.securesms', label: 'Signal', iconKey: 'shield', tint: '#1E40AF', category: 'Communication' },
  { packageName: 'com.slack', label: 'Slack', iconKey: 'hash', tint: '#6D28D9', category: 'Communication' },
  { packageName: 'com.google.android.apps.docs', label: 'Drive', iconKey: 'hard-drive', tint: '#0369A1', category: 'Productivity' },
  { packageName: 'md.obsidian', label: 'Obsidian', iconKey: 'file-text', tint: '#4338CA', category: 'Productivity' },
  { packageName: 'notion.id', label: 'Notion', iconKey: 'book-open', tint: '#1F2937', category: 'Productivity' },
  { packageName: 'com.todoist', label: 'Todoist', iconKey: 'check-square', tint: '#BE123C', category: 'Productivity' },
  { packageName: 'com.github.android', label: 'GitHub', iconKey: 'code', tint: '#18181B', category: 'Productivity' },
  { packageName: 'com.spotify.music', label: 'Spotify', iconKey: 'music', tint: '#166534', category: 'Media' },
  { packageName: 'com.google.android.youtube', label: 'YouTube', iconKey: 'play', tint: '#DC2626', category: 'Media' },
  { packageName: 'au.com.shiftyjelly.pocketcasts', label: 'Pocket Casts', iconKey: 'headphones', tint: '#C2410C', category: 'Media' },
  { packageName: 'com.amazon.kindle', label: 'Kindle', iconKey: 'book', tint: '#0F766E', category: 'Media' },
  { packageName: 'com.ubercab', label: 'Uber', iconKey: 'car', tint: '#111827', category: 'Navigation' },
  { packageName: 'com.citymapper.app.release', label: 'Citymapper', iconKey: 'compass', tint: '#15803D', category: 'Navigation' },
  { packageName: 'com.google.android.apps.walletnfcrel', label: 'Wallet', iconKey: 'credit-card', tint: '#047857', category: 'Finance' },
  { packageName: 'com.chase.sig.android', label: 'Chase', iconKey: 'landmark', tint: '#1E3A8A', category: 'Finance' },
  { packageName: 'com.squareup.cash', label: 'Cash App', iconKey: 'dollar-sign', tint: '#15803D', category: 'Finance' },
  { packageName: 'com.android.settings', label: 'Settings', iconKey: 'settings', tint: '#475569', category: 'Utilities' },
  { packageName: 'com.google.android.deskclock', label: 'Clock', iconKey: 'clock', tint: '#374151', category: 'Utilities' },
  { packageName: 'com.google.android.calculator', label: 'Calculator', iconKey: 'calculator', tint: '#0369A1', category: 'Utilities' },
  { packageName: 'com.agilebits.onepassword', label: '1Password', iconKey: 'key-round', tint: '#1D4ED8', category: 'Utilities' },
  { packageName: 'com.google.android.apps.nbu.files', label: 'Files', iconKey: 'folder', tint: '#0284C7', category: 'Utilities' },
  { packageName: 'com.adobe.lrmobile', label: 'Lightroom', iconKey: 'aperture', tint: '#0C4A6E', category: 'Photography' },
  { packageName: 'com.google.android.keep', label: 'Keep Notes', iconKey: 'sticky-note', tint: '#B45309', category: 'Productivity' },
  { packageName: 'com.strava', label: 'Strava', iconKey: 'activity', tint: '#C2410C', category: 'Utilities' },
  { packageName: 'com.google.android.apps.authenticator2', label: 'Authenticator', iconKey: 'lock', tint: '#334155', category: 'Utilities' },
];

export interface WidgetTemplate {
  syncKey: string;
  provider: string;
  title: string;
  kind: WidgetKind;
  defaultSpanX: number;
  defaultSpanY: number;
  defaultConfig: WidgetItem['config'];
}

export const WIDGET_TEMPLATES: WidgetTemplate[] = [
  {
    syncKey: 'widget.weather.at-a-glance',
    provider: 'com.google.android.apps.weather/.WidgetProvider',
    title: 'Weather & Conditions',
    kind: 'weather',
    defaultSpanX: 4,
    defaultSpanY: 1,
    defaultConfig: {
      city: 'San Francisco',
      unit: 'F',
      tempF: 61,
      condition: 'Partly Cloudy',
    },
  },
  {
    syncKey: 'widget.calendar.agenda',
    provider: 'com.google.android.calendar/.widget.AgendaWidgetProvider',
    title: 'Upcoming Agenda',
    kind: 'calendar',
    defaultSpanX: 4,
    defaultSpanY: 2,
    defaultConfig: {
      calendarAccount: 'Work & Personal',
      showDeclined: false,
      events: [
        { time: '09:30', title: 'Android Launcher Sync Review', location: 'Room 4B' },
        { time: '13:00', title: 'Design Systems Check-in', location: 'Meet' },
        { time: '16:15', title: 'Pickup Hardware Prototypes', location: 'Bldg 12' },
      ],
    },
  },
  {
    syncKey: 'widget.tasks.focus',
    provider: 'com.todoist/.widget.ChecklistWidgetProvider',
    title: 'Focus Tasks',
    kind: 'tasks',
    defaultSpanX: 4,
    defaultSpanY: 2,
    defaultConfig: {
      listTitle: 'Device Migration Checklist',
      tasks: [
        { id: 't1', text: 'Verify 2FA backup codes', done: true },
        { id: 't2', text: 'Export Pixel home screen grid', done: false },
        { id: 't3', text: 'Sync Weather & Agenda widgets', done: false },
      ],
    },
  },
  {
    syncKey: 'widget.clock.dual-zone',
    provider: 'com.google.android.deskclock/.DualClockWidgetProvider',
    title: 'World Clock',
    kind: 'clock',
    defaultSpanX: 2,
    defaultSpanY: 1,
    defaultConfig: {
      primaryZone: 'PST · San Francisco',
      secondaryZone: 'UTC · London',
      use24Hour: false,
    },
  },
  {
    syncKey: 'widget.music.now-playing',
    provider: 'com.spotify.music/.widget.NowPlayingWidgetProvider',
    title: 'Spotify Player',
    kind: 'music',
    defaultSpanX: 4,
    defaultSpanY: 1,
    defaultConfig: {
      trackTitle: 'Kiasmos — Blurred',
      artist: 'Focus Mix · 44kHz',
      isPlaying: false,
    },
  },
  {
    syncKey: 'widget.battery.devices',
    provider: 'com.google.android.settings.intelligence/.BatteryWidgetProvider',
    title: 'Device Battery',
    kind: 'battery',
    defaultSpanX: 2,
    defaultSpanY: 1,
    defaultConfig: {
      showConnectedWearables: true,
      wearableName: 'Pixel Buds Pro',
      wearablePercent: 84,
    },
  },
];

function catalogApp(pkg: string) {
  const found = ANDROID_APP_CATALOG.find((a) => a.packageName === pkg);
  if (!found) {
    throw new Error(`Missing catalog entry for ${pkg}`);
  }
  return found;
}

export function createInitialDevices(): DeviceProfile[] {
  const now = '2026-11-21T07:02:00.000Z';

  const pixel9: DeviceProfile = {
    id: 'dev-pixel-9-pro',
    name: 'Pixel 9 Pro',
    manufacturer: 'Google',
    androidVersion: 'Android 15',
    launcher: 'Pixel Launcher',
    formFactor: 'phone',
    gridCols: 4,
    gridRows: 5,
    wallpaperId: 'alpine-dusk',
    lastScannedAt: now,
    dock: [
      { id: 'dk-p1', ...catalogApp('com.google.android.dialer') },
      { id: 'dk-p2', ...catalogApp('com.google.android.apps.messaging') },
      { id: 'dk-p3', ...catalogApp('com.android.chrome') },
      { id: 'dk-p4', ...catalogApp('com.google.android.GoogleCamera') },
    ],
    screens: [
      {
        id: 'scr-p-home',
        name: 'Home Screen',
        isPrimary: true,
        order: 0,
        widgets: [
          {
            id: 'w-p-weather',
            syncKey: 'widget.weather.at-a-glance',
            provider: 'com.google.android.apps.weather/.WidgetProvider',
            title: 'Weather & Conditions',
            kind: 'weather',
            col: 0,
            row: 0,
            spanX: 4,
            spanY: 1,
            syncEnabled: true,
            updatedAt: now,
            updatedByDeviceId: 'dev-pixel-9-pro',
            config: {
              city: 'San Francisco',
              unit: 'F',
              tempF: 61,
              condition: 'Partly Cloudy',
            },
          },
          {
            id: 'w-p-tasks',
            syncKey: 'widget.tasks.focus',
            provider: 'com.todoist/.widget.ChecklistWidgetProvider',
            title: 'Focus Tasks',
            kind: 'tasks',
            col: 0,
            row: 1,
            spanX: 4,
            spanY: 2,
            syncEnabled: true,
            updatedAt: now,
            updatedByDeviceId: 'dev-pixel-9-pro',
            config: {
              listTitle: 'Device Migration Checklist',
              tasks: [
                { id: 't1', text: 'Verify 2FA backup codes', done: true },
                { id: 't2', text: 'Export Pixel home screen grid', done: false },
                { id: 't3', text: 'Sync Weather & Agenda widgets', done: false },
              ],
            },
          },
        ],
        icons: [
          { id: 'ic-p1', ...catalogApp('com.google.android.gm'), col: 0, row: 3 },
          { id: 'ic-p2', ...catalogApp('com.google.android.calendar'), col: 1, row: 3 },
          { id: 'ic-p3', ...catalogApp('com.google.android.apps.maps'), col: 2, row: 3 },
          { id: 'ic-p4', ...catalogApp('com.google.android.apps.photos'), col: 3, row: 3 },
          { id: 'ic-p5', ...catalogApp('com.spotify.music'), col: 0, row: 4 },
          { id: 'ic-p6', ...catalogApp('com.google.android.apps.walletnfcrel'), col: 1, row: 4 },
        ],
        folders: [
          {
            id: 'fld-p-work',
            name: 'Work Suite',
            col: 2,
            row: 4,
            tint: '#334155',
            apps: [
              { id: 'fa-p1', ...catalogApp('com.slack') },
              { id: 'fa-p2', ...catalogApp('com.google.android.apps.docs') },
              { id: 'fa-p3', ...catalogApp('md.obsidian') },
              { id: 'fa-p4', ...catalogApp('com.github.android') },
            ],
          },
          {
            id: 'fld-p-comm',
            name: 'Messaging',
            col: 3,
            row: 4,
            tint: '#1E3A8A',
            apps: [
              { id: 'fa-p5', ...catalogApp('com.whatsapp') },
              { id: 'fa-p6', ...catalogApp('org.thoughtcrime.securesms') },
            ],
          },
        ],
      },
      {
        id: 'scr-p-supp-1',
        name: 'Schedule & Finance',
        isPrimary: false,
        order: 1,
        widgets: [
          {
            id: 'w-p-cal',
            syncKey: 'widget.calendar.agenda',
            provider: 'com.google.android.calendar/.widget.AgendaWidgetProvider',
            title: 'Upcoming Agenda',
            kind: 'calendar',
            col: 0,
            row: 0,
            spanX: 4,
            spanY: 2,
            syncEnabled: true,
            updatedAt: now,
            updatedByDeviceId: 'dev-pixel-9-pro',
            config: {
              calendarAccount: 'Work & Personal',
              showDeclined: false,
              events: [
                { time: '09:30', title: 'Android Launcher Sync Review', location: 'Room 4B' },
                { time: '13:00', title: 'Design Systems Check-in', location: 'Meet' },
                { time: '16:15', title: 'Pickup Hardware Prototypes', location: 'Bldg 12' },
              ],
            },
          },
          {
            id: 'w-p-bat',
            syncKey: 'widget.battery.devices',
            provider: 'com.google.android.settings.intelligence/.BatteryWidgetProvider',
            title: 'Device Battery',
            kind: 'battery',
            col: 0,
            row: 2,
            spanX: 2,
            spanY: 1,
            syncEnabled: false,
            updatedAt: now,
            updatedByDeviceId: 'dev-pixel-9-pro',
            config: {
              showConnectedWearables: true,
              wearableName: 'Pixel Buds Pro',
              wearablePercent: 84,
            },
          },
        ],
        icons: [
          { id: 'ic-p7', ...catalogApp('com.todoist'), col: 2, row: 2 },
          { id: 'ic-p8', ...catalogApp('notion.id'), col: 3, row: 2 },
          { id: 'ic-p9', ...catalogApp('com.agilebits.onepassword'), col: 0, row: 3 },
          { id: 'ic-p10', ...catalogApp('com.google.android.apps.authenticator2'), col: 1, row: 3 },
          { id: 'ic-p11', ...catalogApp('com.android.settings'), col: 2, row: 3 },
        ],
        folders: [
          {
            id: 'fld-p-fin',
            name: 'Finance',
            col: 3,
            row: 3,
            tint: '#065F46',
            apps: [
              { id: 'fa-p7', ...catalogApp('com.chase.sig.android') },
              { id: 'fa-p8', ...catalogApp('com.squareup.cash') },
            ],
          },
        ],
      },
      {
        id: 'scr-p-supp-2',
        name: 'Media & Transit',
        isPrimary: false,
        order: 2,
        widgets: [
          {
            id: 'w-p-music',
            syncKey: 'widget.music.now-playing',
            provider: 'com.spotify.music/.widget.NowPlayingWidgetProvider',
            title: 'Spotify Player',
            kind: 'music',
            col: 0,
            row: 0,
            spanX: 4,
            spanY: 1,
            syncEnabled: true,
            updatedAt: now,
            updatedByDeviceId: 'dev-pixel-9-pro',
            config: {
              trackTitle: 'Kiasmos — Blurred',
              artist: 'Focus Mix · 44kHz',
              isPlaying: false,
            },
          },
        ],
        icons: [
          { id: 'ic-p12', ...catalogApp('com.google.android.youtube'), col: 0, row: 1 },
          { id: 'ic-p13', ...catalogApp('au.com.shiftyjelly.pocketcasts'), col: 1, row: 1 },
          { id: 'ic-p14', ...catalogApp('com.amazon.kindle'), col: 2, row: 1 },
          { id: 'ic-p15', ...catalogApp('com.strava'), col: 3, row: 1 },
        ],
        folders: [
          {
            id: 'fld-p-transit',
            name: 'Transit',
            col: 0,
            row: 2,
            tint: '#0F766E',
            apps: [
              { id: 'fa-p9', ...catalogApp('com.ubercab') },
              { id: 'fa-p10', ...catalogApp('com.citymapper.app.release') },
            ],
          },
        ],
      },
    ],
  };

  const galaxyS24: DeviceProfile = {
    id: 'dev-galaxy-s24',
    name: 'Galaxy S24 Ultra',
    manufacturer: 'Samsung',
    androidVersion: 'Android 15 · One UI 7',
    launcher: 'One UI Home',
    formFactor: 'phone',
    gridCols: 5,
    gridRows: 6,
    wallpaperId: 'botanical-stone',
    lastScannedAt: '2026-11-20T21:14:00.000Z',
    dock: [
      { id: 'dk-s1', ...catalogApp('com.google.android.dialer') },
      { id: 'dk-s2', ...catalogApp('com.whatsapp') },
      { id: 'dk-s3', ...catalogApp('com.android.chrome') },
      { id: 'dk-s4', ...catalogApp('com.google.android.GoogleCamera') },
    ],
    screens: [
      {
        id: 'scr-s-home',
        name: 'Home Screen',
        isPrimary: true,
        order: 0,
        widgets: [
          {
            id: 'w-s-weather',
            syncKey: 'widget.weather.at-a-glance',
            provider: 'com.google.android.apps.weather/.WidgetProvider',
            title: 'Weather & Conditions',
            kind: 'weather',
            col: 0,
            row: 0,
            spanX: 5,
            spanY: 1,
            syncEnabled: true,
            updatedAt: now,
            updatedByDeviceId: 'dev-pixel-9-pro',
            config: {
              city: 'San Francisco',
              unit: 'F',
              tempF: 61,
              condition: 'Partly Cloudy',
            },
          },
          {
            id: 'w-s-clock',
            syncKey: 'widget.clock.dual-zone',
            provider: 'com.google.android.deskclock/.DualClockWidgetProvider',
            title: 'World Clock',
            kind: 'clock',
            col: 0,
            row: 1,
            spanX: 2,
            spanY: 1,
            syncEnabled: true,
            updatedAt: '2026-11-20T21:14:00.000Z',
            updatedByDeviceId: 'dev-galaxy-s24',
            config: {
              primaryZone: 'PST · San Francisco',
              secondaryZone: 'UTC · London',
              use24Hour: false,
            },
          },
        ],
        icons: [
          { id: 'ic-s1', ...catalogApp('com.adobe.lrmobile'), col: 0, row: 4 },
          { id: 'ic-s2', ...catalogApp('com.google.android.keep'), col: 1, row: 4 },
          { id: 'ic-s3', ...catalogApp('com.google.android.calculator'), col: 2, row: 4 },
          { id: 'ic-s4', ...catalogApp('com.google.android.apps.nbu.files'), col: 3, row: 4 },
          { id: 'ic-s5', ...catalogApp('com.android.settings'), col: 4, row: 4 },
        ],
        folders: [
          {
            id: 'fld-s-work',
            name: 'Work Suite',
            col: 0,
            row: 5,
            tint: '#334155',
            apps: [
              { id: 'fa-s1', ...catalogApp('com.google.android.gm') },
              { id: 'fa-s2', ...catalogApp('notion.id') },
            ],
          },
        ],
      },
      {
        id: 'scr-s-supp-1',
        name: 'Productivity',
        isPrimary: false,
        order: 1,
        widgets: [
          {
            id: 'w-s-tasks',
            syncKey: 'widget.tasks.focus',
            provider: 'com.todoist/.widget.ChecklistWidgetProvider',
            title: 'Focus Tasks',
            kind: 'tasks',
            col: 0,
            row: 0,
            spanX: 5,
            spanY: 2,
            syncEnabled: true,
            updatedAt: now,
            updatedByDeviceId: 'dev-pixel-9-pro',
            config: {
              listTitle: 'Device Migration Checklist',
              tasks: [
                { id: 't1', text: 'Verify 2FA backup codes', done: true },
                { id: 't2', text: 'Export Pixel home screen grid', done: false },
                { id: 't3', text: 'Sync Weather & Agenda widgets', done: false },
              ],
            },
          },
        ],
        icons: [
          { id: 'ic-s6', ...catalogApp('com.google.android.deskclock'), col: 0, row: 2 },
          { id: 'ic-s7', ...catalogApp('com.strava'), col: 1, row: 2 },
        ],
        folders: [],
      },
    ],
  };

  const tabS9: DeviceProfile = {
    id: 'dev-tab-s9',
    name: 'Galaxy Tab S9',
    manufacturer: 'Samsung',
    androidVersion: 'Android 14 · Tablet',
    launcher: 'Nova Launcher 8',
    formFactor: 'tablet',
    gridCols: 5,
    gridRows: 5,
    wallpaperId: 'architectural-glass',
    lastScannedAt: '2026-11-19T18:40:00.000Z',
    dock: [
      { id: 'dk-t1', ...catalogApp('com.android.chrome') },
      { id: 'dk-t2', ...catalogApp('md.obsidian') },
      { id: 'dk-t3', ...catalogApp('com.google.android.youtube') },
      { id: 'dk-t4', ...catalogApp('com.amazon.kindle') },
    ],
    screens: [
      {
        id: 'scr-t-home',
        name: 'Desk Home',
        isPrimary: true,
        order: 0,
        widgets: [
          {
            id: 'w-t-cal',
            syncKey: 'widget.calendar.agenda',
            provider: 'com.google.android.calendar/.widget.AgendaWidgetProvider',
            title: 'Upcoming Agenda',
            kind: 'calendar',
            col: 0,
            row: 0,
            spanX: 5,
            spanY: 2,
            syncEnabled: true,
            updatedAt: now,
            updatedByDeviceId: 'dev-pixel-9-pro',
            config: {
              calendarAccount: 'Work & Personal',
              showDeclined: false,
              events: [
                { time: '09:30', title: 'Android Launcher Sync Review', location: 'Room 4B' },
                { time: '13:00', title: 'Design Systems Check-in', location: 'Meet' },
                { time: '16:15', title: 'Pickup Hardware Prototypes', location: 'Bldg 12' },
              ],
            },
          },
          {
            id: 'w-t-music',
            syncKey: 'widget.music.now-playing',
            provider: 'com.spotify.music/.widget.NowPlayingWidgetProvider',
            title: 'Spotify Player',
            kind: 'music',
            col: 0,
            row: 2,
            spanX: 5,
            spanY: 1,
            syncEnabled: true,
            updatedAt: now,
            updatedByDeviceId: 'dev-pixel-9-pro',
            config: {
              trackTitle: 'Kiasmos — Blurred',
              artist: 'Focus Mix · 44kHz',
              isPlaying: false,
            },
          },
        ],
        icons: [
          { id: 'ic-t1', ...catalogApp('com.google.android.apps.docs'), col: 0, row: 3 },
          { id: 'ic-t2', ...catalogApp('com.adobe.lrmobile'), col: 1, row: 3 },
          { id: 'ic-t3', ...catalogApp('com.google.android.apps.photos'), col: 2, row: 3 },
        ],
        folders: [
          {
            id: 'fld-t-read',
            name: 'Reading & Notes',
            col: 3,
            row: 3,
            tint: '#0F766E',
            apps: [
              { id: 'fa-t1', ...catalogApp('com.amazon.kindle') },
              { id: 'fa-t2', ...catalogApp('notion.id') },
              { id: 'fa-t3', ...catalogApp('com.google.android.keep') },
            ],
          },
        ],
      },
    ],
  };

  return [pixel9, galaxyS24, tabS9];
}

export function createInitialBackups(devices: DeviceProfile[]): LayoutBackupSnapshot[] {
  const pixel = devices[0];
  const galaxy = devices[1];

  const pixelBackup = buildBackupSnapshot(pixel, {
    id: 'bk-pixel-baseline-2026',
    name: 'Pixel 9 Pro — Daily Driver Layout',
    notes: 'Full 3-screen capture including Work Suite, Messaging, Finance, Transit folders and 4 synced widgets.',
    storage: 'cloud',
    createdAt: '2026-11-21T06:45:00.000Z',
  });

  const galaxyBackup = buildBackupSnapshot(galaxy, {
    id: 'bk-galaxy-travel-2026',
    name: 'Galaxy S24 Ultra — 5x6 Dense Setup',
    notes: 'High-density One UI 7 layout with Lightroom, Keep Notes, Dual World Clock, and Work Suite folder.',
    storage: 'cloud',
    createdAt: '2026-11-20T21:20:00.000Z',
  });

  return [pixelBackup, galaxyBackup];
}
