package com.bflow.widgets.format

/**
 * Lector de instantes ISO 8601 sin `java.time` (minSdk 24 no lo tiene sin desugaring).
 *
 * Acepta lo que emite `Date.prototype.toISOString()` ("2026-11-11T15:42:07.123Z"), la misma
 * forma sin milisegundos ("2026-11-11T15:42:07Z") y, por tolerancia, un desfase explicito
 * ("+05:00" / "-05:00") y de 1 a 9 decimales. Kotlin puro: se prueba en JVM.
 */
object IsoInstant {
  private val ISO_REGEX = Regex(
    "^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,9}))?(Z|[+-]\\d{2}:\\d{2})$"
  )

  private const val MILLIS_PER_DAY = 86_400_000L

  /** Milisegundos desde 1970-01-01T00:00:00Z, o `null` si el texto no es un instante valido. */
  fun parseEpochMillis(text: String): Long? {
    val match = ISO_REGEX.matchEntire(text) ?: return null
    val groups = match.groupValues
    val year = groups[1].toInt()
    val month = groups[2].toInt()
    val day = groups[3].toInt()
    val hour = groups[4].toInt()
    val minute = groups[5].toInt()
    val second = groups[6].toInt()
    if (month !in 1..12 || day !in 1..daysInMonth(year, month)) return null
    if (hour > 23 || minute > 59 || second > 59) return null

    val millisOfSecond = groups[7].takeIf { it.isNotEmpty() }?.padEnd(3, '0')?.substring(0, 3)?.toInt() ?: 0
    val offsetMillis = parseOffsetMillis(groups[8]) ?: return null

    val days = daysFromCivil(year.toLong(), month, day)
    val localMillis = days * MILLIS_PER_DAY +
      hour * 3_600_000L + minute * 60_000L + second * 1_000L + millisOfSecond
    return localMillis - offsetMillis
  }

  private fun parseOffsetMillis(zone: String): Long? {
    if (zone == "Z") return 0L
    val sign = if (zone[0] == '-') -1L else 1L
    val hours = zone.substring(1, 3).toInt()
    val minutes = zone.substring(4, 6).toInt()
    if (hours > 23 || minutes > 59) return null
    return sign * (hours * 3_600_000L + minutes * 60_000L)
  }

  internal fun isLeapYear(year: Int): Boolean = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0

  internal fun daysInMonth(year: Int, month: Int): Int = when (month) {
    2 -> if (isLeapYear(year)) 29 else 28
    4, 6, 9, 11 -> 30
    else -> 31
  }

  /** Dias desde 1970-01-01 para una fecha del calendario gregoriano proleptico (H. Hinnant). */
  internal fun daysFromCivil(yearInput: Long, month: Int, day: Int): Long {
    val year = if (month <= 2) yearInput - 1 else yearInput
    val era = (if (year >= 0) year else year - 399) / 400
    val yearOfEra = year - era * 400
    val shiftedMonth = (month + 9) % 12
    val dayOfYear = (153 * shiftedMonth + 2) / 5 + day - 1
    val dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear
    return era * 146_097 + dayOfEra - 719_468
  }
}
