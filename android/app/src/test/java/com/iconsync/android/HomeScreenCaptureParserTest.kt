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

        val notifNoComma = HomeScreenCaptureParser.cleanShortcutLabel("Messages 1 notification")
        assertEquals("Messages", notifNoComma?.first)
        assertFalse(notifNoComma?.second ?: true)

        val folder = HomeScreenCaptureParser.cleanShortcutLabel("Google, Folder")
        assertEquals("Google", folder?.first)
        assertTrue(folder?.second ?: false)

        val folderWithApps = HomeScreenCaptureParser.cleanShortcutLabel("Google, 7 apps")
        assertEquals("Google", folderWithApps?.first)
        assertTrue(folderWithApps?.second ?: false)

        val searchLabel = HomeScreenCaptureParser.cleanShortcutLabel("Google Search")
        assertEquals("Google Search", searchLabel?.first)

        val searchPill = HomeScreenCaptureParser.cleanShortcutLabel("Search")
        assertEquals("Search", searchPill?.first)

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

    @Test
    fun parsesSparsePageWithWidgetsMissingMiddleRowsAndPreservesRow5() {
        val screenW = 1080
        val screenH = 2340
        val density = 2.8125f

        val colXs = listOf(120, 330, 540, 750, 960)
        val rowYs = listOf(260, 520, 790, 1060, 1330, 1600)
        val dockY = 2010

        fun cell(label: String, col: Int, row: Int, folder: Boolean = false): ObservedBoundsNode {
            val cx = colXs[col]
            val cy = rowYs[row]
            return ObservedBoundsNode(label, cx - 80, cy - 95, cx + 80, cy + 95, isFolderHint = folder)
        }

        // Page 2 pattern: rows 0 & 1 full, 5x2 Facebook widget on rows 2..3, row 4 empty, 4 icons in row 5, 5 dock icons
        val page2Nodes = listOf(
            cell("Boone Coun...", 0, 0),
            cell("2061 Indiana...", 1, 0),
            cell("Point on map", 2, 0),
            cell("1406 Teal Rd", 3, 0),
            cell("Whitley Cou...", 4, 0),
            cell("drive.google....", 0, 1),
            cell("User Control ...", 1, 1),
            cell("AlfredCamera", 2, 1),
            cell("Hoffman, Illin...", 3, 1),
            cell("drive.google....", 4, 1),
            ObservedBoundsNode(
                label = "Facebook Top Updates",
                left = 40,
                top = 695,
                right = 1040,
                bottom = 1155,
                isWidget = true
            ),
            cell("Wish", 0, 5),
            cell("drive.google....", 1, 5),
            cell("Camera", 3, 5),
            cell("wundergrou...", 4, 5),
            ObservedBoundsNode("Phone", colXs[0] - 80, dockY - 95, colXs[0] + 80, dockY + 95),
            ObservedBoundsNode("DuckDuckGo", colXs[1] - 80, dockY - 95, colXs[1] + 80, dockY + 95),
            ObservedBoundsNode("Messenger", colXs[2] - 80, dockY - 95, colXs[2] + 80, dockY + 95),
            ObservedBoundsNode("Camera", colXs[3] - 80, dockY - 95, colXs[3] + 80, dockY + 95),
            ObservedBoundsNode("Facebook", colXs[4] - 80, dockY - 95, colXs[4] + 80, dockY + 95)
        )

        val parsedPage2 = HomeScreenCaptureParser.parse(
            rawNodes = page2Nodes,
            screenWidth = screenW,
            screenHeight = screenH,
            density = density,
            pageNumber = 2,
            totalPages = 11
        )

        assertEquals(5, parsedPage2.detectedCols)
        assertEquals(6, parsedPage2.detectedRows)
        assertEquals(14, parsedPage2.shortcuts.size)
        assertEquals(5, parsedPage2.dock.size)
        assertEquals(1, parsedPage2.widgets.size)
        assertEquals(5, parsedPage2.widgets.first().spanX)
        assertEquals(2, parsedPage2.widgets.first().spanY)
        assertEquals(5, parsedPage2.shortcuts.first { it.label == "Wish" }.row)
        assertEquals(2, parsedPage2.pageNumber)
        assertEquals(11, parsedPage2.totalPages)
    }

    @Test
    fun parsesSparseWidgetHeavyRightColumnPageAndUpperTwoRowPageWithDock() {
        val screenW = 1080
        val screenH = 2340
        val density = 2.8125f

        val colXs = listOf(120, 330, 540, 750, 960)
        val rowYs = listOf(260, 520, 790, 1060, 1330, 1600)
        val dockY = 2010

        fun cell(label: String, col: Int, row: Int, folder: Boolean = false): ObservedBoundsNode {
            val cx = colXs[col]
            val cy = rowYs[row]
            return ObservedBoundsNode(label, cx - 80, cy - 95, cx + 80, cy + 95, isFolderHint = folder)
        }

        // Page 3 pattern: 3x3 Phone widget cols 0..2 rows 0..2, Spotify(3,0), Claude(4,0), Google(3,1), Search 2x1(3..4,2), To-do List(2,5)
        val page3Nodes = listOf(
            ObservedBoundsNode("Voicemail", 40, 165, 620, 885, isWidget = true),
            cell("Spotify", 3, 0),
            cell("Claude", 4, 0),
            cell("Google", 3, 1, folder = true),
            ObservedBoundsNode("Google Search", 670, 695, 1040, 885, isWidget = true),
            cell("To-do List", 2, 5),
            ObservedBoundsNode("Phone", colXs[0] - 80, dockY - 95, colXs[0] + 80, dockY + 95),
            ObservedBoundsNode("DuckDuckGo", colXs[1] - 80, dockY - 95, colXs[1] + 80, dockY + 95),
            ObservedBoundsNode("Messenger", colXs[2] - 80, dockY - 95, colXs[2] + 80, dockY + 95),
            ObservedBoundsNode("Camera", colXs[3] - 80, dockY - 95, colXs[3] + 80, dockY + 95),
            ObservedBoundsNode("Facebook", colXs[4] - 80, dockY - 95, colXs[4] + 80, dockY + 95)
        )

        val parsedPage3 = HomeScreenCaptureParser.parse(
            rawNodes = page3Nodes,
            screenWidth = screenW,
            screenHeight = screenH,
            density = density,
            pageNumber = 3,
            totalPages = 11
        )

        assertEquals(5, parsedPage3.detectedCols)
        assertEquals(6, parsedPage3.detectedRows)
        assertEquals(4, parsedPage3.shortcuts.size)
        assertEquals(5, parsedPage3.dock.size)
        assertEquals(2, parsedPage3.widgets.size)
        val todo = parsedPage3.shortcuts.first { it.label == "To-do List" }
        assertEquals(2, todo.col)
        assertEquals(5, todo.row)

        // Page 4 pattern: only rows 0 & 1 populated + 5 dock icons
        val page4Nodes = listOf(
            cell("App 1", 0, 0),
            cell("App 2", 1, 0),
            cell("App 3", 2, 0),
            cell("App 4", 3, 0),
            cell("App 5", 4, 0),
            cell("App 6", 0, 1),
            cell("App 7", 1, 1),
            cell("App 8", 2, 1),
            ObservedBoundsNode("Phone", colXs[0] - 80, dockY - 95, colXs[0] + 80, dockY + 95),
            ObservedBoundsNode("DuckDuckGo", colXs[1] - 80, dockY - 95, colXs[1] + 80, dockY + 95),
            ObservedBoundsNode("Messenger", colXs[2] - 80, dockY - 95, colXs[2] + 80, dockY + 95),
            ObservedBoundsNode("Camera", colXs[3] - 80, dockY - 95, colXs[3] + 80, dockY + 95),
            ObservedBoundsNode("Facebook", colXs[4] - 80, dockY - 95, colXs[4] + 80, dockY + 95)
        )

        val parsedPage4 = HomeScreenCaptureParser.parse(
            rawNodes = page4Nodes,
            screenWidth = screenW,
            screenHeight = screenH,
            density = density,
            pageNumber = 4,
            totalPages = 11
        )

        assertEquals(5, parsedPage4.detectedCols)
        assertEquals(6, parsedPage4.detectedRows)
        assertEquals(8, parsedPage4.shortcuts.size)
        assertEquals(5, parsedPage4.dock.size)
        assertEquals(Pair(2, 11), HomeScreenCaptureParser.parsePageIndicator("Page 2 of 11"))
    }
}
