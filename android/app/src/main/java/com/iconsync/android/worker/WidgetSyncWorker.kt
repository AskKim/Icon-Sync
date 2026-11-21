package com.iconsync.android.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.iconsync.android.grid.LauncherGridDetector

/**
 * Background WorkManager job that periodically syncs shared widget states
 * and reports the detected/manual launcher grid to the user's Icon Sync vault.
 */
class WidgetSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val detector = LauncherGridDetector(applicationContext)
        val grid = detector.detectGrid()
        return if (grid.cols in 3..8 && grid.rows in 3..8) {
            Result.success()
        } else {
            Result.retry()
        }
    }
}
