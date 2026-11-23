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
import com.iconsync.android.grid.CapturedShortcut
import com.iconsync.android.grid.LauncherGridDetector
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Opt-in AccessibilityService that inspects visible home-screen shortcut bounding boxes
 * to infer column x row counts and shortcut coordinates on launchers without a public
 * grid ContentProvider (such as Samsung One UI Home, Pixel Launcher, and minimalist launchers).
 */
class LauncherGridAccessibilityService : AccessibilityService() {

    private var lastProcessedTimestampMs: Long = 0L

    private data class ObservedNode(
        val label: String,
        val centerX: Int,
        val centerY: Int
    )

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val now = SystemClock.elapsedRealtime()
        if (now - lastProcessedTimestampMs < DEBOUNCE_INTERVAL_MS) return

        val pkg = event?.packageName?.toString().orEmpty()
        val detector = LauncherGridDetector(this)
        if (pkg != detector.detectActiveLauncherPackage()) return

        val root = rootInActiveWindow ?: return
        lastProcessedTimestampMs = now

        val density = resources.displayMetrics.density.coerceAtLeast(1f)
        val minSizePx = (32f * density).roundToInt()
        val maxSizePx = (150f * density).roundToInt()
        val clusterGapPx = (32f * density).roundToInt()

        try {
            val observed = mutableListOf<ObservedNode>()
            collectShortcutNodes(root, observed, minSizePx, maxSizePx, depth = 0)
            if (observed.isEmpty()) return

            val colCenters = clusterAxisCenters(observed.map { it.centerX }, clusterGapPx)
            val rowCenters = clusterAxisCenters(observed.map { it.centerY }, clusterGapPx)

            if (colCenters.size in 3..8 && rowCenters.size in 3..8) {
                val shortcuts = observed.map { node ->
                    val col = nearestClusterIndex(node.centerX, colCenters)
                    val row = nearestClusterIndex(node.centerY, rowCenters)
                    CapturedShortcut(label = node.label, col = col, row = row)
                }
                detector.saveAccessibilityCapture(
                    cols = colCenters.size,
                    rows = rowCenters.size,
                    shortcuts = shortcuts
                )
            }
        } finally {
            recycleNodeCompat(root)
        }
    }

    override fun onInterrupt() {
        // No continuous state to release
    }

    private fun collectShortcutNodes(
        node: AccessibilityNodeInfo,
        out: MutableList<ObservedNode>,
        minSizePx: Int,
        maxSizePx: Int,
        depth: Int
    ) {
        if (depth > MAX_TREE_DEPTH) return

        val rawLabel = node.text?.toString()?.trim()?.takeIf { it.isNotBlank() }
            ?: node.contentDescription?.toString()?.trim()?.takeIf { it.isNotBlank() }

        if (node.isClickable && rawLabel != null) {
            val rect = Rect()
            node.getBoundsInScreen(rect)
            if (rect.width() in minSizePx..maxSizePx && rect.height() in minSizePx..maxSizePx) {
                // Clean common Samsung One UI suffix like ", Folder" or notification badge hints
                val cleanedLabel = rawLabel
                    .substringBefore('\n')
                    .trim()
                    .take(60)
                if (cleanedLabel.isNotBlank()) {
                    out += ObservedNode(
                        label = cleanedLabel,
                        centerX = rect.centerX(),
                        centerY = rect.centerY()
                    )
                }
            }
        }

        if (depth == MAX_TREE_DEPTH) return

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                collectShortcutNodes(child, out, minSizePx, maxSizePx, depth + 1)
            } finally {
                recycleNodeCompat(child)
            }
        }
    }

    private fun clusterAxisCenters(values: List<Int>, maxGapPx: Int): List<Int> {
        if (values.isEmpty()) return emptyList()
        val sorted = values.sorted()
        val clusters = mutableListOf<MutableList<Int>>()
        for (value in sorted) {
            val current = clusters.lastOrNull()
            if (current == null || value - current.last() > maxGapPx) {
                clusters += mutableListOf(value)
            } else {
                current += value
            }
        }
        return clusters.map { group -> group.average().roundToInt() }
    }

    private fun nearestClusterIndex(value: Int, centers: List<Int>): Int {
        var bestIdx = 0
        var bestDist = Int.MAX_VALUE
        centers.forEachIndexed { idx, center ->
            val dist = abs(value - center)
            if (dist < bestDist) {
                bestDist = dist
                bestIdx = idx
            }
        }
        return bestIdx
    }

    @Suppress("DEPRECATION")
    private fun recycleNodeCompat(node: AccessibilityNodeInfo) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            node.recycle()
        }
    }

    companion object {
        private const val DEBOUNCE_INTERVAL_MS = 250L
        private const val MAX_TREE_DEPTH = 14

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
