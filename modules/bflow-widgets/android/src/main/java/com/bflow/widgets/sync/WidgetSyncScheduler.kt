package com.bflow.widgets.sync

import android.content.Context
import android.os.Build
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.bflow.widgets.storage.WidgetStore
import com.bflow.widgets.widget.WidgetRenderer
import java.util.concurrent.TimeUnit

/**
 * Programa el refresco desde la nube con WorkManager.
 *
 * - Periodico unico (`bflow-widget-sync-periodic`, 15 min = minimo de WorkManager, con red)
 *   mientras haya al menos un widget y credenciales validas. Los appwidget-provider declaran
 *   `updatePeriodMillis="0"`: el sistema no despierta a la app por su cuenta.
 * - Inmediato unico (`bflow-widget-sync-now`) para el boton "Actualizar"; KEEP evita apilar
 *   toques repetidos.
 */
internal object WidgetSyncScheduler {
  const val PERIODIC_WORK_NAME = "bflow-widget-sync-periodic"
  const val IMMEDIATE_WORK_NAME = "bflow-widget-sync-now"
  const val INPUT_MANUAL = "manual"
  private const val PERIOD_MINUTES = 15L
  private const val TAG = "BFlowWidgets"

  private val networkConstraint: Constraints
    get() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

  /** Programa o retira el periodico segun haya widgets y credenciales. Idempotente. */
  fun ensurePeriodic(context: Context) {
    val store = WidgetStore.get(context)
    if (!WidgetRenderer.hasAnyWidget(context) || !store.hasAuth() || store.isAuthRejected) {
      cancelPeriodic(context)
      return
    }
    val request = PeriodicWorkRequestBuilder<WidgetSyncWorker>(PERIOD_MINUTES, TimeUnit.MINUTES)
      .setConstraints(networkConstraint)
      .build()
    // UPDATE conserva el ciclo en curso (no reinicia la cuenta de 15 min en cada onUpdate).
    workManager(context)?.enqueueUniquePeriodicWork(PERIODIC_WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
  }

  fun cancelPeriodic(context: Context) {
    workManager(context)?.cancelUniqueWork(PERIODIC_WORK_NAME)
  }

  fun requestImmediate(context: Context) {
    if (!WidgetStore.get(context).hasAuth()) return
    val builder = OneTimeWorkRequestBuilder<WidgetSyncWorker>()
      .setConstraints(networkConstraint)
      .setInputData(workDataOf(INPUT_MANUAL to true))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      // Sin cuota de expedited, WorkManager lo ejecuta como trabajo normal.
      builder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    }
    workManager(context)?.enqueueUniqueWork(IMMEDIATE_WORK_NAME, ExistingWorkPolicy.KEEP, builder.build())
  }

  fun cancelAll(context: Context) {
    workManager(context)?.let {
      it.cancelUniqueWork(PERIODIC_WORK_NAME)
      it.cancelUniqueWork(IMMEDIATE_WORK_NAME)
    }
  }

  private fun workManager(context: Context): WorkManager? = try {
    WorkManager.getInstance(context.applicationContext)
  } catch (error: IllegalStateException) {
    // Solo ocurre si la app desactiva el inicializador de androidx.startup sin configurar otro.
    Log.w(TAG, "WorkManager no esta inicializado: ${error.message}")
    null
  }
}
