package com.iconsync.android.service

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.iconsync.android.grid.LauncherGridDetector
import kotlin.math.roundToInt

/**
 * Opt-in AccessibilityService that inspects visible home-screen shortcut bounding boxes
 * to infer column x row counts on launchers without a public grid ContentProvider.
 */
class LauncherGridAccessibilityService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val root = rootInActiveWindow ?: return
        val pkg = event?.packageName?.toString().orEmpty()
        val detector = LauncherGridDetector(this)
        if (pkg != detector.detectActiveLauncherPackage()) return

        val distinctXs = mutableSetOf<Int>()
        val distinctYs = mutableSetOf<Int>()
        collectShortcutCells(root, distinctXs, distinctYs)

        if (distinctXs.size in 3..8 && distinctYs.size in 3..8) {
            detector.saveAccessibilityDetectedGrid(distinctXs.size, distinctYs.size)
        }
    }

    override fun onInterrupt() {
        // No continuous state to release
    }

    private fun collectShortcutCells(
        node: AccessibilityNodeInfo,
        xs: MutableSet<Int>,
        ys: MutableSet<Int>
    ) {
        if (node.isClickable && !node.text.isNullOrBlank()) {
            val rect = Rect()
            node.getBoundsInScreen(rect)
            if (rect.width() in 48..420 && rect.height() in 48..420) {
                // Bucket center coordinates to 60px bands to collapse minor launcher padding differences
                xs += (rect.centerX() / 60.0).roundToInt()
                ys += (rect.centerY() / 60.0).roundToInt()
            }
        }
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                collectShortcutCells(child, xs, ys)
            }
        }
    }
}
