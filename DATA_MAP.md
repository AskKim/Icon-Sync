<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Privacy Data Map — Icon Sync

**Last Updated:** November 22, 2026  
**Release:** `v0.1.0-alpha.1` (Alpha 0.1)  
**License:** GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`)  
**Schema Version:** Layout Snapshot `v2.0` · Vault Revision `5`

This document maps every data element processed by Icon Sync, where it originates, how it flows through the application, where it is stored, and how it maps to Android / Google Play Data Safety declarations.

> **Storage Note:** We will not be adding a real database for this project. All workspace persistence intentionally uses `.data/icon-sync-vault.json`, browser `localStorage`, Android `SharedPreferences`/`cacheDir`, and user-initiated `.json` exports.

---

## 1. End-to-End Data Flow

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                           Browser Client (React SPA)                       │
│                                                                            │
│  [PhoneCanvas / Inspector / DeveloperTools] ──► In-memory React state      │
│         │                        (devices, backups, widgetSyncPolicy, logs)│
│         ├──► localStorage["iconsync.vault.v4"]  (offline/local cache)      │
│         ├──► Browser Blob Downloads (user-initiated only)                  │
│         │      • icon-sync-<name>-YYYY-MM-DD.json   (layout backup v2.0)   │
│         │      • icon-sync-missing-apps-<dev>.txt   (Play Store links)     │
│         │      • icon-sync-missing-apps-<dev>.html  (CSP-safe checklist)   │
│         │      • icon-sync-diagnostics-<ts>.json    (Dev Tools bundle)     │
│         └──► HTTP JSON over /api/*                                         │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                      Express Server (server.ts, Port 3000)                 │
│                                                                            │
│  GET    /api/health       ──► { ok, service, version: "0.1.0-alpha.1" }    │
│  GET    /api/diagnostics  ──► Vault file stats, uptime, migration status   │
│  GET    /api/vault        ──► Reads  .data/icon-sync-vault.json            │
│  PUT    /api/vault        ──► Atomic 0600 write to .data/icon-sync-vault   │
│  POST   /api/backups      ──► Upserts snapshot in .data/icon-sync-vault    │
│  DELETE /api/backups/:id  ──► Removes snapshot in .data/icon-sync-vault    │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │
                                ▼ (Optional Native Android APK)
┌────────────────────────────────────────────────────────────────────────────┐
│                 Icon Sync Android APK (com.iconsync.android)               │
│                                                                            │
│  LauncherGridDetector.kt    ──► Queries launcher provider / Accessibility /│
│                                 SharedPreferences("icon_sync_grid_prefs")  │
│  GridRemapper.kt            ──► Pure in-memory 5-strategy cross-grid math  │
│  LauncherBackupService.kt   ──► Writes v2.0 JSON to app cacheDir on demand │
│  WidgetSyncWorker.kt        ──► Periodic WorkManager widget & grid sync    │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Field-Level Data Inventory

| Data Category | Exact Fields | Purpose | Sensitivity | Storage Location | Retention | Third-Party Sharing |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Device Profile** | `id`, `name`, `modelCode`, `manufacturer`, `androidVersion`, `launcher`, `formFactor`, `gridCols`, `gridRows`, `gridDetectionSource`, `gridConfidence`, `gridDetectedAt`, `wallpaperId`, `lastScannedAt` | Renders accurate phone grid (`4×5`, `4×6`, `5×4`, `5×6`, `6×6`) and drives cross-grid layout adaptation | Low (Hardware/UI metadata) | `localStorage` + `.data/icon-sync-vault.json` | Until cleared by user | None |
| **Installed Package List** | `installedPackages: string[]` (Android package IDs like `com.whatsapp`) | Compares target device apps against imported backup to generate missing-app placeholders and Play Store links | Low–Medium (Installed app inventory) | `localStorage` + `.data/icon-sync-vault.json` | Until cleared by user | None |
| **Home Screen Pages & Icons** | `screens[].id`, `name`, `isPrimary`, `order`, `icons[].packageName`, `label`, `iconKey`, `tint`, `category`, `col`, `row`, `isPlaceholder`, `playStoreUrl`, `dock[]` | Captures and restores exact icon placement on primary and supplemental screens | Low | `localStorage` + `.data/icon-sync-vault.json` + optional `.json` export | Until deleted by user | None |
| **Folders** | `folders[].id`, `name`, `col`, `row`, `tint`, `apps[]` | Preserves folder groupings and supports Merge-mode folder deduplication by name | Low | `localStorage` + `.data/icon-sync-vault.json` + optional `.json` export | Until deleted by user | None |
| **Widgets & Sync State** | `widgets[].id`, `syncKey`, `provider`, `title`, `kind`, `col`, `row`, `spanX`, `spanY`, `syncEnabled`, `updatedAt`, `updatedByDeviceId`, `config` | Renders live interactive widgets and propagates widget configuration changes across linked devices | Low–Medium (User-entered widget labels/tasks) | `localStorage` + `.data/icon-sync-vault.json` + optional `.json` export | Until deleted by user | None |
| **Backup Snapshots** | `id`, `name`, `notes`, `schemaVersion`, `createdAt`, `storage`, `sourceDeviceId`, `sourceDeviceName`, `sourceLauncher`, `gridCols`, `gridRows`, `gridDetectionSource`, `stats`, `checksum` | Stores portable point-in-time layout snapshots with FNV-1a integrity checksums | Low | `localStorage` + `.data/icon-sync-vault.json` + optional `.json` export | Until deleted (`DELETE /api/backups/:id`) | None |
| **Widget Sync Policy** | `conflictStrategy` (`newest` \| `primary_device` \| `manual`), `autoSyncEnabled`, `lastSyncAt` | Controls how conflicting widget edits across multiple phones are resolved | Low | `localStorage` + `.data/icon-sync-vault.json` | Until cleared by user | None |
| **Android Local Grid Prefs** | `user_grid_cols`, `user_grid_rows`, `acc_grid_cols`, `acc_grid_rows` | Persists user-reported and opt-in Accessibility-detected launcher dimensions on device | Low | Android `SharedPreferences` (`icon_sync_grid_prefs`, `MODE_PRIVATE`) | Until cleared or APK uninstalled | None |
| **Android On-Demand Exports** | `icon-sync-backup-<timestamp>.json` | Portable v2.0 layout snapshot exported from `MainActivity` | Low | Android app `context.cacheDir` | Ephemeral cache / cleared by user or OS | None |
| **Developer Activity Logs & Undo** | `logs[]` (API latency, grid events), `undoSnapshot` | Under-the-hood troubleshooting and one-click restore rollback | Low | React component memory only (never persisted unless explicitly exported) | Cleared on reload or Clear button | None |

---

## 3. Data Explicitly Excluded (Zero Collection)

Icon Sync **never** accesses, collects, stores, or transmits:
- User accounts, passwords, OAuth tokens, or biometric credentials
- SMS messages, chat histories, call logs, contacts, or email bodies
- Photos, videos, camera rolls, or arbitrary local files
- Precise or approximate GPS / Wi-Fi / cell-tower location data
- Payment cards, banking details, or health/fitness records
- Advertising identifiers (`AAID`), cookies for cross-site tracking, or third-party telemetry SDKs

---

## 4. API Endpoint & Network Boundary Matrix

| Endpoint | Request Body | Response Payload | Side Effects & Security Controls |
| :--- | :--- | :--- | :--- |
| `GET /api/health` | None | `{ ok, service, version }` | Read-only; `Cache-Control: no-store` |
| `GET /api/diagnostics` | None | `{ ok, service, version, vaultFileExists, vaultFilePath, vaultSizeBytes, vaultUpdatedAt, legacyVaultDetected, uptimeSeconds, nodeVersion }` | Read-only; no secrets exposed |
| `GET /api/vault` | None | `{ initialized, vault }` | Read-only; reads `.data/icon-sync-vault.json` |
| `PUT /api/vault` | `{ devices, backups, widgetSyncPolicy, schemaRevision }` (max 4 MB, max 32 devices, max 250 backups) | `{ ok, updatedAt }` | Strips forbidden prototype keys; atomic `0600` write inside `.data/`; rate-limited |
| `POST /api/backups` | Single `LayoutBackupSnapshot` (validated ID `^[a-zA-Z0-9_-]{1,96}$`) | `{ ok, backup, updatedAt }` | Upserts backup by `id` in `.data/icon-sync-vault.json`; rate-limited |
| `DELETE /api/backups/:id` | Path param `id` (validated) | `{ ok, deletedId }` | Filters out matching backup in `.data/icon-sync-vault.json`; rate-limited |

---

## 5. Google Play Data Safety Mapping (Android APK)

For shipping the Icon Sync Android APK (`/android/`, `com.iconsync.android`) to Google Play or F-Droid:

| Play Data Safety Category | Collected? | Shared? | Purpose & Notes |
| :--- | :---: | :---: | :--- |
| **App info and performance — Installed apps** | Yes *(on-device / user's own vault)* | No | Used solely to match backup shortcuts against installed packages and list missing apps (`QUERY_ALL_PACKAGES`) |
| **App activity / Other user-generated content** | Yes *(layout, grid & widget settings only)* | No | User-created folder names, custom grid dimensions, backup notes, and widget preferences |
| **Personal info (Name, Email, Address, Phone)** | No | No | Not requested or stored |
| **Location (Approximate / Precise)** | No | No | Weather city name is manually typed text, not GPS |
| **Photos, Videos, Messages, Contacts, Files** | No | No | Never accessed |
| **Data deletion support** | Yes | — | Users can delete snapshots in-app, uninstall the APK, or delete `.data/icon-sync-vault.json` |
| **Ephemeral / local-first option** | Yes | — | Full local JSON export/import works without a remote cloud server |
