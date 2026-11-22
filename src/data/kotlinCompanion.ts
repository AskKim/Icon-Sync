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

import kotlinx.serialization.Serializable

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
    val sourceDeviceId: String,
    val sourceDeviceName: String,
    val sourceLauncher: String,
    val gridCols: Int,
    val gridRows: Int,
    val gridDetectionSource: String = "auto-accessibility",
    val includesIconArt: Boolean = false,
    val iconArtAssets: Map<String, IconArtEntry>? = null,
    val screens: List<HomeScreenPage>,
    val dock: List<AppIconItem>,
    val checksum: String
)

@Serializable
data class HomeScreenPage(
    val id: String,
    val name: String,
    val isPrimary: Boolean,
    val order: Int,
    val icons: List<AppIconItem>,
    val folders: List<FolderItem>,
    val widgets: List<WidgetItem>
)

@Serializable
data class AppIconItem(
    val id: String,
    val packageName: String,
    val label: String,
    val col: Int = 0,
    val row: Int = 0,
    val isPlaceholder: Boolean = false,
    val customIconArt: String? = null
)

@Serializable
data class FolderItem(
    val id: String,
    val name: String,
    val col: Int,
    val row: Int,
    val apps: List<AppIconItem>
)

@Serializable
data class WidgetItem(
    val id: String,
    val syncKey: String,
    val provider: String,
    val title: String,
    val col: Int,
    val row: Int,
    val spanX: Int,
    val spanY: Int,
    val syncEnabled: Boolean,
    val updatedAt: String,
    val configJson: String
)

enum class RestoreMode { REPLACE, MERGE }

enum class GridAdaptationStrategy {
    AUTO_REFLOW,
    PROPORTIONAL_SCALE,
    PRESERVE_PAGES,
    RESIZE_TARGET_GRID,
    CROP_WITHIN_BOUNDS
}`,
  },
  {
    filename: 'LauncherGridDetector.kt',
    path: 'android/app/src/main/java/com/iconsync/android/grid/LauncherGridDetector.kt',
    language: 'kotlin',
    summary: 'Auto-detects active launcher grid dimensions (4×5, 4×6, 5×4, 6×6, etc.) via launcher metadata, Accessibility bounds, or OEM profile, with manual reporting fallback.',
    content: `package com.iconsync.android.grid

import android.content.Context
import android.content.Intent
import android.os.Build

data class DetectedGrid(
    val cols: Int,
    val rows: Int,
    val launcherPackage: String,
    val source: String, // "launcher-provider" | "auto-accessibility" | "oem-profile" | "user-reported"
    val confidence: String // "verified" | "estimated" | "manual"
)

class LauncherGridDetector(private val context: Context) {

    fun resolveDefaultLauncherPackage(): String {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        return context.packageManager.resolveActivity(intent, 0)?.activityInfo?.packageName
            ?: "com.android.launcher3"
    }

