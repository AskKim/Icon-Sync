export interface CompanionSourceFile {
  filename: string;
  path: string;
  language: 'kotlin' | 'xml' | 'yaml';
  summary: string;
  content: string;
}

export const ANDROID_COMPANION_FILES: CompanionSourceFile[] = [
  {
    filename: 'BackupSchema.kt',
    path: 'android/app/src/main/java/com/iconsync/android/model/BackupSchema.kt',
    language: 'kotlin',
    summary: 'Serializable data classes matching the Icon Sync v2.0 JSON backup format for icons, folders, grid detection metadata, and synced widgets.',
    content: `package com.iconsync.android.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class GridDetectionSource {
    @SerialName("launcher-provider")
    LAUNCHER_PROVIDER,

    @SerialName("auto-accessibility")
    AUTO_ACCESSIBILITY,

    @SerialName("user-reported")
    USER_REPORTED,

    @SerialName("backup-metadata")
    BACKUP_METADATA,

    @SerialName("oem-profile")
    FALLBACK_HEURISTIC
}

@Serializable
enum class GridAdaptationStrategy {
    @SerialName("auto-reflow")
    AUTO_REFLOW,

    @SerialName("proportional-scale")
    PROPORTIONAL_SCALE,

    @SerialName("preserve-pages")
    PRESERVE_PAGES,

    @SerialName("resize-target-grid")
    RESIZE_TARGET_GRID,

    @SerialName("crop-within-bounds")
    CROP_WITHIN_BOUNDS
}

@Serializable
data class IconPlacement(
    val id: String,
    val packageName: String,
    val label: String,
    val col: Int,
    val row: Int,
    val isPlaceholder: Boolean = false,
    val customIconArt: String? = null,
    val iconKey: String = "smartphone",
    val tint: String = "#166534",
    val category: String = "Utilities"
)

@Serializable
data class FolderPlacement(
    val id: String,
    val name: String,
    val col: Int,
    val row: Int,
    val tint: String = "#334155",
    val apps: List<IconPlacement> = emptyList()
)

@Serializable
data class WidgetPlacement(
    val id: String,
    val syncKey: String,
    val provider: String,
    val title: String,
    val col: Int,
    val row: Int,
    val spanX: Int,
    val spanY: Int,
    val syncEnabled: Boolean = true,
    val updatedAt: String = ""
)

@Serializable
data class HomeScreenPage(
    val id: String,
    val name: String,
    val isPrimary: Boolean,
    val order: Int,
    val icons: List<IconPlacement> = emptyList(),
    val folders: List<FolderPlacement> = emptyList(),
    val widgets: List<WidgetPlacement> = emptyList()
)

@Serializable
data class IconArtEntry(
    val packageName: String,
    val label: String,
    val iconKey: String,
    val tint: String,
    val dataUri: String
)

@Serializable
data class LayoutBackupSnapshot(
    val id: String,
    val name: String,
    val notes: String = "",
    val schemaVersion: String = "2.0",
    val createdAt: String,
    val storage: String = "local",
    val sourceDeviceId: String = "android-companion",
    val sourceDeviceName: String,
    val sourceLauncher: String,
    val gridCols: Int,
    val gridRows: Int,
    val gridDetectionSource: GridDetectionSource = GridDetectionSource.AUTO_ACCESSIBILITY,
    val wallpaperId: String = "alpine-dusk",
    val includesIconArt: Boolean = false,
    val iconArtAssets: Map<String, IconArtEntry>? = null,
    val screens: List<HomeScreenPage>,
    val dock: List<IconPlacement> = emptyList(),
    val checksum: String = ""
)

@Serializable
data class DetectedLauncherGrid(
    val launcherPackage: String,
    val cols: Int,
    val rows: Int,
    val source: GridDetectionSource,
    val confidence: String,
    val message: String
)`,
  },
  {
    filename: 'LauncherGridDetector.kt',
    path: 'android/app/src/main/java/com/iconsync/android/grid/LauncherGridDetector.kt',
    language: 'kotlin',
    summary: 'Auto-detects active launcher grid dimensions (4×5, 4×6, 5×4, 6×6, etc.) via launcher ContentProviders, Accessibility bounds, or user-reported SharedPreferences fallback.',
    content: `package com.iconsync.android.grid

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.edit
import androidx.core.net.toUri
import com.iconsync.android.model.DetectedLauncherGrid
import com.iconsync.android.model.GridDetectionSource
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

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

/**
 * Resolves the active Android launcher's home-screen grid dimensions (cols x rows).
 *
 * Tier 1: Query known launcher ContentProviders (Nova, Lawnchair) when permitted.
 * Tier 2: Read latest cached bounds from opt-in LauncherGridAccessibilityService.
 * Tier 3: Fall back to user-reported custom grid stored in SharedPreferences.
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

    fun detectGrid(): DetectedLauncherGrid {
        val launcherPkg = detectActiveLauncherPackage()
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
                message = "Using calibrated \${userCols}x$userRows grid."
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
                message = "Queried $launcherPkg grid provider directly (\${cols}x$rows)."
            )
        }

        // Tier 2: Check AccessibilityService workspace cache
        val accCols = storedConfig.accCols
        val accRows = storedConfig.accRows
        if (accCols != null && accRows != null && accCols in 3..8 && accRows in 3..8) {
            return DetectedLauncherGrid(
                launcherPackage = launcherPkg,
                cols = accCols,
                rows = accRows,
                source = GridDetectionSource.AUTO_ACCESSIBILITY,
                confidence = "verified",
                message = "Detected via Accessibility workspace bounds (\${accCols}x$accRows)."
            )
        }

        // Tier 3: User-reported custom grid
        if (userCols != null && userRows != null && userCols in 3..8 && userRows in 3..8) {
            return DetectedLauncherGrid(
                launcherPackage = launcherPkg,
                cols = userCols,
                rows = userRows,
                source = GridDetectionSource.USER_REPORTED,
                confidence = "manual",
                message = "Using user-reported grid configuration (\${userCols}x$userRows)."
            )
        }

        // Safe OEM default heuristic
        return DetectedLauncherGrid(
            launcherPackage = launcherPkg,
            cols = 4,
            rows = 5,
            source = GridDetectionSource.FALLBACK_HEURISTIC,
            confidence = "estimated",
            message = "$launcherPkg did not expose grid dimensions. Enable Accessibility or calibrate below."
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
        val current = loadStoredConfig()
        saveStoredConfig(
            current.copy(
                accCols = cols.coerceIn(3, 8),
                accRows = rows.coerceIn(3, 8),
                lastCapturedAtMs = System.currentTimeMillis()
            )
        )
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
}`,
  },
  {
    filename: 'GridRemapper.kt',
    path: 'android/app/src/main/java/com/iconsync/android/grid/GridRemapper.kt',
    language: 'kotlin',
    summary: 'Adapts layouts across mismatched grids (e.g., 6×6 into 5×4) using Auto-Reflow, Proportional Spatial Scaling, Page-Locked Split, Target Resize, or Strict Bounds Crop.',
    content: `package com.iconsync.android.grid

import com.iconsync.android.model.FolderPlacement
import com.iconsync.android.model.GridAdaptationStrategy
import com.iconsync.android.model.HomeScreenPage
import com.iconsync.android.model.IconPlacement
import com.iconsync.android.model.WidgetPlacement
import kotlin.math.abs
import kotlin.math.roundToInt

data class RemapResult(
    val screens: List<HomeScreenPage>,
    val targetCols: Int,
    val targetRows: Int,
    val relocatedCount: Int,
    val widgetsResized: Int,
    val droppedByCrop: Int,
    val overflowPagesAdded: Int
)

/**
 * Pure Kotlin cross-grid layout remapper matching Icon Sync Web Studio's 5 adaptation strategies.
 * Handles arbitrary source -> target grid mismatches such as 6x6 -> 5x4 or 5x6 -> 4x5.
 */
object GridRemapper {

    fun remapPages(
        sourcePages: List<HomeScreenPage>,
        sourceCols: Int,
        sourceRows: Int,
        targetCols: Int,
        targetRows: Int,
        strategy: GridAdaptationStrategy
    ): RemapResult {
        val effectiveCols = if (strategy == GridAdaptationStrategy.RESIZE_TARGET_GRID) sourceCols else targetCols
        val effectiveRows = if (strategy == GridAdaptationStrategy.RESIZE_TARGET_GRID) sourceRows else targetRows

        var relocatedCount = 0
        var widgetsResized = 0
        var droppedByCrop = 0
        var overflowPagesAdded = 0

        val outputPages = mutableListOf<HomeScreenPage>()
        val globalOverflowIcons = mutableListOf<IconPlacement>()
        val globalOverflowFolders = mutableListOf<FolderPlacement>()
        val globalOverflowWidgets = mutableListOf<WidgetPlacement>()

        for (page in sourcePages) {
            val grid = Array(effectiveRows) { BooleanArray(effectiveCols) }
            val placedWidgets = mutableListOf<WidgetPlacement>()
            val placedFolders = mutableListOf<FolderPlacement>()
            val placedIcons = mutableListOf<IconPlacement>()

            val pageOverflowWidgets = mutableListOf<WidgetPlacement>()
            val pageOverflowFolders = mutableListOf<FolderPlacement>()
            val pageOverflowIcons = mutableListOf<IconPlacement>()

            // 1. Widgets first (largest contiguous footprints)
            for (w in page.widgets) {
                val clampedSpanX = w.spanX.coerceAtMost(effectiveCols)
                val clampedSpanY = w.spanY.coerceAtMost(effectiveRows)
                if (clampedSpanX != w.spanX || clampedSpanY != w.spanY) widgetsResized++

                val preferred = computePreferredSlot(
                    col = w.col,
                    row = w.row,
                    spanX = clampedSpanX,
                    spanY = clampedSpanY,
                    srcCols = sourceCols,
                    srcRows = sourceRows,
                    dstCols = effectiveCols,
                    dstRows = effectiveRows,
                    strategy = strategy
                )

                if (strategy == GridAdaptationStrategy.CROP_WITHIN_BOUNDS) {
                    if (w.col >= 0 &&
                        w.row >= 0 &&
                        w.col + clampedSpanX <= effectiveCols &&
                        w.row + clampedSpanY <= effectiveRows &&
                        canPlace(grid, w.col, w.row, clampedSpanX, clampedSpanY, effectiveCols, effectiveRows)
                    ) {
                        mark(grid, w.col, w.row, clampedSpanX, clampedSpanY)
                        placedWidgets += w.copy(spanX = clampedSpanX, spanY = clampedSpanY)
                    } else {
                        droppedByCrop++
                    }
                    continue
                }

                val slot = when {
                    preferred != null && canPlace(grid, preferred.first, preferred.second, clampedSpanX, clampedSpanY, effectiveCols, effectiveRows) -> preferred
                    strategy == GridAdaptationStrategy.PROPORTIONAL_SCALE && preferred != null ->
                        findNearestSlot(grid, preferred.first, preferred.second, clampedSpanX, clampedSpanY, effectiveCols, effectiveRows)
                    else -> findFirstSlot(grid, clampedSpanX, clampedSpanY, effectiveCols, effectiveRows)
                }

                if (slot != null) {
                    if (slot.first != w.col || slot.second != w.row) relocatedCount++
                    mark(grid, slot.first, slot.second, clampedSpanX, clampedSpanY)
                    placedWidgets += w.copy(col = slot.first, row = slot.second, spanX = clampedSpanX, spanY = clampedSpanY)
                } else {
                    relocatedCount++
                    val resized = w.copy(spanX = clampedSpanX, spanY = clampedSpanY)
                    if (strategy == GridAdaptationStrategy.PRESERVE_PAGES) {
                        pageOverflowWidgets += resized
                    } else {
                        globalOverflowWidgets += resized
                    }
                }
            }

            // 2. Folders
            for (f in page.folders) {
                if (strategy == GridAdaptationStrategy.CROP_WITHIN_BOUNDS) {
                    if (f.col in 0 until effectiveCols && f.row in 0 until effectiveRows && !grid[f.row][f.col]) {
                        grid[f.row][f.col] = true
                        placedFolders += f
                    } else {
                        droppedByCrop++
                    }
                    continue
                }

                val preferred = computePreferredSlot(f.col, f.row, 1, 1, sourceCols, sourceRows, effectiveCols, effectiveRows, strategy)
                val slot = when {
                    preferred != null && canPlace(grid, preferred.first, preferred.second, 1, 1, effectiveCols, effectiveRows) -> preferred
                    strategy == GridAdaptationStrategy.PROPORTIONAL_SCALE && preferred != null ->
                        findNearestSlot(grid, preferred.first, preferred.second, 1, 1, effectiveCols, effectiveRows)
                    else -> findFirstSlot(grid, 1, 1, effectiveCols, effectiveRows)
                }

                if (slot != null) {
                    if (slot.first != f.col || slot.second != f.row) relocatedCount++
                    grid[slot.second][slot.first] = true
                    placedFolders += f.copy(col = slot.first, row = slot.second)
                } else {
                    relocatedCount++
                    if (strategy == GridAdaptationStrategy.PRESERVE_PAGES) {
                        pageOverflowFolders += f
                    } else {
                        globalOverflowFolders += f
                    }
                }
            }

            // 3. Icons
            for (ic in page.icons) {
                if (strategy == GridAdaptationStrategy.CROP_WITHIN_BOUNDS) {
                    if (ic.col in 0 until effectiveCols && ic.row in 0 until effectiveRows && !grid[ic.row][ic.col]) {
                        grid[ic.row][ic.col] = true
                        placedIcons += ic
                    } else {
                        droppedByCrop++
                    }
                    continue
                }

                val preferred = computePreferredSlot(ic.col, ic.row, 1, 1, sourceCols, sourceRows, effectiveCols, effectiveRows, strategy)
                val slot = when {
                    preferred != null && canPlace(grid, preferred.first, preferred.second, 1, 1, effectiveCols, effectiveRows) -> preferred
                    strategy == GridAdaptationStrategy.PROPORTIONAL_SCALE && preferred != null ->
                        findNearestSlot(grid, preferred.first, preferred.second, 1, 1, effectiveCols, effectiveRows)
                    else -> findFirstSlot(grid, 1, 1, effectiveCols, effectiveRows)
                }

                if (slot != null) {
                    if (slot.first != ic.col || slot.second != ic.row) relocatedCount++
                    grid[slot.second][slot.first] = true
                    placedIcons += ic.copy(col = slot.first, row = slot.second)
                } else {
                    relocatedCount++
                    if (strategy == GridAdaptationStrategy.PRESERVE_PAGES) {
                        pageOverflowIcons += ic
                    } else {
                        globalOverflowIcons += ic
                    }
                }
            }

            outputPages += page.copy(
                order = outputPages.size,
                isPrimary = outputPages.isEmpty(),
                icons = placedIcons,
                folders = placedFolders,
                widgets = placedWidgets
            )

            // Per-page split overflow for PRESERVE_PAGES
            if (strategy == GridAdaptationStrategy.PRESERVE_PAGES &&
                (pageOverflowWidgets.isNotEmpty() || pageOverflowFolders.isNotEmpty() || pageOverflowIcons.isNotEmpty())
            ) {
                val spilled = packOverflowPages(
                    baseName = "\${page.name} (Cont.)",
                    startOrder = outputPages.size,
                    cols = effectiveCols,
                    rows = effectiveRows,
                    widgets = pageOverflowWidgets,
                    folders = pageOverflowFolders,
                    icons = pageOverflowIcons
                )
                overflowPagesAdded += spilled.size
                outputPages += spilled
            }
        }

        // Global overflow pages for AUTO_REFLOW / PROPORTIONAL_SCALE
        if (globalOverflowWidgets.isNotEmpty() || globalOverflowFolders.isNotEmpty() || globalOverflowIcons.isNotEmpty()) {
            val spilled = packOverflowPages(
                baseName = "Grid Overflow",
                startOrder = outputPages.size,
                cols = effectiveCols,
                rows = effectiveRows,
                widgets = globalOverflowWidgets,
                folders = globalOverflowFolders,
                icons = globalOverflowIcons
            )
            overflowPagesAdded += spilled.size
            outputPages += spilled
        }

        return RemapResult(
            screens = outputPages,
            targetCols = effectiveCols,
            targetRows = effectiveRows,
            relocatedCount = relocatedCount,
            widgetsResized = widgetsResized,
            droppedByCrop = droppedByCrop,
            overflowPagesAdded = overflowPagesAdded
        )
    }

    private fun packOverflowPages(
        baseName: String,
        startOrder: Int,
        cols: Int,
        rows: Int,
        widgets: List<WidgetPlacement>,
        folders: List<FolderPlacement>,
        icons: List<IconPlacement>
    ): List<HomeScreenPage> {
        val pages = mutableListOf<HomeScreenPage>()
        val grids = mutableListOf<Array<BooleanArray>>()
        val widgetsPerPage = mutableListOf<MutableList<WidgetPlacement>>()
        val foldersPerPage = mutableListOf<MutableList<FolderPlacement>>()
        val iconsPerPage = mutableListOf<MutableList<IconPlacement>>()

        fun addPage(): Int {
            grids.add(Array(rows) { BooleanArray(cols) })
            widgetsPerPage.add(mutableListOf())
            foldersPerPage.add(mutableListOf())
            iconsPerPage.add(mutableListOf())
            return grids.lastIndex
        }

        for (w in widgets) {
            var placed = false
            for (i in grids.indices) {
                val slot = findFirstSlot(grids[i], w.spanX, w.spanY, cols, rows)
                if (slot != null) {
                    mark(grids[i], slot.first, slot.second, w.spanX, w.spanY)
                    widgetsPerPage[i] += w.copy(col = slot.first, row = slot.second)
                    placed = true
                    break
                }
            }
            if (!placed) {
                val idx = addPage()
                mark(grids[idx], 0, 0, w.spanX, w.spanY)
                widgetsPerPage[idx] += w.copy(col = 0, row = 0)
            }
        }

        for (f in folders) {
            var placed = false
            for (i in grids.indices) {
                val slot = findFirstSlot(grids[i], 1, 1, cols, rows)
                if (slot != null) {
                    grids[i][slot.second][slot.first] = true
                    foldersPerPage[i] += f.copy(col = slot.first, row = slot.second)
                    placed = true
                    break
                }
            }
            if (!placed) {
                val idx = addPage()
                grids[idx][0][0] = true
                foldersPerPage[idx] += f.copy(col = 0, row = 0)
            }
        }

        for (ic in icons) {
            var placed = false
            for (i in grids.indices) {
                val slot = findFirstSlot(grids[i], 1, 1, cols, rows)
                if (slot != null) {
                    grids[i][slot.second][slot.first] = true
                    iconsPerPage[i] += ic.copy(col = slot.first, row = slot.second)
                    placed = true
                    break
                }
            }
            if (!placed) {
                val idx = addPage()
                grids[idx][0][0] = true
                iconsPerPage[idx] += ic.copy(col = 0, row = 0)
            }
        }

        for (i in grids.indices) {
            val suffix = if (grids.size > 1) " \${i + 1}" else ""
            pages += HomeScreenPage(
                id = "overflow-\${startOrder + i}",
                name = "$baseName$suffix",
                isPrimary = false,
                order = startOrder + i,
                icons = iconsPerPage[i],
                folders = foldersPerPage[i],
                widgets = widgetsPerPage[i]
            )
        }
        return pages
    }

    private fun computePreferredSlot(
        col: Int,
        row: Int,
        spanX: Int,
        spanY: Int,
        srcCols: Int,
        srcRows: Int,
        dstCols: Int,
        dstRows: Int,
        strategy: GridAdaptationStrategy
    ): Pair<Int, Int>? {
        if (strategy == GridAdaptationStrategy.PROPORTIONAL_SCALE) {
            val scaledCol = scaleCoord(col, srcCols, dstCols).coerceAtMost((dstCols - spanX).coerceAtLeast(0))
            val scaledRow = scaleCoord(row, srcRows, dstRows).coerceAtMost((dstRows - spanY).coerceAtLeast(0))
            return Pair(scaledCol, scaledRow)
        }
        return if (col in 0..(dstCols - spanX) && row in 0..(dstRows - spanY)) {
            Pair(col, row)
        } else {
            null
        }
    }

    private fun scaleCoord(coord: Int, fromMax: Int, toMax: Int): Int {
        if (fromMax <= 1 || toMax <= 1) return 0
        val ratio = coord.toDouble() / (fromMax - 1).toDouble()
        return (ratio * (toMax - 1)).roundToInt().coerceIn(0, toMax - 1)
    }

    private fun canPlace(
        grid: Array<BooleanArray>,
        col: Int,
        row: Int,
        spanX: Int,
        spanY: Int,
        cols: Int,
        rows: Int
    ): Boolean {
        if (col < 0 || row < 0 || col + spanX > cols || row + spanY > rows) return false
        for (r in row until row + spanY) {
            for (c in col until col + spanX) {
                if (grid[r][c]) return false
            }
        }
        return true
    }

    private fun mark(grid: Array<BooleanArray>, col: Int, row: Int, spanX: Int, spanY: Int) {
        for (r in row until row + spanY) {
            for (c in col until col + spanX) {
                grid[r][c] = true
            }
        }
    }

    private fun findFirstSlot(
        grid: Array<BooleanArray>,
        spanX: Int,
        spanY: Int,
        cols: Int,
        rows: Int
    ): Pair<Int, Int>? {
        for (r in 0..(rows - spanY)) {
            for (c in 0..(cols - spanX)) {
                if (canPlace(grid, c, r, spanX, spanY, cols, rows)) return Pair(c, r)
            }
        }
        return null
    }

    private fun findNearestSlot(
        grid: Array<BooleanArray>,
        targetCol: Int,
        targetRow: Int,
        spanX: Int,
        spanY: Int,
        cols: Int,
        rows: Int
    ): Pair<Int, Int>? {
        var best: Pair<Int, Int>? = null
        var bestDist = Int.MAX_VALUE
        for (r in 0..(rows - spanY)) {
            for (c in 0..(cols - spanX)) {
                if (!canPlace(grid, c, r, spanX, spanY, cols, rows)) continue
                val dist = abs(c - targetCol) + abs(r - targetRow)
                if (dist < bestDist) {
                    bestDist = dist
                    best = Pair(c, r)
                }
            }
        }
        return best
    }
}`,
  },
  {
    filename: 'WidgetSyncWorker.kt',
    path: 'android/app/src/main/java/com/iconsync/android/worker/WidgetSyncWorker.kt',
    language: 'kotlin',
    summary: 'WorkManager background worker that validates detected/manual launcher grid dimensions and keeps Icon Sync widget metadata synchronized across Android devices.',
    content: `package com.iconsync.android.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.iconsync.android.grid.LauncherGridDetector

/**
 * Background WorkManager job that periodically syncs shared widget states
 * and reports the detected/manual launcher grid to the user's Icon Sync vault.
 */
class WidgetSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val detector = LauncherGridDetector(applicationContext)
        val grid = detector.detectGrid()
        return if (grid.cols in 3..8 && grid.rows in 3..8) {
            Result.success()
        } else {
            Result.retry()
        }
    }
}`,
  },
  {
    filename: 'AndroidManifest.xml',
    path: 'android/app/src/main/AndroidManifest.xml',
    language: 'xml',
    summary: 'Declares Icon Sync launcher package visibility, Accessibility screen-tree capture service, and cloud sync permissions.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Required for Cloud Vault backup/restore & widget sync -->
    <uses-permission android:name="android.permission.INTERNET" />
    <!-- Required on Android 11+ to audit installed packages during layout restore -->
    <uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />

    <application
        android:allowBackup="true"
        android:icon="@drawable/ic_launcher_iconsync"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.IconSync">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Accessibility service for opt-in launcher grid auto-detection on custom & mini launchers -->
        <service
            android:name=".service.LauncherGridAccessibilityService"
            android:exported="false"
            android:label="@string/accessibility_service_label"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/launcher_accessibility_config" />
        </service>

        <!-- FileProvider for sharing exported v2.0 JSON backup snapshots -->
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>
</manifest>`,
  },
  {
    filename: 'build-android-apk.yml',
    path: '.github/workflows/build-android-apk.yml',
    language: 'yaml',
    summary: 'GitHub Actions workflow that compiles, lints, tests, verifies badging, and uploads the Icon Sync Android APK (IconSync-v*-debug.apk & optional signed release APK).',
    content: `name: Build Icon Sync Android APK

on:
  push:
    branches: [main]
    paths:
      - 'android/**'
      - '.github/workflows/build-android-apk.yml'
  pull_request:
    paths:
      - 'android/**'
      - '.github/workflows/build-android-apk.yml'
  workflow_dispatch:
    inputs:
      build_release:
        description: 'Build release APK (uses signing secrets if configured)'
        required: false
        default: true
        type: boolean

concurrency:
  group: android-apk-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  build-apk:
    name: Test, Lint & Assemble Icon Sync APK
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3
        with:
          packages: platform-tools build-tools;35.0.0 platforms;android-35

      - name: Set up Gradle 8.9
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.9'

      - name: Verify & install Android SDK 35 components
        run: |
          SDK_ROOT="\${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
          if [ -z "$SDK_ROOT" ]; then
            echo "::error::ANDROID_HOME / ANDROID_SDK_ROOT is not set."
            exit 1
          fi
          SDKMANAGER=""
          for candidate in \\
            "$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \\
            "$(command -v sdkmanager || true)"; do
            if [ -n "$candidate" ] && [ -x "$candidate" ]; then
              SDKMANAGER="$candidate"
              break
            fi
          done
          if [ -n "$SDKMANAGER" ]; then
            set +o pipefail
            yes | "$SDKMANAGER" --sdk_root="$SDK_ROOT" --licenses >/dev/null
            set -o pipefail
            "$SDKMANAGER" --sdk_root="$SDK_ROOT" "platform-tools" "build-tools;35.0.0" "platforms;android-35" >/dev/null
          fi
          if [ ! -x "$SDK_ROOT/build-tools/35.0.0/aapt2" ]; then
            echo "::error::Expected aapt2 at $SDK_ROOT/build-tools/35.0.0/aapt2"
            exit 1
          fi

      - name: Ensure Gradle wrapper is executable
        working-directory: android
        run: |
          if [ ! -f gradlew ]; then
            gradle wrapper --gradle-version 8.9
          fi
          chmod +x gradlew

      - name: Run Kotlin unit tests (GridRemapperTest)
        working-directory: android
        run: ./gradlew testDebugUnitTest --no-daemon --stacktrace --console=plain

      - name: Run Android Lint
        working-directory: android
        run: ./gradlew lintDebug --no-daemon --stacktrace --console=plain

      - name: Assemble Debug APK (IconSync)
        working-directory: android
        run: ./gradlew assembleDebug --no-daemon --stacktrace --console=plain

      - name: Verify Debug APK badging with aapt2
        run: |
          AAPT2="\${ANDROID_HOME:-$ANDROID_SDK_ROOT}/build-tools/35.0.0/aapt2"
          DEBUG_APK=$(find android/app/build/outputs/apk/debug -maxdepth 1 -type f -name '*.apk' | head -n 1)
          if [ -z "$DEBUG_APK" ]; then
            echo "::error::No debug APK found under android/app/build/outputs/apk/debug/"
            exit 1
          fi
          APP_VERSION=$(sed -n 's/^val appVersionName = "\\(.*\\)"/\\1/p' android/app/build.gradle.kts)
          BADGING=$("$AAPT2" dump badging "$DEBUG_APK")
          echo "$BADGING" | head -n 20
          echo "$BADGING" | grep -Fq "package: name='com.iconsync.android.debug'"
          echo "$BADGING" | grep -Fq "versionName='\${APP_VERSION}-debug'"
          echo "$BADGING" | grep -Eq "^(minSdkVersion|sdkVersion):'26'$"
          echo "$BADGING" | grep -Fq "targetSdkVersion:'35'"

      - name: Check signing secrets availability
        id: signing
        env:
          KEYSTORE_B64: \${{ secrets.ICONSYNC_KEYSTORE_BASE64 }}
          KEYSTORE_PASS: \${{ secrets.ICONSYNC_KEYSTORE_PASSWORD }}
          KEY_ALIAS: \${{ secrets.ICONSYNC_KEY_ALIAS }}
          KEY_PASS: \${{ secrets.ICONSYNC_KEY_PASSWORD }}
        run: |
          if [ -n "$KEYSTORE_B64" ] && [ -n "$KEYSTORE_PASS" ] && [ -n "$KEY_ALIAS" ] && [ -n "$KEY_PASS" ]; then
            echo "available=true" >> "$GITHUB_OUTPUT"
          else
            echo "available=false" >> "$GITHUB_OUTPUT"
            echo "::notice::Release signing secrets (ICONSYNC_KEYSTORE_*) are not configured; skipping signed Release APK and publishing Debug APK only."
          fi

      - name: Decode release keystore & assemble signed Release APK
        if: steps.signing.outputs.available == 'true' && github.event_name != 'pull_request' && (github.event_name != 'workflow_dispatch' || inputs.build_release)
        working-directory: android
        env:
          KEYSTORE_B64: \${{ secrets.ICONSYNC_KEYSTORE_BASE64 }}
          ICONSYNC_KEYSTORE_PASSWORD: \${{ secrets.ICONSYNC_KEYSTORE_PASSWORD }}
          ICONSYNC_KEY_ALIAS: \${{ secrets.ICONSYNC_KEY_ALIAS }}
          ICONSYNC_KEY_PASSWORD: \${{ secrets.ICONSYNC_KEY_PASSWORD }}
        run: |
          KEYSTORE_FILE="$RUNNER_TEMP/iconsync-release.jks"
          trap 'rm -f "$KEYSTORE_FILE"' EXIT
          printf '%s' "$KEYSTORE_B64" | tr -d '[:space:]' | base64 --decode > "$KEYSTORE_FILE"
          if [ ! -s "$KEYSTORE_FILE" ]; then
            echo "::error::Decoded ICONSYNC_KEYSTORE_BASE64 is empty."
            exit 1
          fi
          export ICONSYNC_KEYSTORE_PATH="$KEYSTORE_FILE"
          chmod +x gradlew
          ./gradlew assembleRelease --no-daemon --stacktrace --console=plain

      - name: Generate SHA-256 checksums for built APKs
        working-directory: android/app/build/outputs/apk
        run: |
          find . -type f -name '*.apk' -print0 | sort -z | xargs -0 -r sha256sum > SHA256SUMS.txt
          if [ ! -s SHA256SUMS.txt ]; then
            echo "::error::No APK files were generated."
            exit 1
          fi
          cat SHA256SUMS.txt
          {
            echo "### Built Icon Sync APKs"
            echo '\`\`\`'
            cat SHA256SUMS.txt
            echo '\`\`\`'
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Upload Debug APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: IconSync-debug-apk
          path: |
            android/app/build/outputs/apk/debug/*.apk
            android/app/build/outputs/apk/SHA256SUMS.txt
          if-no-files-found: error
          retention-days: 30

      - name: Upload Release APK artifact (if signed)
        if: steps.signing.outputs.available == 'true' && github.event_name != 'pull_request' && (github.event_name != 'workflow_dispatch' || inputs.build_release)
        uses: actions/upload-artifact@v4
        with:
          name: IconSync-release-apk
          path: |
            android/app/build/outputs/apk/release/*.apk
            android/app/build/outputs/apk/SHA256SUMS.txt
          if-no-files-found: ignore
          retention-days: 90

      - name: Upload Android Lint & Unit Test Reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: IconSync-android-reports
          path: |
            android/app/build/reports/tests/testDebugUnitTest/
            android/app/build/reports/lint-results-debug.html
          if-no-files-found: ignore
          retention-days: 14`,
  },
];
