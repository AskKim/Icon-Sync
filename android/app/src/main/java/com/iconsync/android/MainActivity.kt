// SPDX-License-Identifier: AGPL-3.0-or-later
package com.iconsync.android

import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.iconsync.android.grid.LauncherGridDetector
import com.iconsync.android.model.LayoutBackupSnapshot
import com.iconsync.android.service.LauncherBackupService
import com.iconsync.android.service.LauncherGridAccessibilityService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

/**
 * Native companion entry point for Icon Sync Android APK.
 * Provides live launcher grid detection, Accessibility helper onboarding,
 * custom grid calibration, SAF document export/import, FileProvider sharing,
 * and on-device cross-grid remap + missing-app auditing.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var detector: LauncherGridDetector
    private lateinit var backupService: LauncherBackupService
    private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private lateinit var launcherTitleView: TextView
    private lateinit var launcherPackageView: TextView
    private lateinit var gridBadgeView: TextView
    private lateinit var gridMetaView: TextView
    private lateinit var accessibilityStatusView: TextView
    private lateinit var colsValueView: TextView
    private lateinit var rowsValueView: TextView
    private lateinit var activityLogView: TextView

    private val presetButtons = mutableListOf<Pair<Pair<Int, Int>, TextView>>()
    private var pendingSaveSnapshot: LayoutBackupSnapshot? = null
    private var pendingSaveNote: String = ""

    private var currentCols = 4
    private var currentRows = 5
    private var isDarkTheme = false

    private val saveDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val snapshot = pendingSaveSnapshot
        val captureNote = pendingSaveNote
        pendingSaveSnapshot = null
        pendingSaveNote = ""
        if (uri == null || snapshot == null) {
            appendLog("Save cancelled.")
            return@registerForActivityResult
        }
        uiScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    backupService.exportSnapshotToUri(uri, snapshot)
                }
            }.onSuccess {
                val iconCount = snapshot.screens.sumOf { it.icons.size }
                appendLog(
                    "Saved v2.0 JSON (${snapshot.gridCols}x${snapshot.gridRows}, $iconCount icons across ${snapshot.screens.size} screen(s)).\n" +
                        "$captureNote\nReady to import in Icon Sync Web Studio."
                )
            }.onFailure { err ->
                appendLog("Failed to save JSON: ${err.message ?: "Unknown I/O error"}")
            }
        }
    }

    private val openDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri == null) {
            appendLog("Import cancelled.")
            return@registerForActivityResult
        }
        uiScope.launch {
            appendLog("Auditing backup file against installed packages...")
            runCatching {
                withContext(Dispatchers.IO) {
                    backupService.importAndAuditFromUri(uri)
                }
            }.onSuccess { audit ->
                val snap = audit.snapshot
                val remap = audit.remapResult
                val summary = buildString {
                    appendLine("Imported: ${snap.name}")
                    appendLine("Source Grid: ${snap.gridCols}x${snap.gridRows} (${snap.sourceDeviceName}) -> Target: ${audit.targetCols}x${audit.targetRows}")
                    appendLine(
                        "Cross-Grid Remap: ${remap.screens.size} screen(s), ${remap.relocatedCount} relocated, " +
                            "${remap.widgetsResized} widgets resized, ${remap.overflowPagesAdded} overflow page(s)"
                    )
                    appendLine("App Audit: ${audit.installedCount}/${audit.totalReferencedApps} apps installed on this device.")
                    if (audit.missingLabelsAndPackages.isEmpty()) {
                        append("All referenced apps are already installed.")
                    } else {
                        appendLine("Missing (${audit.missingLabelsAndPackages.size}):")
                        audit.missingLabelsAndPackages.take(6).forEach { (label, pkg) ->
                            appendLine("  - $label ($pkg)")
                        }
                        if (audit.missingLabelsAndPackages.size > 6) {
                            append("  ...and ${audit.missingLabelsAndPackages.size - 6} more")
                        }
                    }
                }
                appendLog(summary)
            }.onFailure { err ->
                appendLog("Import failed: ${err.message ?: "Invalid v2.0 backup JSON"}")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        detector = LauncherGridDetector(this)
        backupService = LauncherBackupService(this)

        isDarkTheme = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES

        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !isDarkTheme
            isAppearanceLightNavigationBars = !isDarkTheme
        }

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

        val bgPage = if (isDarkTheme) Color.parseColor("#0F172A") else Color.parseColor("#F5F6F8")
        val bgCard = if (isDarkTheme) Color.parseColor("#1E293B") else Color.parseColor("#FFFFFF")
        val bgMuted = if (isDarkTheme) Color.parseColor("#0B1220") else Color.parseColor("#F8FAFC")
        val borderCol = if (isDarkTheme) Color.parseColor("#334155") else Color.parseColor("#E4E7EC")
        val textPrimary = if (isDarkTheme) Color.parseColor("#F8FAFC") else Color.parseColor("#111827")
        val textSecondary = if (isDarkTheme) Color.parseColor("#94A3B8") else Color.parseColor("#4B5563")
        val accentGreen = Color.parseColor("#166534")
        val accentGreenSoft = if (isDarkTheme) Color.parseColor("#14532D") else Color.parseColor("#DCFCE7")
        val accentGreenText = if (isDarkTheme) Color.parseColor("#BBF7D0") else Color.parseColor("#166534")

        val rootContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(bgPage)
        }

        // 1. Header
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(14))
        }
        val titleCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        titleCol.addView(
            TextView(this).apply {
                text = getString(R.string.app_name)
                textSize = 24f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(textPrimary)
            }
        )
        titleCol.addView(
            TextView(this).apply {
                text = "Android ${Build.VERSION.RELEASE} · ${Build.MANUFACTURER} ${Build.MODEL}"
                textSize = 12f
                setTextColor(textSecondary)
            }
        )
        val versionBadge = TextView(this).apply {
            text = "v${resolveVersionName()}"
            textSize = 11f
            setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
            setTextColor(accentGreenText)
            setPadding(dp(10), dp(4), dp(10), dp(4))
            background = roundedDrawable(accentGreenSoft, Color.TRANSPARENT, dp(999))
        }
        headerRow.addView(titleCol)
        headerRow.addView(versionBadge)
        rootContainer.addView(headerRow)

        // 2. Active Launcher & Grid Status Card
        val statusCard = createCard(bgCard, borderCol)
        val statusTopRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val launcherTextCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        launcherTitleView = TextView(this).apply {
            textSize = 17f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(textPrimary)
        }
        launcherPackageView = TextView(this).apply {
            textSize = 12f
            typeface = Typeface.MONOSPACE
            setTextColor(textSecondary)
        }
        launcherTextCol.addView(launcherTitleView)
        launcherTextCol.addView(launcherPackageView)

        gridBadgeView = TextView(this).apply {
            textSize = 18f
            setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
            setTextColor(accentGreenText)
            setPadding(dp(12), dp(6), dp(12), dp(6))
            background = roundedDrawable(accentGreenSoft, Color.TRANSPARENT, dp(10))
        }
        statusTopRow.addView(launcherTextCol)
        statusTopRow.addView(gridBadgeView)

        gridMetaView = TextView(this).apply {
            textSize = 13f
            setTextColor(textSecondary)
            setPadding(0, dp(10), 0, dp(8))
        }
        accessibilityStatusView = TextView(this).apply {
            textSize = 12f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(textPrimary)
            setPadding(dp(10), dp(8), dp(10), dp(8))
            background = roundedDrawable(bgMuted, borderCol, dp(10))
        }

        statusCard.addView(statusTopRow)
        statusCard.addView(gridMetaView)
        statusCard.addView(accessibilityStatusView)
        rootContainer.addView(statusCard)

        // 3. Grid Calibration & Accessibility Card
        val gridCard = createCard(bgCard, borderCol)
        gridCard.addView(sectionLabel("Grid Calibration & Detection", textPrimary))
        gridCard.addView(
            TextView(this).apply {
                text = "Tap a preset or adjust columns/rows to match your launcher, or enable Accessibility auto-detection."
                textSize = 12f
                setTextColor(textSecondary)
                setPadding(0, dp(2), 0, dp(10))
            }
        )

        val presets = listOf(
            4 to 5, 4 to 6, 5 to 4,
            5 to 5, 5 to 6, 6 to 6
        )
        for (rowIdx in 0 until 2) {
            val rowLayout = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, 0, 0, dp(8))
            }
            for (colIdx in 0 until 3) {
                val pair = presets[rowIdx * 3 + colIdx]
                val chip = TextView(this).apply {
                    text = "${pair.first}×${pair.second}"
                    textSize = 13f
                    gravity = Gravity.CENTER
                    setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
                    setPadding(0, dp(9), 0, dp(9))
                    layoutParams = LinearLayout.LayoutParams(
                        0,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        1f
                    ).apply {
                        if (colIdx < 2) marginEnd = dp(8)
                    }
                    setOnClickListener {
                        detector.saveUserReportedGrid(pair.first, pair.second)
                        refreshStatus()
                        appendLog("Calibrated launcher grid to ${pair.first}×${pair.second} (manual).")
                    }
                }
                presetButtons += pair to chip
                rowLayout.addView(chip)
            }
            gridCard.addView(rowLayout)
        }

        // Custom Cols / Rows Stepper Row
        val stepperRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(4), 0, dp(10))
        }
        colsValueView = TextView(this)
        rowsValueView = TextView(this)
        stepperRow.addView(
            createStepperBox("Cols", colsValueView, bgMuted, borderCol, textPrimary, textSecondary,
                onDec = {
                    val next = (currentCols - 1).coerceIn(3, 8)
                    detector.saveUserReportedGrid(next, currentRows)
                    refreshStatus()
                },
                onInc = {
                    val next = (currentCols + 1).coerceIn(3, 8)
                    detector.saveUserReportedGrid(next, currentRows)
                    refreshStatus()
                }
            ).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginEnd = dp(8)
                }
            }
        )
        stepperRow.addView(
            createStepperBox("Rows", rowsValueView, bgMuted, borderCol, textPrimary, textSecondary,
                onDec = {
                    val next = (currentRows - 1).coerceIn(3, 8)
                    detector.saveUserReportedGrid(currentCols, next)
                    refreshStatus()
                },
                onInc = {
                    val next = (currentRows + 1).coerceIn(3, 8)
                    detector.saveUserReportedGrid(currentCols, next)
                    refreshStatus()
                }
            ).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
        )
        gridCard.addView(stepperRow)

        val detectBtnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        detectBtnRow.addView(
            createActionButton("Auto-Detect Grid", bgMuted, textPrimary, borderCol) {
                detector.resetToAutoDetect()
                refreshStatus()
                val detected = detector.detectGrid()
                appendLog("Auto-detect completed: ${detected.cols}×${detected.rows} via ${detected.source}.")
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginEnd = dp(8)
                }
            }
        )
        detectBtnRow.addView(
            createActionButton("Accessibility Settings", bgMuted, textPrimary, borderCol) {
                openAccessibilitySettings()
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
        )
        gridCard.addView(detectBtnRow)
        rootContainer.addView(gridCard)

        // 4. Snapshot Export, Share & Cross-Grid Audit Card
        val backupCard = createCard(bgCard, borderCol)
        backupCard.addView(sectionLabel("v2.0 Snapshot & Cross-Grid Audit", textPrimary))
        backupCard.addView(
            TextView(this).apply {
                text = "Save directly to Downloads/Drive for Icon Sync Web Studio, share via Android Sharesheet, or import a backup to audit missing apps."
                textSize = 12f
                setTextColor(textSecondary)
                setPadding(0, dp(2), 0, dp(10))
            }
        )

        backupCard.addView(
            createActionButton("Save v2.0 JSON to Device", accentGreen, Color.WHITE, Color.TRANSPARENT) {
                launchDocumentSaveFlow()
            }.apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dp(8)
                }
            }
        )

        val secondaryBackupRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        secondaryBackupRow.addView(
            createActionButton("Share JSON Snapshot", bgMuted, textPrimary, borderCol) {
                launchShareFlow()
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginEnd = dp(8)
                }
            }
        )
        secondaryBackupRow.addView(
            createActionButton("Import & Remap JSON", bgMuted, textPrimary, borderCol) {
                openDocumentLauncher.launch(arrayOf("application/json", "text/plain", "*/*"))
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
        )
        backupCard.addView(secondaryBackupRow)
        rootContainer.addView(backupCard)

        // 5. Activity & Diagnostic Log Card
        val logCard = createCard(bgCard, borderCol)
        logCard.addView(sectionLabel("Activity & Diagnostic Log", textPrimary))
        activityLogView = TextView(this).apply {
            textSize = 12f
            typeface = Typeface.MONOSPACE
            setTextColor(textSecondary)
            setPadding(dp(10), dp(10), dp(10), dp(10))
            background = roundedDrawable(bgMuted, borderCol, dp(10))
            setTextIsSelectable(true)
        }
        logCard.addView(
            activityLogView.apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = dp(8)
                }
            }
        )
        rootContainer.addView(logCard)

        val scrollView = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(bgPage)
            addView(rootContainer)
        }

        val basePad = dp(16)
        ViewCompat.setOnApplyWindowInsetsListener(scrollView) { _, windowInsets ->
            val insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            rootContainer.setPadding(
                basePad + insets.left,
                basePad + insets.top,
                basePad + insets.right,
                basePad + insets.bottom
            )
            windowInsets
        }
        setContentView(scrollView)

        val restoredLog = savedInstanceState?.getCharSequence(KEY_LOG_TEXT)
        refreshStatus()
        if (!restoredLog.isNullOrEmpty()) {
            activityLogView.text = restoredLog
        } else {
            appendLog("Ready on ${Build.MANUFACTURER} ${Build.MODEL} (Android ${Build.VERSION.RELEASE}).")
        }
    }

    override fun onResume() {
        super.onResume()
        if (::detector.isInitialized) {
            refreshStatus()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::activityLogView.isInitialized) {
            outState.putCharSequence(KEY_LOG_TEXT, activityLogView.text)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        uiScope.cancel()
    }

    private fun launchDocumentSaveFlow() {
        appendLog("Building live v2.0 JSON snapshot...")
        uiScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    backupService.buildLiveDeviceSnapshot()
                }
            }.onSuccess { (snapshot, note) ->
                pendingSaveSnapshot = snapshot
                pendingSaveNote = note
                val modelSlug = Build.MODEL.lowercase(Locale.ROOT)
                    .replace(Regex("[^a-z0-9]+"), "-")
                    .trim('-')
                    .ifBlank { "android" }
                val suggestedName = "icon-sync-$modelSlug-${snapshot.gridCols}x${snapshot.gridRows}.json"
                saveDocumentLauncher.launch(suggestedName)
            }.onFailure { err ->
                appendLog("Snapshot build failed: ${err.message ?: "Unknown error"}")
            }
        }
    }

    private fun launchShareFlow() {
        appendLog("Preparing v2.0 JSON snapshot for sharing...")
        uiScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val (snapshot, note) = backupService.buildLiveDeviceSnapshot()
                    val file = backupService.exportLiveSnapshotForSharing(snapshot)
                    Triple(snapshot, file, note)
                }
            }.onSuccess { (snapshot, file, note) ->
                val contentUri = FileProvider.getUriForFile(
                    this@MainActivity,
                    "$packageName.fileprovider",
                    file
                )
                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "application/json"
                    putExtra(Intent.EXTRA_STREAM, contentUri)
                    putExtra(Intent.EXTRA_SUBJECT, "Icon Sync Backup (${snapshot.gridCols}x${snapshot.gridRows})")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivity(Intent.createChooser(shareIntent, "Share Icon Sync v2.0 Snapshot"))
                val iconCount = snapshot.screens.sumOf { it.icons.size }
                appendLog("Sharing ${file.name} ($iconCount icons). $note")
            }.onFailure { err ->
                appendLog("Share failed: ${err.message ?: "Unable to share snapshot"}")
            }
        }
    }

    private fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        val launched = runCatching {
            startActivity(intent)
        }.isSuccess
        if (launched) {
            appendLog("Opened Android Accessibility Settings. Enable \"Icon Sync Grid Detector\" and visit your home screen once to capture live coordinates.")
        } else {
            appendLog("Unable to open Accessibility Settings automatically on this device profile.")
        }
    }

    private fun refreshStatus() {
        val detected = detector.detectGrid()
        val launcherName = detector.getLauncherDisplayName(detected.launcherPackage)
        val accEnabled = LauncherGridAccessibilityService.isEnabled(this)
        val capturedCount = detector.getCapturedShortcutCount()

        currentCols = detected.cols
        currentRows = detected.rows

        launcherTitleView.text = launcherName
        launcherPackageView.text = detected.launcherPackage
        gridBadgeView.text = "${detected.cols}×${detected.rows}"
        gridMetaView.text = "Source: ${detected.source} (${detected.confidence})\n${detected.message}"

        val accBg = if (accEnabled) {
            if (isDarkTheme) Color.parseColor("#14532D") else Color.parseColor("#DCFCE7")
        } else {
            if (isDarkTheme) Color.parseColor("#0B1220") else Color.parseColor("#F8FAFC")
        }
        val accBorder = if (accEnabled) Color.parseColor("#166534") else {
            if (isDarkTheme) Color.parseColor("#334155") else Color.parseColor("#E4E7EC")
        }
        accessibilityStatusView.background = roundedDrawable(accBg, accBorder, dp(10))
        accessibilityStatusView.text = if (accEnabled) {
            "Accessibility Helper: Active ($capturedCount home icon(s) captured)"
        } else {
            "Accessibility Helper: Off — tap Accessibility Settings to capture exact home icons"
        }

        colsValueView.text = currentCols.toString()
        rowsValueView.text = currentRows.toString()
        updatePresetHighlight()

        uiScope.launch {
            val appCount = withContext(Dispatchers.IO) {
                detector.getInstalledLaunchableApps().size
            }
            if (!accEnabled) {
                accessibilityStatusView.text =
                    "Accessibility Helper: Off · $appCount launchable apps ready for inventory export"
            }
        }
    }

    private fun updatePresetHighlight() {
        val activeBg = Color.parseColor("#166534")
        val inactiveBg = if (isDarkTheme) Color.parseColor("#0B1220") else Color.parseColor("#F8FAFC")
        val inactiveBorder = if (isDarkTheme) Color.parseColor("#334155") else Color.parseColor("#E4E7EC")
        val inactiveText = if (isDarkTheme) Color.parseColor("#E2E8F0") else Color.parseColor("#111827")

        for ((pair, view) in presetButtons) {
            val selected = pair.first == currentCols && pair.second == currentRows
            view.background = roundedDrawable(
                fillColor = if (selected) activeBg else inactiveBg,
                strokeColor = if (selected) activeBg else inactiveBorder,
                radiusPx = dp(10)
            )
            view.setTextColor(if (selected) Color.WHITE else inactiveText)
        }
    }

    private fun appendLog(message: String) {
        if (::activityLogView.isInitialized) {
            activityLogView.text = message.trim()
        }
    }

    private fun resolveVersionName(): String {
        return runCatching {
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0L))
            } else {
                @Suppress("DEPRECATION")
                packageManager.getPackageInfo(packageName, 0)
            }
            info.versionName ?: "2.3.0"
        }.getOrDefault("2.3.0")
    }

    private fun createCard(bgColor: Int, borderColor: Int): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = roundedDrawable(bgColor, borderColor, dp(16))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dp(12)
            }
        }
    }

    private fun sectionLabel(title: String, textColor: Int): TextView {
        return TextView(this).apply {
            text = title
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(textColor)
        }
    }

    private fun createActionButton(
        label: String,
        bgColor: Int,
        textColor: Int,
        borderColor: Int,
        onClick: () -> Unit
    ): TextView {
        return TextView(this).apply {
            text = label
            textSize = 13f
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(textColor)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            background = roundedDrawable(bgColor, borderColor, dp(10))
            setOnClickListener { onClick() }
        }
    }

    private fun createStepperBox(
        title: String,
        valueView: TextView,
        bgColor: Int,
        borderColor: Int,
        textPrimary: Int,
        textSecondary: Int,
        onDec: () -> Unit,
        onInc: () -> Unit
    ): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(10), dp(6), dp(10), dp(6))
            background = roundedDrawable(bgColor, borderColor, dp(10))

            addView(
                TextView(this@MainActivity).apply {
                    text = title
                    textSize = 12f
                    setTextColor(textSecondary)
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
            )
            addView(
                createStepperStep("-", textPrimary, borderColor, onDec)
            )
            valueView.apply {
                textSize = 14f
                gravity = Gravity.CENTER
                setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
                setTextColor(textPrimary)
                setPadding(dp(10), 0, dp(10), 0)
            }
            addView(valueView)
            addView(
                createStepperStep("+", textPrimary, borderColor, onInc)
            )
        }
    }

    private fun createStepperStep(
        symbol: String,
        textColor: Int,
        borderColor: Int,
        onClick: () -> Unit
    ): View {
        return TextView(this).apply {
            text = symbol
            textSize = 16f
            gravity = Gravity.CENTER
            setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
            setTextColor(textColor)
            val size = dp(30)
            layoutParams = LinearLayout.LayoutParams(size, size)
            background = roundedDrawable(Color.TRANSPARENT, borderColor, dp(8))
            setOnClickListener { onClick() }
        }
    }

    private fun roundedDrawable(fillColor: Int, strokeColor: Int, radiusPx: Int): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radiusPx.toFloat()
            setColor(fillColor)
            if (strokeColor != Color.TRANSPARENT) {
                setStroke(dp(1), strokeColor)
            }
        }
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val KEY_LOG_TEXT = "activity_log_text"
    }
}
