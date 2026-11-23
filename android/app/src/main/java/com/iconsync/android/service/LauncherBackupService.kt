// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android.service

import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import com.iconsync.android.grid.GridRemapper
import com.iconsync.android.grid.LauncherGridDetector
import com.iconsync.android.grid.RemapResult
import com.iconsync.android.model.GridAdaptationStrategy
import com.iconsync.android.model.HomeScreenPage
import com.iconsync.android.model.IconPlacement
import com.iconsync.android.model.LayoutBackupSnapshot
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.io.IOException
import java.time.Instant
import java.util.Locale

data class ImportedSnapshotAudit(
    val snapshot: LayoutBackupSnapshot,
    val remapResult: RemapResult,
    val totalReferencedApps: Int,
    val installedCount: Int,
    val missingLabelsAndPackages: List<Pair<String, String>>,
    val targetCols: Int,
    val targetRows: Int
)

/**
 * Exports and imports portable v2.0 JSON snapshots compatible with Icon Sync Web Studio.
 */
class LauncherBackupService(private val context: Context) {

    private val json = Json {
        prettyPrint = true
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

    fun buildLiveDeviceSnapshot(name: String? = null): Pair<LayoutBackupSnapshot, String> {
        val detector = LauncherGridDetector(context)
        val detected = detector.detectGrid()
        val launcherName = detector.getLauncherDisplayName(detected.launcherPackage)
        val capturedIcons = detector.getCapturedIcons(detected.cols, detected.rows)
        val capturedFolders = detector.getCapturedFolders(detected.cols, detected.rows)
        val capturedDock = detector.getCapturedDockIcons()

        val pages: List<HomeScreenPage>
        val captureModeNote: String
        if (capturedIcons.isNotEmpty() || capturedFolders.isNotEmpty() || capturedDock.isNotEmpty()) {
            pages = listOf(
                HomeScreenPage(
                    id = "scr-main",
                    name = "Primary Home",
                    isPrimary = true,
                    order = 0,
                    icons = capturedIcons,
                    folders = capturedFolders
                )
            )
            captureModeNote = "Captured ${capturedIcons.size} home icon(s), ${capturedFolders.size} folder(s), and ${capturedDock.size} dock icon(s) via Accessibility."
        } else {
            val starter = buildInstalledStarterPages(detector, detected.cols, detected.rows)
            pages = starter.first
            captureModeNote = starter.second
        }

        val timestamp = System.currentTimeMillis()
        val deviceLabel = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
        val snapshot = LayoutBackupSnapshot(
            id = "bk-$timestamp",
            name = name ?: "$deviceLabel (${detected.cols}x${detected.rows})",
            notes = "Exported from $launcherName on Android ${Build.VERSION.RELEASE}. $captureModeNote",
            schemaVersion = "2.0",
            createdAt = Instant.now().toString(),
            storage = "local",
            sourceDeviceId = "android-${Build.MODEL.lowercase(Locale.ROOT).replace(Regex("[^a-z0-9]+"), "-")}",
            sourceDeviceName = deviceLabel,
            sourceLauncher = detected.launcherPackage,
            gridCols = detected.cols,
            gridRows = detected.rows,
            gridDetectionSource = detected.source,
            screens = pages,
            dock = capturedDock
        )
        return Pair(snapshot, captureModeNote)
    }

    fun buildInstalledStarterPages(
        detector: LauncherGridDetector,
        cols: Int,
        rows: Int
    ): Pair<List<HomeScreenPage>, String> {
        val apps = detector.getInstalledLaunchableApps()
        if (apps.isEmpty()) {
            return Pair(
                listOf(
                    HomeScreenPage(
                        id = "scr-main",
                        name = "Primary Home",
                        isPrimary = true,
                        order = 0
                    )
                ),
                "No launchable apps enumerated; exported empty Primary Home template."
            )
        }

        val perPage = (cols * rows).coerceAtLeast(1)
        val cappedApps = apps.take(perPage * 2)
        val palette = listOf("#166534", "#1D4ED8", "#7C3AED", "#B45309", "#0F766E", "#BE123C")
        val pages = mutableListOf<HomeScreenPage>()

        cappedApps.chunked(perPage).forEachIndexed { pageIdx, chunk ->
            val icons = chunk.mapIndexed { cellIdx, app ->
                val col = cellIdx % cols
                val row = cellIdx / cols
                IconPlacement(
                    id = "ic-app-${pageIdx}-$cellIdx",
                    packageName = app.packageName,
                    label = app.label.take(40),
                    col = col,
                    row = row,
                    iconKey = "smartphone",
                    tint = palette[(pageIdx * perPage + cellIdx) % palette.size],
                    category = "Utilities"
                )
            }
            pages += HomeScreenPage(
                id = if (pageIdx == 0) "scr-main" else "scr-page-${pageIdx + 1}",
                name = if (pageIdx == 0) "Primary Home" else "App Inventory ${pageIdx + 1}",
                isPrimary = pageIdx == 0,
                order = pageIdx,
                icons = icons
            )
        }

        return Pair(
            pages,
            "Populated ${pages.size} screen(s) with ${cappedApps.size} installed launchable apps (of ${apps.size} total). Enable Accessibility to capture exact home coordinates."
        )
    }

    fun encodeSnapshotJson(snapshot: LayoutBackupSnapshot): String =
        json.encodeToString(snapshot)

    fun exportSnapshotToCache(name: String, pages: List<HomeScreenPage>): File {
        val detector = LauncherGridDetector(context)
        val detected = detector.detectGrid()
        val timestamp = System.currentTimeMillis()
        val snapshot = LayoutBackupSnapshot(
            id = "bk-$timestamp",
            name = name,
            schemaVersion = "2.0",
            createdAt = Instant.now().toString(),
            sourceDeviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
            sourceLauncher = detected.launcherPackage,
            gridCols = detected.cols,
            gridRows = detected.rows,
            gridDetectionSource = detected.source,
            screens = pages
        )
        return writeSnapshotAtomicallyToExportsDir(snapshot)
    }

    fun exportLiveSnapshotForSharing(snapshot: LayoutBackupSnapshot): File =
        writeSnapshotAtomicallyToExportsDir(snapshot)

    fun exportSnapshotToUri(uri: Uri, snapshot: LayoutBackupSnapshot) {
        val payload = encodeSnapshotJson(snapshot)
        context.contentResolver.openOutputStream(uri)?.use { output ->
            output.write(payload.toByteArray(Charsets.UTF_8))
            output.flush()
        } ?: throw IOException("Unable to open output stream for selected document URI.")
    }

    fun createAndExportSnapshotInTree(
        treeUri: Uri,
        fileName: String,
        snapshot: LayoutBackupSnapshot
    ): Uri {
        val treeDocId = DocumentsContract.getTreeDocumentId(treeUri)
        val parentDocUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, treeDocId)
        val createdUri = DocumentsContract.createDocument(
            context.contentResolver,
            parentDocUri,
            "application/json",
            fileName
        ) ?: throw IOException("Unable to create $fileName inside selected folder.")
        exportSnapshotToUri(createdUri, snapshot)
        return createdUri
    }

