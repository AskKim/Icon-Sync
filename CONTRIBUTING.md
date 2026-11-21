# Contributing to Icon Sync

Thank you for helping improve **Icon Sync**! Whether you are adding a new Android launcher capability, refining the cross-grid (`6×6 → 5×4`) layout engine, improving the Developer Tools diagnostics suite, or extending the native Kotlin APK in `/android/`, this guide explains how to work cleanly in the codebase.

---

## Development Setup

```bash
npm install
npm run dev
```

The development server runs on `http://localhost:3000` (Express API + Vite frontend middleware).

---

## Verification Checklist Before Submitting Changes

Always run both TypeScript linting and a full production build before opening a pull request:

```bash
npm run lint
npm run build
```

If you modify `/android/`, also verify Kotlin tests and APK assembly (also enforced by `.github/workflows/build-android-apk.yml`):

```bash
cd android
gradle testDebugUnitTest lintDebug assembleDebug
```

Verify manually in the browser:
- Switching devices on the **Screens** tab (Pixel 9 Pro, Galaxy A15, Galaxy A16, Galaxy S24 Ultra, Galaxy Tab S9 `6×6`)
- Testing **Auto-Detect** and **Report Grid** (`3–8 × 3–8`) for custom & Mini launchers in the right-hand Inspector
- Opening **Import / Restore** with the `Nova Launcher 8 — 6×6 Power Grid` snapshot targeting a `5×4` or `4×5` device and comparing all 5 Grid Adaptation Strategies
- Opening the **Developer** tab (`Ctrl+Shift+D`) and confirming `/api/diagnostics`, the Workspace Integrity Auditor, Grid Remap Lab, and Fault Simulator recovery flows work cleanly

---

## Adding a New Launcher or Device Profile

1. Add launcher grid capabilities to `LAUNCHER_GRID_CAPABILITIES` in `src/engine/layoutEngine.ts`.
2. Define any new `DeviceProfile` inside `createInitialDevices()` in `src/data/catalog.ts` with accurate `gridCols`, `gridRows`, `gridDetectionSource`, `gridConfidence`, and `installedPackages`.
3. Add a corresponding default backup snapshot in `createInitialBackups()`.
4. Increment `VAULT_SCHEMA_REVISION` in `src/App.tsx` if existing persisted vaults should automatically receive the new profile on load.
5. Update `README.md` and `CHANGELOG.md`.

---

## Code & Documentation Conventions

- Use **TypeScript** with strict typing (no `any`) and **Kotlin** (official style) under `/android/`.
- Style components with **Tailwind CSS** utility classes matching the neutral surface palette (`#F6F7F9` canvas, `#FFFFFF` cards, `#E4E7EC` borders, `#166534` primary accent).
- Ensure every failure state shows clear user feedback and at least one actionable recovery path.
- Whenever storage fields, API routes, or Android permissions change, update **`PRIVACY.md`** and **`DATA_MAP.md`** in the same pull request.
