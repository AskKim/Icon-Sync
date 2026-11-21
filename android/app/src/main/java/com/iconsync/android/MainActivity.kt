package com.iconsync.android

import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.iconsync.android.grid.LauncherGridDetector
import com.iconsync.android.model.HomeScreenPage
import com.iconsync.android.service.LauncherBackupService

/**
 * Lightweight native companion entry point for Icon Sync Android APK.
 * Displays detected launcher grid status, allows one-tap custom grid reporting (e.g., 5x4 or 6x6),
 * and exports a local schema v2.0 backup file.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var detector: LauncherGridDetector
    private lateinit var backupService: LauncherBackupService
    private lateinit var statusView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        detector = LauncherGridDetector(this)
        backupService = LauncherBackupService(this)

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (24 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad * 2, pad, pad)
        }

        val title = TextView(this).apply {
            text = getString(R.string.app_name)
            textSize = 24f
        }

        statusView = TextView(this).apply {
            textSize = 14f
            setPadding(0, 24, 0, 32)
        }

        val btnRefresh = Button(this).apply {
            text = "Auto-Detect Launcher Grid"
            setOnClickListener { refreshStatus() }
        }

        val btnReport5x4 = Button(this).apply {
            text = "Report Mini Launcher Grid (5x4)"
            setOnClickListener {
                detector.saveUserReportedGrid(5, 4)
                refreshStatus()
            }
        }

        val btnReport6x6 = Button(this).apply {
            text = "Report Power Launcher Grid (6x6)"
            setOnClickListener {
                detector.saveUserReportedGrid(6, 6)
                refreshStatus()
            }
        }

        val btnExport = Button(this).apply {
            text = "Export v2.0 JSON Snapshot"
            setOnClickListener {
                val file = backupService.exportSnapshotToCache(
                    name = "Android Companion Export",
                    pages = listOf(
                        HomeScreenPage(
                            id = "scr-main",
                            name = "Primary Home",
                            isPrimary = true,
                            order = 0
                        )
                    )
                )
                statusView.text = "Exported backup snapshot:\n${file.absolutePath}"
            }
        }

        container.addView(title)
        container.addView(statusView)
        container.addView(btnRefresh)
        container.addView(btnReport5x4)
        container.addView(btnReport6x6)
        container.addView(btnExport)
        setContentView(container)

        refreshStatus()
    }

    private fun refreshStatus() {
        val detected = detector.detectGrid()
        statusView.text = buildString {
            appendLine("Active Launcher: ${detected.launcherPackage}")
            appendLine("Detected Grid: ${detected.cols}x${detected.rows}")
            appendLine("Source: ${detected.source} (${detected.confidence})")
            append(detected.message)
        }
    }
}
