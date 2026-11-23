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
    val inHotseat: Boolean = false
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
    val dock: List<CapturedShortcut>
)

/**
 * Pure Kotlin parser that cleans launcher Accessibility node labels, separates
 * hotseat/dock icons from workspace cells, clusters X/Y axes into grid columns/rows,
 * and maps visible shortcuts to deterministic (col, row) coordinates.
 */
object HomeScreenCaptureParser {

    private val NOTIFICATION_SUFFIX_REGEX = Regex(
        pattern = ",\\s*\\d+\\s+notifications?\\b.*$",
        option = RegexOption.IGNORE_CASE
    )
    private val FOLDER_SUFFIX_REGEX = Regex(
        pattern = ",\\s*folder\\b.*$",
        option = RegexOption.IGNORE_CASE
    )
    private val ACTION_HINT_SUFFIX_REGEX = Regex(
        pattern = ",\\s*(?:double[- ]tap.*|app icon|shortcut|widget|notification badge.*)$",
        option = RegexOption.IGNORE_CASE
    )
    private val PAGE_INDICATOR_REGEX = Regex(
        pattern = "^page\\s+\\d+(?:\\s+of\\s+\\d+)?$",
        option = RegexOption.IGNORE_CASE
    )
    private val PURE_NUMBER_REGEX = Regex("^\\d+$")

    private val IGNORED_CHROME_LABELS = setOf(
        "search",
        "search apps",
        "close all",
        "wallpaper and style",
        "themes",
        "home settings",
        "widgets",
        "add to home"
    )

    fun cleanShortcutLabel(rawLabel: String?): Pair<String, Boolean>? {
        if (rawLabel.isNullOrBlank()) return null
        val firstLine = rawLabel.substringBefore('\n').trim()
        if (firstLine.isBlank()) return null

        val isFolder = FOLDER_SUFFIX_REGEX.containsMatchIn(firstLine)
        var cleaned = firstLine
            .replace(FOLDER_SUFFIX_REGEX, "")
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
        fallbackRows: Int = 6
    ): ParsedHomeCapture {
        if (rawNodes.isEmpty() || screenWidth <= 0 || screenHeight <= 0) {
            return ParsedHomeCapture(null, null, emptyList(), emptyList())
        }

        val safeDensity = density.coerceAtLeast(1f)
        val dedupRadiusPx = (18f * safeDensity).roundToInt()
        val axisGapPx = (28f * safeDensity).roundToInt()

        // Keep strictly on-screen visible nodes so adjacent launcher pages in PagedView are excluded
        val onScreenNodes = rawNodes.filter { node ->
            node.width > 0 &&
                node.height > 0 &&
                node.centerX in 0 until screenWidth &&
                node.centerY in 0 until screenHeight
        }
        if (onScreenNodes.isEmpty()) {
            return ParsedHomeCapture(null, null, emptyList(), emptyList())
        }

        val deduplicated = deduplicateByProximity(onScreenNodes, dedupRadiusPx)

        // Separate hotseat/dock from workspace
        val explicitDock = deduplicated.filter { it.inHotseat }
        val nonExplicitDock = deduplicated.filterNot { it.inHotseat }

        val dockNodes: List<ObservedBoundsNode>
        val workspaceNodes: List<ObservedBoundsNode>

        if (explicitDock.isNotEmpty()) {
            dockNodes = explicitDock
            workspaceNodes = nonExplicitDock
        } else {
            val allRowCenters = clusterAxisCenters(nonExplicitDock.map { it.centerY }, axisGapPx)
            val bottomCenterY = allRowCenters.lastOrNull()
            val hasDockCandidateZone = bottomCenterY != null &&
                bottomCenterY >= (screenHeight * 0.78f).roundToInt() &&
                allRowCenters.size >= 4

            val isGapSeparated = if (allRowCenters.size >= 4) {
                val gaps = allRowCenters.zipWithNext { a, b -> b - a }
                val upperGaps = gaps.dropLast(1).sorted()
                val medianUpperGap = upperGaps[upperGaps.size / 2].coerceAtLeast(1)
                val lastGap = gaps.last()
                lastGap >= (medianUpperGap * 1.28f).roundToInt()
            } else {
                false
            }

            if (hasDockCandidateZone && (isGapSeparated || allRowCenters.size >= 5)) {
                val dockThresholdY = bottomCenterY!! - axisGapPx
                dockNodes = nonExplicitDock.filter { it.centerY >= dockThresholdY }
                workspaceNodes = nonExplicitDock.filter { it.centerY < dockThresholdY }
            } else {
                dockNodes = emptyList()
                workspaceNodes = nonExplicitDock
            }
        }

        val dockShortcuts = dockNodes
            .sortedBy { it.centerX }
            .distinctBy { it.centerX / (axisGapPx.coerceAtLeast(1)) }
            .take(8)
            .mapIndexed { idx, node ->
                CapturedShortcut(
                    label = node.label,
                    col = idx,
                    row = 0,
                    isFolder = node.isFolderHint
                )
            }

        if (workspaceNodes.isEmpty()) {
            return ParsedHomeCapture(null, null, emptyList(), dockShortcuts)
        }

        val colCenters = clusterAxisCenters(workspaceNodes.map { it.centerX }, axisGapPx)
        val rowCenters = clusterAxisCenters(workspaceNodes.map { it.centerY }, axisGapPx)

        val detectedCols = colCenters.size.takeIf { it in 3..8 }
        val detectedRows = rowCenters.size.takeIf { it in 3..8 }

        val effectiveCols = detectedCols ?: fallbackCols.coerceIn(3, 8)
        val effectiveRows = detectedRows ?: fallbackRows.coerceIn(3, 8)

        val minX = (screenWidth * 0.04f).roundToInt()
        val maxX = (screenWidth * 0.96f).roundToInt().coerceAtLeast(minX + 1)
        val minY = (screenHeight * 0.06f).roundToInt()
        val maxY = (screenHeight * 0.77f).roundToInt().coerceAtLeast(minY + 1)

        val shortcuts = workspaceNodes.map { node ->
            val col = if (detectedCols != null) {
                nearestClusterIndex(node.centerX, colCenters)
            } else {
                proportionalIndex(node.centerX, minX, maxX, effectiveCols)
            }
            val row = if (detectedRows != null) {
                nearestClusterIndex(node.centerY, rowCenters)
            } else {
                proportionalIndex(node.centerY, minY, maxY, effectiveRows)
            }
            CapturedShortcut(
                label = node.label,
                col = col.coerceIn(0, effectiveCols - 1),
                row = row.coerceIn(0, effectiveRows - 1),
                isFolder = node.isFolderHint
            )
        }

        return ParsedHomeCapture(
            detectedCols = detectedCols,
            detectedRows = detectedRows,
            shortcuts = shortcuts,
            dock = dockShortcuts
        )
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
