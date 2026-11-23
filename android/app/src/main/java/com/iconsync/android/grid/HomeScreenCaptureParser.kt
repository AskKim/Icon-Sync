// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android.grid

import kotlin.math.abs
import kotlin.math.roundToInt

data class ObservedBoundsNode(
    val label: String,
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
    val isFolderHint: Boolean = false,
    val inHotseat: Boolean = false,
    val isWidget: Boolean = false,
    val providerHint: String = ""
) {
    val centerX: Int get() = (left + right) / 2
    val centerY: Int get() = (top + bottom) / 2
    val width: Int get() = (right - left).coerceAtLeast(0)
    val height: Int get() = (bottom - top).coerceAtLeast(0)
}

data class ParsedHomeCapture(
    val detectedCols: Int?,
    val detectedRows: Int?,
    val shortcuts: List<CapturedShortcut>,
    val dock: List<CapturedShortcut>,
    val widgets: List<CapturedWidget> = emptyList(),
    val pageNumber: Int? = null,
    val totalPages: Int? = null
)

/**
 * Pure Kotlin parser that cleans launcher Accessibility node labels, separates
 * hotseat/dock icons from workspace cells, estimates grid columns/rows via both
 * occupied clusters and uniform cell pitch (handling sparse & widget-heavy pages),
 * and maps visible shortcuts, folders, and widgets to deterministic (col, row) slots.
 */
object HomeScreenCaptureParser {

    private val NOTIFICATION_SUFFIX_REGEX = Regex(
        pattern = ",\\s*\\d+\\s+(?:notifications?|missed\\s+calls?|unread.*|new\\s+items?)\\b.*$",
        option = RegexOption.IGNORE_CASE
    )
    private val FOLDER_SUFFIX_REGEX = Regex(
        pattern = ",\\s*folder\\b.*$",
        option = RegexOption.IGNORE_CASE
    )
    private val FOLDER_PREFIX_REGEX = Regex(
        pattern = "^folder:\\s*",
        option = RegexOption.IGNORE_CASE
    )
    private val FOLDER_COUNT_SUFFIX_REGEX = Regex(
        pattern = ",\\s*\\d+\\s+(?:apps?|items?)\\b.*$",
        option = RegexOption.IGNORE_CASE
    )
    private val ACTION_HINT_SUFFIX_REGEX = Regex(
        pattern = ",\\s*(?:double[- ]tap.*|app icon|shortcut|widget|notification badge.*)$",
        option = RegexOption.IGNORE_CASE
    )
    private val PAGE_INDICATOR_REGEX = Regex(
        pattern = "^(?:page|home\\s+screen)\\s+(\\d+)(?:\\s+of\\s+(\\d+))?$",
        option = RegexOption.IGNORE_CASE
    )
    private val PURE_NUMBER_REGEX = Regex("^\\d+$")

    private val IGNORED_CHROME_LABELS = setOf(
        "search",
        "search apps",
        "close all",
        "clear all",
        "wallpaper and style",
        "themes",
        "home settings",
        "widgets",
        "add to home",
        "default home screen",
        "remove page",
        "add page"
    )

    fun parsePageIndicator(rawLabel: String?): Pair<Int, Int>? {
        if (rawLabel.isNullOrBlank()) return null
        val firstLine = rawLabel.substringBefore('\n').trim()
        val match = PAGE_INDICATOR_REGEX.matchEntire(firstLine) ?: return null
        val page = match.groupValues.getOrNull(1)?.toIntOrNull()?.takeIf { it in 1..40 } ?: return null
        val total = match.groupValues.getOrNull(2)?.toIntOrNull()?.takeIf { it in page..40 } ?: page
        return Pair(page, total)
    }

    fun cleanShortcutLabel(rawLabel: String?): Pair<String, Boolean>? {
        if (rawLabel.isNullOrBlank()) return null
        val firstLine = rawLabel.substringBefore('\n').trim()
        if (firstLine.isBlank()) return null
        if (PAGE_INDICATOR_REGEX.matches(firstLine)) return null

        val isFolder = FOLDER_SUFFIX_REGEX.containsMatchIn(firstLine) ||
            FOLDER_PREFIX_REGEX.containsMatchIn(firstLine)
        val cleaned = firstLine
            .replace(FOLDER_PREFIX_REGEX, "")
            .replace(FOLDER_SUFFIX_REGEX, "")
            .replace(FOLDER_COUNT_SUFFIX_REGEX, "")
            .replace(NOTIFICATION_SUFFIX_REGEX, "")
            .replace(ACTION_HINT_SUFFIX_REGEX, "")
            .trim()
            .trimEnd(',')
            .trim()

        if (cleaned.isBlank()) return null
        if (PURE_NUMBER_REGEX.matches(cleaned)) return null
        if (PAGE_INDICATOR_REGEX.matches(cleaned)) return null
        if (cleaned.lowercase() in IGNORED_CHROME_LABELS) return null

        return Pair(cleaned.take(60), isFolder)
    }

