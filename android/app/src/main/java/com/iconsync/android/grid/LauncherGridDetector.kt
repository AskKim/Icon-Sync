// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android.grid

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.edit
import androidx.core.net.toUri
import com.iconsync.android.model.DetectedLauncherGrid
import com.iconsync.android.model.GridDetectionSource
import com.iconsync.android.model.IconPlacement
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.Locale

@Serializable
data class CapturedShortcut(
    val label: String,
    val col: Int,
    val row: Int
)

@Serializable
data class StoredGridConfig(
    val userCols: Int? = null,
    val userRows: Int? = null,
    val accCols: Int? = null,
    val accRows: Int? = null,
    val preferUserGrid: Boolean = false,
    val capturedShortcuts: List<CapturedShortcut> = emptyList(),
    val lastCapturedAtMs: Long = 0L
)

data class LaunchableAppInfo(
    val packageName: String,
    val label: String
)

/**
 * Resolves the active Android launcher's home-screen grid dimensions (cols x rows).
 *
 * Tier 1: Query known launcher ContentProviders (Nova, Lawnchair) when permitted.
 * Tier 2: Read latest cached bounds from opt-in LauncherGridAccessibilityService (unless user explicitly locked a manual grid).
 * Tier 3: Fall back to user-reported custom grid stored in SharedPreferences.
 * Tier 4: OEM heuristic default (e.g. 4x5 for One UI Home / Pixel Launcher) with actionable setup instructions.
 */