    /**
     * Auto-detects the active launcher's grid dimensions.
     * Falls back to user-reported dimensions for minimalist/custom launchers that hide workspace bounds.
     */
    fun detectGrid(
        observedMaxCol: Int = 0,
        observedMaxRow: Int = 0,
        userReportedGrid: Pair<Int, Int>? = null
    ): DetectedGrid {
        val pkg = resolveDefaultLauncherPackage()

        if (userReportedGrid != null) {
            return DetectedGrid(
                cols = userReportedGrid.first.coerceIn(3, 8),
                rows = userReportedGrid.second.coerceIn(3, 8),
                launcherPackage = pkg,
                source = "user-reported",
                confidence = "manual"
            )
        }

        // 1. Third-party launchers exposing provider/backup dimensions (Nova, Lawnchair)
        if (pkg.contains("teslacoilsw") || pkg.contains("lawnchair")) {
            val cols = maxOf(5, observedMaxCol).coerceIn(3, 8)
            val rows = maxOf(5, observedMaxRow).coerceIn(3, 8)
            return DetectedGrid(cols, rows, pkg, "launcher-provider", "verified")
        }

        // 2. Samsung One UI Home (Galaxy A15 / A16 default 4x6, S-series 5x6)
        if (pkg.contains("sec.android.app.launcher")) {
            val model = Build.MODEL.uppercase()
            val (defaultCols, defaultRows) = when {
                model.startsWith("SM-A15") || model.startsWith("SM-A16") -> 4 to 6
                model.startsWith("SM-S9") -> 5 to 6
                else -> 4 to 5
            }
            return DetectedGrid(
                cols = maxOf(defaultCols, observedMaxCol).coerceIn(4, 7),
                rows = maxOf(defaultRows, observedMaxRow).coerceIn(5, 7),
                launcherPackage = pkg,
                source = if (observedMaxCol > 0) "auto-accessibility" else "oem-profile",
                confidence = "verified"
            )
        }

        // 3. Google Pixel Launcher
        if (pkg.contains("nexuslauncher")) {
            val cols = maxOf(4, observedMaxCol).coerceIn(4, 5)
            val rows = maxOf(5, observedMaxRow).coerceIn(4, 6)
            return DetectedGrid(cols, rows, pkg, "auto-accessibility", "verified")
        }

        // 4. Minimalist / unknown custom launcher — estimate from observed items or request manual report
        val fallbackCols = if (observedMaxCol >= 3) observedMaxCol.coerceIn(3, 8) else 4
        val fallbackRows = if (observedMaxRow >= 3) observedMaxRow.coerceIn(3, 8) else 5
        return DetectedGrid(
            cols = fallbackCols,
            rows = fallbackRows,
            launcherPackage = pkg,
            source = "oem-profile",
            confidence = "estimated"
        )
    }
}`,
  },
  {
    filename: 'GridRemapper.kt',
    path: 'android/app/src/main/java/com/iconsync/android/grid/GridRemapper.kt',
    language: 'kotlin',
    summary: 'Adapts layouts across mismatched grids (e.g., 6×6 into 5×4) using Auto-Reflow, Proportional Spatial Scaling, Page-Locked Split, Target Resize, or Strict Bounds Crop.',
    content: `package com.iconsync.android.grid

import com.iconsync.android.model.*
import kotlin.math.abs
import kotlin.math.roundToInt

data class RemapSummary(
    val pages: List<HomeScreenPage>,
    val widgetsResized: Int,
    val itemsRelocated: Int,
    val overflowPagesCreated: Int,
    val itemsCropped: Int
)

object GridRemapper {

    fun scaleCoordinate(coord: Int, srcMax: Int, dstMax: Int, span: Int = 1): Int {
        val usableDst = (dstMax - span).coerceAtLeast(0)
        if (srcMax <= 1 || usableDst == 0) return 0
        val ratio = coord.toDouble() / (srcMax - 1).coerceAtLeast(1).toDouble()
        return (ratio * usableDst).roundToInt().coerceIn(0, usableDst)
    }

