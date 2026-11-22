// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android.grid

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
                    baseName = "${page.name} (Cont.)",
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
            grids += Array(rows) { BooleanArray(cols) }
            widgetsPerPage += mutableListOf()
            foldersPerPage += mutableListOf()
            iconsPerPage += mutableListOf()
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
            val suffix = if (grids.size > 1) " ${i + 1}" else ""
            pages += HomeScreenPage(
                id = "overflow-${startOrder + i}",
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
}
