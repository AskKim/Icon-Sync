<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Security Policy — Icon Sync

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `0.1.0-alpha.1` (Current Alpha 0.1 — Schema v2.0 / Vault Rev 5 / APK `com.iconsync.android` / `AGPL-3.0-or-later`) | Yes |
| Pre-alpha development snapshots | No |

---

## Security Architecture

Icon Sync is designed as a local-first layout studio with defensive validation at every import, build, and persistence boundary:

- **Strict Backup Validation, Sanitation & Safe Repair (`src/utils/sanitize.ts`, `validateBackupPayload`, `repairBackupPayload`)**: Every uploaded `.json` backup file is stripped of prototype-pollution keys (`__proto__`, `constructor`, `prototype`), bounded in grid dimensions (`3–8 × 3–8`), normalized for safe text/package/hex-color values, and verified against FNV-1a checksums.
- **Safe HTML Export & Link Allowlisting**: Generated `.html` Missing Apps checklists escape every dynamic value via `escapeHtml()`, embed a strict `Content-Security-Policy` meta tag (`default-src 'none'; style-src 'unsafe-inline';`), and enforce `https://play.google.com/store/apps/details?id=...` on all Play Store links across both exported HTML and in-app anchors (`MissingAppsModal`, `InspectorPanel`).
- **Hardened Express Cloud Vault (`server.ts`)**: Disables `X-Powered-By`, sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, and `Cache-Control: no-store` on `/api/*`, confines disk paths strictly inside `.data/`, writes vaults atomically (`tmp` + `rename`) with `0600` permissions, validates backup IDs against `^[a-zA-Z0-9_-]{1,96}$`, bounds payload sizes (`4mb`) and array lengths, and enforces per-IP write rate limiting (`429 Too Many Requests`).
- **Automated Security Scanning**: GitHub Actions runs **CodeQL** static analysis (`javascript-typescript`), production `npm audit --omit=dev --audit-level=high`, and **Dependabot** weekly dependency updates across npm, Gradle, and Actions.
- **Secret-Safe APK Signing**: Android release signing in `.github/workflows/build-android-apk.yml` and `.github/workflows/release.yml` reads exclusively from GitHub Actions Secrets (`ICONSYNC_KEYSTORE_*`), decodes keystores into ephemeral `$RUNNER_TEMP`, and deletes the keystore file immediately after build via a `trap` cleanup hook. No keystores or passwords are ever committed.
- **Non-Destructive Rollback**: Every Replace or Merge restoration captures an in-memory rollback snapshot of the target device prior to applying changes, enabling immediate one-click Undo.

---

## Self-Hosting Hardening Guidance

By default, `server.ts` is intended for local or private-network use without built-in authentication. Before exposing Icon Sync on a public network:

1. **Require Authentication**: Place Icon Sync behind an authenticating reverse proxy (e.g., OAuth2 Proxy, Cloudflare Access, or HTTP auth / session middleware) before allowing access to `/api/vault`, `/api/backups`, and `/api/diagnostics`.
2. **Enforce HTTPS / TLS**: Terminate TLS in front of port `3000` so layout snapshots and widget configurations are encrypted in transit.
3. **Restrict File Permissions**: Ensure `.data/icon-sync-vault.json` is readable/writable only by the service user (`chmod 600 .data/icon-sync-vault.json`).
4. **AGPL-3.0 Network Source Offer**: If you host a modified version over a network, ensure users have a prominent link to obtain your Corresponding Source in accordance with Section 13 of [LICENSE](./LICENSE).

---

## Reporting a Vulnerability

If you discover a security vulnerability in Icon Sync:

1. **Do not open a public issue** containing exploit details.
2. Prefer **GitHub Private Vulnerability Reporting** (under the repository's **Security → Advisories** tab) if enabled, or contact the repository maintainer directly with subject `[Security] Icon Sync Vulnerability Report`.
3. Include affected file(s), reproduction steps, and potential impact.

We aim to acknowledge reports within **3 business days** and publish a fix or mitigation guidance promptly after confirmation.
