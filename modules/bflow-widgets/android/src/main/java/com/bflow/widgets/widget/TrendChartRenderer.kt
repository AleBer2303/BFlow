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
 * Grafico del widget "Resumen" con el estilo de `TrendBarsChart` (SummaryWidget.swift):
 * barras agrupadas por mes (ingresos recibidos y gastos pagados), esquinas de 2 pt, sin eje Y,
 * sin rejilla ni linea base, y debajo el mes abreviado en 9 pt medium y texto secundario.
 *
 * RemoteViews no admite vistas propias, asi que se dibuja en un Bitmap a la densidad del
 * widget. El tamano se acota (`MAX_PIXELS`) porque el Bitmap viaja por Binder al launcher y en
 * Android 12+ se envian dos (claro y oscuro).
 */
internal object TrendChartRenderer {
  /** ~0,36 MP por Bitmap: 1,4 MB en ARGB_8888; dos variantes caben de sobra en RemoteViews. */
  private const val MAX_PIXELS = 360_000
  private const val MAX_SIDE_PX = 1_200

  data class Colors(
    val income: Int,
    val expense: Int,
    val label: Int,
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

  /** @param scale pixeles por dp del Bitmap final (menor que la densidad si se acoto el tamano). */
  fun render(points: List<WidgetTrendPoint>, size: PixelSize, scale: Float, colors: Colors): Bitmap {
    val bitmap = Bitmap.createBitmap(size.width, size.height, Bitmap.Config.ARGB_8888)
    if (points.isEmpty()) return bitmap
    val canvas = Canvas(bitmap)

    val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = 9f * scale
      textAlign = Paint.Align.CENTER
      color = colors.label
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }
    val incomePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = colors.income }
    val expensePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = colors.expense }

    val labelBand = labelPaint.textSize + 5f * scale
    val chartTop = 2f * scale
    val chartBottom = size.height - labelBand
    val chartHeight = chartBottom - chartTop
    if (chartHeight <= 4f * scale) return bitmap

    val maxValue = points.maxOf { max(it.receivedIncome, it.paidExpenses) }
    val bandWidth = size.width.toFloat() / points.size
    // Swift Charts reparte cada banda entre las dos series dejando aire entre meses.
    val barGap = 1f * scale
    val barWidth = min((bandWidth * 0.7f - barGap) / 2f, 16f * scale).coerceAtLeast(1.5f * scale)
    val radius = min(2f * scale, barWidth / 2f)
    val rect = RectF()

    points.forEachIndexed { index, point ->
      val centerX = bandWidth * index + bandWidth / 2f
      if (maxValue > 0L) {
        drawBar(canvas, rect, centerX - barGap / 2f - barWidth, chartBottom, barWidth,
          barHeight(point.receivedIncome, maxValue, chartHeight, scale), radius, incomePaint)
        drawBar(canvas, rect, centerX + barGap / 2f, chartBottom, barWidth,
          barHeight(point.paidExpenses, maxValue, chartHeight, scale), radius, expensePaint)
      }
      canvas.drawText(WidgetFormat.monthShortLabel(point.monthKey), centerX, size.height - 2f * scale, labelPaint)
    }
    return bitmap
  }

  /** Altura proporcional; un valor > 0 nunca desaparece (1 dp minimo). */
  private fun barHeight(value: Long, maxValue: Long, chartHeight: Float, scale: Float): Float {
    if (value <= 0L) return 0f
    val ratio = value.toDouble() / maxValue.toDouble()
    return max((ratio * chartHeight).toFloat(), scale)
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
  }
}
