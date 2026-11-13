package com.bflow.widgets.format

import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * Formato de los widgets: replica exacta de `src/domain/money/money.ts` (`formatCurrency`,
 * `formatSignedCurrency`, `formatCurrencyCompact`) para que widget y app digan lo mismo, y
 * nombres de mes en espanol que no dependen del locale del telefono.
 *
 * Kotlin puro: los tests JVM (`WidgetFormatTest`) fijan los mismos casos que los de dominio.
 */
object WidgetFormat {
  const val DEFAULT_SYMBOL = "$"
  const val DEFAULT_SEPARATOR = "."

  private val MONTH_ABBREVIATIONS = arrayOf(
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  )

  /** "$ 1.080.000" / "-$ 450.000" (igual que `formatCurrency`). */
  fun formatCurrency(
    amount: Long,
    symbol: String = DEFAULT_SYMBOL,
    thousandsSeparator: String = DEFAULT_SEPARATOR,
  ): String {
    val digits = absDigits(amount)
    val grouped = groupThousands(digits, thousandsSeparator)
    return if (amount < 0) "-$symbol $grouped" else "$symbol $grouped"
  }

  /** "+$ 120.000" / "-$ 80.000" / "$ 0" (igual que `formatSignedCurrency`). */
  fun formatSignedCurrency(
    amount: Long,
    symbol: String = DEFAULT_SYMBOL,
    thousandsSeparator: String = DEFAULT_SEPARATOR,
  ): String {
    val formatted = formatCurrency(amount, symbol, thousandsSeparator)
    return if (amount > 0) "+$formatted" else formatted
  }

  /**
   * "$ 1.2M", "$ 450k", "$ 999" (igual que `formatCurrencyCompact`). `toFixed` de JavaScript
   * redondea el valor binario exacto del `double` hacia arriba en el empate: es lo que hace
   * `BigDecimal(double)` con `HALF_UP`.
   */
  fun formatCurrencyCompact(amount: Long, symbol: String = DEFAULT_SYMBOL): String {
    val abs = if (amount < 0) -amount else amount
    val body = when {
      abs >= 1_000_000_000L -> "$symbol ${toFixedOneTrimmed(abs.toDouble() / 1_000_000_000.0)}B"
      abs >= 1_000_000L -> "$symbol ${toFixedOneTrimmed(abs.toDouble() / 1_000_000.0)}M"
      abs >= 1_000L -> "$symbol ${toFixed(abs.toDouble() / 1_000.0, 0)}k"
      else -> "$symbol $abs"
    }
    return if (amount < 0) "-$body" else body
  }

  /** "2026-11" -> "Nov 2026". Si la clave no es valida, se devuelve tal cual. */
  fun monthLabel(monthKey: String): String {
    val parsed = parseMonthKey(monthKey) ?: return monthKey
    return "${MONTH_ABBREVIATIONS[parsed.second - 1]} ${parsed.first}"
  }

  /** "2026-11" -> "Nov". */
  fun monthShortLabel(monthKey: String): String {
    val parsed = parseMonthKey(monthKey) ?: return monthKey
    return MONTH_ABBREVIATIONS[parsed.second - 1]
  }

  /**
   * Hora de actualizacion en la zona del telefono, 24 h: "Act. 10:42" si es de hoy y
   * "Act. 9 Nov 10:42" si es de otro dia (un widget de ayer no debe parecer reciente).
   */
  fun updatedLabel(epochMillis: Long, nowMillis: Long, timeZone: TimeZone = TimeZone.getDefault()): String {
    val updated = Calendar.getInstance(timeZone).apply { timeInMillis = epochMillis }
    val now = Calendar.getInstance(timeZone).apply { timeInMillis = nowMillis }
    // Locale.ROOT: digitos ASCII aunque el telefono use otro sistema de numeracion.
    val time = String.format(Locale.ROOT, "%02d:%02d", updated.get(Calendar.HOUR_OF_DAY), updated.get(Calendar.MINUTE))
    val sameDay = updated.get(Calendar.YEAR) == now.get(Calendar.YEAR) &&
      updated.get(Calendar.DAY_OF_YEAR) == now.get(Calendar.DAY_OF_YEAR)
    if (sameDay) return "Act. $time"
    val day = updated.get(Calendar.DAY_OF_MONTH)
    val month = MONTH_ABBREVIATIONS[updated.get(Calendar.MONTH)]
    return "Act. $day $month $time"
  }

  /** "45%" sin espacio, como `WidgetFormat.percent` de iOS (truncado, nunca promete de mas). */
  fun percentLabel(part: Long, whole: Long): String = "${progressPercent(part, whole)}%"

  /** Lectura para TalkBack, igual que `spokenAmount` de iOS: "1.080.000 pesos" / "menos ...". */
  fun spokenAmount(amount: Long, thousandsSeparator: String = DEFAULT_SEPARATOR): String {
    val grouped = groupThousands(absDigits(amount), thousandsSeparator)
    return if (amount < 0) "menos $grouped pesos" else "$grouped pesos"
  }

  /** Porcentaje entero truncado y acotado a 0..100 (nunca promete mas de lo pagado). */
  fun progressPercent(part: Long, whole: Long): Int {
    if (whole <= 0L || part <= 0L) return 0
    if (part >= whole) return 100
    // part < whole <= 2^53: part * 100 cabe en Long sin desbordar.
    return ((part * 100L) / whole).toInt()
  }

  internal fun parseMonthKey(monthKey: String): Pair<Int, Int>? {
    if (monthKey.length != 7 || monthKey[4] != '-') return null
    val year = monthKey.substring(0, 4).toIntOrNull() ?: return null
    val month = monthKey.substring(5, 7).toIntOrNull() ?: return null
    if (!monthKey.substring(0, 4).all { it.isDigit() } || !monthKey.substring(5, 7).all { it.isDigit() }) {
      return null
    }
    if (month !in 1..12) return null
    return year to month
  }

  private fun absDigits(amount: Long): String {
    // Long.MIN_VALUE no tiene opuesto en Long; nunca llega (enteros seguros), pero no rompe.
    return if (amount == Long.MIN_VALUE) "9223372036854775808" else kotlin.math.abs(amount).toString()
  }

  private fun groupThousands(digits: String, separator: String): String {
    if (digits.length <= 3 || separator.isEmpty()) return digits
    val builder = StringBuilder(digits.length + (digits.length / 3) * separator.length)
    val firstGroup = digits.length % 3
    if (firstGroup > 0) builder.append(digits, 0, firstGroup)
    var index = firstGroup
    while (index < digits.length) {
      if (builder.isNotEmpty()) builder.append(separator)
      builder.append(digits, index, index + 3)
      index += 3
    }
    return builder.toString()
  }

  private fun toFixed(value: Double, digits: Int): String =
    BigDecimal(value).setScale(digits, RoundingMode.HALF_UP).toPlainString()

  private fun toFixedOneTrimmed(value: Double): String = toFixed(value, 1).removeSuffix(".0")
}