class LauncherGridDetector(private val context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun detectActiveLauncherPackage(): String {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.resolveActivity(
                intent,
                PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong())
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.resolveActivity(
                intent,
                PackageManager.MATCH_DEFAULT_ONLY
            )
        }
        return resolved?.activityInfo?.packageName ?: "unknown.launcher"
    }

    fun getLauncherDisplayName(launcherPkg: String): String {
        if (launcherPkg == "unknown.launcher") return "Unknown Launcher"
        return runCatching {
            val appInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.getApplicationInfo(
                    launcherPkg,
                    PackageManager.ApplicationInfoFlags.of(0L)
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getApplicationInfo(launcherPkg, 0)
            }
            context.packageManager.getApplicationLabel(appInfo).toString().ifBlank { launcherPkg }
        }.getOrElse { launcherPkg }
    }

    fun detectGrid(): DetectedLauncherGrid {
        val launcherPkg = detectActiveLauncherPackage()
        val launcherName = getLauncherDisplayName(launcherPkg)
        val storedConfig = loadStoredConfig()

        val userCols = storedConfig.userCols
        val userRows = storedConfig.userRows
        if (storedConfig.preferUserGrid && userCols != null && userRows != null && userCols in 3..8 && userRows in 3..8) {
            return DetectedLauncherGrid(
                launcherPackage = launcherPkg,
                cols = userCols,
                rows = userRows,
                source = GridDetectionSource.USER_REPORTED,
                confidence = "manual",
                message = "Using calibrated ${userCols}x$userRows grid for $launcherName. Tap Auto-Detect to re-scan."
            )
        }

        // Tier 1: Query launcher provider if exposed (e.g., Nova / Lawnchair)
        queryLauncherProvider(launcherPkg)?.let { (cols, rows) ->
            return DetectedLauncherGrid(
                launcherPackage = launcherPkg,
                cols = cols.coerceIn(3, 8),
                rows = rows.coerceIn(3, 8),
                source = GridDetectionSource.LAUNCHER_PROVIDER,
                confidence = "verified",
                message = "Queried $launcherName ($launcherPkg) grid provider directly (${cols}x$rows)."
            )
        }

        // Tier 2: Check AccessibilityService workspace cache
        val accCols = storedConfig.accCols
        val accRows = storedConfig.accRows
        if (accCols != null && accRows != null && accCols in 3..8 && accRows in 3..8) {
            val capturedCount = storedConfig.capturedShortcuts.size
            val captureNote = if (capturedCount > 0) " ($capturedCount home icons captured)" else ""
            return DetectedLauncherGrid(
                launcherPackage = launcherPkg,
                cols = accCols,
                rows = accRows,
                source = GridDetectionSource.AUTO_ACCESSIBILITY,
                confidence = "verified",
                message = "Detected via Accessibility bounds on $launcherName (${accCols}x$accRows)$captureNote."
            )
        }

        // Tier 3: User-reported custom grid (required for private Mini/Minimalist launchers)
        if (userCols != null && userRows != null && userCols in 3..8 && userRows in 3..8) {
            return DetectedLauncherGrid(
                launcherPackage = launcherPkg,
                cols = userCols,
                rows = userRows,
                source = GridDetectionSource.USER_REPORTED,
                confidence = "manual",
                message = "Using user-reported grid configuration (${userCols}x$userRows)."
            )
        }

        // Tier 4: Safe default heuristic when launcher blocks introspection and user hasn't reported yet
        val (defaultCols, defaultRows) = defaultGridForLauncher(launcherPkg)
        return DetectedLauncherGrid(
            launcherPackage = launcherPkg,
            cols = defaultCols,
            rows = defaultRows,
            source = GridDetectionSource.FALLBACK_HEURISTIC,
            confidence = "estimated",
            message = "$launcherName does not expose a public grid provider. Enable Accessibility detection or pick your grid below."
        )
    }

    fun saveUserReportedGrid(cols: Int, rows: Int) {
        val current = loadStoredConfig()
        saveStoredConfig(
            current.copy(
                userCols = cols.coerceIn(3, 8),
                userRows = rows.coerceIn(3, 8),
                preferUserGrid = true
            )
        )
    }

    fun resetToAutoDetect() {
        val current = loadStoredConfig()
        saveStoredConfig(current.copy(preferUserGrid = false))
    }

    fun saveAccessibilityDetectedGrid(cols: Int, rows: Int) {
        saveAccessibilityCapture(cols, rows, loadStoredConfig().capturedShortcuts)
    }

    fun saveAccessibilityCapture(cols: Int, rows: Int, shortcuts: List<CapturedShortcut>) {
        val current = loadStoredConfig()
        val boundedCols = cols.coerceIn(3, 8)
        val boundedRows = rows.coerceIn(3, 8)
        val sanitizedShortcuts = shortcuts
            .filter { it.label.isNotBlank() && it.col in 0 until boundedCols && it.row in 0 until boundedRows }
            .distinctBy { Pair(it.col, it.row) }
            .take(boundedCols * boundedRows)

        saveStoredConfig(
            current.copy(
                accCols = boundedCols,
                accRows = boundedRows,
                capturedShortcuts = sanitizedShortcuts,
                lastCapturedAtMs = System.currentTimeMillis()
            )
        )
    }

    fun getCapturedShortcutCount(): Int = loadStoredConfig().capturedShortcuts.size

    fun getCapturedIcons(cols: Int, rows: Int): List<IconPlacement> {
        val shortcuts = loadStoredConfig().capturedShortcuts
        if (shortcuts.isEmpty()) return emptyList()

        val launchableApps = getInstalledLaunchableApps()
        val byLowerLabel = launchableApps.associateBy { it.label.trim().lowercase(Locale.ROOT) }

        val palette = listOf("#166534", "#1D4ED8", "#7C3AED", "#B45309", "#0F766E", "#BE123C")
        val seenSlots = mutableSetOf<Pair<Int, Int>>()
        val result = mutableListOf<IconPlacement>()

        shortcuts.forEachIndexed { idx, shortcut ->
            val col = shortcut.col.coerceIn(0, cols - 1)
            val row = shortcut.row.coerceIn(0, rows - 1)
            if (!seenSlots.add(Pair(col, row))) return@forEachIndexed

            val cleanLabel = shortcut.label.trim()
            val matchedApp = byLowerLabel[cleanLower(cleanLabel)]
                ?: launchableApps.firstOrNull {
                    it.label.equals(cleanLabel, ignoreCase = true) ||
                        cleanLabel.contains(it.label, ignoreCase = true)
                }

            val slug = cleanLabel.lowercase(Locale.ROOT)
                .replace(Regex("[^a-z0-9]+"), ".")
                .trim('.')
                .ifBlank { "item.$idx" }

            result += IconPlacement(
                id = "ic-cap-$idx",
                packageName = matchedApp?.packageName ?: "com.launcher.shortcut.$slug",
                label = matchedApp?.label ?: cleanLabel.take(40),
                col = col,
                row = row,
                isPlaceholder = matchedApp == null,
                iconKey = inferIconKey(cleanLabel),
                tint = palette[idx % palette.size],
                category = inferCategory(cleanLabel)
            )
        }
        return result
    }

    fun getInstalledLaunchableApps(): List<LaunchableAppInfo> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolveInfos = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.queryIntentActivities(
                intent,
                PackageManager.ResolveInfoFlags.of(0L)
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.queryIntentActivities(intent, 0)
        }

        val seenPackages = mutableSetOf<String>()
        val apps = mutableListOf<LaunchableAppInfo>()
        for (info in resolveInfos) {
            val pkg = info.activityInfo?.packageName ?: continue
            if (pkg == context.packageName || !seenPackages.add(pkg)) continue
            val label = info.loadLabel(context.packageManager)?.toString()?.trim().orEmpty()
                .ifBlank { pkg.substringAfterLast('.') }
            apps += LaunchableAppInfo(packageName = pkg, label = label)
        }
        return apps.sortedBy { it.label.lowercase(Locale.ROOT) }
    }

    fun getInstalledPackageSet(): Set<String> {
        val installed = mutableSetOf<String>()
        val packages = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getInstalledPackages(PackageManager.PackageInfoFlags.of(0L))
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getInstalledPackages(0)
        }
        for (pkgInfo in packages) {
            installed += pkgInfo.packageName
        }
        return installed
    }

    private fun defaultGridForLauncher(launcherPkg: String): Pair<Int, Int> {
        return when (launcherPkg) {
            "com.sec.android.app.launcher" -> Pair(4, 5)
            "com.google.android.apps.nexuslauncher" -> Pair(4, 5)
            "com.teslacoilsw.launcher" -> Pair(5, 5)
            "app.lawnchair" -> Pair(5, 5)
            else -> Pair(4, 5)
        }
    }

    private fun cleanLower(value: String): String =
        value.trim().lowercase(Locale.ROOT)

    private fun inferIconKey(label: String): String {
        val lower = label.lowercase(Locale.ROOT)
        return when {
            "camera" in lower -> "camera"
            "phone" in lower || "dial" in lower -> "phone"
            "message" in lower || "sms" in lower || "chat" in lower -> "message-square"
            "mail" in lower || "gmail" in lower -> "mail"
            "map" in lower || "nav" in lower -> "map-pin"
            "music" in lower || "spotify" in lower -> "music"
            "calendar" in lower -> "calendar"
            "clock" in lower || "alarm" in lower -> "clock"
            "setting" in lower -> "settings"
            "gallery" in lower || "photo" in lower -> "image"
            "chrome" in lower || "browser" in lower || "web" in lower -> "globe"
            else -> "smartphone"
        }
    }

    private fun inferCategory(label: String): String {
        val lower = label.lowercase(Locale.ROOT)
        return when {
            "phone" in lower || "message" in lower || "mail" in lower || "whatsapp" in lower -> "Communication"
            "camera" in lower || "photo" in lower || "gallery" in lower -> "Photography"
            "music" in lower || "youtube" in lower || "spotify" in lower || "video" in lower -> "Media"
            "map" in lower || "uber" in lower || "waze" in lower -> "Navigation"
            "calendar" in lower || "note" in lower || "docs" in lower || "drive" in lower -> "Productivity"
            "bank" in lower || "pay" in lower || "wallet" in lower -> "Finance"
            else -> "Utilities"
        }
    }

    private fun loadStoredConfig(): StoredGridConfig {
        val serialized = prefs.getString(KEY_STORED_GRID_CONFIG, null)
        if (!serialized.isNullOrBlank()) {
            val decoded = runCatching { json.decodeFromString<StoredGridConfig>(serialized) }.getOrNull()
            if (decoded != null) {
                return decoded
            }
        }

        val hasLegacyKeys = prefs.contains(KEY_USER_COLS) ||
            prefs.contains(KEY_USER_ROWS) ||
            prefs.contains(KEY_ACC_COLS) ||
            prefs.contains(KEY_ACC_ROWS)

        if (hasLegacyKeys) {
            val migrated = StoredGridConfig(
                userCols = prefs.getInt(KEY_USER_COLS, -1).takeIf { it in 3..8 },
                userRows = prefs.getInt(KEY_USER_ROWS, -1).takeIf { it in 3..8 },
                accCols = prefs.getInt(KEY_ACC_COLS, -1).takeIf { it in 3..8 },
                accRows = prefs.getInt(KEY_ACC_ROWS, -1).takeIf { it in 3..8 }
            )
            saveStoredConfig(migrated)
            return migrated
        }

        return StoredGridConfig()
    }

    private fun saveStoredConfig(config: StoredGridConfig) {
        prefs.edit {
            putString(KEY_STORED_GRID_CONFIG, json.encodeToString(config))
            remove(KEY_USER_COLS)
            remove(KEY_USER_ROWS)
            remove(KEY_ACC_COLS)
            remove(KEY_ACC_ROWS)
        }
    }

    private fun queryLauncherProvider(launcherPkg: String): Pair<Int, Int>? {
        val providerUri = when (launcherPkg) {
            "com.teslacoilsw.launcher" -> "content://com.teslacoilsw.launcher.settings/grid".toUri()
            "app.lawnchair" -> "content://app.lawnchair.settings/grid".toUri()
            else -> return null
        }

        return runCatching {
            context.contentResolver.query(providerUri, arrayOf("cols", "rows"), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val cols = cursor.getInt(0)
                        val rows = cursor.getInt(1)
                        if (cols in 3..8 && rows in 3..8) Pair(cols, rows) else null
                    } else {
                        null
                    }
                }
        }.getOrNull()
    }

    companion object {
        private const val PREFS_NAME = "icon_sync_grid_prefs"
        private const val KEY_STORED_GRID_CONFIG = "stored_grid_config"
        private const val KEY_USER_COLS = "user_grid_cols"
        private const val KEY_USER_ROWS = "user_grid_rows"
        private const val KEY_ACC_COLS = "acc_grid_cols"
        private const val KEY_ACC_ROWS = "acc_grid_rows"
    }
}
