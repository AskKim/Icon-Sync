<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Icon Sync — Architecture & Beginner-Friendly Codebase Guide

> **Who is this guide for?**  
> Both **first-time / novice coders** opening this project for the first time *and* **AI coding assistants** looking for an accurate, zero-guesswork map of how every file connects.

---

## 1. The 60-Second Mental Model

Think of **Icon Sync** as a visual spreadsheet editor for Android phone home screens, paired with a tiny local save-file server and a companion Android APK:

1. **Every home screen page is a grid of cells** (`gridCols` columns wide by `gridRows` rows tall).
   - Top-left corner is always `(col = 0, row = 0)`.
   - An **App Icon** or **Folder** takes `1 × 1` cell.
   - A **Widget** (Weather, Calendar, Tasks, Clock, Music) takes `spanX × spanY` cells (for example, `4 × 1` or `6 × 1`).
2. **State lives in one place (`src/App.tsx`)**, then flows downward to UI components via React props.
3. **Math & grid logic lives in one pure file (`src/engine/layoutEngine.ts`)** — no React, no DOM, no network calls. The Android APK mirrors this exact algorithm in Kotlin (`android/app/src/main/java/com/iconsync/android/grid/GridRemapper.kt`).
4. **Security sanitation lives in `src/utils/sanitize.ts` and `server.ts`** — every untrusted JSON upload, HTML download, and API request passes through strict validation before touching the UI or disk.

---

## 2. Annotated Folder & File Map

```text
.
├── server.ts                         # Express web host (Port 3000) + local JSON vault API
├── index.html                        # HTML page shell, fonts, and page title
├── package.json                      # Dependencies, npm scripts, and GPL-3.0-or-later metadata
├── ARCHITECTURE.md                   # You are here! Map for beginners & AI readers
├── LICENSE                           # GNU GPL v3.0 or later (GPL-3.0-or-later)
│
├── src/
│   ├── main.tsx                      # React entry point (mounts <App /> into #root)
│   ├── App.tsx                       # Root state, navigation tabs, recovery banners, modals
│   │
│   ├── types/                        # TypeScript blueprints ("shapes" of every object)
│   │   ├── layout.ts                 # DeviceProfile, HomeScreenPage, BackupSnapshot, Strategies
│   │   └── diagnostics.ts            # FeedbackBannerItem, DiagnosticLogEntry, IntegrityFinding
│   │
│   ├── utils/
│   │   └── sanitize.ts               # HTML escaping, Play Store URL guard, prototype-pollution filter
│   │
│   ├── engine/
│   │   └── layoutEngine.ts           # Pure layout math: occupancy grids, 6x6 -> 5x4 remapping,
│   │                                 # Replace/Merge solver, checksum, JSON repair, auditor
│   │
│   ├── services/
│   │   └── cloudApi.ts               # Calls /api/*, manages localStorage cache, exports files
│   │
│   ├── data/
│   │   ├── catalog.ts                # Pre-loaded apps, widgets, wallpapers, 5 default devices
│   │   └── kotlinCompanion.ts        # Read-only Kotlin & YAML snippets shown in Developer tab
│   │
│   └── components/                   # Visual UI building blocks (one clear job each)
│       ├── PhoneCanvas.tsx           # Interactive Android phone screen preview
│       ├── InspectorPanel.tsx        # Right-hand editor for grids, icons, folders & widgets
│       ├── FeedbackBanner.tsx        # Success / Action Needed / Failed banners with fix buttons
│       ├── ImportRestoreModal.tsx    # Cross-grid (6x6 -> 5x4) Replace/Merge restore wizard
│       ├── BackupExportModal.tsx     # Create Cloud Vault or local JSON snapshot
│       ├── AddDeviceModal.tsx        # Register custom phones or 5x4 Mini Launcher devices
│       ├── MissingAppsModal.tsx      # Step-by-step Play Store installer for missing apps
│       ├── BackupsView.tsx           # Search, filter by grid, sort, clone, or delete backups
│       ├── WidgetSyncView.tsx        # Cross-device widget sync matrix & conflict policy
│       ├── HowItWorksView.tsx        # Plain-English guide, FAQ, and inline privacy data map
│       ├── DeveloperToolsView.tsx    # Under-the-hood probes, Integrity Auditor, Grid Remap Lab
│       ├── CompanionView.tsx         # Code viewer for Android Kotlin & GitHub Actions files
│       ├── AndroidIcon.tsx           # Renders live & placeholder app icons
│       └── AndroidWidgetTile.tsx     # Renders interactive Weather/Calendar/Task/Clock/Music tiles
│
├── android/                          # Real buildable Gradle + Kotlin Android APK project
│   ├── settings.gradle.kts           # Project name ("IconSync") & module registry
│   ├── build.gradle.kts              # Android Gradle Plugin 8.7.2 & Kotlin 2.0.21 setup
│   └── app/
│       ├── build.gradle.kts          # Package `com.iconsync.android`, APK naming, signing
│       └── src/
│           ├── main/java/com/iconsync/android/
│           │   ├── MainActivity.kt               # Native grid detector & backup export screen
│           │   ├── model/BackupSchema.kt         # Kotlin serialization models (v2.0)
│           │   ├── grid/LauncherGridDetector.kt  # 3-tier provider / Accessibility / manual detector
│           │   ├── grid/GridRemapper.kt          # 5-strategy 6x6 -> 5x4 Kotlin remapper
│           │   ├── service/LauncherBackupService.kt
│           │   ├── service/LauncherGridAccessibilityService.kt
│           │   └── worker/WidgetSyncWorker.kt    # WorkManager background sync task
│           └── test/java/com/iconsync/android/
│               └── GridRemapperTest.kt           # JUnit tests verifying 6x6 -> 5x4 strategies
│
└── .github/                          # Automated CI/CD, security scanning & metadata sync
    ├── dependabot.yml                # Weekly npm, Gradle & GitHub Actions dependency updates
    └── workflows/
        ├── build-android-apk.yml     # Runs Kotlin tests, Android Lint & builds IconSync APK
        ├── ci-web.yml                # Typechecks, builds web bundle & smoke-tests server.ts
        ├── release.yml               # Publishes tagged GitHub Releases with APK + SHA256SUMS
        ├── codeql-security.yml       # CodeQL static analysis + production npm audit
        └── sync-repo-metadata.yml    # One-click GitHub repository description & topics updater
```

