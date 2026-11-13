package com.bflow.widgets.widget

import android.appwidget.AppWidgetProvider
import androidx.annotation.LayoutRes
import com.bflow.widgets.R

/**
 * Catalogo de widgets, con la equivalencia de tamanos de iOS: systemSmall = 2x2,
 * systemMedium = 4x2 y systemLarge = 4x4.
 *
 * - `layout`: diseno principal (el pequeno en Deudas y Ahorros).
 * - `mediumLayout`: solo en los widgets que en iOS ofrecen pequeno y mediano; se usa cuando el
 *   widget mide al menos `MEDIUM_MIN_WIDTH_DP` de ancho.
 * - `tab`: pestana que abre el toque (`bflow://?tab=<tab>`, ids de `WORKSPACE_TABS`).
 * - `requestCode`: separa los PendingIntent de cada tipo.
 * - `defaultWidthDp`/`defaultHeightDp`: minWidth/minHeight del `*_info.xml`, por si el launcher
 *   aun no informo el tamano.
 */
internal enum class WidgetKind(
  val providerClass: Class<out AppWidgetProvider>,
  @param:LayoutRes val layout: Int,
  @param:LayoutRes val mediumLayout: Int?,
  val tab: String,
  val requestCode: Int,
  val defaultWidthDp: Int,
  val defaultHeightDp: Int,
) {
  NET_FLOW(NetFlowWidgetProvider::class.java, R.layout.bflow_widget_netflow, null, "summary", 10, 110, 110),
  SUMMARY(SummaryWidgetProvider::class.java, R.layout.bflow_widget_summary, null, "summary", 20, 250, 110),
  PENDING(PendingWidgetProvider::class.java, R.layout.bflow_widget_pending, null, "checklist", 30, 250, 250),
  DEBT(
    DebtWidgetProvider::class.java,
    R.layout.bflow_widget_debt_small,
    R.layout.bflow_widget_debt_medium,
    "debts",
    40,
    110,
    110,
  ),
  SAVINGS(
    SavingsWidgetProvider::class.java,
    R.layout.bflow_widget_savings_small,
    R.layout.bflow_widget_savings_medium,
    "savings",
    50,
    110,
    110,
  );

  companion object {
    /** Ancho a partir del cual Deudas y Ahorros pasan al diseno mediano (3 celdas o mas). */
    const val MEDIUM_MIN_WIDTH_DP = 220
  }
}
