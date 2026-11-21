# Privacy Policy — Icon Sync

**Effective Date:** November 21, 2026  
**Applies To:** Icon Sync Web Studio (`server.ts` + React frontend) and the Icon Sync Android APK (`com.iconsync.android`).

Icon Sync is built around a simple principle: **back up how your home screens are arranged, never your personal life.** This policy explains in plain language what data Icon Sync handles, why it is needed, where it is stored, and how you control it.

---

## 1. Plain-English Summary

- **What Icon Sync stores:** Only home screen layout metadata — grid dimensions and detection source (`launcher-provider`, `auto-accessibility`, or `user-reported`), screen names, app names and Android package IDs, folder groupings, widget display settings (such as weather city or task list items), and device profile labels (such as `Galaxy A15`, `Galaxy A16`, `Pixel 9 Pro`, or `Galaxy Tab S9`).
- **What Icon Sync NEVER collects:** Passwords, login tokens, messages, emails, photos, contacts, call logs, browsing history, financial account data, precise GPS location, advertising IDs, or behavioral analytics.
- **No third-party data sharing:** Icon Sync does not sell, rent, or transmit your layout data to advertisers, analytics vendors, or external data brokers.

---

## 2. Information Processed by Icon Sync

### A. Layout & Device Profile Metadata
When you inspect, edit, or back up a device layout, Icon Sync records:
- **Device & launcher grid metadata:** Display name (e.g., `Galaxy A15`), model code (e.g., `SM-A156U`), manufacturer, Android/One UI version string, launcher name, wallpaper theme ID, grid dimensions (`gridCols × gridRows`), and how the grid was determined (`gridDetectionSource`).
- **Installed app inventory:** A list of launchable Android package IDs (e.g., `com.google.android.gm`) used strictly to detect whether an app in a backup is already installed on the target device or needs a placeholder icon and Play Store link.
- **Home & supplemental screen structure:** Page names, icon grid positions (`col`, `row`), dock shortcuts, folder names and colors, and nested app references.
- **Widget configuration metadata:** Widget provider identifiers, grid span (`spanX`, `spanY`), sync toggle state, timestamps, and user-configured widget display options (e.g., Weather city/unit, World Clock time zones, Focus Tasks checklist items, Calendar display flags).

### B. Exported Files (User-Initiated Only)
- **Backup Snapshots (`.json`):** Generated locally in your browser or Android companion app when you export a backup (`icon-sync-<name>-YYYY-MM-DD.json`).
- **Missing Apps Checklists (`.txt` / `.html`):** Generated locally containing app labels, Android package IDs, target screen coordinates, and standard `https://play.google.com/store/apps/details?id=...` links.
- **Diagnostics Bundles (`.json`):** Generated only when you explicitly click **Export Bundle** inside the **Developer** tab for local troubleshooting.

---

## 3. Android APK Permissions Disclosure

The Icon Sync Android APK (`/android/`, package `com.iconsync.android`) declares only the permissions required for launcher grid detection, backup, and widget synchronization:

| Android Permission | Why It Is Needed | Data Scope |
| :--- | :--- | :--- |
| `INTERNET` | Syncs backup snapshots and widget configs with your configured Icon Sync server URL | Layout JSON payloads only |
| `QUERY_ALL_PACKAGES` | Identifies which apps from a backup are installed vs. missing on the target phone | Package IDs and launchable app labels only |
| `BIND_ACCESSIBILITY_SERVICE` *(Optional / Opt-In)* | Non-root inspection of launcher workspace bounds to auto-detect custom grid sizes (e.g., `5×4`, `6×6`) on launchers without a grid ContentProvider | Home screen cell bounds only; never reads keystrokes, passwords, or other apps |

---

## 4. Where Your Data Is Stored & Retention

1. **Browser Storage (`localStorage`):** Cached under key `iconsync.vault.v4` on your device so your edits persist immediately even if the server is offline.
2. **Local Cloud Vault File:** When running `server.ts`, layout state is persisted locally to `.data/icon-sync-vault.json` on the host machine running the server.
3. **Retention:** Data stays in your local browser storage and local `.data/icon-sync-vault.json` file until you delete a backup or clear the vault. There is no remote third-party retention.

For a complete field-by-field inventory and architecture diagram, see **[DATA_MAP.md](./DATA_MAP.md)**.

---

## 5. Your Controls & Rights

You maintain full control over every piece of layout data:
- **View & Inspect:** Every screen, icon, folder, and widget stored in Icon Sync is directly visible in the UI, in the **Developer** panel, and in plain-text JSON backup exports.
- **Export / Portability:** Download any snapshot as standard `v2.0` JSON at any time from the **Backups** tab or **Backup Layout** modal.
- **Delete:** Delete individual backups via the **Backups** tab (`DELETE /api/backups/:id`), clear browser cache from **Developer → Health & Audit**, or remove `.data/icon-sync-vault.json`.
- **Undo Changes:** Every Replace or Merge restore automatically captures a local rollback snapshot so you can revert immediately.

---

## 6. Children's Privacy

Icon Sync is a general-purpose device organization utility and does not knowingly collect personal information from children under 13 (or the equivalent minimum age in your jurisdiction).

---

## 7. Policy Updates

If Icon Sync's storage architecture or optional cloud providers change in a future release, this `PRIVACY.md` file and the companion `DATA_MAP.md` will be updated in the same commit with a new effective date.
