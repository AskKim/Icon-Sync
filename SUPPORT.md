<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Support & Troubleshooting — Icon Sync

Need help setting up **Icon Sync**, migrating a `6×6` layout to a `5×4` Mini Launcher, or sideloading the Alpha 0.1 Android APK? Start here.

---

## Quick Self-Checks

1. **Web Studio & Cloud Vault Diagnostics**
   - Open the **Developer** tab (or press `Ctrl+Shift+D`) and check **Health & Audit**.
   - Verify `/api/health` and `/api/diagnostics` return `ok: true`.
   - Click **Auto-Fix** in the Workspace Integrity Auditor to repair out-of-bounds slots, overlapping icons, or stale checksums.

2. **Cross-Grid Restore (`6×6 → 5×4` or `5×6 → 4×5`)**
   - Use **Report Grid** in the right-hand Inspector if your custom or minimalist launcher blocks automatic grid introspection.
   - Compare all 5 strategies inside **Developer → Grid Remap Lab** before restoring (`Auto-Reflow`, `Proportional Scale`, `Split Per Source Page`, `Resize Target Grid`, `Strict Bounds Crop`).
   - Every restore captures an automatic rollback copy—click **Undo Restore** at any time to revert.

3. **Sideloading the Android APK (`v0.1.0-alpha.1`)**
   - Requires **Android 8.0 (API 26) or newer**.
   - Download `IconSync-v0.1.0-alpha.1-debug.apk` (or the signed release APK if published) and `SHA256SUMS.txt` from the GitHub Releases page or the **Build Icon Sync Android APK** workflow artifacts.
   - Verify the checksum:
     ```bash
     sha256sum -c SHA256SUMS.txt
     ```
   - On your phone, allow installing unknown apps from your browser/file manager when prompted.

---

## Where to Get Help

- **Report a Bug:** Open a [Bug Report](./.github/ISSUE_TEMPLATE/bug_report.yml) with your Icon Sync version (`v0.1.0-alpha.1`), device/launcher grid, and sanitized diagnostics output.
- **Request Launcher Grid Support:** Use the [Launcher Grid Compatibility Report](./.github/ISSUE_TEMPLATE/launcher_grid_report.yml) form.
- **Request a Feature:** Open a [Feature Request](./.github/ISSUE_TEMPLATE/feature_request.yml).
- **Security Vulnerabilities:** Do **not** open a public issue—follow [SECURITY.md](./SECURITY.md).
- **Privacy & Data Handling:** Review [PRIVACY.md](./PRIVACY.md) and [DATA_MAP.md](./DATA_MAP.md).
