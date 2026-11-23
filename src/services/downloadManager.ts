/**
 * @file src/services/downloadManager.ts
 * @license AGPL-3.0-or-later
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Manages selectable download locations (Browser Downloads, Chosen Device Folder,
 * Save As Picker, or Workspace Export Folder) and tracks recently saved files so
 * users can immediately open the saved file or browse its destination folder.
 */

export type DownloadLocationMode =
  | 'browser-downloads'
  | 'device-folder'
  | 'ask-each-time'
  | 'workspace-folder';

export interface DownloadLocationPreferences {
  mode: DownloadLocationMode;
  deviceFolderName: string | null;
  workspaceFolder: string;
  alsoTriggerBrowserDownload: boolean;
}

export interface SavedFileRecord {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  savedAt: string;
  locationMode: DownloadLocationMode;
  locationLabel: string;
  workspaceFolder?: string;
  serverUrl?: string;
  content: string;
  cancelled?: boolean;
  fallbackNotice?: string;
}

export interface WorkspaceFolderSummary {
  name: string;
  fileCount: number;
}

export interface FolderFileEntry {
  filename: string;
  sizeBytes: number;
  updatedAt: string;
  mimeType: string;
  source: 'device-folder' | 'workspace-folder';
  workspaceFolder?: string;
  url?: string;
}

