/**
 * @file src/utils/sanitize.ts
 * @license AGPL-3.0-or-later
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * ============================================================================
 * ICON SYNC — INPUT SANITATION & HARDENING UTILITIES
 * ============================================================================
 *
 * PLAIN-ENGLISH OVERVIEW (for beginners & AI readers):
 * Whenever a user uploads a JSON backup file, types a folder name, or clicks
 * an exported HTML checklist link, untrusted text enters the app.
 *
 * This module acts as a "security checkpoint" before data is stored, rendered,
 * or written into downloadable HTML/JSON files. It prevents:
 *   1. HTML/script injection inside exported `.html` checklists.
 *   2. Dangerous URL schemes (like `javascript:` or `data:`) in Play Store links.
 *   3. Prototype pollution (`__proto__`, `constructor`, `prototype` keys) from
 *      malicious or malformed JSON uploads.
 *   4. Control characters or oversized strings corrupting layouts or storage.
 */

/**
 * Keys that JavaScript objects inherit from `Object.prototype`.
 * If an attacker puts these keys inside an uploaded JSON file and code merges
 * them naively, it can alter every object in the program. We always strip them.
 */
const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Escapes special HTML characters so plain text can NEVER be interpreted as
 * executable HTML tags or attributes inside generated `.html` files.
 *
 * Example:
 *   escapeHtml('<script>alert(1)</script>')
 *   // => '&lt;script&gt;alert(1)&lt;/script&gt;'
 */
export function escapeHtml(value: unknown): string {
  const str = typeof value === 'string' ? value : String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Removes invisible ASCII control characters (except standard spaces/newlines
 * when allowed), trims leading/trailing whitespace, and caps string length.
 */
export function sanitizeText(
  value: unknown,
  maxLength = 120,
  options?: { allowNewlines?: boolean }
): string {
  if (typeof value !== 'string') return '';
  // Strip C0 control chars (0x00-0x1F) and DEL (0x7F); optionally preserve \n
  const pattern = options?.allowNewlines
    ? /[\u0000-\u0009\u000B-\u001F\u007F]/g
    : /[\u0000-\u001F\u007F]/g;
  return value.replace(pattern, '').trim().slice(0, maxLength);
}

/**
 * Validates and cleans an Android package identifier (for example: `com.whatsapp`).
 * Allows only letters, digits, dots, underscores, and hyphens.
 * Returns a safe fallback if the input is invalid or empty.
 */
export function sanitizePackageName(
  value: unknown,
  fallback = 'com.unknown.app'
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 160);
  // Require at least one letter/digit and prevent consecutive dots or leading dots
  if (!cleaned || cleaned.startsWith('.') || cleaned.includes('..') || !/[a-zA-Z0-9]/.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

/**
 * Guarantees that any Google Play Store link uses `https:` on `play.google.com`.
 * Blocks dangerous schemes like `javascript:alert(1)` or phishing redirects.
 *
 * If the provided URL fails validation, it safely rebuilds a canonical Play Store
 * URL from the sanitized `fallbackPackageName`.
 */
export function sanitizePlayStoreUrl(
  rawUrl: unknown,
  fallbackPackageName = 'com.unknown.app'
): string {
  const safePkg = sanitizePackageName(fallbackPackageName);
  const canonicalFallback = `https://play.google.com/store/apps/details?id=${encodeURIComponent(safePkg)}`;

  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return canonicalFallback;
  }

  try {
    const parsed = new URL(rawUrl.trim());
    if (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'play.google.com' &&
      parsed.pathname === '/store/apps/details'
    ) {
      const idParam = parsed.searchParams.get('id');
      if (idParam) {
        const verifiedPkg = sanitizePackageName(idParam, safePkg);
        return `https://play.google.com/store/apps/details?id=${encodeURIComponent(verifiedPkg)}`;
      }
    }
  } catch {
    // Malformed URL string — fall through to canonical Play Store link
  }

  return canonicalFallback;
}

/**
 * Validates a CSS hex color string (such as `#166534` or `#FFF`).
 * Prevents CSS injection if a malicious backup supplies non-color text.
 */
export function sanitizeHexColor(value: unknown, fallback = '#334155'): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : fallback;
}

/**
 * Validates a backup or entity identifier used in URL paths (`/api/backups/:id`).
 * Rejects path separators (`/` or `\`), dots (`..`), and special characters.
 */
export function isSafeEntityId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(value);
}

/**
 * Recursively copies plain JSON data while stripping prototype-pollution keys
 * (`__proto__`, `constructor`, `prototype`) and capping nesting depth to avoid
 * stack overflows from deeply nested malicious payloads.
 */
export function stripDangerousKeys<T>(input: T, maxDepth = 16): T {
  if (maxDepth <= 0 || input === null || typeof input !== 'object') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => stripDangerousKeys(item, maxDepth - 1)) as unknown as T;
  }

  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) continue;
    clean[key] = stripDangerousKeys(val, maxDepth - 1);
  }
  return clean as T;
}

/**
 * Clamps a numeric grid dimension (columns or rows) strictly within Icon Sync's
 * supported bounds (`3` through `8`).
 */
export function clampGridDimension(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(3, Math.min(8, Math.round(num)));
}

/**
 * Validates embedded icon artwork data URIs (PNG, JPEG, WebP, or static SVG)
 * while rejecting scripts, event handlers, or oversized blobs.
 */
export function sanitizeIconArtDataUri(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 65536) return undefined;

  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^data:image\/svg\+xml(;charset=utf-8)?;base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    try {
      const b64 = trimmed.split(',')[1] ?? '';
      const binary = globalThis.atob(b64);
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      if (/<script|on\w+\s*=|javascript:|<foreignObject/i.test(decoded)) {
        return undefined;
      }
      return trimmed;
    } catch {
      return undefined;
    }
  }

  if (/^data:image\/svg\+xml(;charset=utf-8)?,/i.test(trimmed)) {
    try {
      const rawBody = trimmed.slice(trimmed.indexOf(',') + 1);
      const decoded = decodeURIComponent(rawBody);
      if (/<script|on\w+\s*=|javascript:|<foreignObject/i.test(decoded)) {
        return undefined;
      }
      return trimmed;
    } catch {
      return undefined;
    }
  }

  return undefined;
}
