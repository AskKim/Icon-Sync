// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android.service

import android.content.Context
import android.os.Build
import com.iconsync.android.grid.LauncherGridDetector
import com.iconsync.android.model.HomeScreenPage
import com.iconsync.android.model.LayoutBackupSnapshot
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.time.Instant

/**
 * Exports portable v2.0 JSON snapshots compatible with Icon Sync Web Studio.
 */
class LauncherBackupService(private val context: Context) {

    private val json = Json {
        prettyPrint = true
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

    fun exportSnapshotToCache(name: String, pages: List<HomeScreenPage>): File {
        val detector = LauncherGridDetector(context)
        val detected = detector.detectGrid()
        val snapshot = LayoutBackupSnapshot(
            id = "bk-${System.currentTimeMillis()}",
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

        val outFile = File(context.cacheDir, "icon-sync-backup-${System.currentTimeMillis()}.json")
        outFile.writeText(json.encodeToString(snapshot))
        return outFile
    }
}
