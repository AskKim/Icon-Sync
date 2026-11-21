# Changelog

All notable changes to **Icon Sync** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.2.0] — 2026-11-21

### Changed
- **Project, App & APK Rebrand to Icon Sync**:
  - Renamed app, metadata, HTML titles, package (`icon-sync`), Express service (`icon-sync-cloud-vault`), Android package (`com.iconsync.android`), and APK outputs (`IconSync-v2.2.0-*.apk`).
  - Migrated persistence automatically from legacy `.data/homegrid-vault.json` and `localStorage["homegrid.vault.v3"]` to `.data/icon-sync-vault.json` and `localStorage["iconsync.vault.v4"]` (`schemaRevision: 5`).
  - Upgraded `Galaxy Tab S9` (`Nova Launcher 8`) to a dense `6×6` layout with a matching `Nova Launcher 8 — 6×6 Power Grid` default snapshot for immediate cross-grid testing.

### Added
- **Launcher Grid Auto-Detection, Manual Reporting & Cross-Grid Adaptation**:
  - Added 3-tier grid detection (`Launcher Provider`, `Accessibility Auto-Detect`, `User Reported`) plus an inline **Report Grid** (`3–8 × 3–8`) control for custom and Mini/Minimalist launchers in both the Inspector and Import modal.
  - Added `analyzeGridCompatibility()` and 5 cross-grid import strategies (`auto-reflow`, `proportional-scale`, `preserve-pages`, `resize-target-grid`, `crop-within-bounds`) to cleanly handle non-same grid imports such as **`6×6 → 5×4`**.
- **Actionable Success & Failure Feedback with Recovery Paths**:
  - Replaced plain text toasts with multi-severity `FeedbackBanner` notifications (`Success`, `Action Needed`, `Failed`, `Info`) with expandable technical details and recovery buttons (Retry Cloud Sync, Download JSON Fallback, Add Supplemental Screen & Place, Auto-Repair Backup JSON, Report Custom Grid, Undo & Choose Reflow).
- **Developer Tools & Diagnostics Panel** (`Developer` tab / `Ctrl+Shift+D`):
  - **Health & Audit**: Live `/api/diagnostics` probe, browser cache inspector, and Workspace Integrity Auditor (detects out-of-bounds slots, overlaps, checksum mismatches, stale placeholders) with one-click **Auto-Fix**.
  - **Grid Remap Lab**: Side-by-side `6×6 → 5×4` visual occupancy heatmaps across all 5 adaptation strategies.
  - **Activity Log**: Live filterable log of API requests, latencies, grid detections, and restore events + JSON diagnostics bundle export.
  - **Fault Simulator & JSON Repair**: Simulate offline Cloud Vault, latency, checksum corruption, and grid detection failures; validate and auto-repair broken JSON backups.
  - **Android APK & Kotlin**: Inspect and copy native Kotlin companion files and GitHub Actions workflow YAML.
- **Native Android Gradle Project & GitHub Actions Suite**:
  - Scaffolded buildable Gradle Android project under `/android/` (`BackupSchema.kt`, `LauncherGridDetector.kt`, `GridRemapper.kt`, `LauncherBackupService.kt`, `LauncherGridAccessibilityService.kt`, `WidgetSyncWorker.kt`, `MainActivity.kt`, and `GridRemapperTest.kt`).
  - Added `.github/workflows/build-android-apk.yml`, `ci-web.yml`, `release.yml`, `codeql-security.yml`, and `.github/dependabot.yml`.

---

## [2.1.0] — 2026-11-21

### Added
- Dedicated `Galaxy A15` (`SM-A156U`, One UI 6.1, `4×6`) and `Galaxy A16` (`SM-A166U`, One UI 7, `4×6`) profiles and default Cloud Vault backup snapshots.
- Plain-language **Guide / How It Works** screen (`HowItWorksView.tsx`) with FAQ accordion and inline Privacy & Data Map table.
- Project governance documentation suite (`README.md`, `PRIVACY.md`, `DATA_MAP.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`).

---

## [2.0.0] — 2026-11-20

### Added
- Home & Supplemental Screen Studio with interactive Android phone preview (`PhoneCanvas`) and live item inspector (`InspectorPanel`).
- Cloud Vault (`server.ts`) and portable `v2.0` JSON backup export/import.
- Replace and Merge restoration engine with folder merging, deduplication, and automatic Undo snapshots.
- Missing Apps detection with dummy placeholder icons, guided Play Store install walkthrough, and `.txt`/`.html` checklist downloads.
- Cross-device Widget Sync matrix with configurable conflict resolution (`newest`, `primary_device`, `manual`).