// Lightweight File System Access API ambient interfaces for TypeScript
export interface FsFileHandle {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{
    write: (data: string | Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

export interface FsDirectoryHandle {
  kind: 'directory';
  name: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FsFileHandle>;
  values: () => AsyncIterable<FsFileHandle | FsDirectoryHandle>;
  queryPermission?: (desc?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (desc?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

interface FsWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FsDirectoryHandle>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FsFileHandle>;
}

const PREFS_STORAGE_KEY = 'iconsync.downloadPrefs.v1';
const IDB_NAME = 'iconsync-download-handles';
const IDB_STORE = 'handles';
const IDB_DIR_KEY = 'default-directory-handle';

const DEFAULT_PREFS: DownloadLocationPreferences = {
  mode: 'browser-downloads',
  deviceFolderName: null,
  workspaceFolder: 'backups',
  alsoTriggerBrowserDownload: true,
};

let cachedDirectoryHandle: FsDirectoryHandle | null = null;

export function isEmbeddedIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function getPickerCapabilities(): {
  hasDirectoryPicker: boolean;
  hasSaveFilePicker: boolean;
  embeddedIframe: boolean;
} {
  const w = window as unknown as FsWindow;
  const embedded = isEmbeddedIframe();
  return {
    hasDirectoryPicker: typeof w.showDirectoryPicker === 'function' && !embedded,
    hasSaveFilePicker: typeof w.showSaveFilePicker === 'function' && !embedded,
    embeddedIframe: embedded,
  };
}

export function sanitizeWorkspaceFolderName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
  return cleaned || 'backups';
}

export function sanitizeSafeFilename(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+/, '')
    .slice(0, 120);
  return cleaned || 'icon-sync-export.json';
}

export function loadDownloadPreferences(): DownloadLocationPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<DownloadLocationPreferences>;
    const mode: DownloadLocationMode =
      parsed.mode === 'browser-downloads' ||
      parsed.mode === 'device-folder' ||
      parsed.mode === 'ask-each-time' ||
      parsed.mode === 'workspace-folder'
        ? parsed.mode
        : 'browser-downloads';
    return {
      mode,
      deviceFolderName: typeof parsed.deviceFolderName === 'string' ? parsed.deviceFolderName : null,
      workspaceFolder: sanitizeWorkspaceFolderName(parsed.workspaceFolder ?? 'backups'),
      alsoTriggerBrowserDownload:
        typeof parsed.alsoTriggerBrowserDownload === 'boolean'
          ? parsed.alsoTriggerBrowserDownload
          : true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveDownloadPreferences(prefs: DownloadLocationPreferences): DownloadLocationPreferences {
  const normalized: DownloadLocationPreferences = {
    mode: prefs.mode,
    deviceFolderName: prefs.deviceFolderName,
    workspaceFolder: sanitizeWorkspaceFolderName(prefs.workspaceFolder),
    alsoTriggerBrowserDownload: prefs.alsoTriggerBrowserDownload,
  };
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage quota errors
  }
  return normalized;
}

function openHandlesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function persistDirectoryHandle(handle: FsDirectoryHandle | null): Promise<void> {
  cachedDirectoryHandle = handle;
  try {
    const db = await openHandlesDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      if (handle) {
        store.put(handle, IDB_DIR_KEY);
      } else {
        store.delete(IDB_DIR_KEY);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Keep in-memory handle even if IndexedDB blocks structured cloning
  }
}

export async function getStoredDirectoryHandle(): Promise<FsDirectoryHandle | null> {
  if (cachedDirectoryHandle) return cachedDirectoryHandle;
  try {
    const db = await openHandlesDb();
    const handle = await new Promise<FsDirectoryHandle | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_DIR_KEY);
      req.onsuccess = () => resolve((req.result as FsDirectoryHandle | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
    db.close();
    cachedDirectoryHandle = handle;
    return handle;
  } catch {
    return null;
  }
}

export async function clearStoredDirectoryHandle(): Promise<void> {
  await persistDirectoryHandle(null);
}

export async function pickAndSaveDeviceFolder(): Promise<{
  ok: boolean;
  folderName?: string;
  cancelled?: boolean;
  error?: string;
}> {
  const w = window as unknown as FsWindow;
  if (typeof w.showDirectoryPicker !== 'function' || isEmbeddedIframe()) {
    return {
      ok: false,
      error: isEmbeddedIframe()
        ? 'Native folder picker is blocked inside embedded preview iframes. Choose a Workspace Export Folder or Browser Downloads here, or open the app in its own browser tab.'
        : 'This browser does not support choosing a persistent local folder. Choose a Workspace Export Folder or Browser Downloads.',
    };
  }

  try {
    const handle = await w.showDirectoryPicker({ mode: 'readwrite' });
    await persistDirectoryHandle(handle);
    return { ok: true, folderName: handle.name };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not access the selected folder.',
    };
  }
}

async function verifyDirectoryWritePermission(handle: FsDirectoryHandle): Promise<boolean> {
  if (typeof handle.queryPermission === 'function') {
    const current = await handle.queryPermission({ mode: 'readwrite' });
    if (current === 'granted') return true;
  }
  if (typeof handle.requestPermission === 'function') {
    const requested = await handle.requestPermission({ mode: 'readwrite' });
    return requested === 'granted';
  }
  return true;
}

export function triggerStandardBrowserDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Defer revocation so Android WebView and mobile browsers complete reading the blob stream
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function fetchWorkspaceExportFolders(): Promise<WorkspaceFolderSummary[]> {
  try {
    const res = await fetch('/api/exports/folders');
    if (!res.ok) return [];
    const data = (await res.json()) as { folders?: WorkspaceFolderSummary[] };
    return Array.isArray(data.folders) ? data.folders : [];
  } catch {
    return [];
  }
}

export async function fetchWorkspaceExportFiles(folder: string): Promise<FolderFileEntry[]> {
  const safeFolder = sanitizeWorkspaceFolderName(folder);
  try {
    const res = await fetch(`/api/exports?folder=${encodeURIComponent(safeFolder)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      files?: Array<{
        filename: string;
        folder: string;
        sizeBytes: number;
        updatedAt: string;
        mimeType: string;
        url: string;
      }>;
    };
    return (data.files ?? []).map((f) => ({
      filename: f.filename,
      sizeBytes: f.sizeBytes,
      updatedAt: f.updatedAt,
      mimeType: f.mimeType,
      source: 'workspace-folder',
      workspaceFolder: f.folder,
      url: f.url,
    }));
  } catch {
    return [];
  }
}

export async function readWorkspaceExportFile(
  folder: string,
  filename: string
): Promise<{ ok: boolean; content?: string; url: string; error?: string }> {
  const safeFolder = sanitizeWorkspaceFolderName(folder);
  const safeFile = sanitizeSafeFilename(filename);
  const url = `/api/exports/file/${encodeURIComponent(safeFolder)}/${encodeURIComponent(safeFile)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, url, error: `HTTP ${res.status}` };
    }
    const content = await res.text();
    return { ok: true, content, url };
  } catch (err) {
    return {
      ok: false,
      url,
      error: err instanceof Error ? err.message : 'Unable to read saved file.',
    };
  }
}

export async function deleteWorkspaceExportFile(
  folder: string,
  filename: string
): Promise<boolean> {
  const safeFolder = sanitizeWorkspaceFolderName(folder);
  const safeFile = sanitizeSafeFilename(filename);
  try {
    const res = await fetch(
      `/api/exports/file/${encodeURIComponent(safeFolder)}/${encodeURIComponent(safeFile)}`,
      { method: 'DELETE' }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function listDeviceDirectoryFiles(): Promise<{
  ok: boolean;
  folderName?: string;
  files: FolderFileEntry[];
  error?: string;
}> {
  const handle = await getStoredDirectoryHandle();
  if (!handle) {
    return { ok: false, files: [], error: 'No device folder selected.' };
  }
  try {
    const permitted = await verifyDirectoryWritePermission(handle);
    if (!permitted) {
      return {
        ok: false,
        folderName: handle.name,
        files: [],
        error: 'Folder read permission was not granted.',
      };
    }
    const files: FolderFileEntry[] = [];
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        files.push({
          filename: file.name,
          sizeBytes: file.size,
          updatedAt: new Date(file.lastModified).toISOString(),
          mimeType: file.type || 'application/octet-stream',
          source: 'device-folder',
        });
      }
    }
    files.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return { ok: true, folderName: handle.name, files };
  } catch (err) {
    return {
      ok: false,
      folderName: handle.name,
      files: [],
      error: err instanceof Error ? err.message : 'Could not list folder files.',
    };
  }
}

export async function readDeviceDirectoryFile(
  filename: string
): Promise<{ ok: boolean; content?: string; error?: string }> {
  const handle = await getStoredDirectoryHandle();
  if (!handle) return { ok: false, error: 'No device folder selected.' };
  try {
    const fileHandle = await handle.getFileHandle(filename, { create: false });
    const file = await fileHandle.getFile();
    const content = await file.text();
    return { ok: true, content };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not open file from folder.',
    };
  }
}

function getPickerTypesForFilename(
  filename: string
): Array<{ description?: string; accept: Record<string, string[]> }> | undefined {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) {
    return [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }];
  }
  if (lower.endsWith('.html')) {
    return [{ description: 'HTML Document', accept: { 'text/html': ['.html'] } }];
  }
  if (lower.endsWith('.txt')) {
    return [{ description: 'Text Document', accept: { 'text/plain': ['.txt'] } }];
  }
  return undefined;
}

export async function saveExportedFile(options: {
  filename: string;
  content: string;
  mimeType: string;
  overridePrefs?: DownloadLocationPreferences;
}): Promise<SavedFileRecord> {
  const safeFilename = sanitizeSafeFilename(options.filename);
  const prefs = options.overridePrefs ?? loadDownloadPreferences();
  const sizeBytes = new TextEncoder().encode(options.content).length;
  const id = `sav-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const savedAt = new Date().toISOString();
  const w = window as unknown as FsWindow;

  // 1. Chosen Device Folder via File System Access API
  if (prefs.mode === 'device-folder') {
    const handle = await getStoredDirectoryHandle();
    if (handle && !isEmbeddedIframe()) {
      try {
        const granted = await verifyDirectoryWritePermission(handle);
        if (granted) {
          const fileHandle = await handle.getFileHandle(safeFilename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(options.content);
          await writable.close();
          return {
            id,
            filename: safeFilename,
            mimeType: options.mimeType,
            sizeBytes,
            savedAt,
            locationMode: 'device-folder',
            locationLabel: `Folder: ${handle.name}`,
            content: options.content,
          };
        }
      } catch {
        // Fall through cleanly to standard download with notice
      }
    }
    triggerStandardBrowserDownload(options.content, safeFilename, options.mimeType);
    return {
      id,
      filename: safeFilename,
      mimeType: options.mimeType,
      sizeBytes,
      savedAt,
      locationMode: 'browser-downloads',
      locationLabel: 'Browser Downloads (folder fallback)',
      content: options.content,
      fallbackNotice:
        'Could not write directly to the saved folder handle in this browser context; saved to Browser Downloads instead.',
    };
  }

  // 2. Ask where to save every time via showSaveFilePicker
  if (prefs.mode === 'ask-each-time') {
    if (typeof w.showSaveFilePicker === 'function' && !isEmbeddedIframe()) {
      try {
        const pickerHandle = await w.showSaveFilePicker({
          suggestedName: safeFilename,
          types: getPickerTypesForFilename(safeFilename),
        });
        const writable = await pickerHandle.createWritable();
        await writable.write(options.content);
        await writable.close();
        return {
          id,
          filename: pickerHandle.name || safeFilename,
          mimeType: options.mimeType,
          sizeBytes,
          savedAt,
          locationMode: 'ask-each-time',
          locationLabel: 'Custom Save Location',
          content: options.content,
        };
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return {
            id,
            filename: safeFilename,
            mimeType: options.mimeType,
            sizeBytes,
            savedAt,
            locationMode: 'ask-each-time',
            locationLabel: 'Cancelled',
            content: options.content,
            cancelled: true,
          };
        }
      }
    }
    triggerStandardBrowserDownload(options.content, safeFilename, options.mimeType);
    return {
      id,
      filename: safeFilename,
      mimeType: options.mimeType,
      sizeBytes,
      savedAt,
      locationMode: 'browser-downloads',
      locationLabel: 'Browser Downloads',
      content: options.content,
      fallbackNotice: isEmbeddedIframe()
        ? 'System "Save As" picker is restricted in embedded preview frames; saved to Browser Downloads.'
        : 'System "Save As" picker unavailable in this browser; saved to Browser Downloads.',
    };
  }

  // 3. Server Workspace Export Folder (.data/exports/<folder>/)
  if (prefs.mode === 'workspace-folder') {
    const folder = sanitizeWorkspaceFolderName(prefs.workspaceFolder);
    try {
      const res = await fetch('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder,
          filename: safeFilename,
          content: options.content,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          file?: { url: string; sizeBytes: number; updatedAt: string };
        };
        if (prefs.alsoTriggerBrowserDownload) {
          triggerStandardBrowserDownload(options.content, safeFilename, options.mimeType);
        }
        return {
          id,
          filename: safeFilename,
          mimeType: options.mimeType,
          sizeBytes: json.file?.sizeBytes ?? sizeBytes,
          savedAt: json.file?.updatedAt ?? savedAt,
          locationMode: 'workspace-folder',
          locationLabel: prefs.alsoTriggerBrowserDownload
            ? `Workspace: .data/exports/${folder}/ + Browser Downloads`
            : `Workspace: .data/exports/${folder}/`,
          workspaceFolder: folder,
          serverUrl: json.file?.url,
          content: options.content,
        };
      }
    } catch {
      // Fall back to standard browser download if server is unreachable
    }
    triggerStandardBrowserDownload(options.content, safeFilename, options.mimeType);
    return {
      id,
      filename: safeFilename,
      mimeType: options.mimeType,
      sizeBytes,
      savedAt,
      locationMode: 'browser-downloads',
      locationLabel: 'Browser Downloads (offline fallback)',
      content: options.content,
      fallbackNotice:
        'Workspace server could not be reached; saved directly to Browser Downloads instead.',
    };
  }

  // 4. Default: Browser Downloads
  triggerStandardBrowserDownload(options.content, safeFilename, options.mimeType);
  return {
    id,
    filename: safeFilename,
    mimeType: options.mimeType,
    sizeBytes,
    savedAt,
    locationMode: 'browser-downloads',
    locationLabel: 'Browser Downloads',
    content: options.content,
  };
}
