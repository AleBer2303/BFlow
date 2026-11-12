package com.bflow.widgets.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import androidx.annotation.ColorRes
import androidx.annotation.IdRes
import com.bflow.widgets.R
import com.bflow.widgets.format.WidgetFormat
import com.bflow.widgets.model.PendingType
import com.bflow.widgets.model.WidgetSnapshot
import com.bflow.widgets.storage.WidgetStore
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Construye los RemoteViews de cada widget a partir del snapshot guardado y los entrega al
 * launcher con `AppWidgetManager.updateAppWidget`.
 *
 * Colores: los del XML los resuelve el launcher al inflar, asi que siguen el tema claro/oscuro
 * (y el color dinamico en Android 12+). Los que se eligen en codigo (signo del flujo neto,
 * ingreso/gasto de una fila) usan en Android 12+ `setColorInt(..., claro, oscuro)` para no quedar
 * congelados al cambiar de tema; antes de Android 12 se resuelven con el tema actual.
 */
internal object WidgetRenderer {
  private const val TAG = "BFlowWidgets"

  /** Hilo propio para repintar sin bloquear el hilo de JavaScript (setSnapshot es sincrono). */
  private val executor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "bflow-widget-render").apply { isDaemon = true }
  }

  private val PENDING_ROWS = intArrayOf(
    R.id.pending_row_1, R.id.pending_row_2, R.id.pending_row_3, R.id.pending_row_4,
    R.id.pending_row_5, R.id.pending_row_6, R.id.pending_row_7, R.id.pending_row_8,
  )
  private val PENDING_DOTS = intArrayOf(
    R.id.pending_dot_1, R.id.pending_dot_2, R.id.pending_dot_3, R.id.pending_dot_4,
    R.id.pending_dot_5, R.id.pending_dot_6, R.id.pending_dot_7, R.id.pending_dot_8,
  )
  private val PENDING_NAMES = intArrayOf(
    R.id.pending_name_1, R.id.pending_name_2, R.id.pending_name_3, R.id.pending_name_4,
    R.id.pending_name_5, R.id.pending_name_6, R.id.pending_name_7, R.id.pending_name_8,
  )
  private val PENDING_AMOUNTS = intArrayOf(
    R.id.pending_amount_1, R.id.pending_amount_2, R.id.pending_amount_3, R.id.pending_amount_4,
    R.id.pending_amount_5, R.id.pending_amount_6, R.id.pending_amount_7, R.id.pending_amount_8,
  )

  // Medidas del layout (dp) para repartir el alto disponible; ver res/layout y values/dimens.xml.
  private const val PADDING_DP = 16
  private const val TOP_PADDING_DP = 8
  private const val HEADER_DP = 40
  private const val STATS_ROW_DP = 40
  private const val CHART_MARGIN_DP = 8
  private const val MIN_CHART_HEIGHT_DP = 32
  /** Barra de progreso (6 + 8 de margen), su texto (~16 + 4) y el margen de la lista (4). */
  private const val PENDING_FIXED_DP = 14 + 20 + 4
  private const val PENDING_ROW_DP = 28

  fun updateAllAsync(context: Context) {
    val appContext = context.applicationContext
    executor.execute {
      try {
        updateAll(appContext)
      } catch (error: RuntimeException) {
        Log.w(TAG, "No se pudieron repintar los widgets: ${error.javaClass.simpleName}")
      }
    }
  }

  fun updateAll(context: Context) {
    val manager = appWidgetManager(context) ?: return
    for (kind in WidgetKind.entries) {
      val ids = idsFor(context, manager, kind)
      if (ids.isNotEmpty()) update(context, kind, manager, ids)
    }
  }

  fun hasAnyWidget(context: Context): Boolean {
    val manager = appWidgetManager(context) ?: return false
    return WidgetKind.entries.any { idsFor(context, manager, it).isNotEmpty() }
  }

  fun update(context: Context, kind: WidgetKind, manager: AppWidgetManager, appWidgetIds: IntArray) {
    val store = WidgetStore.get(context)
    val snapshot = store.readSnapshot()
    val canRefresh = store.hasAuth()
    val now = System.currentTimeMillis()
    for (appWidgetId in appWidgetIds) {
      val views = try {
        build(context, kind, manager, appWidgetId, snapshot, canRefresh, now)
      } catch (error: RuntimeException) {
        // Un snapshot raro nunca debe dejar el widget en "No se puede cargar el widget".
        Log.w(TAG, "Fallo al construir el widget ${kind.name}: ${error.javaClass.simpleName}")
        build(context, kind, manager, appWidgetId, null, canRefresh, now)
      }
      manager.updateAppWidget(appWidgetId, views)
    }
  }

  private fun build(
    context: Context,
    kind: WidgetKind,
    manager: AppWidgetManager,
    appWidgetId: Int,
    snapshot: WidgetSnapshot?,
    canRefresh: Boolean,
    now: Long,
  ): RemoteViews {
    val views = RemoteViews(context.packageName, kind.layout)
    views.setOnClickPendingIntent(android.R.id.background, openAppIntent(context, kind))
    views.setOnClickPendingIntent(R.id.bflow_widget_refresh, refreshIntent(context, kind))
    views.setViewVisibility(R.id.bflow_widget_refresh, if (canRefresh) View.VISIBLE else View.GONE)
    views.setTextViewText(R.id.bflow_widget_title, titleFor(context, kind, snapshot))

    if (snapshot == null) {
      views.setViewVisibility(R.id.bflow_widget_content, View.GONE)
      views.setViewVisibility(R.id.bflow_widget_updated, View.GONE)
      views.setViewVisibility(R.id.bflow_widget_empty, View.VISIBLE)
      return views
    }

    views.setViewVisibility(R.id.bflow_widget_content, View.VISIBLE)
    views.setViewVisibility(R.id.bflow_widget_empty, View.GONE)
    views.setViewVisibility(R.id.bflow_widget_updated, View.VISIBLE)
    views.setTextViewText(R.id.bflow_widget_updated, WidgetFormat.updatedLabel(snapshot.updatedAtEpochMillis, now))

    val palette = Palette(context)
    when (kind) {
      WidgetKind.NET_FLOW -> bindNetFlow(context, views, snapshot, palette)
      WidgetKind.SUMMARY -> bindSummary(context, views, snapshot, palette, sizeOf(manager, appWidgetId, kind))
      WidgetKind.PENDING -> bindPending(context, views, snapshot, palette, sizeOf(manager, appWidgetId, kind))
      WidgetKind.DEBT -> bindDebt(context, views, snapshot)
      WidgetKind.SAVINGS -> bindSavings(views, snapshot)
    }
    return views
  }

  private fun titleFor(context: Context, kind: WidgetKind, snapshot: WidgetSnapshot?): String {
    val base = context.getString(
      when (kind) {
        WidgetKind.NET_FLOW -> R.string.bflow_widget_netflow_title
        WidgetKind.SUMMARY -> R.string.bflow_widget_summary_title
        WidgetKind.PENDING -> R.string.bflow_widget_pending_title
        WidgetKind.DEBT -> R.string.bflow_widget_debt_title
        WidgetKind.SAVINGS -> R.string.bflow_widget_savings_title
      }
    )
    // El widget pequeno ya muestra el mes en su cuerpo; los demas lo llevan en el titulo.
    if (snapshot == null || kind == WidgetKind.NET_FLOW) return base
    return context.getString(R.string.bflow_widget_title_with_month, base, WidgetFormat.monthLabel(snapshot.monthKey))
  }

  // ---- Flujo neto -------------------------------------------------------------------------

  private fun bindNetFlow(context: Context, views: RemoteViews, s: WidgetSnapshot, palette: Palette) {
    val amount = WidgetFormat.formatSignedCurrency(s.netCashFlow, s.currencySymbol, s.thousandsSeparator)
    val month = WidgetFormat.monthLabel(s.monthKey)
    views.setTextViewText(R.id.netflow_amount, amount)
    palette.setTextColor(
      views,
      R.id.netflow_amount,
      if (s.netCashFlow >= 0L) R.color.bflow_widget_income else R.color.bflow_widget_expense,
    )
    views.setContentDescription(
      R.id.netflow_amount,
      context.getString(R.string.bflow_widget_netflow_content_description, month, amount),
    )
    views.setTextViewText(R.id.netflow_month, month)
    views.setTextViewText(
      R.id.netflow_checklist,
      context.getString(R.string.bflow_widget_checklist_progress, s.checklistCompleted.toIntSafe(), s.checklistTotal.toIntSafe()),
    )
  }

  // ---- Resumen ----------------------------------------------------------------------------

  private fun bindSummary(
    context: Context,
    views: RemoteViews,
    s: WidgetSnapshot,
    palette: Palette,
    size: SizeDp,
  ) {
    views.setTextViewText(R.id.summary_received, money(s, s.receivedIncome))
    views.setTextViewText(R.id.summary_paid, money(s, s.paidExpenses))
    views.setTextViewText(R.id.summary_pending, money(s, s.pendingExpenses))

    val chartWidthDp = size.widthDp - 2 * PADDING_DP
    val chartHeightDp = size.heightDp - TOP_PADDING_DP - HEADER_DP - STATS_ROW_DP - CHART_MARGIN_DP - PADDING_DP
    if (chartWidthDp <= 0 || chartHeightDp < MIN_CHART_HEIGHT_DP) {
      views.setViewVisibility(R.id.summary_chart, View.GONE)
      return
    }
    val density = context.resources.displayMetrics.density
    val pixelSize = TrendChartRenderer.pixelSize(chartWidthDp, chartHeightDp, density)
    if (pixelSize == null) {
      views.setViewVisibility(R.id.summary_chart, View.GONE)
      return
    }
    val scale = pixelSize.width.toFloat() / chartWidthDp
    views.setViewVisibility(R.id.summary_chart, View.VISIBLE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val light = TrendChartRenderer.render(s.trend, pixelSize, scale, palette.chartColors(night = false))
      val dark = TrendChartRenderer.render(s.trend, pixelSize, scale, palette.chartColors(night = true))
      views.setIcon(R.id.summary_chart, "setImageIcon", Icon.createWithBitmap(light), Icon.createWithBitmap(dark))
    } else {
      views.setImageViewBitmap(
        R.id.summary_chart,
        TrendChartRenderer.render(s.trend, pixelSize, scale, palette.chartColors(night = palette.isNightNow)),
      )
    }
    val points = s.trend.joinToString(separator = "; ") { point ->
      context.getString(
        R.string.bflow_widget_chart_point,
        WidgetFormat.monthLabel(point.monthKey),
        money(s, point.receivedIncome),
        money(s, point.paidExpenses),
      )
    }
    views.setContentDescription(R.id.summary_chart, context.getString(R.string.bflow_widget_chart_content_description, points))
  }

  // ---- Pendientes -------------------------------------------------------------------------

  private fun bindPending(
    context: Context,
    views: RemoteViews,
    s: WidgetSnapshot,
    palette: Palette,
    size: SizeDp,
  ) {
    views.setTextViewText(R.id.pending_total_expense, money(s, s.pendingExpenses))
    views.setTextViewText(R.id.pending_total_income, money(s, s.pendingIncome))

    val total = s.checklistTotal.toIntSafe()
    val completed = s.checklistCompleted.toIntSafe()
    views.setProgressBar(R.id.pending_progress, total.coerceAtLeast(1), completed.coerceAtMost(total), false)
    views.setTextViewText(R.id.pending_progress_label, context.getString(R.string.bflow_widget_pending_progress, completed, total))

    // Filas que caben en el alto actual (se reserva una para "+N mas").
    val available = size.heightDp - TOP_PADDING_DP - HEADER_DP - STATS_ROW_DP - PENDING_FIXED_DP - PADDING_DP
    val capacity = (available / PENDING_ROW_DP).coerceIn(1, PENDING_ROWS.size)
    val items = s.pendingItems
    val shown = if (items.size > capacity) (capacity - 1).coerceAtLeast(1) else items.size

    for (index in PENDING_ROWS.indices) {
      val item = items.getOrNull(index)
      if (item == null || index >= shown) {
        views.setViewVisibility(PENDING_ROWS[index], View.GONE)
        continue
      }
      val amount = money(s, item.amount)
      val isIncome = item.type == PendingType.INCOME
      views.setViewVisibility(PENDING_ROWS[index], View.VISIBLE)
      views.setTextViewText(PENDING_NAMES[index], item.name)
      views.setTextViewText(PENDING_AMOUNTS[index], amount)
      views.setImageViewResource(
        PENDING_DOTS[index],
        if (isIncome) R.drawable.bflow_widget_dot_income else R.drawable.bflow_widget_dot_expense,
      )
      palette.setTextColor(
        views,
        PENDING_AMOUNTS[index],
        if (isIncome) R.color.bflow_widget_income else R.color.bflow_widget_expense,
      )
      views.setContentDescription(
        PENDING_ROWS[index],
        context.getString(
          if (isIncome) R.string.bflow_widget_pending_income_item else R.string.bflow_widget_pending_expense_item,
          item.name,
          amount,
        ),
      )
    }

    views.setViewVisibility(R.id.pending_none, if (items.isEmpty()) View.VISIBLE else View.GONE)
    val hidden = items.size - shown
    if (hidden > 0) {
      views.setViewVisibility(R.id.pending_more, View.VISIBLE)
      views.setTextViewText(R.id.pending_more, context.getString(R.string.bflow_widget_pending_more, hidden))
    } else {
      views.setViewVisibility(R.id.pending_more, View.GONE)
    }
  }

  // ---- Deudas -----------------------------------------------------------------------------

  private fun bindDebt(context: Context, views: RemoteViews, s: WidgetSnapshot) {
    if (s.initialDebt == 0L && s.totalDebt == 0L) {
      views.setViewVisibility(R.id.debt_active, View.GONE)
      views.setViewVisibility(R.id.debt_none, View.VISIBLE)
      return
    }
    views.setViewVisibility(R.id.debt_active, View.VISIBLE)
    views.setViewVisibility(R.id.debt_none, View.GONE)
    views.setTextViewText(R.id.debt_amount, money(s, s.totalDebt))

    val paid = (s.initialDebt - s.totalDebt).coerceAtLeast(0L)
    val percent = WidgetFormat.progressPercent(paid, s.initialDebt)
    views.setProgressBar(R.id.debt_progress, 100, percent, false)
    val since = s.debtSinceMonthKey
    views.setTextViewText(
      R.id.debt_progress_label,
      if (since != null) {
        context.getString(R.string.bflow_widget_debt_progress_since, percent, WidgetFormat.monthLabel(since))
      } else {
        context.getString(R.string.bflow_widget_debt_progress, percent)
      },
    )
    views.setTextViewText(
      R.id.debt_paid_month,
      context.getString(R.string.bflow_widget_debt_paid_this_month, money(s, s.paidDebtThisMonth)),
    )
    val payoff = s.estimatedPayoffMonthKey
    if (payoff != null) {
      views.setViewVisibility(R.id.debt_payoff, View.VISIBLE)
      views.setTextViewText(R.id.debt_payoff, context.getString(R.string.bflow_widget_debt_payoff, WidgetFormat.monthLabel(payoff)))
    } else {
      views.setViewVisibility(R.id.debt_payoff, View.GONE)
    }
  }

  // ---- Ahorros ----------------------------------------------------------------------------

  private fun bindSavings(views: RemoteViews, s: WidgetSnapshot) {
    views.setTextViewText(R.id.savings_total, money(s, s.totalSavings))
    views.setTextViewText(R.id.savings_reserve_name, s.reserveName)
    views.setTextViewText(R.id.savings_reserve_value, money(s, s.reserveBalance))
    views.setTextViewText(R.id.savings_savings_name, s.savingsName)
    views.setTextViewText(R.id.savings_savings_value, money(s, s.savingsBalance))
    if (s.otherSavingsBalance > 0L) {
      views.setViewVisibility(R.id.savings_other_row, View.VISIBLE)
      views.setTextViewText(R.id.savings_other_value, money(s, s.otherSavingsBalance))
    } else {
      views.setViewVisibility(R.id.savings_other_row, View.GONE)
    }
  }

  // ---- Utilidades -------------------------------------------------------------------------

  private fun money(s: WidgetSnapshot, amount: Long): String =
    WidgetFormat.formatCurrency(amount, s.currencySymbol, s.thousandsSeparator)

  private fun Long.toIntSafe(): Int = coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()

  private data class SizeDp(val widthDp: Int, val heightDp: Int)

  /**
   * Tamano real del widget. En vertical el launcher usa el ancho minimo y el alto maximo
   * informados (OPTION_APPWIDGET_MIN_WIDTH / MAX_HEIGHT).
   */
  private fun sizeOf(manager: AppWidgetManager, appWidgetId: Int, kind: WidgetKind): SizeDp {
    val options = manager.getAppWidgetOptions(appWidgetId)
    val width = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)?.takeIf { it > 0 } ?: kind.defaultWidthDp
    val height = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)?.takeIf { it > 0 } ?: kind.defaultHeightDp
    return SizeDp(width, height)
  }

  /** Abre la app en la pestana del widget: `bflow://?tab=<tab>`, solo dentro de este paquete. */
  private fun openAppIntent(context: Context, kind: WidgetKind): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("bflow://?tab=${kind.tab}"))
      .setPackage(context.packageName)
      // La actividad principal de Expo es singleTask: si ya esta abierta recibe el enlace en onNewIntent.
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(
      context,
      kind.requestCode,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private fun refreshIntent(context: Context, kind: WidgetKind): PendingIntent {
    val intent = Intent(context, kind.providerClass)
      .setAction(BFlowWidgetProvider.ACTION_REFRESH)
      .setPackage(context.packageName)
    return PendingIntent.getBroadcast(
      context,
      kind.requestCode + 1,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private fun appWidgetManager(context: Context): AppWidgetManager? = try {
    AppWidgetManager.getInstance(context)
  } catch (_: RuntimeException) {
    null
  }

  private fun idsFor(context: Context, manager: AppWidgetManager, kind: WidgetKind): IntArray =
    manager.getAppWidgetIds(ComponentName(context, kind.providerClass)) ?: IntArray(0)

  /** Resuelve colores para claro y oscuro (Android 12+) o para el tema actual. */
  private class Palette(private val context: Context) {
    val isNightNow: Boolean =
      (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    private val lightContext: Context by lazy { themed(night = false) }
    private val darkContext: Context by lazy { themed(night = true) }

    private fun themed(night: Boolean): Context {
      val configuration = Configuration(context.resources.configuration)
      configuration.uiMode = (configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
        if (night) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
      return context.createConfigurationContext(configuration)
    }

    fun color(@ColorRes res: Int, night: Boolean): Int =
      (if (night) darkContext else lightContext).getColor(res)

    fun setTextColor(views: RemoteViews, @IdRes viewId: Int, @ColorRes res: Int) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        views.setColorInt(viewId, "setTextColor", color(res, night = false), color(res, night = true))
      } else {
        views.setTextColor(viewId, context.getColor(res))
      }
    }

    fun chartColors(night: Boolean) = TrendChartRenderer.Colors(
      income = color(R.color.bflow_widget_income, night),
      expense = color(R.color.bflow_widget_expense, night),
      label = color(R.color.bflow_widget_text_muted, night),
      currentLabel = color(R.color.bflow_widget_text_primary, night),
      baseline = color(R.color.bflow_widget_outline, night),
    )
  }
}
