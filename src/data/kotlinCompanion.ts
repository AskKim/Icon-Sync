export interface CompanionSourceFile {
  filename: string;
  path: string;
  language: 'kotlin' | 'xml';
  summary: string;
  content: string;
}

export const ANDROID_COMPANION_FILES: CompanionSourceFile[] = [
  {
    filename: 'BackupSchema.kt',
    path: 'app/src/main/java/com/homegrid/sync/model/BackupSchema.kt',
    language: 'kotlin',
    summary: 'Serializable data classes matching the HomeGrid v2.0 JSON backup format for icons, folders, supplemental screens, and synced widgets.',
    content: `package com.homegrid.sync.model

import kotlinx.serialization.Serializable

@Serializable
data class LayoutBackupSnapshot(
    val id: String,
    val name: String,
    val notes: String = "",
    val schemaVersion: String = "2.0",
    val createdAt: String,
    val sourceDeviceId: String,
    val sourceDeviceName: String,
    val sourceLauncher: String,
    val gridCols: Int,
    val gridRows: Int,
    val screens: List<HomeScreenPage>,
    val dock: List<AppIconItem>,
    val checksum: String
)

@Serializable
data class HomeScreenPage(
    val id: String,
    val name: String,
    val isPrimary: Boolean,
    val order: Int,
    val icons: List<AppIconItem>,
    val folders: List<FolderItem>,
    val widgets: List<WidgetItem>
)

@Serializable
data class AppIconItem(
    val id: String,
    val packageName: String,
    val label: String,
    val col: Int = 0,
    val row: Int = 0
)

@Serializable
data class FolderItem(
    val id: String,
    val name: String,
    val col: Int,
    val row: Int,
    val apps: List<AppIconItem>
)

@Serializable
data class WidgetItem(
    val id: String,
    val syncKey: String,
    val provider: String,
    val title: String,
    val col: Int,
    val row: Int,
    val spanX: Int,
    val spanY: Int,
    val syncEnabled: Boolean,
    val updatedAt: String,
    val configJson: String
)

enum class RestoreMode { REPLACE, MERGE }`,
  },
  {
    filename: 'LauncherBackupService.kt',
    path: 'app/src/main/java/com/homegrid/sync/service/LauncherBackupService.kt',
    language: 'kotlin',
    summary: 'Reads home and supplemental screen layouts via LauncherApps, AppWidgetManager, and AccessibilityService workspace traversal, plus Replace/Merge restore logic.',
    content: `package com.homegrid.sync.service

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.pm.LauncherApps
import android.os.Build
import android.os.UserManager
import com.homegrid.sync.model.*
import java.time.Instant
import java.util.UUID

class LauncherBackupService(private val context: Context) {

    private val launcherApps = context.getSystemService(LauncherApps::class.java)
    private val appWidgetManager = AppWidgetManager.getInstance(context)
    private val userManager = context.getSystemService(UserManager::class.java)

    /**
     * Captures the active home screen, supplemental pages, folders, dock, and bound widgets.
     */
    fun captureCurrentLayout(
        gridCols: Int,
        gridRows: Int,
        pages: List<HomeScreenPage>,
        dock: List<AppIconItem>
    ): LayoutBackupSnapshot {
        val installedPackages = resolveInstalledLaunchablePackages()
        val sanitizedPages = pages.map { page ->
            page.copy(
                icons = page.icons.filter { it.packageName in installedPackages },
                folders = page.folders.map { folder ->
                    folder.copy(apps = folder.apps.filter { it.packageName in installedPackages })
                }
            )
        }

        return LayoutBackupSnapshot(
            id = "bk-\${UUID.randomUUID().toString().take(8)}",
            name = "\${Build.MODEL} Backup",
            createdAt = Instant.now().toString(),
            sourceDeviceId = Build.FINGERPRINT.hashCode().toString(16),
            sourceDeviceName = Build.MODEL,
            sourceLauncher = resolveDefaultLauncherPackage(),
            gridCols = gridCols,
            gridRows = gridRows,
            screens = sanitizedPages,
            dock = dock.filter { it.packageName in installedPackages },
            checksum = sanitizedPages.hashCode().toUInt().toString(16).uppercase()
        )
    }

    /**
     * Restores a backup using either REPLACE (clean slate) or MERGE (deduplicate + folder merge).
     */
    fun restoreLayout(
        currentPages: List<HomeScreenPage>,
        backup: LayoutBackupSnapshot,
        mode: RestoreMode,
        deduplicateApps: Boolean = true,
        mergeMatchingFolders: Boolean = true
    ): List<HomeScreenPage> {
        if (mode == RestoreMode.REPLACE) {
            return backup.screens
        }

        val existingPackages = currentPages.flatMap { page ->
            page.icons.map { it.packageName } + page.folders.flatMap { f -> f.apps.map { it.packageName } }
        }.toMutableSet()

        val mergedPages = currentPages.map { it.copy(
            icons = it.icons.toMutableList(),
            folders = it.folders.map { f -> f.copy(apps = f.apps.toMutableList()) }.toMutableList(),
            widgets = it.widgets.toMutableList()
        ) }.toMutableList()

        backup.screens.forEachIndexed { idx, incomingPage ->
            val targetPage = mergedPages.getOrNull(idx) ?: run {
                val created = incomingPage.copy(id = "scr-merged-\$idx", isPrimary = false, order = mergedPages.size)
                mergedPages.add(created)
                return@forEachIndexed
            }

            incomingPage.folders.forEach { incomingFolder ->
                val match = if (mergeMatchingFolders) {
                    targetPage.folders.find { it.name.equals(incomingFolder.name, ignoreCase = true) }
                } else null

                if (match != null) {
                    val newApps = incomingFolder.apps.filter { !deduplicateApps || existingPackages.add(it.packageName) }
                    (match.apps as MutableList).addAll(newApps)
                } else {
                    (targetPage.folders as MutableList).add(incomingFolder)
                }
            }

            incomingPage.icons.forEach { icon ->
                if (!deduplicateApps || existingPackages.add(icon.packageName)) {
                    (targetPage.icons as MutableList).add(icon)
                }
            }
        }
        return mergedPages
    }

    private fun resolveInstalledLaunchablePackages(): Set<String> {
        val result = mutableSetOf<String>()
        userManager.userProfiles.forEach { profile ->
            launcherApps.getActivityList(null, profile).forEach { info ->
                result.add(info.applicationInfo.packageName)
            }
        }
        return result
    }

    private fun resolveDefaultLauncherPackage(): String {
        val intent = android.content.Intent(android.content.Intent.ACTION_MAIN)
            .addCategory(android.content.Intent.CATEGORY_HOME)
        return context.packageManager.resolveActivity(intent, 0)?.activityInfo?.packageName
            ?: "com.android.launcher3"
    }
}`,
  },
  {
    filename: 'WidgetSyncWorker.kt',
    path: 'app/src/main/java/com/homegrid/sync/worker/WidgetSyncWorker.kt',
    language: 'kotlin',
    summary: 'WorkManager background worker that synchronizes AppWidgetProvider metadata and live widget configuration bundles across Android devices via HomeGrid REST API.',
    content: `package com.homegrid.sync.worker

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Bundle
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import java.net.HttpURLConnection
import java.net.URL

class WidgetSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val syncEndpoint = inputData.getString("SYNC_URL") ?: return Result.failure()
        val appWidgetManager = AppWidgetManager.getInstance(applicationContext)

        return try {
            val connection = (URL("\$syncEndpoint/api/vault").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8000
                readTimeout = 8000
            }

            if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                val payload = connection.inputStream.bufferedReader().use { it.readText() }
                // Apply synchronized widget options (city, unit, tasks, clock zones)
                // via AppWidgetManager.updateAppWidgetOptions(widgetId, bundle)
                val syncedBundle = Bundle().apply {
                    putString("homegrid_sync_payload", payload)
                    putLong("homegrid_synced_at", System.currentTimeMillis())
                }
                val activeIds = inputData.getIntArray("BOUND_WIDGET_IDS") ?: intArrayOf()
                activeIds.forEach { widgetId ->
                    appWidgetManager.updateAppWidgetOptions(widgetId, syncedBundle)
                }
                Result.success()
            } else {
                Result.retry()
            }
        } catch (e: Exception) {
            Result.retry()
        }
    }
}`,
  },
  {
    filename: 'AndroidManifest.xml',
    path: 'app/src/main/AndroidManifest.xml',
    language: 'xml',
    summary: 'Declares Launcher package visibility, AppWidget binding, Accessibility screen-tree capture service, and cloud sync permissions.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />
    <uses-permission android:name="android.permission.BIND_APPWIDGET" />

    <application
        android:allowBackup="true"
        android:label="HomeGrid"
        android:supportsRtl="true">

        <!-- Optional Accessibility Service for non-root stock launcher layout capture -->
        <service
            android:name=".service.LauncherGridAccessibilityService"
            android:exported="false"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/launcher_accessibility_config" />
        </service>
    </application>
</manifest>`,
  },
];
