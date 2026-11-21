package com.iconsync.android.grid

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import com.iconsync.android.model.DetectedLauncherGrid
import com.iconsync.android.model.GridDetectionSource

/**
 * Resolves the active Android launcher's home-screen grid dimensions (cols x rows).
 *
 * Tier 1: Query known launcher ContentProviders (Nova, Lawnchair, Pixel/Launcher3) when permitted.
 * Tier 2: Read latest cached bounds from opt-in LauncherGridAccessibilityService.
 * Tier 3: Fall back to user-reported custom grid stored in SharedPreferences (ideal for Mini/Minimalist launchers).
 */
class LauncherGridDetector(private val context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun detectActiveLauncherPackage(): String {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val resolved = context.packageManager.resolveActivity(
            intent,
            PackageManager.MATCH_DEFAULT_ONLY
        )
        return resolved?.activityInfo?.packageName ?: "unknown.launcher"
    }

    fun detectGrid(): DetectedLauncherGrid {
        val launcherPkg = detectActiveLauncherPackage()

        // Tier 1: Query launcher provider if exposed (e.g., Nova / Lawnchair)
        queryLauncherProvider(launcherPkg)?.let { (cols, rows) ->
            return DetectedLauncherGrid(
                launcherPackage = launcherPkg,
                cols = cols.coerceIn(3, 8),
                rows = rows.coerceIn(3, 8),
                source = GridDetectionSource.LAUNCHER_PROVIDER,
                confidence = "verified",
                message = "Queried $launcherPkg grid provider directly (${cols}x$rows)."
            )
        }

        // Tier 2: Check AccessibilityService workspace cache
        val accCols = prefs.getInt(KEY_ACC_COLS, -1)
        val accRows = prefs.getInt(KEY_ACC_ROWS, -1)
        if (accCols in 3..8 && accRows in 3..8) {
            return DetectedLauncherGrid(
                launcherPackage = launcherPkg,
                cols = accCols,
                rows = accRows,
                source = GridDetectionSource.AUTO_ACCESSIBILITY,
                confidence = "verified",
                message = "Detected via Accessibility workspace bounds (${accCols}x$accRows)."
            )
        }

        // Tier 3: User-reported custom grid (required for private Mini/Minimalist launchers)
        val userCols = prefs.getInt(KEY_USER_COLS, -1)
        val userRows = prefs.getInt(KEY_USER_ROWS, -1)
        if (userCols in 3..8 && userRows in 3..8) {
            return DetectedLauncherGrid(
                launcherPackage = launcherPkg,
                cols = userCols,
                rows = userRows,
                source = GridDetectionSource.USER_REPORTED,
                confidence = "manual",
                message = "Using user-reported grid configuration (${userCols}x$userRows)."
            )
        }

        // Safe default heuristic when launcher blocks introspection and user hasn't reported yet
        return DetectedLauncherGrid(
            launcherPackage = launcherPkg,
            cols = 4,
            rows = 5,
            source = GridDetectionSource.FALLBACK_HEURISTIC,
            confidence = "estimated",
            message = "$launcherPkg did not expose grid dimensions. Report your grid manually in Icon Sync."
        )
    }

    fun saveUserReportedGrid(cols: Int, rows: Int) {
        prefs.edit()
            .putInt(KEY_USER_COLS, cols.coerceIn(3, 8))
            .putInt(KEY_USER_ROWS, rows.coerceIn(3, 8))
            .apply()
    }

    fun saveAccessibilityDetectedGrid(cols: Int, rows: Int) {
        prefs.edit()
            .putInt(KEY_ACC_COLS, cols.coerceIn(3, 8))
            .putInt(KEY_ACC_ROWS, rows.coerceIn(3, 8))
            .apply()
    }

    private fun queryLauncherProvider(launcherPkg: String): Pair<Int, Int>? {
        val providerUri = when (launcherPkg) {
            "com.teslacoilsw.launcher" -> Uri.parse("content://com.teslacoilsw.launcher.settings/grid")
            "app.lawnchair" -> Uri.parse("content://app.lawnchair.settings/grid")
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
        private const val KEY_USER_COLS = "user_grid_cols"
        private const val KEY_USER_ROWS = "user_grid_rows"
        private const val KEY_ACC_COLS = "acc_grid_cols"
        private const val KEY_ACC_ROWS = "acc_grid_rows"
    }
}