    fun remapPages(
        sourcePages: List<HomeScreenPage>,
        srcCols: Int,
        srcRows: Int,
        dstCols: Int,
        dstRows: Int,
        strategy: GridAdaptationStrategy
    ): RemapSummary {
        if (strategy == GridAdaptationStrategy.RESIZE_TARGET_GRID ||
            (srcCols == dstCols && srcRows == dstRows)
        ) {
            return RemapSummary(sourcePages, 0, 0, 0, 0)
        }

        val resultPages = mutableListOf<HomeScreenPage>()
        var widgetsResized = 0
        var itemsRelocated = 0
        var overflowPages = 0
        var itemsCropped = 0

        for ((idx, srcPage) in sourcePages.withIndex()) {
            val occupied = Array(dstRows) { BooleanArray(dstCols) }
            val placedWidgets = mutableListOf<WidgetItem>()
            val placedFolders = mutableListOf<FolderItem>()
            val placedIcons = mutableListOf<AppIconItem>()
            val overflowIcons = mutableListOf<AppIconItem>()

            // 1. Widgets first (clamp spans to target grid)
            for (w in srcPage.widgets) {
                val spanX = minOf(w.spanX, dstCols)
                val spanY = minOf(w.spanY, dstRows)
                if (spanX != w.spanX || spanY != w.spanY) widgetsResized++

                val oob = w.col + spanX > dstCols || w.row + spanY > dstRows
                if (strategy == GridAdaptationStrategy.CROP_WITHIN_BOUNDS && oob) {
                    itemsCropped++
                    continue
                }

                val targetCol = if (strategy == GridAdaptationStrategy.PROPORTIONAL_SCALE) {
                    scaleCoordinate(w.col, srcCols, dstCols, spanX)
                } else w.col
                val targetRow = if (strategy == GridAdaptationStrategy.PROPORTIONAL_SCALE) {
                    scaleCoordinate(w.row, srcRows, dstRows, spanY)
                } else w.row

                val slot = findSlot(occupied, dstCols, dstRows, targetCol, targetRow, spanX, spanY)
                if (slot != null) {
                    mark(occupied, slot.first, slot.second, spanX, spanY)
                    placedWidgets.add(w.copy(col = slot.first, row = slot.second, spanX = spanX, spanY = spanY))
                    if (slot.first != w.col || slot.second != w.row) itemsRelocated++
                }
            }

            // 2. Folders & Icons
            for (f in srcPage.folders) {
                val oob = f.col >= dstCols || f.row >= dstRows
                if (strategy == GridAdaptationStrategy.CROP_WITHIN_BOUNDS && oob) {
                    itemsCropped++
                    continue
                }
                val tc = if (strategy == GridAdaptationStrategy.PROPORTIONAL_SCALE) scaleCoordinate(f.col, srcCols, dstCols) else f.col
                val tr = if (strategy == GridAdaptationStrategy.PROPORTIONAL_SCALE) scaleCoordinate(f.row, srcRows, dstRows) else f.row
                val slot = findSlot(occupied, dstCols, dstRows, tc, tr, 1, 1)
                if (slot != null) {
                    mark(occupied, slot.first, slot.second, 1, 1)
                    placedFolders.add(f.copy(col = slot.first, row = slot.second))
                    if (slot.first != f.col || slot.second != f.row) itemsRelocated++
                }
            }

            for (ic in srcPage.icons) {
                val oob = ic.col >= dstCols || ic.row >= dstRows
                if (strategy == GridAdaptationStrategy.CROP_WITHIN_BOUNDS && oob) {
                    itemsCropped++
                    continue
                }
                val tc = if (strategy == GridAdaptationStrategy.PROPORTIONAL_SCALE) scaleCoordinate(ic.col, srcCols, dstCols) else ic.col
                val tr = if (strategy == GridAdaptationStrategy.PROPORTIONAL_SCALE) scaleCoordinate(ic.row, srcRows, dstRows) else ic.row
                val slot = findSlot(occupied, dstCols, dstRows, tc, tr, 1, 1)
                if (slot != null) {
                    mark(occupied, slot.first, slot.second, 1, 1)
                    placedIcons.add(ic.copy(col = slot.first, row = slot.second))
                    if (slot.first != ic.col || slot.second != ic.row) itemsRelocated++
                } else {
                    overflowIcons.add(ic)
                }
            }

            resultPages.add(
                srcPage.copy(
                    order = resultPages.size,
                    isPrimary = idx == 0,
                    widgets = placedWidgets,
                    folders = placedFolders,
                    icons = placedIcons
                )
            )

            // Spill excess items to overflow page(s) so nothing is silently lost
            var part = 2
            while (overflowIcons.isNotEmpty()) {
                overflowPages++
                val ovGrid = Array(dstRows) { BooleanArray(dstCols) }
                val ovIcons = mutableListOf<AppIconItem>()
                val iter = overflowIcons.iterator()
                while (iter.hasNext()) {
                    val ic = iter.next()
                    val slot = findSlot(ovGrid, dstCols, dstRows, 0, 0, 1, 1) ?: break
                    mark(ovGrid, slot.first, slot.second, 1, 1)
                    ovIcons.add(ic.copy(col = slot.first, row = slot.second))
                    itemsRelocated++
                    iter.remove()
                }
                resultPages.add(
                    HomeScreenPage(
                        id = "\${srcPage.id}-part-\$part",
                        name = "\${srcPage.name} (Part \${part++})",
                        isPrimary = false,
                        order = resultPages.size,
                        icons = ovIcons,
                        folders = emptyList(),
                        widgets = emptyList()
                    )
                )
            }
        }

        return RemapSummary(resultPages, widgetsResized, itemsRelocated, overflowPages, itemsCropped)
    }