    fun readTextFromUri(uri: Uri): String {
        return context.contentResolver.openInputStream(uri)?.use { input ->
            input.bufferedReader(Charsets.UTF_8).readText()
        } ?: throw IOException("Unable to read saved file.")
    }

    fun resolveDisplayName(uri: Uri): String? {
        return runCatching {
            context.contentResolver.query(
                uri,
                arrayOf(OpenableColumns.DISPLAY_NAME),
                null,
                null,
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) cursor.getString(idx) else null
                } else {
                    null
                }
            }
        }.getOrNull()
    }

    fun importAndAuditFromUri(
        uri: Uri,
        strategy: GridAdaptationStrategy = GridAdaptationStrategy.AUTO_REFLOW
    ): ImportedSnapshotAudit {
        val rawJson = context.contentResolver.openInputStream(uri)?.use { input ->
            input.bufferedReader(Charsets.UTF_8).readText()
        } ?: throw IOException("Unable to read selected JSON file.")

        val snapshot = json.decodeFromString<LayoutBackupSnapshot>(rawJson)
        val detector = LauncherGridDetector(context)
        val targetGrid = detector.detectGrid()
        val installedPackages = detector.getInstalledPackageSet()

        val remapResult = GridRemapper.remapPages(
            sourcePages = snapshot.screens,
            sourceCols = snapshot.gridCols.coerceIn(3, 8),
            sourceRows = snapshot.gridRows.coerceIn(3, 8),
            targetCols = targetGrid.cols,
            targetRows = targetGrid.rows,
            strategy = strategy
        )

        val referencedApps = mutableListOf<Pair<String, String>>()
        val seenPkgs = mutableSetOf<String>()
        for (screen in snapshot.screens) {
            for (icon in screen.icons) {
                if (!icon.isPlaceholder && seenPkgs.add(icon.packageName)) {
                    referencedApps += Pair(icon.label, icon.packageName)
                }
            }
            for (folder in screen.folders) {
                for (nested in folder.apps) {
                    if (!nested.isPlaceholder && seenPkgs.add(nested.packageName)) {
                        referencedApps += Pair(nested.label, nested.packageName)
                    }
                }
            }
        }
        for (dockIcon in snapshot.dock) {
            if (!dockIcon.isPlaceholder && seenPkgs.add(dockIcon.packageName)) {
                referencedApps += Pair(dockIcon.label, dockIcon.packageName)
            }
        }

        val missing = referencedApps.filter { (_, pkg) -> pkg !in installedPackages }
        val installedCount = referencedApps.size - missing.size

        return ImportedSnapshotAudit(
            snapshot = snapshot,
            remapResult = remapResult,
            totalReferencedApps = referencedApps.size,
            installedCount = installedCount,
            missingLabelsAndPackages = missing,
            targetCols = targetGrid.cols,
            targetRows = targetGrid.rows
        )
    }

    private fun writeSnapshotAtomicallyToExportsDir(snapshot: LayoutBackupSnapshot): File {
        val exportsDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val timestamp = System.currentTimeMillis()
        val outFile = File(exportsDir, "icon-sync-backup-$timestamp.json")
        val tmpFile = File.createTempFile("icon-sync-backup-$timestamp-", ".tmp", exportsDir)
        try {
            tmpFile.writeText(encodeSnapshotJson(snapshot), Charsets.UTF_8)
            if (!tmpFile.renameTo(outFile)) {
                throw IOException("Failed to atomically rename ${tmpFile.name} to ${outFile.name}")
            }
        } catch (e: Exception) {
            if (tmpFile.exists()) {
                tmpFile.delete()
            }
            throw e
        }
        return outFile
    }
}
