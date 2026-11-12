package com.bflow.widgets.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import com.bflow.widgets.format.WidgetFormat
import com.bflow.widgets.model.WidgetTrendPoint
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Mini grafico de barras del widget "Resumen": por mes, ingresos recibidos frente a gastos
 * pagados (los mismos puntos `trend` que alimentan los graficos de la app, ADR 0020).
 *
 * RemoteViews no admite vistas propias, asi que se dibuja en un Bitmap a la densidad del
 * widget. El tamano se acota (`MAX_PIXELS`) porque el Bitmap viaja por Binder al launcher y
 * en Android 12+ se envian dos (claro y oscuro).
 */
internal object TrendChartRenderer {
  /** ~0,35 MP por Bitmap: 1,4 MB en ARGB_8888; dos variantes caben de sobra en el limite de RemoteViews. */
  private const val MAX_PIXELS = 360_000
  private const val MAX_SIDE_PX = 1_200

  data class Colors(
    val income: Int,
    val expense: Int,
    val label: Int,
    val currentLabel: Int,
    val baseline: Int,
  )

  data class PixelSize(val width: Int, val height: Int)

  /** Tamano en pixeles para un area en dp, acotado en lado y en area total. */
  fun pixelSize(widthDp: Int, heightDp: Int, density: Float): PixelSize? {
    var width = (widthDp * density).roundToInt().coerceAtMost(MAX_SIDE_PX)
    var height = (heightDp * density).roundToInt().coerceAtMost(MAX_SIDE_PX)
    if (width <= 0 || height <= 0) return null
    val pixels = width.toLong() * height.toLong()
    if (pixels > MAX_PIXELS) {
      val scale = sqrt(MAX_PIXELS.toDouble() / pixels.toDouble())
      width = (width * scale).toInt().coerceAtLeast(1)
      height = (height * scale).toInt().coerceAtLeast(1)
    }
    return PixelSize(width, height)
  }

  /**
   * @param scale pixeles por dp del Bitmap final (menor que la densidad si se acoto el tamano).
   */
  fun render(points: List<WidgetTrendPoint>, size: PixelSize, scale: Float, colors: Colors): Bitmap {
    val bitmap = Bitmap.createBitmap(size.width, size.height, Bitmap.Config.ARGB_8888)
    if (points.isEmpty()) return bitmap
    val canvas = Canvas(bitmap)

    val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = 11f * scale
      textAlign = Paint.Align.CENTER
      color = colors.label
    }
    val currentLabelPaint = Paint(labelPaint).apply {
      color = colors.currentLabel
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val incomePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = colors.income }
    val expensePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = colors.expense }
    val baselinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = colors.baseline
      strokeWidth = max(1f, scale)
    }

    val labelBand = labelPaint.textSize + 6f * scale
    val chartTop = 2f * scale
    val chartBottom = size.height - labelBand
    val chartHeight = chartBottom - chartTop
    if (chartHeight <= 4f * scale) return bitmap

    val maxValue = points.maxOf { max(it.receivedIncome, it.paidExpenses) }
    val groupWidth = size.width.toFloat() / points.size
    val barGap = 2f * scale
    val barWidth = min(groupWidth * 0.3f, 12f * scale).coerceAtLeast(2f * scale)
    val radius = barWidth / 2f
    val minVisible = 2f * scale
    val rect = RectF()

    points.forEachIndexed { index, point ->
      val centerX = groupWidth * index + groupWidth / 2f
      if (maxValue > 0L) {
        val incomeHeight = barHeight(point.receivedIncome, maxValue, chartHeight, minVisible)
        val expenseHeight = barHeight(point.paidExpenses, maxValue, chartHeight, minVisible)
        drawBar(canvas, rect, centerX - barGap / 2f - barWidth, chartBottom, barWidth, incomeHeight, radius, incomePaint)
        drawBar(canvas, rect, centerX + barGap / 2f, chartBottom, barWidth, expenseHeight, radius, expensePaint)
      }
      val isCurrent = index == points.lastIndex
      canvas.drawText(
        WidgetFormat.monthShortLabel(point.monthKey),
        centerX,
        size.height - 3f * scale,
        if (isCurrent) currentLabelPaint else labelPaint,
      )
    }
    canvas.drawLine(0f, chartBottom, size.width.toFloat(), chartBottom, baselinePaint)
    return bitmap
  }

  /** Altura proporcional en enteros escalados; un valor > 0 nunca desaparece. */
  private fun barHeight(value: Long, maxValue: Long, chartHeight: Float, minVisible: Float): Float {
    if (value <= 0L) return 0f
    val ratio = value.toDouble() / maxValue.toDouble()
    return max((ratio * chartHeight).toFloat(), minVisible)
  }

  private fun drawBar(
    canvas: Canvas,
    rect: RectF,
    left: Float,
    bottom: Float,
    width: Float,
    height: Float,
    radius: Float,
    paint: Paint,
  ) {
    if (height <= 0f) return
    rect.set(left, bottom - height, left + width, bottom)
    canvas.drawRoundRect(rect, radius, radius, paint)
    // Base recta: solo se redondea el extremo superior.
    if (height > radius) {
      rect.set(left, bottom - radius, left + width, bottom)
      canvas.drawRect(rect, paint)
    }
  }
}
