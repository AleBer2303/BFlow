package com.bflow.widgets.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle
import com.bflow.widgets.sync.WidgetSyncScheduler

/**
 * Base comun de los cinco proveedores. Pinta desde lo guardado (nunca hace red en el hilo
 * principal) y mantiene el trabajo periodico vivo solo mientras haya widgets en pantalla.
 */
abstract class BFlowWidgetProvider internal constructor(private val kind: WidgetKind) : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    WidgetRenderer.update(context, kind, appWidgetManager, appWidgetIds)
    WidgetSyncScheduler.ensurePeriodic(context)
  }

  override fun onEnabled(context: Context) {
    WidgetSyncScheduler.ensurePeriodic(context)
  }

  override fun onDisabled(context: Context) {
    // Se retiro el ultimo widget de ESTE tipo; el periodico se cancela solo si no queda ninguno.
    if (!WidgetRenderer.hasAnyWidget(context)) {
      WidgetSyncScheduler.cancelAll(context)
    }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle,
  ) {
    // Redimensionado: el grafico y el numero de filas dependen del tamano.
    WidgetRenderer.update(context, kind, appWidgetManager, intArrayOf(appWidgetId))
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ACTION_REFRESH) {
      WidgetSyncScheduler.requestImmediate(context)
      // Repinta desde lo guardado por si la app escribio algo mientras tanto.
      WidgetRenderer.updateAll(context)
      return
    }
    super.onReceive(context, intent)
  }

  companion object {
    /** Broadcast explicito del boton "Actualizar" (solo lo envia la propia app). */
    const val ACTION_REFRESH = "com.bflow.widgets.action.REFRESH"
  }
}

class NetFlowWidgetProvider : BFlowWidgetProvider(WidgetKind.NET_FLOW)

class SummaryWidgetProvider : BFlowWidgetProvider(WidgetKind.SUMMARY)

class PendingWidgetProvider : BFlowWidgetProvider(WidgetKind.PENDING)

class DebtWidgetProvider : BFlowWidgetProvider(WidgetKind.DEBT)

class SavingsWidgetProvider : BFlowWidgetProvider(WidgetKind.SAVINGS)