---

## 3. How Data Flows (Step by Step)

### A. Saving Your Work Automatically
1. You move an icon, report a `5×4` Mini Launcher grid, or edit a widget in the UI.
2. `src/App.tsx` updates React state (`devices`, `backups`, or `widgetSyncPolicy`).
3. A `useEffect` hook computes a fast FNV-1a checksum (`computeChecksum`) and skips saving if nothing actually changed.
4. After a 350 ms debounce, `persistVaultState()` in `src/services/cloudApi.ts`:
   - Writes immediately to browser `localStorage["iconsync.vault.v4"]` (so offline work is never lost).
   - Sends `PUT /api/vault` to `server.ts`.
5. `server.ts` strips dangerous keys, validates array bounds, writes to a temporary file inside `.data/` with owner-only `0600` permissions, and atomically renames it to `.data/icon-sync-vault.json`.
6. If the server is unreachable, `App.tsx` surfaces a red **Failed** banner with one-click **Retry Cloud Sync** and **Download JSON Backup** recovery buttons.

### B. How Cross-Grid Import Works (Example: `6×6` Backup → `5×4` Mini Launcher)
When you open **Import / Restore** and choose a `6×6` backup (36 cells/page) targeting a `5×4` device (20 cells/page):
1. `analyzeGridCompatibility(targetDevice, backup)` inspects every widget, folder, and icon coordinate.
   - Any icon at column `5` (`col = 5`) or rows `4–5` (`row >= 4`) is flagged as **out of bounds**.
   - Any widget wider than 5 cells (e.g., `6×1`) is flagged for **resizing**.
2. `computeRestoreResult()` runs your chosen strategy from the 5 options:
   - **`auto-reflow`**: Clamps oversized widgets, keeps in-bounds items in place, packs overflow items cleanly onto a new supplemental screen (**zero data loss**).
   - **`proportional-scale`**: Scales coordinates proportionally (`scaleCoordinate`) so top-right stays near top-right and bottom-right stays near bottom-right.
   - **`preserve-pages`**: Keeps each dense backup page visually grouped by creating `"Page Name (Cont.)"` sibling pages instead of mixing pages together.
   - **`resize-target-grid`**: Switches the target device grid to `6×6` for an exact 1:1 coordinate restore (ideal for Nova/Lawnchair/Mini launchers that allow custom grids).
   - **`crop-within-bounds`**: Keeps only slots inside `5×4` and drops excess items without creating extra pages.
3. Before applying anything, `ImportRestoreModal` renders a **live pre-flight diff**, and `App.tsx` stores a full `undoSnapshot` so you can revert in one click.

---

## 4. Common Beginner Recipes ("How Do I Change X?")

| What you want to do | Which file to open | Where to look |
| :--- | :--- | :--- |
| Add a new default Android app icon | `src/data/catalog.ts` | `ANDROID_APP_CATALOG` array |
| Add a new launcher capability (e.g., Niagara or Smart Launcher) | `src/engine/layoutEngine.ts` | `LAUNCHER_GRID_CAPABILITIES` array |
| Change how `6×6 → 5×4` handles overflow icons | `src/engine/layoutEngine.ts` | `computeRestoreResult()` (and mirror in `android/.../GridRemapper.kt`) |
| Add a new API endpoint | `server.ts` | Inside `startServer()`, above the Vite middleware block |
| Add a new diagnostic check to the Workspace Integrity Auditor | `src/engine/layoutEngine.ts` | `auditWorkspaceIntegrity()` |
| Change APK version number or package ID | `android/app/build.gradle.kts` | `appVersionName`, `appVersionCode`, `applicationId` |

---

## 5. Security Boundaries Quick Reference

- **Never trust uploaded JSON**: Always pass external JSON through `stripDangerousKeys()` and `validateBackupPayload()` before using it.
- **Never inject raw text into HTML strings**: Always wrap interpolated text in `escapeHtml()` and validate Play Store URLs with `sanitizePlayStoreUrl()`.
- **Never put secrets in client files or `.env.example` values**: Android release signing keys belong strictly in GitHub Actions Secrets (`ICONSYNC_KEYSTORE_*`).