    fun parse(
        rawNodes: List<ObservedBoundsNode>,
        screenWidth: Int,
        screenHeight: Int,
        density: Float,
        fallbackCols: Int = 5,
        fallbackRows: Int = 6,
        pageNumber: Int? = null,
        totalPages: Int? = null
    ): ParsedHomeCapture {
        if (rawNodes.isEmpty() || screenWidth <= 0 || screenHeight <= 0) {
            return ParsedHomeCapture(null, null, emptyList(), emptyList(), emptyList(), pageNumber, totalPages)
        }

        val safeDensity = density.coerceAtLeast(1f)
        val dedupRadiusPx = (18f * safeDensity).roundToInt()
        val axisGapPx = (28f * safeDensity).roundToInt()
        val minReasonableCellPx = (36f * safeDensity).roundToInt()

        // Keep strictly on-screen visible nodes so adjacent launcher pages in PagedView are excluded
        val onScreenWidgets = rawNodes.filter { node ->
            node.isWidget &&
                node.width > 0 &&
                node.height > 0 &&
                node.centerX in 0 until screenWidth &&
                node.centerY in 0 until screenHeight
        }

        val onScreenItems = rawNodes.filter { node ->
            !node.isWidget &&
                node.width > 0 &&
                node.height > 0 &&
                node.centerX in 0 until screenWidth &&
                node.centerY in 0 until screenHeight
        }

        if (onScreenItems.isEmpty() && onScreenWidgets.isEmpty()) {
            return ParsedHomeCapture(null, null, emptyList(), emptyList(), emptyList(), pageNumber, totalPages)
        }

        val deduplicatedItems = deduplicateByProximity(onScreenItems, dedupRadiusPx)
            .filterNot { item ->
                // Guard against widget child controls leaking as workspace icons
                !item.inHotseat && onScreenWidgets.any { w ->
                    item.centerX in (w.left + 8)..(w.right - 8) &&
                        item.centerY in (w.top + 8)..(w.bottom - 8)
                }
            }

        // Separate hotseat/dock from workspace
        val explicitDock = deduplicatedItems.filter { it.inHotseat }
        val nonExplicitDock = deduplicatedItems.filterNot { it.inHotseat }

        val dockNodes: List<ObservedBoundsNode>
        val workspaceNodes: List<ObservedBoundsNode>

        if (explicitDock.isNotEmpty()) {
            dockNodes = explicitDock
            workspaceNodes = nonExplicitDock
        } else {
            val allRowCenters = clusterAxisCenters(nonExplicitDock.map { it.centerY }, axisGapPx)
            val bottomCenterY = allRowCenters.lastOrNull()
            val dockThresholdByHeight = (screenHeight * 0.78f).roundToInt()
            val strongDockBandY = (screenHeight * 0.81f).roundToInt()

            val isBottomDockBand = bottomCenterY != null &&
                bottomCenterY >= strongDockBandY &&
                allRowCenters.size >= 2

            val isGapSeparatedDenseDock = if (bottomCenterY != null &&
                bottomCenterY >= dockThresholdByHeight &&
                allRowCenters.size >= 4
            ) {
                val gaps = allRowCenters.zipWithNext { a, b -> b - a }
                val upperGaps = gaps.dropLast(1).sorted()
                val medianUpperGap = upperGaps[upperGaps.size / 2].coerceAtLeast(1)
                val lastGap = gaps.last()
                lastGap >= (medianUpperGap * 1.28f).roundToInt() || allRowCenters.size >= 5
            } else {
                false
            }

            if (isBottomDockBand || isGapSeparatedDenseDock) {
                val dockCutoffY = bottomCenterY!! - axisGapPx
                dockNodes = nonExplicitDock.filter { it.centerY >= dockCutoffY }
                workspaceNodes = nonExplicitDock.filter { it.centerY < dockCutoffY }
            } else {
                dockNodes = emptyList()
                workspaceNodes = nonExplicitDock
            }
        }

        val dockShortcuts = dockNodes
            .sortedBy { it.centerX }
            .distinctBy { it.centerX / (dedupRadiusPx.coerceAtLeast(1)) }
            .take(8)
            .mapIndexed { idx, node ->
                CapturedShortcut(
                    label = node.label,
                    col = idx,
                    row = 0,
                    isFolder = node.isFolderHint
                )
            }

        if (workspaceNodes.isEmpty() && onScreenWidgets.isEmpty()) {
            return ParsedHomeCapture(
                detectedCols = null,
                detectedRows = null,
                shortcuts = emptyList(),
                dock = dockShortcuts,
                widgets = emptyList(),
                pageNumber = pageNumber,
                totalPages = totalPages
            )
        }

        val defaultGridLeft = (screenWidth * 0.03f).roundToInt()
        val defaultGridRight = (screenWidth * 0.97f).roundToInt().coerceAtLeast(defaultGridLeft + 1)
        val defaultGridTop = (screenHeight * 0.055f).roundToInt()

        val allWorkspaceBounds = workspaceNodes + onScreenWidgets
        val observedMinLeft = allWorkspaceBounds.minOfOrNull { it.left } ?: defaultGridLeft
        val observedMaxRight = allWorkspaceBounds.maxOfOrNull { it.right } ?: defaultGridRight
        val observedMinTop = allWorkspaceBounds.minOfOrNull { it.top } ?: defaultGridTop
        val observedMaxBottom = allWorkspaceBounds.maxOfOrNull { it.bottom } ?: (screenHeight * 0.77f).roundToInt()

        val gridLeft = minOf(defaultGridLeft, observedMinLeft).coerceAtLeast(0)
        val gridRight = maxOf(defaultGridRight, observedMaxRight).coerceAtMost(screenWidth)
        val gridTop = minOf(defaultGridTop, observedMinTop).coerceAtLeast(0)

        val dockAwareBottom = if (dockNodes.isNotEmpty()) {
            val dockTop = dockNodes.minOf { it.top }
            val pageIndicatorMargin = (screenHeight * 0.055f).roundToInt()
            (dockTop - pageIndicatorMargin).coerceIn(
                (screenHeight * 0.68f).roundToInt(),
                (screenHeight * 0.79f).roundToInt()
            )
        } else {
            (screenHeight * 0.77f).roundToInt()
        }
        val gridBottom = maxOf(dockAwareBottom, observedMaxBottom)
            .coerceAtLeast(gridTop + 1)
            .coerceAtMost((screenHeight * 0.82f).roundToInt())

        val colCenters = clusterAxisCenters(workspaceNodes.map { it.centerX }, axisGapPx)
        val rowCenters = clusterAxisCenters(workspaceNodes.map { it.centerY }, axisGapPx)

        val detectedCols = estimateAxisCount(
            centers = colCenters,
            itemCount = workspaceNodes.size,
            hasWidgets = onScreenWidgets.isNotEmpty(),
            gridStart = gridLeft,
            gridEnd = gridRight,
            minCellPx = minReasonableCellPx,
            requireSpanForPitch = dockNodes.isNotEmpty() || onScreenWidgets.isNotEmpty() || colCenters.size >= 3
        )

        val detectedRows = estimateAxisCount(
            centers = rowCenters,
            itemCount = workspaceNodes.size,
            hasWidgets = onScreenWidgets.isNotEmpty(),
            gridStart = gridTop,
            gridEnd = gridBottom,
            minCellPx = minReasonableCellPx,
            requireSpanForPitch = dockNodes.isNotEmpty() || onScreenWidgets.isNotEmpty() || rowCenters.size >= 3
        )

        val effectiveCols = detectedCols ?: fallbackCols.coerceIn(3, 8)
        val effectiveRows = detectedRows ?: fallbackRows.coerceIn(3, 8)

        val useClusterCols = colCenters.size == effectiveCols && hasUniformCoverage(colCenters, gridLeft, gridRight)
        val useClusterRows = rowCenters.size == effectiveRows && hasUniformCoverage(rowCenters, gridTop, gridBottom)

        val shortcuts = workspaceNodes.map { node ->
            val col = if (useClusterCols) {
                nearestClusterIndex(node.centerX, colCenters)
            } else {
                proportionalIndex(node.centerX, gridLeft, gridRight, effectiveCols)
            }
            val row = if (useClusterRows) {
                nearestClusterIndex(node.centerY, rowCenters)
            } else {
                proportionalIndex(node.centerY, gridTop, gridBottom, effectiveRows)
            }
            CapturedShortcut(
                label = node.label,
                col = col.coerceIn(0, effectiveCols - 1),
                row = row.coerceIn(0, effectiveRows - 1),
                isFolder = node.isFolderHint
            )
        }

        val cellWidth = (gridRight - gridLeft).toFloat() / effectiveCols.toFloat()
        val cellHeight = (gridBottom - gridTop).toFloat() / effectiveRows.toFloat()

        val widgets = onScreenWidgets
            .sortedWith(compareBy({ it.top }, { it.left }))
            .mapNotNull { w ->
                if (cellWidth <= 1f || cellHeight <= 1f) return@mapNotNull null
                val insetX = cellWidth * 0.35f
                val insetY = cellHeight * 0.35f
                val startCol = (((w.left + insetX) - gridLeft) / cellWidth).toInt().coerceIn(0, effectiveCols - 1)
                val endCol = (((w.right - insetX) - gridLeft) / cellWidth).toInt().coerceIn(startCol, effectiveCols - 1)
                val startRow = (((w.top + insetY) - gridTop) / cellHeight).toInt().coerceIn(0, effectiveRows - 1)
                val endRow = (((w.bottom - insetY) - gridTop) / cellHeight).toInt().coerceIn(startRow, effectiveRows - 1)
                val spanX = (endCol - startCol + 1).coerceIn(1, effectiveCols - startCol)
                val spanY = (endRow - startRow + 1).coerceIn(1, effectiveRows - startRow)
                CapturedWidget(
                    label = w.label.ifBlank { "App Widget" },
                    provider = w.providerHint,
                    col = startCol,
                    row = startRow,
                    spanX = spanX,
                    spanY = spanY
                )
            }
            .distinctBy { Pair(it.col, it.row) }

        return ParsedHomeCapture(
            detectedCols = detectedCols,
            detectedRows = detectedRows,
            shortcuts = shortcuts,
            dock = dockShortcuts,
            widgets = widgets,
            pageNumber = pageNumber,
            totalPages = totalPages
        )
    }

