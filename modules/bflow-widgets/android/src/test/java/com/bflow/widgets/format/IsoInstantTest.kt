package com.bflow.widgets.format

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Valores esperados calculados con `Date.parse` de JavaScript. */
class IsoInstantTest {

  @Test
  fun parsesToIsoStringOutput() {
    assertEquals(1_794_411_727_123L, IsoInstant.parseEpochMillis("2026-11-11T15:42:07.123Z"))
    assertEquals(1_794_411_727_000L, IsoInstant.parseEpochMillis("2026-11-11T15:42:07Z"))
    assertEquals(0L, IsoInstant.parseEpochMillis("1970-01-01T00:00:00.000Z"))
    assertEquals(-1_000L, IsoInstant.parseEpochMillis("1969-12-31T23:59:59Z"))
  }

  @Test
  fun handlesOffsetsLeapDaysAndLongFractions() {
    assertEquals(1_709_269_199_999L, IsoInstant.parseEpochMillis("2024-02-29T23:59:59.999-05:00"))
    assertEquals(1_794_411_727_100L, IsoInstant.parseEpochMillis("2026-11-11T15:42:07.1Z"))
    assertEquals(1_794_411_727_123L, IsoInstant.parseEpochMillis("2026-11-11T15:42:07.123456789Z"))
  }

  @Test
  fun comparesInstantsNotStrings() {
    // Mismo instante escrito con y sin milisegundos / con desfase.
    assertEquals(
      IsoInstant.parseEpochMillis("2026-11-11T15:42:07Z"),
      IsoInstant.parseEpochMillis("2026-11-11T10:42:07.000-05:00"),
    )
  }

  @Test
  fun rejectsInvalidDates() {
    assertNull(IsoInstant.parseEpochMillis("2026-02-29T00:00:00Z"))
    assertNull(IsoInstant.parseEpochMillis("2026-11-31T00:00:00Z"))
    assertNull(IsoInstant.parseEpochMillis("2026-11-11T24:00:00Z"))
    assertNull(IsoInstant.parseEpochMillis("2026-11-11 15:42:07Z"))
    assertNull(IsoInstant.parseEpochMillis("2026-11-11T15:42:07"))
    assertNull(IsoInstant.parseEpochMillis("2026-11-11T15:42:07.Z"))
    assertNull(IsoInstant.parseEpochMillis(""))
  }
}
