package com.bflow.widgets.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Worker de WorkManager que trae el snapshot remoto (`WidgetSyncEngine`). Siempre termina en
 * `success()`: un fallo de red se resuelve en el siguiente ciclo periodico y un rechazo de
 * credenciales no debe entrar en el reintento exponencial de WorkManager.
 *
 * El trabajo urgente ("Actualizar") solo se marca expedited en Android 12+; en versiones
 * anteriores WorkManager lo ejecutaria como servicio en primer plano y exigiria
 * `getForegroundInfo()` con una notificacion, que aqui no tiene sentido.
 */
class WidgetSyncWorker(
  appContext: Context,
  params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val manual = inputData.getBoolean(WidgetSyncScheduler.INPUT_MANUAL, false)
    WidgetSyncEngine(applicationContext).sync(manual)
    Result.success()
  }
}
