// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class GridDetectionSource {
    @SerialName("launcher-provider")
    LAUNCHER_PROVIDER,

    @SerialName("auto-accessibility")
    AUTO_ACCESSIBILITY,

    @SerialName("user-reported")
    USER_REPORTED,

    @SerialName("backup-metadata")
    BACKUP_METADATA,

    @SerialName("oem-profile")
    FALLBACK_HEURISTIC
}

@Serializable
enum class GridAdaptationStrategy {
    @SerialName("auto-reflow")
    AUTO_REFLOW,

    @SerialName("proportional-scale")
    PROPORTIONAL_SCALE,

    @SerialName("preserve-pages")
    PRESERVE_PAGES,

    @SerialName("resize-target-grid")
    RESIZE_TARGET_GRID,

    @SerialName("crop-within-bounds")
    CROP_WITHIN_BOUNDS
}

@Serializable
data class IconPlacement(
    val id: String,
    val packageName: String,
    val label: String,
    val col: Int,
    val row: Int,
    val isPlaceholder: Boolean = false,
    val customIconArt: String? = null,
    val iconKey: String = "smartphone",
    val tint: String = "#166534",
    val category: String = "Utilities"
)

@Serializable
data class FolderPlacement(
    val id: String,
    val name: String,
    val col: Int,
    val row: Int,
    val tint: String = "#334155",
    val apps: List<IconPlacement> = emptyList()
)

@Serializable
data class WidgetPlacement(
    val id: String,
    val syncKey: String,
    val provider: String,
    val title: String,
    val col: Int,
    val row: Int,
    val spanX: Int,
    val spanY: Int,
    val syncEnabled: Boolean = true,
    val updatedAt: String = ""
)

@Serializable
data class HomeScreenPage(
    val id: String,
    val name: String,
    val isPrimary: Boolean,
    val order: Int,
    val icons: List<IconPlacement> = emptyList(),
    val folders: List<FolderPlacement> = emptyList(),
    val widgets: List<WidgetPlacement> = emptyList()
)

@Serializable
data class IconArtEntry(
    val packageName: String,
    val label: String,
    val iconKey: String,
    val tint: String,
    val dataUri: String
)

@Serializable
data class LayoutBackupSnapshot(
    val id: String,
    val name: String,
    val notes: String = "",
    val schemaVersion: String = "2.0",
    val createdAt: String,
    val storage: String = "local",
    val sourceDeviceId: String = "android-companion",
    val sourceDeviceName: String,
    val sourceLauncher: String,
    val gridCols: Int,
    val gridRows: Int,
    val gridDetectionSource: GridDetectionSource = GridDetectionSource.AUTO_ACCESSIBILITY,
    val wallpaperId: String = "alpine-dusk",
    val includesIconArt: Boolean = false,
    val iconArtAssets: Map<String, IconArtEntry>? = null,
    val screens: List<HomeScreenPage>,
    val dock: List<IconPlacement> = emptyList(),
    val checksum: String = ""
)

@Serializable
data class DetectedLauncherGrid(
    val launcherPackage: String,
    val cols: Int,
    val rows: Int,
    val source: GridDetectionSource,
    val confidence: String,
    val message: String
)
