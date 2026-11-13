package com.bflow.widgets.format

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.TimeZone

/**
 * Paridad con `src/domain/money/money.ts`. Los valores esperados de `formatCurrencyCompact` se
 * obtuvieron ejecutando la funcion de JavaScript (incluidos los empates de `toFixed`).
 */
class WidgetFormatTest {

  @Test
  fun formatsCurrencyLikeTheDomain() {
    assertEquals("$ 1.080.000", WidgetFormat.formatCurrency(1_080_000))
    assertEquals("-$ 1.080.000", WidgetFormat.formatCurrency(-1_080_000))
    assertEquals("$ 0", WidgetFormat.formatCurrency(0))
    assertEquals("$ 999", WidgetFormat.formatCurrency(999))
    assertEquals("$ 1.000", WidgetFormat.formatCurrency(1_000))
    assertEquals("$ 100.000", WidgetFormat.formatCurrency(100_000))
    assertEquals("$ 9.007.199.254.740.991", WidgetFormat.formatCurrency(9_007_199_254_740_991L))
  }

  @Test
  fun honoursSymbolAndSeparatorFromTheSnapshot() {
    assertEquals("US$ 1,080,000", WidgetFormat.formatCurrency(1_080_000, "US$", ","))
    assertEquals("€ 1080000", WidgetFormat.formatCurrency(1_080_000, "€", ""))
    assertEquals("$ 1 080 000", WidgetFormat.formatCurrency(1_080_000, "$", " "))
  }

  @Test
  fun signsDifferencesLikeFormatSignedCurrency() {
    assertEquals("+$ 120.000", WidgetFormat.formatSignedCurrency(120_000))
    assertEquals("-$ 80.000", WidgetFormat.formatSignedCurrency(-80_000))
    assertEquals("$ 0", WidgetFormat.formatSignedCurrency(0))
  }

  @Test
  fun compactsLikeFormatCurrencyCompact() {
    val expected = mapOf(
      999L to "$ 999",
      1_000L to "$ 1k",
      1_499L to "$ 1k",
      1_500L to "$ 2k",
      450_000L to "$ 450k",
      999_499L to "$ 999k",
      999_500L to "$ 1000k",
      1_049_999L to "$ 1M",
      1_050_000L to "$ 1.1M",
      1_149_999L to "$ 1.1M",
      1_150_000L to "$ 1.1M",
      1_250_000L to "$ 1.3M",
      1_000_000_000L to "$ 1B",
      1_250_000_000L to "$ 1.3B",
      -1_080_000L to "-$ 1.1M",
    )
    for ((amount, text) in expected) {
      assertEquals("amount=$amount", text, WidgetFormat.formatCurrencyCompact(amount))
    }
  }

  @Test
  fun labelsMonthsInSpanishWithoutLocale() {
    assertEquals("Nov 2026", WidgetFormat.monthLabel("2026-11"))
    assertEquals("Ene 2027", WidgetFormat.monthLabel("2027-01"))
    assertEquals("Ago 2026", WidgetFormat.monthLabel("2026-08"))
    assertEquals("Dic", WidgetFormat.monthShortLabel("2026-12"))
    assertEquals("2026-13", WidgetFormat.monthLabel("2026-13"))
    assertEquals("x", WidgetFormat.monthShortLabel("x"))
  }

  @Test
  fun showsUpdateTimeInLocalTime24h() {
    val bogota = TimeZone.getTimeZone("America/Bogota")
    // 2026-11-11T15:42:07Z = 10:42 en Bogota (UTC-5).
    val updated = 1_794_411_727_000L
    assertEquals("Act. 10:42", WidgetFormat.updatedLabel(updated, updated + 60_000L, bogota))
    // Al dia siguiente se anade la fecha.
    assertEquals("Act. 11 Nov 10:42", WidgetFormat.updatedLabel(updated, updated + 86_400_000L, bogota))
    val utc = TimeZone.getTimeZone("UTC")
    assertEquals("Act. 15:42", WidgetFormat.updatedLabel(updated, updated, utc))
  }

  @Test
  fun matchesIosPercentAndSpokenAmounts() {
    assertEquals("22%", WidgetFormat.percentLabel(1_800_000, 8_000_000))
    assertEquals("0%", WidgetFormat.percentLabel(0, 0))
    assertEquals("100%", WidgetFormat.percentLabel(9, 8))
    assertEquals("1.080.000 pesos", WidgetFormat.spokenAmount(1_080_000))
    assertEquals("menos 450.000 pesos", WidgetFormat.spokenAmount(-450_000))
    assertEquals("0 pesos", WidgetFormat.spokenAmount(0))
  }

  @Test
  fun computesTruncatedProgress() {
    assertEquals(0, WidgetFormat.progressPercent(0, 100))
    assertEquals(0, WidgetFormat.progressPercent(5, 0))
    assertEquals(33, WidgetFormat.progressPercent(1, 3))
    assertEquals(99, WidgetFormat.progressPercent(999, 1_000))
    assertEquals(100, WidgetFormat.progressPercent(1_000, 1_000))
    assertEquals(100, WidgetFormat.progressPercent(2_000, 1_000))
    // Enteros seguros grandes: part * 100 no desborda y se trunca (49,99... -> 49).
    assertEquals(49, WidgetFormat.progressPercent(4_503_599_627_370_495L, 9_007_199_254_740_991L))
  }
}
