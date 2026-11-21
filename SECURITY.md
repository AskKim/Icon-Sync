# Security Policy — Icon Sync

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `2.2.x` (Current — Schema v2.0 / Vault Rev 5 / APK `com.iconsync.android`) | Yes |
| `< 2.0` | No |

---

## Security Architecture

Icon Sync is designed as a local-first layout studio with defensive validation at every import, build, and persistence boundary:

- **Strict Backup Validation & Safe Repair (`validateBackupPayload` / `repairBackupPayload`)**: Every uploaded `.json` backup file is structurally validated before previewing or applying changes — checking schema version (`2.0`), FNV-1a checksum integrity, numeric grid bounds (`3–8 × 3–8`), and valid screen arrays.
- **Automated Security Scanning**: GitHub Actions runs **CodeQL** static analysis (`javascript-typescript`), production `npm audit --audit-level=high`, and **Dependabot** weekly dependency updates across npm, Gradle, and Actions.
- **Secret-Safe APK Signing**: Android release signing in `.github/workflows/build-android-apk.yml` reads exclusively from GitHub Actions Secrets (`ICONSYNC_KEYSTORE_*`), decodes keystores into ephemeral `$RUNNER_TEMP`, and deletes the keystore file immediately after build. No keystores or passwords are ever committed.
- **Non-Destructive Rollback**: Every Replace or Merge restoration captures an in-memory rollback snapshot of the target device prior to applying changes, enabling immediate one-click Undo.
- **Bounded Request Bodies**: Express JSON parsing enforces a `4mb` payload cap (`express.json({ limit: '4mb' })`) and validates expected array types on `/api/vault` and object/ID types on `/api/backups`.
- **Safe External Links**: Generated Google Play Store links strictly target `https://play.google.com/store/apps/details?id=<packageName>` with `rel="noopener noreferrer"` in exported HTML checklists.

---

## Self-Hosting Hardening Guidance

By default, `server.ts` is intended for local or private-network use without built-in authentication. Before exposing Icon Sync on a public network:

1. **Require Authentication**: Place Icon Sync behind an authenticating reverse proxy (e.g., OAuth2 Proxy, Cloudflare Access, or HTTP auth / session middleware) before allowing access to `/api/vault`, `/api/backups`, and `/api/diagnostics`.
2. **Enforce HTTPS / TLS**: Terminate TLS in front of port `3000` so layout snapshots and widget configurations are encrypted in transit.
3. **Restrict File Permissions**: Ensure `.data/icon-sync-vault.json` is readable/writable only by the service user (`chmod 600 .data/icon-sync-vault.json`).

---

## Reporting a Vulnerability

If you discover a security vulnerability in Icon Sync:

1. **Do not open a public issue** containing exploit details.
2. Document the affected file(s), reproduction steps, and potential impact.
3. Send a private report to the repository maintainer with the subject line `[Security] Icon Sync Vulnerability Report`.

We aim to acknowledge reports within **3 business days** and publish a fix or mitigation guidance promptly after confirmation.