    private fun estimateAxisCount(
        centers: List<Int>,
        itemCount: Int,
        hasWidgets: Boolean,
        gridStart: Int,
        gridEnd: Int,
        minCellPx: Int,
        requireSpanForPitch: Boolean
    ): Int? {
        val totalSpan = (gridEnd - gridStart).coerceAtLeast(1)
        if (centers.size < 2) return null

        val deltas = centers.zipWithNext { a, b -> b - a }.filter { it >= minCellPx }
        val minDelta = deltas.minOrNull()
        val maxDelta = deltas.maxOrNull()

        // Dense coverage across almost the full axis matches cluster count directly
        if (centers.size in 3..8 && minDelta != null && maxDelta != null && maxDelta <= (minDelta * 1.45f).roundToInt()) {
            val observedSpan = centers.last() - centers.first()
            if (observedSpan >= (totalSpan * 0.54f).roundToInt()) {
                return centers.size
            }
        }

        // Pitch-based recovery when columns/rows are empty or occupied by widgets (sparse pages)
        val hasEnoughSignal = centers.size >= 3 || (itemCount >= 3 && centers.size >= 2) || (hasWidgets && centers.size >= 2)
        if (hasEnoughSignal && requireSpanForPitch && minDelta != null) {
            val estimated = (totalSpan.toFloat() / minDelta.toFloat()).roundToInt()
            if (estimated in 3..8 && deltas.all { isNearMultiple(it, minDelta) }) {
                return estimated
            }
        }

        return null
    }

