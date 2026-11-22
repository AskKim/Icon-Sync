<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Changelog

All notable changes to **Icon Sync** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

---

## [0.1.0-alpha.1] — 2026-11-22 (First Public Alpha Release)

### License & Release Preparation
- **GNU AGPL v3.0 or later (`AGPL-3.0-or-later`)**: Replaced `LICENSE` with the complete official FSF GNU Affero General Public License v3.0 text (automatically detected by GitHub), added `NOTICE.md` covering Section 13 network-interaction source requirements and third-party attributions, and aligned `package.json`, Gradle files, workflows, and SPDX headers to `AGPL-3.0-or-later`.
- **Alpha 0.1 Versioning (`0.1.0-alpha.1`)**: Standardized version identifiers across `package.json`, `server.ts` (`SERVICE_VERSION`), `android/app/build.gradle.kts` (`versionCode = 1`, `versionName = "0.1.0-alpha.1"`, `IconSync-v0.1.0-alpha.1-*.apk`), `src/services/cloudApi.ts`, and `RELEASE_NOTES_v0.1.0-alpha.1.md`.

### Fixed — Android APK & Release Workflows
- **Deterministic Android SDK 35 Setup**: Replaced fragile `android-actions/setup-android@v3` package-string invocation in `.github/workflows/build-android-apk.yml` and `.github/workflows/release.yml` with explicit `ANDROID_HOME` discovery, automatic `cmdline-tools` fallback, explicit `yes | sdkmanager --licenses`, quoted `"platform-tools" "platforms;android-35" "build-tools;35.0.0"` installation, and pre-build `platforms/android-35/android.jar` verification.
- **Reliable Gradle CI Execution**: Configured `gradle/actions/setup-gradle@v4` with `build-root-directory: android`, ran Gradle tasks with `--no-daemon --stacktrace --console=plain`, tuned `android/gradle.properties` heap & parallel caching (`-Xmx3072m`, `kotlin.daemon.jvmargs=-Xmx1536m`), upgraded AGP to `8.7.3`, applied `base` explicitly, and migrated `android/app/build.gradle.kts` to Kotlin 2.0 `compilerOptions`.
- **Android Companion Improvements**: Added Android 13+ (`TIRAMISU`) non-deprecated `resolveActivity` handling in `LauncherGridDetector.kt` and added `PRESERVE_PAGES` unit test coverage in `GridRemapperTest.kt` (all 5 cross-grid strategies now tested in CI).
- **Alpha Pre-Release Automation**: Updated `.github/workflows/release.yml` to automatically mark `-alpha`/`-beta`/`-rc` tags as GitHub Pre-releases, attach `RELEASE_NOTES_<tag>.md`, and bundle `LICENSE`, `NOTICE.md`, `PRIVACY.md`, `DATA_MAP.md`, and `CHANGELOG.md` in the Web Studio release tarball.

### Added — GitHub Optimization & Community Governance
- **Declarative Repo Metadata & Optimization**: Added `.github/repo-metadata.json` and upgraded `.github/workflows/sync-repo-metadata.yml` to sync repository description, homepage, topics (`agplv3`, `android`, `android-launcher`, `icon-sync`, `cross-grid`, etc.), merge hygiene settings (squash/rebase, auto-delete merged branches), and 10 standardized color-coded Issue/PR labels.
- **GitHub Community Health Files**: Added structured YAML issue forms (`.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `launcher_grid_report.yml`, `config.yml`), `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, `.github/FUNDING.yml`, `CODE_OF_CONDUCT.md`, `SUPPORT.md`, `NOTICE.md`, `RELEASE_NOTES_v0.1.0-alpha.1.md`, and `.editorconfig`.
- **Updated Privacy & Data Map**: Refreshed `PRIVACY.md` and `DATA_MAP.md` with GDPR/CCPA rights alignment, Android `SharedPreferences` & `cacheDir` storage mappings, and hardened API boundary details.

---

## Pre-Alpha Development Milestones (Incorporated into `v0.1.0-alpha.1`)

### Security, Custom Devices & Diagnostics
- Input sanitation layer (`src/utils/sanitize.ts`), CSP-protected `.html` Missing Apps checklists, strict Play Store URL allowlisting, hardened atomic `0600` Express Cloud Vault writes, prototype-pollution stripping, and write rate limiting.
- **+ Add Device** custom phone / `5×4` Mini Launcher modal (`AddDeviceModal.tsx`), grid-filtered & sortable Backup Archives (`BackupsView.tsx`), and FNV-1a auto-persist deduplication.
- Cross-grid (`6×6 → 5×4`) 5-strategy adaptation engine (`layoutEngine.ts` + Kotlin `GridRemapper.kt`), 3-tier launcher grid auto-detection + manual grid reporting, actionable `FeedbackBanner` recovery flows, and the **Developer** tab (`Ctrl+Shift+D`).
- Home & Supplemental Screen Studio (`PhoneCanvas`, `InspectorPanel`), Replace/Merge restore with automatic Undo snapshots, Missing Apps walkthrough, and Cross-Device Widget Sync matrix across Pixel 9 Pro, Galaxy A15, Galaxy A16, Galaxy S24 Ultra, and Galaxy Tab S9.
