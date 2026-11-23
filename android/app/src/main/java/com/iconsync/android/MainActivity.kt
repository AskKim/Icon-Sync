// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android

import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
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
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        detector = LauncherGridDetector(this)
        backupService = LauncherBackupService(this)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (supportFragmentManager.backStackEntryCount > 0) {
                        supportFragmentManager.popBackStack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        )

        val basePad = (24 * resources.displayMetrics.density).toInt()
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(basePad, basePad, basePad, basePad)
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

        val scrollView = ScrollView(this).apply {
            isFillViewport = true
            addView(container)
        }
        ViewCompat.setOnApplyWindowInsetsListener(scrollView) { _, windowInsets ->
            val insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            container.setPadding(
                basePad + insets.left,
                basePad + insets.top,
                basePad + insets.right,
                basePad + insets.bottom
            )
            windowInsets
        }
        setContentView(scrollView)

        val restoredStatus = savedInstanceState?.getCharSequence(KEY_STATUS_TEXT)
        if (!restoredStatus.isNullOrEmpty()) {
            statusView.text = restoredStatus
        } else {
            refreshStatus()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::statusView.isInitialized) {
            outState.putCharSequence(KEY_STATUS_TEXT, statusView.text)
        }
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

    companion object {
        private const val KEY_STATUS_TEXT = "status_text"
    }
}
