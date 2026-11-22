// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android

import com.iconsync.android.grid.GridRemapper
import com.iconsync.android.model.GridAdaptationStrategy
import com.iconsync.android.model.HomeScreenPage
import com.iconsync.android.model.IconPlacement
import com.iconsync.android.model.WidgetPlacement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GridRemapperTest {

    private fun buildDenseSixBySixPage(): HomeScreenPage {
        val icons = mutableListOf<IconPlacement>()
        // Fill 24 icons across rows 1..5, cols 0..5 (exceeds 5x4 capacity of 20 cells)
        var counter = 0
        for (r in 1..5) {
            for (c in 0..5) {
                if (counter >= 24) break
                icons += IconPlacement(
                    id = "ic-$counter",
                    packageName = "com.example.app$counter",
                    label = "App $counter",
                    col = c,
                    row = r
                )
                counter++
            }
        }
        val wideWidget = WidgetPlacement(
            id = "w-wide",
            syncKey = "weather-main",
            provider = "Weather",
            title = "Weather Strip",
            col = 0,
            row = 0,
            spanX = 6,
            spanY = 1
        )
        return HomeScreenPage(
            id = "scr-6x6",
            name = "Nova 6x6 Home",
            isPrimary = true,
            order = 0,
            icons = icons,
            widgets = listOf(wideWidget)
        )
    }

    @Test
    fun autoReflowAdapts6x6Into5x4WithZeroLoss() {
        val source = listOf(buildDenseSixBySixPage())
        val result = GridRemapper.remapPages(
            sourcePages = source,
            sourceCols = 6,
            sourceRows = 6,
            targetCols = 5,
            targetRows = 4,
            strategy = GridAdaptationStrategy.AUTO_REFLOW
        )

        val totalIconsPlaced = result.screens.sumOf { it.icons.size }
        assertEquals(24, totalIconsPlaced)
        assertEquals(1, result.widgetsResized)
        assertEquals(0, result.droppedByCrop)
        assertTrue("Expected overflow page to be created", result.overflowPagesAdded >= 1)

        // Verify every placed icon and widget is strictly within 5x4 bounds
        for (scr in result.screens) {
            for (ic in scr.icons) {
                assertTrue(ic.col in 0 until 5)
                assertTrue(ic.row in 0 until 4)
            }
            for (w in scr.widgets) {
                assertTrue(w.col + w.spanX <= 5)
                assertTrue(w.row + w.spanY <= 4)
            }
        }
    }

    @Test
    fun proportionalScalePreservesAllItemsWithinTargetBounds() {
        val source = listOf(buildDenseSixBySixPage())
        val result = GridRemapper.remapPages(
            sourcePages = source,
            sourceCols = 6,
            sourceRows = 6,
            targetCols = 5,
            targetRows = 4,
            strategy = GridAdaptationStrategy.PROPORTIONAL_SCALE
        )

        assertEquals(24, result.screens.sumOf { it.icons.size })
        assertEquals(1, result.screens.sumOf { it.widgets.size })
        assertEquals(0, result.droppedByCrop)
    }

    @Test
    fun cropWithinBoundsDropsOutOfBoundsItemsWithoutAddingPages() {
        val source = listOf(buildDenseSixBySixPage())
        val result = GridRemapper.remapPages(
            sourcePages = source,
            sourceCols = 6,
            sourceRows = 6,
            targetCols = 5,
            targetRows = 4,
            strategy = GridAdaptationStrategy.CROP_WITHIN_BOUNDS
        )

        assertEquals(1, result.screens.size)
        assertEquals(0, result.overflowPagesAdded)
        assertTrue("Expected out-of-bounds items to be cropped", result.droppedByCrop > 0)
    }

    @Test
    fun resizeTargetGridMatchesSource6x6OneToOne() {
        val source = listOf(buildDenseSixBySixPage())
        val result = GridRemapper.remapPages(
            sourcePages = source,
            sourceCols = 6,
            sourceRows = 6,
            targetCols = 5,
            targetRows = 4,
            strategy = GridAdaptationStrategy.RESIZE_TARGET_GRID
        )

        assertEquals(6, result.targetCols)
        assertEquals(6, result.targetRows)
        assertEquals(0, result.relocatedCount)
        assertEquals(0, result.widgetsResized)
        assertEquals(1, result.screens.size)
    }

    @Test
    fun preservePagesCreatesSiblingContinuationPagesWithZeroLoss() {
        val source = listOf(buildDenseSixBySixPage())
        val result = GridRemapper.remapPages(
            sourcePages = source,
            sourceCols = 6,
            sourceRows = 6,
            targetCols = 5,
            targetRows = 4,
            strategy = GridAdaptationStrategy.PRESERVE_PAGES
        )

        assertEquals(24, result.screens.sumOf { it.icons.size })
        assertEquals(1, result.screens.sumOf { it.widgets.size })
        assertEquals(0, result.droppedByCrop)
        assertTrue("Expected sibling continuation page", result.overflowPagesAdded >= 1)
        assertTrue(result.screens.any { it.name.contains("(Cont.)") })
    }
}
