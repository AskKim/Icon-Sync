package com.iconsync.android.model

import kotlinx.serialization.Serializable

@Serializable
enum class GridDetectionSource {
    LAUNCHER_PROVIDER,
    AUTO_ACCESSIBILITY,
    USER_REPORTED,
    BACKUP_METADATA,
    FALLBACK_HEURISTIC
}

@Serializable
enum class GridAdaptationStrategy {
    AUTO_REFLOW,
    PROPORTIONAL_SCALE,
    PRESERVE_PAGES,
    RESIZE_TARGET_GRID,
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
    val customIconArt: String? = null
)

@Serializable
data class FolderPlacement(
    val id: String,
    val name: String,
    val col: Int,
    val row: Int,
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
    val schemaVersion: String = "2.0",
    val createdAt: String,
    val sourceDeviceName: String,
    val sourceLauncher: String,
    val gridCols: Int,
    val gridRows: Int,
    val gridDetectionSource: GridDetectionSource = GridDetectionSource.AUTO_ACCESSIBILITY,
    val includesIconArt: Boolean = false,
    val iconArtAssets: Map<String, IconArtEntry>? = null,
    val screens: List<HomeScreenPage>,
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
