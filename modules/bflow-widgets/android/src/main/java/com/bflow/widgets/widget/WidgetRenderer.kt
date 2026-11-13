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
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import androidx.annotation.ColorRes
import androidx.annotation.IdRes
import androidx.annotation.LayoutRes
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
 * El diseno replica las vistas de las vistas SwiftUI de `targets/widgets/` (ADR 0021): misma jerarquia, mismos
 * textos y colores de la piel iOS. Cada `bind*` indica la vista Swift que reproduce.
 *
 * Colores: los del XML los resuelve el launcher al inflar, asi que siguen el modo claro/oscuro.
 * Los que se eligen en codigo (signo del flujo neto) usan en Android 12+ `setColorInt(claro,
 * oscuro)` para no quedar congelados al cambiar de tema; antes se resuelven con el tema actual.
 */
internal object WidgetRenderer {
  private const val TAG = "BFlowWidgets"

  /** Hilo propio para repintar sin bloquear el hilo de JavaScript (setSnapshot es sincrono). */
  private val executor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "bflow-widget-render").apply { isDaemon = true }
  }

  private val PENDING_ROWS = intArrayOf(
    R.id.pending_row_1, R.id.pending_row_2, R.id.pending_row_3,
    R.id.pending_row_4, R.id.pending_row_5, R.id.pending_row_6,
  )
  private val PENDING_ICONS = intArrayOf(
    R.id.pending_icon_1, R.id.pending_icon_2, R.id.pending_icon_3,
    R.id.pending_icon_4, R.id.pending_icon_5, R.id.pending_icon_6,
  )
  private val PENDING_NAMES = intArrayOf(
    R.id.pending_name_1, R.id.pending_name_2, R.id.pending_name_3,
    R.id.pending_name_4, R.id.pending_name_5, R.id.pending_name_6,
  )
  private val PENDING_AMOUNTS = intArrayOf(
    R.id.pending_amount_1, R.id.pending_amount_2, R.id.pending_amount_3,
    R.id.pending_amount_4, R.id.pending_amount_5, R.id.pending_amount_6,
  )
  /** Separador anterior a cada fila (la primera no lleva). */
  private val PENDING_DIVIDERS = intArrayOf(
    0, R.id.pending_divider_2, R.id.pending_divider_3,
    R.id.pending_divider_4, R.id.pending_divider_5, R.id.pending_divider_6,
  )

  /** `PendingLargeView.maxVisibleRows` de iOS. */
  private const val PENDING_MAX_ROWS = 6
  private const val PROGRESS_MAX = 1_000

  // Medidas de los layouts (dp) para repartir el alto disponible.
  private const val PADDING_DP = 16
  private const val HEADER_DP = 20
  private const val LEGEND_DP = 16
  private const val COLUMN_GAP_DP = 14
  private const val MIN_CHART_HEIGHT_DP = 24
  /** Checklist (10 + 15), barra (5 + 6), totales (10 + 15 + 2 + 24), margen de lista (10), "y N mas" (14). */
  private const val PENDING_FIXED_DP = 25 + 11 + 51 + 10 + 14
  /** Fila de 15 sp con 5 + 5 de relleno y separador de 1 px. */
  private const val PENDING_ROW_DP = 31

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
      val size = sizeOf(manager, appWidgetId, kind)
      val views = try {
        build(context, kind, size, snapshot, canRefresh, now)
      } catch (error: RuntimeException) {
        // Un snapshot raro nunca debe dejar el widget en "No se puede cargar el widget".
        Log.w(TAG, "Fallo al construir el widget ${kind.name}: ${error.javaClass.simpleName}")
        build(context, kind, size, null, canRefresh, now)
      }
      manager.updateAppWidget(appWidgetId, views)
    }
  }

  /**
   * Deudas y Ahorros tienen diseno pequeno y mediano, como en iOS. En Android 12+ se entregan los
   * dos y el launcher elige segun el tamano real (tambien al redimensionar, sin despertar a la
   * app); antes de Android 12 se elige aqui con el ancho informado.
   */
  private fun build(
    context: Context,
    kind: WidgetKind,
    size: SizeDp,
    snapshot: WidgetSnapshot?,
    canRefresh: Boolean,
    now: Long,
  ): RemoteViews {
    val medium = kind.mediumLayout ?: return buildLayout(context, kind, kind.layout, size, snapshot, canRefresh, now)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val mediumWidth = WidgetKind.MEDIUM_MIN_WIDTH_DP
      return RemoteViews(
        mapOf(
          SizeF(kind.defaultWidthDp.toFloat(), kind.defaultHeightDp.toFloat()) to
            buildLayout(context, kind, kind.layout, size, snapshot, canRefresh, now),
          SizeF(mediumWidth.toFloat(), kind.defaultHeightDp.toFloat()) to
            buildLayout(context, kind, medium, size.copy(widthDp = maxOf(size.widthDp, mediumWidth)), snapshot, canRefresh, now),
        )
      )
    }
    val layout = if (size.widthDp >= WidgetKind.MEDIUM_MIN_WIDTH_DP) medium else kind.layout
    return buildLayout(context, kind, layout, size, snapshot, canRefresh, now)
  }

  private fun buildLayout(
    context: Context,
    kind: WidgetKind,
    @LayoutRes layout: Int,
    size: SizeDp,
    snapshot: WidgetSnapshot?,
    canRefresh: Boolean,
    now: Long,
  ): RemoteViews {
    val views = RemoteViews(context.packageName, layout)
    val spec = LayoutSpec.of(layout)
    views.setOnClickPendingIntent(android.R.id.background, openAppIntent(context, kind))
    if (spec.hasRefresh) {
      views.setOnClickPendingIntent(R.id.bflow_widget_refresh, refreshIntent(context, kind))
      views.setViewVisibility(R.id.bflow_widget_refresh, if (canRefresh) View.VISIBLE else View.GONE)
    }

    if (snapshot == null) {
      // WidgetEmptyStateView: icono, "BFlow" y "Abre BFlow para ver tu mes".
      views.setViewVisibility(R.id.bflow_widget_content, View.GONE)
      views.setViewVisibility(R.id.bflow_widget_empty, View.VISIBLE)
      return views
    }
    views.setViewVisibility(R.id.bflow_widget_content, View.VISIBLE)
    views.setViewVisibility(R.id.bflow_widget_empty, View.GONE)

    // WidgetHeader: titulo + mes (y, en medianos y grandes, la hora y el boton).
    val month = WidgetFormat.monthLabel(snapshot.monthKey)
    views.setTextViewText(R.id.bflow_widget_title, context.getString(titleFor(kind)))
    views.setTextViewText(R.id.bflow_widget_month, month)
    views.setContentDescription(R.id.bflow_widget_month, context.getString(R.string.bflow_widget_month_content_description, month))
    if (spec.hasUpdated) {
      views.setTextViewText(R.id.bflow_widget_updated, WidgetFormat.updatedLabel(snapshot.updatedAtEpochMillis, now))
    }

    val palette = Palette(context)
    when (layout) {
      R.layout.bflow_widget_netflow -> bindNetFlow(context, views, snapshot, palette)
      R.layout.bflow_widget_summary -> bindSummary(context, views, snapshot, palette, size)
      R.layout.bflow_widget_pending -> bindPending(context, views, snapshot, size)
      R.layout.bflow_widget_debt_small -> bindDebt(context, views, snapshot, medium = false)
      R.layout.bflow_widget_debt_medium -> bindDebt(context, views, snapshot, medium = true)
      R.layout.bflow_widget_savings_small -> bindSavings(context, views, snapshot, medium = false)
      R.layout.bflow_widget_savings_medium -> bindSavings(context, views, snapshot, medium = true)
    }
    return views
  }

  /** Que piezas comunes trae cada layout (RemoteViews falla si se toca una vista inexistente). */
  private data class LayoutSpec(val hasRefresh: Boolean, val hasUpdated: Boolean) {
    companion object {
      fun of(@LayoutRes layout: Int): LayoutSpec = when (layout) {
        R.layout.bflow_widget_netflow, R.layout.bflow_widget_debt_small -> LayoutSpec(hasRefresh = false, hasUpdated = true)
        // SavingsSmallView no muestra "hace X min": con tres bolsillos no cabe.
        R.layout.bflow_widget_savings_small -> LayoutSpec(hasRefresh = false, hasUpdated = false)
        else -> LayoutSpec(hasRefresh = true, hasUpdated = true)
      }
    }
  }

  private fun titleFor(kind: WidgetKind): Int = when (kind) {
    WidgetKind.NET_FLOW -> R.string.bflow_widget_netflow_title
    WidgetKind.SUMMARY -> R.string.bflow_widget_summary_title
    WidgetKind.PENDING -> R.string.bflow_widget_pending_title
    WidgetKind.DEBT -> R.string.bflow_widget_debt_title
    WidgetKind.SAVINGS -> R.string.bflow_widget_savings_title
  }

  // ---- NetFlowSmallView ---------------------------------------------------------------------

  private fun bindNetFlow(context: Context, views: RemoteViews, s: WidgetSnapshot, palette: Palette) {
    val negative = s.netCashFlow < 0L
    views.setImageViewResource(
      R.id.netflow_icon,
      if (negative) R.drawable.bflow_widget_ic_arrow_down_right_expense else R.drawable.bflow_widget_ic_arrow_up_right_income,
    )
    views.setTextViewText(
      R.id.netflow_state,
      context.getString(if (negative) R.string.bflow_widget_netflow_deficit else R.string.bflow_widget_netflow_available),
    )
    views.setTextViewText(R.id.netflow_amount, signedMoney(s, s.netCashFlow))
    palette.setTextColor(views, R.id.netflow_amount, flowColor(s.netCashFlow))
    views.setContentDescription(
      R.id.netflow_amount,
      context.getString(R.string.bflow_widget_netflow_content_description, WidgetFormat.monthLabel(s.monthKey), spoken(s, s.netCashFlow)),
    )
    val completed = s.checklistCompleted.toIntSafe()
    val total = s.checklistTotal.toIntSafe()
    views.setTextViewText(R.id.netflow_checklist, context.getString(R.string.bflow_widget_checklist_count, completed, total))
    views.setContentDescription(
      R.id.netflow_checklist,
      context.getString(R.string.bflow_widget_checklist_content_description, completed, total),
    )
    setFraction(views, R.id.netflow_progress, s.checklistCompleted, s.checklistTotal)
  }

  // ---- SummaryMediumView --------------------------------------------------------------------

  private fun bindSummary(context: Context, views: RemoteViews, s: WidgetSnapshot, palette: Palette, size: SizeDp) {
    views.setTextViewText(R.id.summary_net, signedMoney(s, s.netCashFlow))
    palette.setTextColor(views, R.id.summary_net, flowColor(s.netCashFlow))
    views.setContentDescription(
      R.id.summary_net,
      context.getString(R.string.bflow_widget_summary_net_content_description, spoken(s, s.netCashFlow)),
    )
    bindMetric(views, R.id.summary_received_row, R.id.summary_received_value, compact(s, s.receivedIncome),
      context.getString(R.string.bflow_widget_received_content_description, spoken(s, s.receivedIncome)))
    bindMetric(views, R.id.summary_paid_row, R.id.summary_paid_value, compact(s, s.paidExpenses),
      context.getString(R.string.bflow_widget_paid_content_description, spoken(s, s.paidExpenses)))
    bindMetric(views, R.id.summary_pending_row, R.id.summary_pending_value, compact(s, s.pendingExpenses),
      context.getString(R.string.bflow_widget_row_content_description, context.getString(R.string.bflow_widget_to_pay), spoken(s, s.pendingExpenses)))

    // Columna derecha: mitad del ancho util, alto restante menos la leyenda.
    val chartWidthDp = (size.widthDp - 2 * PADDING_DP - COLUMN_GAP_DP) / 2
    val chartHeightDp = size.heightDp - 2 * PADDING_DP - HEADER_DP - 4 - LEGEND_DP
    val density = context.resources.displayMetrics.density
    val pixelSize = if (chartWidthDp > 0 && chartHeightDp >= MIN_CHART_HEIGHT_DP) {
      TrendChartRenderer.pixelSize(chartWidthDp, chartHeightDp, density)
    } else {
      null
    }
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
    val first = s.trend.first()
    val last = s.trend.last()
    views.setContentDescription(
      R.id.summary_chart,
      if (s.trend.size == 1) {
        context.getString(R.string.bflow_widget_chart_single_content_description, WidgetFormat.monthLabel(last.monthKey))
      } else {
        context.getString(
          R.string.bflow_widget_chart_content_description,
          WidgetFormat.monthLabel(first.monthKey),
          WidgetFormat.monthLabel(last.monthKey),
        )
      },
    )
  }

  // ---- PendingLargeView ---------------------------------------------------------------------

  private fun bindPending(context: Context, views: RemoteViews, s: WidgetSnapshot, size: SizeDp) {
    val completed = s.checklistCompleted.toIntSafe()
    val total = s.checklistTotal.toIntSafe()
    views.setTextViewText(R.id.pending_checklist, context.getString(R.string.bflow_widget_checklist_completed, completed, total))
    views.setContentDescription(
      R.id.pending_checklist_row,
      context.getString(R.string.bflow_widget_checklist_content_description, completed, total),
    )
    setFraction(views, R.id.pending_progress, s.checklistCompleted, s.checklistTotal)

    views.setTextViewText(R.id.pending_expense_amount, money(s, s.pendingExpenses))
    views.setContentDescription(R.id.pending_expense, rowDescription(context, R.string.bflow_widget_to_pay, spoken(s, s.pendingExpenses)))
    views.setTextViewText(R.id.pending_income_amount, money(s, s.pendingIncome))
    views.setContentDescription(R.id.pending_income, rowDescription(context, R.string.bflow_widget_to_receive, spoken(s, s.pendingIncome)))

    val items = s.pendingItems
    if (items.isEmpty()) {
      // "Todo al dia" centrado en el espacio libre.
      views.setViewVisibility(R.id.pending_list, View.GONE)
      views.setViewVisibility(R.id.pending_spacer, View.GONE)
      views.setViewVisibility(R.id.pending_more, View.GONE)
      views.setViewVisibility(R.id.pending_none, View.VISIBLE)
      return
    }
    views.setViewVisibility(R.id.pending_none, View.GONE)
    views.setViewVisibility(R.id.pending_list, View.VISIBLE)
    views.setViewVisibility(R.id.pending_spacer, View.VISIBLE)

    // Hasta 6 filas, como iOS; menos si el widget es mas bajo que un systemLarge.
    val available = size.heightDp - 2 * PADDING_DP - HEADER_DP - PENDING_FIXED_DP
    val capacity = (available / PENDING_ROW_DP).coerceIn(1, PENDING_MAX_ROWS)
    val shown = minOf(items.size, capacity)
    for (index in PENDING_ROWS.indices) {
      val item = items.getOrNull(index)?.takeIf { index < shown }
      val visible = item != null
      views.setViewVisibility(PENDING_ROWS[index], if (visible) View.VISIBLE else View.GONE)
      if (index > 0) views.setViewVisibility(PENDING_DIVIDERS[index], if (visible) View.VISIBLE else View.GONE)
      if (item == null) continue
      val isIncome = item.type == PendingType.INCOME
      val formatted = money(s, item.amount)
      views.setImageViewResource(
        PENDING_ICONS[index],
        if (isIncome) R.drawable.bflow_widget_ic_circle_down_left_income else R.drawable.bflow_widget_ic_circle_up_right_expense,
      )
      views.setTextViewText(PENDING_NAMES[index], item.name)
      // El signo repite el tipo: "+$ 250.000" por recibir, "-$ 250.000" por pagar.
      views.setTextViewText(PENDING_AMOUNTS[index], if (isIncome) "+$formatted" else "-$formatted")
      views.setContentDescription(
        PENDING_ROWS[index],
        context.getString(
          R.string.bflow_widget_pending_item_content_description,
          context.getString(if (isIncome) R.string.bflow_widget_to_receive else R.string.bflow_widget_to_pay),
          item.name,
          spoken(s, item.amount),
        ),
      )
    }
    val hidden = items.size - shown
    if (hidden > 0) {
      views.setViewVisibility(R.id.pending_more, View.VISIBLE)
      views.setTextViewText(
        R.id.pending_more,
        if (hidden == 1) context.getString(R.string.bflow_widget_pending_more_one) else context.getString(R.string.bflow_widget_pending_more, hidden),
      )
    } else {
      views.setViewVisibility(R.id.pending_more, View.GONE)
    }
  }

  // ---- DebtSmallView / DebtMediumView -------------------------------------------------------

  private fun bindDebt(context: Context, views: RemoteViews, s: WidgetSnapshot, medium: Boolean) {
    val hasNoDebts = s.initialDebt == 0L && s.totalDebt == 0L
    views.setViewVisibility(R.id.debt_active, if (hasNoDebts) View.GONE else View.VISIBLE)
    views.setViewVisibility(R.id.debt_spacer, if (hasNoDebts) View.GONE else View.VISIBLE)
    views.setViewVisibility(R.id.debt_progress_block, if (hasNoDebts) View.GONE else View.VISIBLE)
    views.setViewVisibility(R.id.debt_free, if (hasNoDebts) View.VISIBLE else View.GONE)
    if (hasNoDebts) return

    views.setTextViewText(R.id.debt_amount, money(s, s.totalDebt))
    views.setContentDescription(R.id.debt_amount, context.getString(R.string.bflow_widget_debt_remaining_content_description, spoken(s, s.totalDebt)))

    val paid = (s.initialDebt - s.totalDebt).coerceAtLeast(0L)
    setFraction(views, R.id.debt_progress, paid, s.initialDebt)
    val percent = WidgetFormat.percentLabel(paid, s.initialDebt)
    val sinceMonth = s.debtSinceMonthKey?.let { WidgetFormat.monthLabel(it) }
    val since = sinceMonth?.let { context.getString(R.string.bflow_widget_debt_since, it) }.orEmpty()
    views.setTextViewText(R.id.debt_progress_label, context.getString(R.string.bflow_widget_debt_progress, percent, since).trim())
    views.setContentDescription(
      R.id.debt_progress_block,
      context.getString(R.string.bflow_widget_debt_progress_content_description, percent, sinceMonth?.let { " desde $it" }.orEmpty()),
    )
    if (!medium) return

    views.setTextViewText(R.id.debt_initial, context.getString(R.string.bflow_widget_debt_initial, money(s, s.initialDebt), since).trim())
    views.setContentDescription(R.id.debt_initial, context.getString(R.string.bflow_widget_debt_initial_content_description, spoken(s, s.initialDebt)))
    bindMetric(views, R.id.debt_paid_month_row, R.id.debt_paid_month_value, compact(s, s.paidDebtThisMonth),
      context.getString(R.string.bflow_widget_debt_paid_content_description, spoken(s, s.paidDebtThisMonth)))
    val payoff = s.estimatedPayoffMonthKey
    if (payoff != null) {
      val label = WidgetFormat.monthLabel(payoff)
      views.setViewVisibility(R.id.debt_payoff_row, View.VISIBLE)
      bindMetric(views, R.id.debt_payoff_row, R.id.debt_payoff_value, label,
        context.getString(R.string.bflow_widget_debt_payoff_content_description, label))
    } else {
      views.setViewVisibility(R.id.debt_payoff_row, View.GONE)
    }
  }

  // ---- SavingsSmallView / SavingsMediumView -------------------------------------------------

  private fun bindSavings(context: Context, views: RemoteViews, s: WidgetSnapshot, medium: Boolean) {
    views.setTextViewText(R.id.savings_total, money(s, s.totalSavings))
    views.setContentDescription(R.id.savings_total, context.getString(R.string.bflow_widget_savings_total_content_description, spoken(s, s.totalSavings)))
    // El pequeno usa cifras compactas y el mediano completas, como en iOS.
    val format: (Long) -> String = if (medium) { amount -> money(s, amount) } else { amount -> compact(s, amount) }
    bindBucket(context, views, s, R.id.savings_reserve_row, R.id.savings_reserve_name, R.id.savings_reserve_value, s.reserveName, s.reserveBalance, format)
    bindBucket(context, views, s, R.id.savings_savings_row, R.id.savings_savings_name, R.id.savings_savings_value, s.savingsName, s.savingsBalance, format)
    val showOther = s.otherSavingsBalance > 0L
    views.setViewVisibility(R.id.savings_other_row, if (showOther) View.VISIBLE else View.GONE)
    if (showOther) {
      bindBucket(context, views, s, R.id.savings_other_row, R.id.savings_other_name, R.id.savings_other_value,
        context.getString(R.string.bflow_widget_savings_other), s.otherSavingsBalance, format)
    }
    if (!medium) return

    // SavingsDistributionBar: reparto proporcional; los saldos negativos cuentan como cero.
    val reserve = s.reserveBalance.coerceAtLeast(0L)
    val savings = s.savingsBalance.coerceAtLeast(0L)
    val other = if (showOther) s.otherSavingsBalance else 0L
    val total = reserve + savings + other
    setFraction(views, R.id.savings_bar_reserve, reserve, total)
    setFraction(views, R.id.savings_bar_savings, reserve + savings, total)
    setFraction(views, R.id.savings_bar_other, total, total)
  }

  private fun bindBucket(
    context: Context,
    views: RemoteViews,
    s: WidgetSnapshot,
    @IdRes rowId: Int,
    @IdRes nameId: Int,
    @IdRes valueId: Int,
    name: String,
    balance: Long,
    format: (Long) -> String,
  ) {
    views.setTextViewText(nameId, name)
    views.setTextViewText(valueId, format(balance))
    views.setContentDescription(rowId, context.getString(R.string.bflow_widget_row_content_description, name, spoken(s, balance)))
  }

  // ---- Utilidades -------------------------------------------------------------------------

  private fun bindMetric(views: RemoteViews, @IdRes rowId: Int, @IdRes valueId: Int, value: String, description: String) {
    views.setTextViewText(valueId, value)
    views.setContentDescription(rowId, description)
  }

  private fun rowDescription(context: Context, label: Int, value: String): String =
    context.getString(R.string.bflow_widget_row_content_description, context.getString(label), value)

  /** Barra de progreso en milesimas, acotada a 0..1 como `WidgetProgressBar`. */
  private fun setFraction(views: RemoteViews, @IdRes viewId: Int, part: Long, whole: Long) {
    val permille = if (whole <= 0L || part <= 0L) 0 else if (part >= whole) PROGRESS_MAX else ((part * PROGRESS_MAX) / whole).toInt()
    views.setProgressBar(viewId, PROGRESS_MAX, permille, false)
  }

  @ColorRes
  private fun flowColor(amount: Long): Int = if (amount < 0L) R.color.bflow_widget_expense else R.color.bflow_widget_income

  private fun money(s: WidgetSnapshot, amount: Long): String =
    WidgetFormat.formatCurrency(amount, s.currencySymbol, s.thousandsSeparator)

  private fun signedMoney(s: WidgetSnapshot, amount: Long): String =
    WidgetFormat.formatSignedCurrency(amount, s.currencySymbol, s.thousandsSeparator)

  private fun compact(s: WidgetSnapshot, amount: Long): String = WidgetFormat.formatCurrencyCompact(amount, s.currencySymbol)

  private fun spoken(s: WidgetSnapshot, amount: Long): String = WidgetFormat.spokenAmount(amount, s.thousandsSeparator)

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
      label = color(R.color.bflow_widget_text_secondary, night),
    )
  }
}
