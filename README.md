# Icon Sync

**Open-source (GPL-3.0+) Android Home Screen Layout Backup, Cross-Grid Adaptation (`6×6 → 5×4`), Replace/Merge Restoration, Developer Diagnostics, Cross-Device Widget Sync Studio & Native Android APK.**

Icon Sync helps Android owners capture, organize, back up, and migrate home screens, supplemental pages, folders, dock shortcuts, and widget configurations across devices and launchers — including **Google Pixel**, **Samsung Galaxy A15**, **Samsung Galaxy A16**, **Samsung Galaxy S24 Ultra**, **Galaxy Tab S9 (Nova Launcher `6×6`)**, and custom/minimalist launchers (registerable via **+ Add Device**) — without losing layout structure or re-dragging every icon by hand.

> **New to this codebase or exploring with an AI assistant?** Read **[ARCHITECTURE.md](./ARCHITECTURE.md)** for a beginner-friendly 60-second mental model, annotated file tree, data flow diagrams, and "How do I change X?" recipes.
>
> **Persistence Note:** We will not be adding a real database for this project. Icon Sync intentionally stores workspace state in `.data/icon-sync-vault.json` (via the Express API), browser `localStorage`, and portable `.json` backup exports.

---

## Plain-English Overview

1. **Inspect, Register, Auto-Detect & Report Launcher Grids**: Pick any pre-configured device or click **+ Add Device** to register your own phone or `5×4` Mini Launcher. Icon Sync auto-detects grid sizes on supported launchers (via Launcher Provider or opt-in Accessibility bounds) and lets custom/Mini launcher users report any `3×3` through `8×8` grid.
2. **Create a Backup**: Save a portable `v2.0` JSON layout snapshot with an FNV-1a integrity checksum to the local Express Cloud Vault (`.data/icon-sync-vault.json`) or download it to disk.
3. **Cross-Grid Import & Restore (Replace or Merge)**:
   - Detects mismatched layouts (such as importing a **`6×6`** Nova Launcher backup into a **`5×4`** compact launcher) and shows exact out-of-bounds impact before applying.
   - Choose from **5 Grid Adaptation Strategies**: `Auto-Reflow & Overflow`, `Proportional Spatial Scale`, `Split Per Source Page`, `Resize Target Grid to Match`, or `Strict Bounds (Crop Excess)`.
   - Supports **Replace Mode**, **Merge Mode** (folder deduplication + open-slot placement), and one-click **Undo Restore**.
4. **Actionable Feedback & Recovery Flows**: Every success, warning, or error banner explains what happened and offers concrete recovery buttons (e.g., retry Cloud Vault sync, download JSON fallback, add supplemental screen & place, auto-repair malformed JSON, or report a custom grid).
5. **Developer Tools & Troubleshooting Panel (`Developer` tab or `Ctrl+Shift+D`)**: Live Express server diagnostics (`/api/diagnostics`), browser cache inspection, Workspace Integrity Auditor with one-click Auto-Fix, interactive **Grid Remap Lab** with visual occupancy heatmaps, live Activity/API log, Fault Simulator, Backup JSON Validator/Repair tool, and Android APK / Kotlin source browser.
6. **Native Android APK & GitHub Actions CI/CD**: Includes a complete Gradle Android project under `/android/` (`com.iconsync.android`, `IconSync-v2.3.0-*.apk`) with automated GitHub Actions workflows for APK builds, unit tests, Web CI, Releases with SHA-256 checksums, CodeQL, and Dependabot.

---

## Supported Device Profiles (Pre-Configured)

| Device | Model Code | Launcher | Grid | Detection Source | Default Backup Source |
| :--- | :--- | :--- | :---: | :--- | :--- |
| Pixel 9 Pro | `GR83Y` | Pixel Launcher | `4×5` | Accessibility | `Pixel 9 Pro — Daily Driver Layout` |
| Galaxy A15 | `SM-A156U` | One UI Home (A15) | `4×6` | Accessibility | `Galaxy A15 — One UI 6.1 Setup` |
| Galaxy A16 | `SM-A166U` | One UI Home (A16) | `4×6` | Accessibility | `Galaxy A16 — One UI 7 Setup` |
| Galaxy S24 Ultra | `SM-S928U` | One UI Home | `5×6` | Accessibility | `Galaxy S24 Ultra — 5×6 Dense Setup` |
| Galaxy Tab S9 | `SM-X710` | Nova Launcher 8 | `6×6` | Launcher Provider | `Nova Launcher 8 — 6×6 Power Grid` |

