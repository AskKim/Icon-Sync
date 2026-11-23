// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android.service

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.os.Build
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.iconsync.android.grid.LauncherGridDetector
import kotlin.math.roundToInt

/**
 * Opt-in AccessibilityService that inspects visible home-screen shortcut bounding boxes
 * to infer column x row counts on launchers without a public grid ContentProvider.
 */
class LauncherGridAccessibilityService : AccessibilityService() {

    private var lastProcessedTimestampMs: Long = 0L

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val now = SystemClock.elapsedRealtime()
        if (now - lastProcessedTimestampMs < DEBOUNCE_INTERVAL_MS) return

        val pkg = event?.packageName?.toString().orEmpty()
        val detector = LauncherGridDetector(this)
        if (pkg != detector.detectActiveLauncherPackage()) return

        val root = rootInActiveWindow ?: return
        lastProcessedTimestampMs = now

        try {
            val distinctXs = mutableSetOf<Int>()
            val distinctYs = mutableSetOf<Int>()
            collectShortcutCells(root, distinctXs, distinctYs, depth = 0)

            if (distinctXs.size in 3..8 && distinctYs.size in 3..8) {
                detector.saveAccessibilityDetectedGrid(distinctXs.size, distinctYs.size)
            }
        } finally {
            recycleNodeCompat(root)
        }
    }

    override fun onInterrupt() {
        // No continuous state to release
    }

    private fun collectShortcutCells(
        node: AccessibilityNodeInfo,
        xs: MutableSet<Int>,
        ys: MutableSet<Int>,
        depth: Int
    ) {
        if (depth > MAX_TREE_DEPTH) return

        if (node.isClickable && !node.text.isNullOrBlank()) {
            val rect = Rect()
            node.getBoundsInScreen(rect)
            if (rect.width() in 48..420 && rect.height() in 48..420) {
                // Bucket center coordinates to 60px bands to collapse minor launcher padding differences
                xs += (rect.centerX() / 60.0).roundToInt()
                ys += (rect.centerY() / 60.0).roundToInt()
            }
        }

        if (depth == MAX_TREE_DEPTH) return

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                collectShortcutCells(child, xs, ys, depth + 1)
            } finally {
                recycleNodeCompat(child)
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun recycleNodeCompat(node: AccessibilityNodeInfo) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            node.recycle()
        }
    }

    companion object {
        private const val DEBOUNCE_INTERVAL_MS = 250L
        private const val MAX_TREE_DEPTH = 12
    }
}