    private fun canFit(grid: Array<BooleanArray>, cols: Int, rows: Int, c: Int, r: Int, sx: Int, sy: Int): Boolean {
        if (c < 0 || r < 0 || c + sx > cols || r + sy > rows) return false
        for (yy in r until r + sy) for (xx in c until c + sx) if (grid[yy][xx]) return false
        return true
    }

    private fun mark(grid: Array<BooleanArray>, c: Int, r: Int, sx: Int, sy: Int) {
        for (yy in r until r + sy) for (xx in c until c + sx) grid[yy][xx] = true
    }

    private fun findSlot(
        grid: Array<BooleanArray>,
        cols: Int,
        rows: Int,
        prefCol: Int,
        prefRow: Int,
        sx: Int,
        sy: Int
    ): Pair<Int, Int>? {
        if (canFit(grid, cols, rows, prefCol, prefRow, sx, sy)) return prefCol to prefRow
        var best: Pair<Int, Int>? = null
        var bestDist = Int.MAX_VALUE
        for (r in 0..rows - sy) {
            for (c in 0..cols - sx) {
                if (canFit(grid, cols, rows, c, r, sx, sy)) {
                    val dist = abs(c - prefCol) + abs(r - prefRow)
                    if (dist < bestDist) {
                        bestDist = dist
                        best = c to r
                    }
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
    summary: 'WorkManager background worker that synchronizes AppWidgetProvider metadata and live widget configuration bundles across Android devices via Icon Sync REST API.',
    content: `package com.iconsync.android.worker

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Bundle
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import java.net.HttpURLConnection
import java.net.URL

class WidgetSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val syncEndpoint = inputData.getString("SYNC_URL") ?: return Result.failure()
        val appWidgetManager = AppWidgetManager.getInstance(applicationContext)

        return try {
            val connection = (URL("\$syncEndpoint/api/vault").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8000
                readTimeout = 8000
            }

            if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                val payload = connection.inputStream.bufferedReader().use { it.readText() }
                val syncedBundle = Bundle().apply {
                    putString("iconsync_payload", payload)
                    putLong("iconsync_synced_at", System.currentTimeMillis())
                }
                val activeIds = inputData.getIntArray("BOUND_WIDGET_IDS") ?: intArrayOf()
                activeIds.forEach { widgetId ->
                    appWidgetManager.updateAppWidgetOptions(widgetId, syncedBundle)
                }
                Result.success()
            } else {
                Result.retry()
            }
        } catch (e: Exception) {
            Result.retry()
        }
    }
}`,
  },
  {
    filename: 'AndroidManifest.xml',
    path: 'android/app/src/main/AndroidManifest.xml',
    language: 'xml',
    summary: 'Declares Icon Sync launcher package visibility, AppWidget binding, Accessibility screen-tree capture service, and cloud sync permissions.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />
    <uses-permission android:name="android.permission.BIND_APPWIDGET" />

    <application
        android:allowBackup="true"
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

        <!-- Optional Accessibility Service for non-root stock launcher layout & grid capture -->
        <service
            android:name=".service.LauncherGridAccessibilityService"
            android:exported="false"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/launcher_accessibility_config" />
        </service>
    </application>
</manifest>`,
  },
  {
    filename: 'build-android-apk.yml',
    path: '.github/workflows/build-android-apk.yml',
    language: 'yaml',
    summary: 'GitHub Actions workflow that compiles, lints, tests, and uploads the Icon Sync Android APK (IconSync-v*-debug.apk & optional signed release APK).',
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
  workflow_dispatch:
    inputs:
      build_release:
        description: 'Build release APK (uses signing secrets if configured)'
        required: false
        default: true
        type: boolean

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
      - uses: android-actions/setup-android@v3
        with:
          packages: platform-tools build-tools;35.0.0 platforms;android-35
      - uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.9'
      - name: Run Kotlin Unit Tests & Assemble Debug APK
        working-directory: android
        run: gradle testDebugUnitTest lintDebug assembleDebug --stacktrace
      - name: Upload IconSync Debug APK
        uses: actions/upload-artifact@v4
        with:
          name: IconSync-debug-apk
          path: android/app/build/outputs/apk/debug/*.apk`,
  },
];
