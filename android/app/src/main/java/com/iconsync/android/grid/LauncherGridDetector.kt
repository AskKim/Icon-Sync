// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android.grid

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.edit
import androidx.core.net.toUri
import com.iconsync.android.model.DetectedLauncherGrid
import com.iconsync.android.model.FolderPlacement
import com.iconsync.android.model.GridDetectionSource
import com.iconsync.android.model.HomeScreenPage
import com.iconsync.android.model.IconPlacement
import com.iconsync.android.model.WidgetPlacement
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.Locale

@Serializable
data class CapturedShortcut(
    val label: String,
    val col: Int,
    val row: Int,
    val isFolder: Boolean = false
)

@Serializable
data class CapturedWidget(
    val label: String,
    val provider: String = "",
    val col: Int,
    val row: Int,
    val spanX: Int = 2,
    val spanY: Int = 1
)

@Serializable
data class CapturedPage(
    val pageNumber: Int,
    val shortcuts: List<CapturedShortcut> = emptyList(),
    val widgets: List<CapturedWidget> = emptyList(),
    val capturedAtMs: Long = 0L
)

@Serializable
data class StoredGridConfig(
    val userCols: Int? = null,
    val userRows: Int? = null,
    val accCols: Int? = null,
    val accRows: Int? = null,
    val preferUserGrid: Boolean = false,
    val capturedShortcuts: List<CapturedShortcut> = emptyList(),
    val capturedWidgets: List<CapturedWidget> = emptyList(),
    val capturedDock: List<CapturedShortcut> = emptyList(),
    val capturedPages: List<CapturedPage> = emptyList(),
    val reportedTotalPages: Int? = null,
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
            val pageCount = storedConfig.capturedPages.size
            val capturedCount = if (pageCount > 0) {
                storedConfig.capturedPages.sumOf { it.shortcuts.size }
            } else {
                storedConfig.capturedShortcuts.size
            }
            val widgetCount = if (pageCount > 0) {
                storedConfig.capturedPages.sumOf { it.widgets.size }
            } else {
                storedConfig.capturedWidgets.size
            }
            val dockCount = storedConfig.capturedDock.size
            val parts = buildList {
                if (capturedCount > 0) add("$capturedCount home")
                if (widgetCount > 0) add("$widgetCount widget(s)")
                if (dockCount > 0) add("$dockCount dock")
            }
            val captureNote = if (parts.isNotEmpty()) {
                val pageSuffix = if (pageCount > 1) " across $pageCount pages" else ""
                " (${parts.joinToString(", ")}$pageSuffix captured)"
            } else {
                ""
            }
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
        saveStoredConfig(
            current.copy(
                preferUserGrid = false,
                accCols = null,
                accRows = null
            )
        )
    }

    fun saveAccessibilityDetectedGrid(cols: Int, rows: Int) {
        val current = loadStoredConfig()
        saveAccessibilityCapture(cols, rows, current.capturedShortcuts, current.capturedDock)
    }

    fun clearAccessibilityCapture() {
        val current = loadStoredConfig()
        saveStoredConfig(
            current.copy(
                accCols = null,
                accRows = null,
                capturedShortcuts = emptyList(),
                capturedWidgets = emptyList(),
                capturedDock = emptyList(),
                capturedPages = emptyList(),
                reportedTotalPages = null,
                lastCapturedAtMs = 0L
            )
        )
    }

    fun saveAccessibilityCapture(
        cols: Int?,
        rows: Int?,
        shortcuts: List<CapturedShortcut>,
        dock: List<CapturedShortcut> = emptyList(),
        widgets: List<CapturedWidget> = emptyList(),
        pageNumber: Int? = null,
        totalPages: Int? = null
    ) {
        val current = loadStoredConfig()
        val allShortcuts = shortcuts + current.capturedPages.flatMap { it.shortcuts }
        val allWidgets = widgets + current.capturedPages.flatMap { it.widgets }
        val observedMaxCols = maxOf(
            (allShortcuts.maxOfOrNull { it.col } ?: -1) + 1,
            allWidgets.maxOfOrNull { it.col + it.spanX } ?: 0
        )
        val observedMaxRows = maxOf(
            (allShortcuts.maxOfOrNull { it.row } ?: -1) + 1,
            allWidgets.maxOfOrNull { it.row + it.spanY } ?: 0
        )
        val candidateCols = if (current.preferUserGrid && current.userCols != null) {
            current.userCols
        } else {
            cols ?: current.userCols ?: current.accCols
        }
        val candidateRows = if (current.preferUserGrid && current.userRows != null) {
            current.userRows
        } else {
            rows ?: current.userRows ?: current.accRows
        }
        val boundedCols = candidateCols?.let { maxOf(it, observedMaxCols).coerceIn(3, 8) }
            ?: observedMaxCols.takeIf { it in 3..8 }
        val boundedRows = candidateRows?.let { maxOf(it, observedMaxRows).coerceIn(3, 8) }
            ?: observedMaxRows.takeIf { it in 3..8 }

        val effectiveCols = boundedCols ?: current.userCols ?: 5
        val effectiveRows = boundedRows ?: current.userRows ?: 6

        val sanitizedShortcuts = shortcuts
            .filter { it.label.isNotBlank() && it.col in 0 until effectiveCols && it.row in 0 until effectiveRows }
            .distinctBy { Pair(it.col, it.row) }
            .take(effectiveCols * effectiveRows)

        val sanitizedWidgets = widgets
            .filter { it.col in 0 until effectiveCols && it.row in 0 until effectiveRows }
            .map { w ->
                w.copy(
                    label = w.label.trim().ifBlank { "App Widget" }.take(60),
                    spanX = w.spanX.coerceIn(1, effectiveCols - w.col),
                    spanY = w.spanY.coerceIn(1, effectiveRows - w.row)
                )
            }
            .distinctBy { Pair(it.col, it.row) }

        val sanitizedDock = if (dock.isNotEmpty()) {
            dock
                .filter { it.label.isNotBlank() }
                .take(8)
                .mapIndexed { idx, item -> item.copy(col = idx, row = 0) }
        } else {
            current.capturedDock
        }

        val nowMs = System.currentTimeMillis()
        val updatedPages = if (pageNumber != null && pageNumber in 1..40) {
            val filteredExisting = current.capturedPages
                .filterNot { it.pageNumber == pageNumber }
                .filter { page -> totalPages == null || page.pageNumber <= totalPages }
            (filteredExisting + CapturedPage(
                pageNumber = pageNumber,
                shortcuts = sanitizedShortcuts,
                widgets = sanitizedWidgets,
                capturedAtMs = nowMs
            )).sortedBy { it.pageNumber }
        } else {
            current.capturedPages
        }

        val primaryPageShortcuts = updatedPages.firstOrNull { it.pageNumber == 1 }?.shortcuts
            ?: sanitizedShortcuts
        val primaryPageWidgets = updatedPages.firstOrNull { it.pageNumber == 1 }?.widgets
            ?: sanitizedWidgets

        saveStoredConfig(
            current.copy(
                accCols = boundedCols,
                accRows = boundedRows,
                capturedShortcuts = primaryPageShortcuts,
                capturedWidgets = primaryPageWidgets,
                capturedDock = sanitizedDock,
                capturedPages = updatedPages,
                reportedTotalPages = totalPages ?: current.reportedTotalPages,
                lastCapturedAtMs = nowMs
            )
        )
    }

    fun getCapturedShortcutCount(): Int {
        val cfg = loadStoredConfig()
        return if (cfg.capturedPages.isNotEmpty()) {
            cfg.capturedPages.sumOf { it.shortcuts.size }
        } else {
            cfg.capturedShortcuts.size
        }
    }

    fun getCapturedWidgetCount(): Int {
        val cfg = loadStoredConfig()
        return if (cfg.capturedPages.isNotEmpty()) {
            cfg.capturedPages.sumOf { it.widgets.size }
        } else {
            cfg.capturedWidgets.size
        }
    }

    fun getCapturedPageCount(): Int = loadStoredConfig().capturedPages.size

    fun getReportedTotalPages(): Int? = loadStoredConfig().reportedTotalPages

    fun getCapturedDockCount(): Int = loadStoredConfig().capturedDock.size

    fun getCapturedShortcutsRaw(): List<CapturedShortcut> = loadStoredConfig().capturedShortcuts

    fun getCapturedWidgetsRaw(): List<CapturedWidget> = loadStoredConfig().capturedWidgets

    fun getCapturedDockRaw(): List<CapturedShortcut> = loadStoredConfig().capturedDock

    fun getCapturedPages(cols: Int, rows: Int): List<HomeScreenPage> {
        val cfg = loadStoredConfig()
        val pagesSource = if (cfg.capturedPages.isNotEmpty()) {
            cfg.capturedPages.sortedBy { it.pageNumber }
        } else if (cfg.capturedShortcuts.isNotEmpty() || cfg.capturedWidgets.isNotEmpty()) {
            listOf(
                CapturedPage(
                    pageNumber = 1,
                    shortcuts = cfg.capturedShortcuts,
                    widgets = cfg.capturedWidgets,
                    capturedAtMs = cfg.lastCapturedAtMs
                )
            )
        } else {
            return emptyList()
        }

        val launchableApps = getInstalledLaunchableApps()
        val byLowerLabel = launchableApps.associateBy { it.label.trim().lowercase(Locale.ROOT) }
        val nowIso = Instant.now().toString()

        return pagesSource.mapIndexed { pageIdx, capturedPage ->
            val icons = mapCapturedIcons(
                shortcuts = capturedPage.shortcuts.filterNot { it.isFolder },
                cols = cols,
                rows = rows,
                pagePrefix = "p${capturedPage.pageNumber}",
                launchableApps = launchableApps,
                byLowerLabel = byLowerLabel
            )
            val folders = mapCapturedFolders(
                folders = capturedPage.shortcuts.filter { it.isFolder },
                cols = cols,
                rows = rows,
                pagePrefix = "p${capturedPage.pageNumber}"
            )
            val widgets = mapCapturedWidgets(
                widgets = capturedPage.widgets,
                cols = cols,
                rows = rows,
                pagePrefix = "p${capturedPage.pageNumber}",
                updatedAt = nowIso
            )
            val pageNum = capturedPage.pageNumber
            HomeScreenPage(
                id = if (pageIdx == 0) "scr-main" else "scr-page-$pageNum",
                name = if (pageIdx == 0) "Primary Home (Page $pageNum)" else "Home Screen $pageNum",
                isPrimary = pageIdx == 0,
                order = pageIdx,
                icons = icons,
                folders = folders,
                widgets = widgets
            )
        }
    }

    fun getCapturedIcons(cols: Int, rows: Int): List<IconPlacement> {
        val shortcuts = loadStoredConfig().capturedShortcuts.filterNot { it.isFolder }
        if (shortcuts.isEmpty()) return emptyList()
        val launchableApps = getInstalledLaunchableApps()
        val byLowerLabel = launchableApps.associateBy { it.label.trim().lowercase(Locale.ROOT) }
        return mapCapturedIcons(shortcuts, cols, rows, "cap", launchableApps, byLowerLabel)
    }

    fun getCapturedFolders(cols: Int, rows: Int): List<FolderPlacement> {
        val folders = loadStoredConfig().capturedShortcuts.filter { it.isFolder }
        if (folders.isEmpty()) return emptyList()
        return mapCapturedFolders(folders, cols, rows, "cap")
    }

    fun getCapturedWidgets(cols: Int, rows: Int): List<WidgetPlacement> {
        val widgets = loadStoredConfig().capturedWidgets
        if (widgets.isEmpty()) return emptyList()
        return mapCapturedWidgets(widgets, cols, rows, "cap", Instant.now().toString())
    }

    private fun mapCapturedIcons(
        shortcuts: List<CapturedShortcut>,
        cols: Int,
        rows: Int,
        pagePrefix: String,
        launchableApps: List<LaunchableAppInfo>,
        byLowerLabel: Map<String, LaunchableAppInfo>
    ): List<IconPlacement> {
        val palette = listOf("#166534", "#1D4ED8", "#7C3AED", "#B45309", "#0F766E", "#BE123C")
        val seenSlots = mutableSetOf<Pair<Int, Int>>()
        val result = mutableListOf<IconPlacement>()

        shortcuts.forEachIndexed { idx, shortcut ->
            val col = shortcut.col.coerceIn(0, cols - 1)
            val row = shortcut.row.coerceIn(0, rows - 1)
            if (!seenSlots.add(Pair(col, row))) return@forEachIndexed

            val cleanLabel = shortcut.label.trim()
            val matchedApp = matchLaunchableApp(cleanLabel, launchableApps, byLowerLabel)

            val slug = cleanLabel.lowercase(Locale.ROOT)
                .replace(Regex("[^a-z0-9]+"), ".")
                .trim('.')
                .ifBlank { "item.$idx" }

            result += IconPlacement(
                id = "ic-$pagePrefix-$idx",
                packageName = matchedApp?.packageName ?: "com.launcher.shortcut.$slug",
                label = matchedApp?.label ?: cleanLabel.take(40),
                col = col,
                row = row,
                isPlaceholder = matchedApp == null,
                iconKey = inferIconKey(matchedApp?.label ?: cleanLabel),
                tint = palette[idx % palette.size],
                category = inferCategory(matchedApp?.label ?: cleanLabel)
            )
        }
        return result
    }

    private fun mapCapturedFolders(
        folders: List<CapturedShortcut>,
        cols: Int,
        rows: Int,
        pagePrefix: String
    ): List<FolderPlacement> {
        val seenSlots = mutableSetOf<Pair<Int, Int>>()
        val result = mutableListOf<FolderPlacement>()
        folders.forEachIndexed { idx, folder ->
            val col = folder.col.coerceIn(0, cols - 1)
            val row = folder.row.coerceIn(0, rows - 1)
            if (!seenSlots.add(Pair(col, row))) return@forEachIndexed
            result += FolderPlacement(
                id = "fld-$pagePrefix-$idx",
                name = folder.label.trim().take(32).ifBlank { "Folder" },
                col = col,
                row = row
            )
        }
        return result
    }

    private fun mapCapturedWidgets(
        widgets: List<CapturedWidget>,
        cols: Int,
        rows: Int,
        pagePrefix: String,
        updatedAt: String
    ): List<WidgetPlacement> {
        val seenSlots = mutableSetOf<Pair<Int, Int>>()
        return widgets.mapIndexedNotNull { idx, w ->
            val col = w.col.coerceIn(0, cols - 1)
            val row = w.row.coerceIn(0, rows - 1)
            if (!seenSlots.add(Pair(col, row))) return@mapIndexedNotNull null
            val cleanTitle = w.label.trim().ifBlank { "App Widget" }.take(60)
            val slug = cleanTitle.lowercase(Locale.ROOT)
                .replace(Regex("[^a-z0-9]+"), "-")
                .trim('-')
                .ifBlank { "widget-$idx" }
            WidgetPlacement(
                id = "w-$pagePrefix-$idx",
                syncKey = "widget.captured.$slug",
                provider = w.provider.ifBlank { "android.appwidget.AppWidgetProvider" },
                title = cleanTitle,
                col = col,
                row = row,
                spanX = w.spanX.coerceIn(1, cols - col),
                spanY = w.spanY.coerceIn(1, rows - row),
                syncEnabled = false,
                updatedAt = updatedAt
            )
        }
    }

    fun getCapturedDockIcons(): List<IconPlacement> {
        val dock = loadStoredConfig().capturedDock
        if (dock.isEmpty()) return emptyList()

        val launchableApps = getInstalledLaunchableApps()
        val byLowerLabel = launchableApps.associateBy { it.label.trim().lowercase(Locale.ROOT) }
        val palette = listOf("#166534", "#1D4ED8", "#7C3AED", "#B45309", "#0F766E", "#BE123C")

        return dock.mapIndexed { idx, shortcut ->
            val cleanLabel = shortcut.label.trim()
            val matchedApp = matchLaunchableApp(cleanLabel, launchableApps, byLowerLabel)
            val slug = cleanLabel.lowercase(Locale.ROOT)
                .replace(Regex("[^a-z0-9]+"), ".")
                .trim('.')
                .ifBlank { "dock.$idx" }

            IconPlacement(
                id = "ic-dock-$idx",
                packageName = matchedApp?.packageName ?: "com.launcher.shortcut.$slug",
                label = matchedApp?.label ?: cleanLabel.take(40),
                col = idx,
                row = 0,
                isPlaceholder = matchedApp == null,
                iconKey = inferIconKey(matchedApp?.label ?: cleanLabel),
                tint = palette[idx % palette.size],
                category = inferCategory(matchedApp?.label ?: cleanLabel)
            )
        }
    }

    private fun matchLaunchableApp(
        cleanLabel: String,
        launchableApps: List<LaunchableAppInfo>,
        byLowerLabel: Map<String, LaunchableAppInfo>
    ): LaunchableAppInfo? {
        val lower = cleanLower(cleanLabel)
        byLowerLabel[lower]?.let { return it }

        // Handle launcher-truncated labels such as "Wize DataG..." or "Samsung Note…"
        val withoutEllipsis = cleanLabel
            .removeSuffix("...")
            .removeSuffix("…")
            .trim()
        if (withoutEllipsis.length >= 3 && withoutEllipsis.length < cleanLabel.length) {
            launchableApps.firstOrNull {
                it.label.startsWith(withoutEllipsis, ignoreCase = true)
            }?.let { return it }
        }

        val normalizedQuery = lower.replace(Regex("[^a-z0-9]"), "")
        if (normalizedQuery.length >= 3) {
            launchableApps.firstOrNull { app ->
                app.label.lowercase(Locale.ROOT).replace(Regex("[^a-z0-9]"), "") == normalizedQuery
            }?.let { return it }
        }

        return launchableApps.firstOrNull { app ->
            app.label.equals(cleanLabel, ignoreCase = true) ||
                cleanLabel.contains(app.label, ignoreCase = true) ||
                (cleanLabel.length >= 4 && app.label.contains(cleanLabel, ignoreCase = true))
        }
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
            "com.sec.android.app.launcher" -> Pair(5, 6)
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
            "chrome" in lower || "browser" in lower || "web" in lower || "duckduckgo" in lower -> "globe"
            else -> "smartphone"
        }
    }

    private fun inferCategory(label: String): String {
        val lower = label.lowercase(Locale.ROOT)
        return when {
            "phone" in lower || "message" in lower || "mail" in lower || "whatsapp" in lower || "messenger" in lower -> "Communication"
            "camera" in lower || "photo" in lower || "gallery" in lower -> "Photography"
            "music" in lower || "youtube" in lower || "spotify" in lower || "video" in lower || "hoopla" in lower -> "Media"
            "map" in lower || "uber" in lower || "waze" in lower -> "Navigation"
            "calendar" in lower || "note" in lower || "docs" in lower || "drive" in lower || "tasks" in lower -> "Productivity"
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
