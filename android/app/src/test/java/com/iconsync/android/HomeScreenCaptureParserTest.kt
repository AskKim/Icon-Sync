// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android

import com.iconsync.android.grid.HomeScreenCaptureParser
import com.iconsync.android.grid.ObservedBoundsNode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeScreenCaptureParserTest {

    @Test
    fun cleansSamsungOneUiNotificationAndFolderSuffixes() {
        val notif = HomeScreenCaptureParser.cleanShortcutLabel("Calendar, 1 notification")
        assertEquals("Calendar", notif?.first)
        assertFalse(notif?.second ?: true)

        val folder = HomeScreenCaptureParser.cleanShortcutLabel("Google, Folder")
        assertEquals("Google", folder?.first)
        assertTrue(folder?.second ?: false)

        assertNull(HomeScreenCaptureParser.cleanShortcutLabel("1"))
        assertNull(HomeScreenCaptureParser.cleanShortcutLabel("Search apps"))
        assertNull(HomeScreenCaptureParser.cleanShortcutLabel("Page 2 of 11"))
    }

    @Test
    fun parsesGalaxyA15FiveBySixLayoutWithDockAndIgnoresOffScreenPages() {
        val screenW = 1080
        val screenH = 2340
        val density = 2.8125f

        val colXs = listOf(120, 330, 540, 750, 960)
        val rowYs = listOf(260, 520, 790, 1060, 1330, 1600)
        val dockY = 2010

        fun cell(label: String, cx: Int, cy: Int, folder: Boolean = false) = ObservedBoundsNode(
            label = label,
            left = cx - 80,
            top = cy - 95,
            right = cx + 80,
            bottom = cy + 95,
            isFolderHint = folder
        )

        val nodes = mutableListOf(
            // Row 0 & 1 right side
            cell("Play Store", colXs[4], rowYs[0]),
            cell("Precip", colXs[4], rowYs[1]),
            // Row 2
            cell("Weather", colXs[2], rowYs[2]),
            cell("Business Suite", colXs[3], rowYs[2]),
            cell("Gallery", colXs[4], rowYs[2]),
            // Row 3
            cell("Google", colXs[0], rowYs[3], folder = true),
            cell("Gather", colXs[1], rowYs[3]),
            cell("Wize DataG...", colXs[2], rowYs[3]),
            cell("Tasks", colXs[3], rowYs[3]),
            cell("Calendar", colXs[4], rowYs[3]),
            // Row 4
            cell("Clock", colXs[0], rowYs[4]),
            cell("Calendar", colXs[1], rowYs[4]),
            cell("The Help List", colXs[2], rowYs[4]),
            cell("Play Store", colXs[3], rowYs[4]),
            cell("Hoopla", colXs[4], rowYs[4]),
            // Row 5
            cell("Games", colXs[0], rowYs[5], folder = true),
            cell("SmartLife", colXs[1], rowYs[5]),
            cell("PayPal", colXs[2], rowYs[5]),
            cell("Gemini", colXs[3], rowYs[5]),
            cell("Spotify", colXs[4], rowYs[5]),
            // Dock
            cell("Phone", colXs[0], dockY),
            cell("DuckDuckGo", colXs[1], dockY),
            cell("Messenger", colXs[2], dockY),
            cell("Camera", colXs[3], dockY),
            cell("Facebook", colXs[4], dockY),
            // Off-screen page nodes from PagedView that must be excluded
            cell("OffscreenLeft", -200, rowYs[3]),
            cell("OffscreenRight", 1280, rowYs[3])
        )

        val parsed = HomeScreenCaptureParser.parse(
            rawNodes = nodes,
            screenWidth = screenW,
            screenHeight = screenH,
            density = density
        )

        assertEquals(5, parsed.detectedCols)
        assertEquals(6, parsed.detectedRows)
        assertEquals(20, parsed.shortcuts.size)
        assertEquals(5, parsed.dock.size)

        val topRight = parsed.shortcuts.first { it.label == "Play Store" && it.row == 0 }
        assertEquals(4, topRight.col)

        val googleFolder = parsed.shortcuts.first { it.label == "Google" }
        assertTrue(googleFolder.isFolder)
        assertEquals(0, googleFolder.col)
        assertEquals(3, googleFolder.row)

        assertEquals(listOf("Phone", "DuckDuckGo", "Messenger", "Camera", "Facebook"), parsed.dock.map { it.label })
    }

    @Test
    fun capturesSparseHomeScreenWithoutDroppingIcons() {
        val nodes = listOf(
            ObservedBoundsNode("Phone", 100, 1400, 260, 1580),
            ObservedBoundsNode("Camera", 500, 1400, 660, 1580)
        )

        val parsed = HomeScreenCaptureParser.parse(
            rawNodes = nodes,
            screenWidth = 1080,
            screenHeight = 2340,
            density = 2.8125f,
            fallbackCols = 5,
            fallbackRows = 6
        )

        assertNull(parsed.detectedCols)
        assertNull(parsed.detectedRows)
        assertEquals(2, parsed.shortcuts.size)
    }
}