    private fun isNearMultiple(value: Int, base: Int): Boolean {
        if (base <= 0) return false
        val ratio = value.toFloat() / base.toFloat()
        val nearest = ratio.roundToInt().coerceAtLeast(1)
        return abs(ratio - nearest) <= 0.25f
    }

    private fun hasUniformCoverage(centers: List<Int>, gridStart: Int, gridEnd: Int): Boolean {
        if (centers.size < 3) return false
        val span = (gridEnd - gridStart).coerceAtLeast(1)
        val gaps = centers.zipWithNext { a, b -> b - a }
        val minGap = gaps.minOrNull() ?: return false
        val maxGap = gaps.maxOrNull() ?: return false
        return (centers.last() - centers.first()) >= (span * 0.54f).roundToInt() &&
            maxGap <= (minGap * 1.45f).roundToInt()
    }

    fun clusterAxisCenters(values: List<Int>, maxGapPx: Int): List<Int> {
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

    fun nearestClusterIndex(value: Int, centers: List<Int>): Int {
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

    private fun proportionalIndex(value: Int, minVal: Int, maxVal: Int, count: Int): Int {
        if (count <= 1) return 0
        val ratio = ((value - minVal).toFloat() / (maxVal - minVal).toFloat()).coerceIn(0f, 0.999f)
        return (ratio * count).toInt().coerceIn(0, count - 1)
    }

    private fun deduplicateByProximity(
        nodes: List<ObservedBoundsNode>,
        radiusPx: Int
    ): List<ObservedBoundsNode> {
        val kept = mutableListOf<ObservedBoundsNode>()
        for (candidate in nodes) {
            val existingIdx = kept.indexOfFirst { existing ->
                abs(existing.centerX - candidate.centerX) <= radiusPx &&
                    abs(existing.centerY - candidate.centerY) <= radiusPx
            }
            if (existingIdx < 0) {
                kept += candidate
            } else {
                val existing = kept[existingIdx]
                if (candidate.label.length > existing.label.length && !existing.isFolderHint) {
                    kept[existingIdx] = candidate
                }
            }
        }
        return kept
    }
}
