<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Icon Sync v0.1.0-alpha.1 (Alpha 0.1)

**Release Type:** Pre-release (Alpha 0.1)  
**License:** GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`)  
**Date:** November 22, 2026

Welcome to the first public **Alpha 0.1** release of **Icon Sync** — an open-source Android home screen layout backup, cross-grid (`6×6 → 5×4`) adaptation, Replace/Merge restoration, cross-device widget sync studio, and native Kotlin Android APK.

---

## Highlights in `v0.1.0-alpha.1`

- **Home & Supplemental Screen Studio**: Manage primary and supplemental pages, icons, folders, dock shortcuts, and live widgets across Pixel 9 Pro (`4×5`), Galaxy A15 (`4×6`), Galaxy A16 (`4×6`), Galaxy S24 Ultra (`5×6`), Galaxy Tab S9 (`6×6` Nova), or custom devices registered via **+ Add Device** (including `5×4` Mini Launchers).
- **Cross-Grid Adaptation Engine (`6×6 → 5×4`)**: Five deterministic adaptation strategies (`Auto-Reflow & Overflow`, `Proportional Scale`, `Split Per Source Page`, `Resize Target Grid`, and `Strict Bounds Crop`) implemented in both TypeScript (`src/engine/layoutEngine.ts`) and Kotlin (`GridRemapper.kt` with JUnit test coverage).
- **Replace & Merge Restore with One-Click Undo**: Preview exact slot collisions, folder merges, missing apps, and Play Store install checklists (`.txt` / `.html`) before applying, with automatic rollback snapshots.
- **Hardened Local Cloud Vault (`server.ts`)**: Atomic `0600` JSON vault writes inside `.data/icon-sync-vault.json`, strict input sanitation (`src/utils/sanitize.ts`), CSP-protected HTML checklist exports, and offline `localStorage` fallback.
- **Developer Tools & Diagnostics (`Ctrl+Shift+D`)**: Live `/api/diagnostics` probe, Workspace Integrity Auditor with Auto-Fix, interactive Grid Remap Lab, Fault Simulator, JSON Repair tool, and Kotlin/Workflow source viewer.
- **Native Android APK (`com.iconsync.android`)**: Automated GitHub Actions APK builds with Android SDK 35 verification, Kotlin unit tests, Android Lint reports, and `SHA256SUMS.txt`.
- **AGPL-3.0-or-later Governance & Privacy Suite**: Complete `LICENSE` (AGPL-3.0), `NOTICE.md`, `PRIVACY.md`, `DATA_MAP.md`, `SECURITY.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SUPPORT.md`.

---

## Verifying Release Assets

```bash
sha256sum -c SHA256SUMS.txt
```

### Android APK Sideloading Notes (Alpha)
- Targets Android 15 (API 35) with minimum support for Android 8.0 (API 26).
- When release signing secrets are not yet configured, `IconSync-v0.1.0-alpha.1-debug.apk` is published for sideloading and alpha testing.

---

## Known Alpha Limitations

- Cloud Vault (`server.ts`) is designed for local or private-network hosting; place it behind an authenticating HTTPS reverse proxy before exposing it on the public internet (see `SECURITY.md`).
- Stock OEM launchers that do not expose a public grid ContentProvider require either the opt-in Accessibility grid detector or one-tap manual grid reporting (`3×3` to `8×8`).
- Please report bugs or custom launcher grids using our GitHub Issue forms!