---

## GitHub Actions & Android APK Builds

| Workflow | File | Purpose |
| :--- | :--- | :--- |
| **Build Icon Sync Android APK** | `.github/workflows/build-android-apk.yml` | Runs Kotlin `GridRemapperTest`, `lintDebug`, assembles `IconSync-v2.3.0-debug.apk` (plus signed `release` APK when signing secrets are configured), generates `SHA256SUMS.txt`, and uploads artifacts. |
| **Web Studio CI** | `.github/workflows/ci-web.yml` | Runs `npm ci`, TypeScript typecheck (`npm run lint`), `npm run build`, and live Express `/api/health` + `/api/diagnostics` smoke tests. |
| **Automated Release** | `.github/workflows/release.yml` | Triggered on `v*.*.*` tags or manual dispatch; builds Web Studio tarball + Android APK, generates `SHA256SUMS.txt`, and publishes a GitHub Release. |
| **CodeQL & Security Audit** | `.github/workflows/codeql-security.yml` | Runs CodeQL static analysis (`javascript-typescript`) and `npm audit --omit=dev --audit-level=high` weekly and on PRs. |
| **Sync Repo Description & Topics** | `.github/workflows/sync-repo-metadata.yml` | One-click `workflow_dispatch` action that sets the GitHub repository description and topic tags via GitHub CLI. |
| **Dependabot** | `.github/dependabot.yml` | Keeps npm, Gradle (`/android`), and GitHub Actions dependencies up to date weekly. |

### Optional Release APK Signing Secrets
To produce a signed release APK in GitHub Actions, add these repository secrets under **Settings → Secrets and variables → Actions**:
- `ICONSYNC_KEYSTORE_BASE64` — Base64-encoded `.jks` keystore
- `ICONSYNC_KEYSTORE_PASSWORD` — Keystore password
- `ICONSYNC_KEY_ALIAS` — Signing key alias
- `ICONSYNC_KEY_PASSWORD` — Signing key password

---

## Getting Started

### Prerequisites
- Node.js 26+ and npm 10+
- *(Optional for local Android builds)* JDK 17, Android SDK 35, and Gradle 8.9

### Local Web Studio Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser. Press `Ctrl+Shift+D` (or click **Developer**) to open the under-the-hood diagnostics panel.

### Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts `server.ts` via `tsx` with Vite middleware on port 3000 |
| `npm run build` | Builds the production client bundle into `dist/` |
| `npm start` | Serves the production build and `/api/*` endpoints via `node server.ts` |
| `npm run lint` | Runs strict TypeScript type-checking (`tsc --noEmit`) |
| `npm run clean` | Removes build artifacts (`dist/` and `server.js`) |

---

## API Endpoints

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health check (`icon-sync-cloud-vault`) |
| `GET` | `/api/diagnostics` | Returns vault file existence/size, legacy vault migration status, uptime, and Node version |
| `GET` | `/api/vault` | Returns persisted Cloud Vault state (`devices`, `backups`, `widgetSyncPolicy`, `schemaRevision`) |
| `PUT` | `/api/vault` | Saves full Cloud Vault state to `.data/icon-sync-vault.json` |
| `POST` | `/api/backups` | Adds or updates a single `LayoutBackupSnapshot` |
| `DELETE` | `/api/backups/:id` | Deletes a backup snapshot by ID |

---

## Documentation & Governance

- **Architecture & Beginner Guide**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Privacy Policy**: [PRIVACY.md](./PRIVACY.md)
- **Privacy Data Map**: [DATA_MAP.md](./DATA_MAP.md)
- **Security Policy**: [SECURITY.md](./SECURITY.md)
- **Contributing Guide**: [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Changelog**: [CHANGELOG.md](./CHANGELOG.md)
- **License**: [GNU General Public License v3.0 or later (`GPL-3.0-or-later`)](./LICENSE)
