// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android.service

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.graphics.Rect
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import com.iconsync.android.grid.HomeScreenCaptureParser
import com.iconsync.android.grid.LauncherGridDetector
import com.iconsync.android.grid.ObservedBoundsNode
import kotlin.math.roundToInt

/**
 * Opt-in AccessibilityService that inspects visible home-screen shortcut bounding boxes
 * to infer column x row counts, workspace shortcut coordinates, folders, and dock icons
 * on launchers without a public grid ContentProvider (such as Samsung One UI Home,
 * Pixel Launcher, and minimalist launchers).
 */
class LauncherGridAccessibilityService : AccessibilityService() {

    private var lastProcessedTimestampMs: Long = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        scanActiveLauncherWindow()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val now = SystemClock.elapsedRealtime()
        if (now - lastProcessedTimestampMs < DEBOUNCE_INTERVAL_MS) return
        scanActiveLauncherWindow(now)
    }

    override fun onInterrupt() {
        // No continuous state to release
    }

    private fun scanActiveLauncherWindow(now: Long = SystemClock.elapsedRealtime()) {
        val detector = LauncherGridDetector(this)
        val launcherPkg = detector.detectActiveLauncherPackage()
        if (launcherPkg == "unknown.launcher") return

        val root = findLauncherRootNode(launcherPkg) ?: return
        lastProcessedTimestampMs = now

        val displayMetrics = resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels
        val screenHeight = displayMetrics.heightPixels
        val density = displayMetrics.density.coerceAtLeast(1f)

        val minCellPx = (20f * density).roundToInt()
        val maxCellW = (220f * density).roundToInt().coerceAtMost((screenWidth * 0.45f).roundToInt())
        val maxCellH = (220f * density).roundToInt().coerceAtMost((screenHeight * 0.35f).roundToInt())
        val minTextLeafH = (12f * density).roundToInt()

        try {
            if (isRecentsOrAppDrawer(root, depth = 0)) return

            val primaryNodes = mutableListOf<ObservedBoundsNode>()
            val fallbackTextNodes = mutableListOf<ObservedBoundsNode>()

            collectShortcutNodes(
                node = root,
                primaryOut = primaryNodes,
                fallbackOut = fallbackTextNodes,
                screenWidth = screenWidth,
                screenHeight = screenHeight,
                minCellPx = minCellPx,
                maxCellW = maxCellW,
                maxCellH = maxCellH,
                minTextLeafH = minTextLeafH,
                inHotseat = false,
                depth = 0
            )

            val candidateNodes = if (primaryNodes.size >= 2) {
                primaryNodes
            } else {
                primaryNodes + fallbackTextNodes
            }
            if (candidateNodes.isEmpty()) return

            val currentGrid = detector.detectGrid()
            val parsed = HomeScreenCaptureParser.parse(
                rawNodes = candidateNodes,
                screenWidth = screenWidth,
                screenHeight = screenHeight,
                density = density,
                fallbackCols = currentGrid.cols,
                fallbackRows = currentGrid.rows
            )

            if (parsed.shortcuts.isNotEmpty() || parsed.dock.isNotEmpty()) {
                detector.saveAccessibilityCapture(
                    cols = parsed.detectedCols,
                    rows = parsed.detectedRows,
                    shortcuts = parsed.shortcuts,
                    dock = parsed.dock
                )
            }
        } finally {
            recycleNodeCompat(root)
        }
    }

    private fun findLauncherRootNode(launcherPkg: String): AccessibilityNodeInfo? {
        val activeRoot = rootInActiveWindow
        if (activeRoot != null) {
            if (activeRoot.packageName?.toString() == launcherPkg) {
                return activeRoot
            }
            recycleNodeCompat(activeRoot)
        }

        val allWindows = runCatching { windows }.getOrNull().orEmpty()
        for (window in allWindows.asReversed()) {
            if (window.type != AccessibilityWindowInfo.TYPE_APPLICATION) continue
            val winRoot = window.root ?: continue
            if (winRoot.packageName?.toString() == launcherPkg) {
                return winRoot
            }
            recycleNodeCompat(winRoot)
        }
        return null
    }

    private fun isRecentsOrAppDrawer(node: AccessibilityNodeInfo, depth: Int): Boolean {
        if (depth > 5) return false
        val viewId = node.viewIdResourceName?.lowercase().orEmpty()
        if (viewId.isNotEmpty()) {
            val isNonHomeOverlay = NON_HOME_VIEW_ID_TOKENS.any { token -> token in viewId }
            if (isNonHomeOverlay) return true
        }
        val textLower = node.text?.toString()?.trim()?.lowercase().orEmpty()
        if (textLower == "close all") return true

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                if (isRecentsOrAppDrawer(child, depth + 1)) return true
            } finally {
                recycleNodeCompat(child)
            }
        }
        return false
    }

    private fun collectShortcutNodes(
        node: AccessibilityNodeInfo,
        primaryOut: MutableList<ObservedBoundsNode>,
        fallbackOut: MutableList<ObservedBoundsNode>,
        screenWidth: Int,
        screenHeight: Int,
        minCellPx: Int,
        maxCellW: Int,
        maxCellH: Int,
        minTextLeafH: Int,
        inHotseat: Boolean,
        depth: Int
    ) {
        if (depth > MAX_TREE_DEPTH || !node.isVisibleToUser) return

        val rect = Rect()
        node.getBoundsInScreen(rect)
        if (rect.isEmpty ||
            rect.right <= 0 ||
            rect.left >= screenWidth ||
            rect.bottom <= 0 ||
            rect.top >= screenHeight
        ) {
            return
        }

        val viewIdLower = node.viewIdResourceName?.lowercase().orEmpty()
        val nowInHotseat = inHotseat || "hotseat" in viewIdLower || "dock" in viewIdLower
        val centerOnScreen = rect.centerX() in 0 until screenWidth && rect.centerY() in 0 until screenHeight

        if (centerOnScreen &&
            isInteractiveNode(node) &&
            rect.width() in minCellPx..maxCellW &&
            rect.height() in minCellPx..maxCellH
        ) {
            val extracted = extractNodeOrDescendantLabel(node, maxDepth = 4)
            if (extracted != null) {
                val (cleanedLabel, folderHint) = extracted
                val isFolder = folderHint || "folder" in viewIdLower
                primaryOut += ObservedBoundsNode(
                    label = cleanedLabel,
                    left = rect.left,
                    top = rect.top,
                    right = rect.right,
                    bottom = rect.bottom,
                    isFolderHint = isFolder,
                    inHotseat = nowInHotseat
                )
                return
            }
        }

        // Secondary fallback for launchers that place non-clickable TextViews inside non-clickable cells
        if (node.childCount == 0 &&
            centerOnScreen &&
            node.className?.toString()?.contains("TextView") == true &&
            rect.width() in minCellPx..maxCellW &&
            rect.height() in minTextLeafH..maxCellH
        ) {
            val raw = node.text?.toString()?.trim()?.takeIf { it.isNotBlank() }
                ?: node.contentDescription?.toString()?.trim()?.takeIf { it.isNotBlank() }
            val cleaned = HomeScreenCaptureParser.cleanShortcutLabel(raw)
            if (cleaned != null && cleaned.first.length <= 32) {
                fallbackOut += ObservedBoundsNode(
                    label = cleaned.first,
                    left = rect.left,
                    top = rect.top,
                    right = rect.right,
                    bottom = rect.bottom,
                    isFolderHint = cleaned.second || "folder" in viewIdLower,
                    inHotseat = nowInHotseat
                )
            }
        }

        if (depth == MAX_TREE_DEPTH) return

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                collectShortcutNodes(
                    node = child,
                    primaryOut = primaryOut,
                    fallbackOut = fallbackOut,
                    screenWidth = screenWidth,
                    screenHeight = screenHeight,
                    minCellPx = minCellPx,
                    maxCellW = maxCellW,
                    maxCellH = maxCellH,
                    minTextLeafH = minTextLeafH,
                    inHotseat = nowInHotseat,
                    depth = depth + 1
                )
            } finally {
                recycleNodeCompat(child)
            }
        }
    }

    private fun isInteractiveNode(node: AccessibilityNodeInfo): Boolean {
        if (node.isClickable || node.isLongClickable) return true
        return node.actionList.any { it.id == AccessibilityNodeInfo.ACTION_CLICK }
    }

    private fun extractNodeOrDescendantLabel(
        node: AccessibilityNodeInfo,
        maxDepth: Int
    ): Pair<String, Boolean>? {
        val ownContentDesc = node.contentDescription?.toString()
        HomeScreenCaptureParser.cleanShortcutLabel(ownContentDesc)?.let { return it }

        val ownText = node.text?.toString()
        HomeScreenCaptureParser.cleanShortcutLabel(ownText)?.let { return it }

        if (maxDepth <= 0) return null

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                extractNodeOrDescendantLabel(child, maxDepth - 1)?.let { return it }
            } finally {
                recycleNodeCompat(child)
            }
        }
        return null
    }

    @Suppress("DEPRECATION")
    private fun recycleNodeCompat(node: AccessibilityNodeInfo) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            node.recycle()
        }
    }

    companion object {
        private const val DEBOUNCE_INTERVAL_MS = 200L
        private const val MAX_TREE_DEPTH = 24

        private val NON_HOME_VIEW_ID_TOKENS = listOf(
            "recents_view",
            "task_view",
            "clear_all",
            "overview_panel",
            "all_apps",
            "apps_grid",
            "apps_view",
            "apps_tray",
            "apps_picker"
        )

        fun isEnabled(context: Context): Boolean {
            val enabledServices = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: return false

            val expected = ComponentName(context, LauncherGridAccessibilityService::class.java)
            return enabledServices
                .split(':')
                .mapNotNull { ComponentName.unflattenFromString(it) }
                .any { it == expected }
        }
    }
}
