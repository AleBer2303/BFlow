package com.bflow.widgets.widget

import android.appwidget.AppWidgetProvider
import androidx.annotation.LayoutRes
import com.bflow.widgets.R

/**
 * Catalogo de widgets. `tab` es la pestana que abre el toque (`bflow://?tab=<tab>`, mismos ids
 * que `WORKSPACE_TABS` de la app); `requestCode` separa los PendingIntent de cada tipo.
 * `defaultWidthDp`/`defaultHeightDp` = minWidth/minHeight del `*_info.xml`, por si el launcher
 * aun no informo el tamano.
 */
internal enum class WidgetKind(
  val providerClass: Class<out AppWidgetProvider>,
  @param:LayoutRes val layout: Int,
  val tab: String,
  val requestCode: Int,
  val defaultWidthDp: Int,
  val defaultHeightDp: Int,
) {
  NET_FLOW(NetFlowWidgetProvider::class.java, R.layout.bflow_widget_netflow, "summary", 10, 110, 110),
  SUMMARY(SummaryWidgetProvider::class.java, R.layout.bflow_widget_summary, "summary", 20, 250, 110),
  PENDING(PendingWidgetProvider::class.java, R.layout.bflow_widget_pending, "checklist", 30, 250, 250),
  DEBT(DebtWidgetProvider::class.java, R.layout.bflow_widget_debt, "debts", 40, 180, 110),
  SAVINGS(SavingsWidgetProvider::class.java, R.layout.bflow_widget_savings, "savings", 50, 180, 110),
}
