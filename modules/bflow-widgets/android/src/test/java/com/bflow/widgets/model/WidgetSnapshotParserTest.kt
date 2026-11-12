package com.bflow.widgets.model

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Contrato `WidgetSnapshotV2` del lado Android: mismos casos que `widgetSnapshotV2Schema`
 * (src/platform/widgets/widgetSnapshot.ts), salvo las claves desconocidas, que aqui se ignoran.
 */
class WidgetSnapshotParserTest {

  private fun validSnapshot(): JSONObject = JSONObject()
    .put("schemaVersion", 2)
    .put("updatedAtIso", "2026-11-11T15:42:07.123Z")
    .put("monthKey", "2026-11")
    .put("currencySymbol", "$")
    .put("thousandsSeparator", ".")
    .put("plannedIncome", 5_000_000)
    .put("receivedIncome", 4_200_000)
    .put("pendingIncome", 800_000)
    .put("plannedExpenses", 3_900_000)
    .put("paidExpenses", 2_100_000)
    .put("pendingExpenses", 1_800_000)
    .put("netCashFlow", -450_000)
    .put("checklistCompleted", 7)
    .put("checklistTotal", 12)
    .put("totalDebt", 12_000_000)
    .put("initialDebt", 18_000_000)
    .put("debtSinceMonthKey", "2026-05")
    .put("paidDebtThisMonth", 600_000)
    .put("estimatedPayoffMonthKey", "2027-09")
    .put("reserveName", "Reserva")
    .put("reserveBalance", 3_000_000)
    .put("savingsName", "Ahorro")
    .put("savingsBalance", 1_500_000)
    .put("otherSavingsBalance", 0)
    .put("totalSavings", 4_500_000)
    .put(
      "pendingItems",
      JSONArray()
        .put(JSONObject().put("id", "2026-11_rent").put("name", "Arriendo").put("amount", 1_200_000).put("type", "expense"))
        .put(JSONObject().put("id", "2026-11_salary").put("name", "Nómina").put("amount", 800_000).put("type", "income")),
    )
    .put(
      "trend",
      JSONArray()
        .put(JSONObject().put("monthKey", "2026-10").put("receivedIncome", 5_000_000).put("paidExpenses", 4_000_000).put("netCashFlow", 1_000_000))
        .put(JSONObject().put("monthKey", "2026-11").put("receivedIncome", 4_200_000).put("paidExpenses", 2_100_000).put("netCashFlow", -450_000)),
    )

  private fun parse(json: JSONObject) = WidgetSnapshotParser.parse(json.toString())

  @Test
  fun decodesAValidSnapshot() {
    val snapshot = parse(validSnapshot())
    assertNotNull(snapshot)
    snapshot!!
    assertEquals("2026-11", snapshot.monthKey)
    assertEquals(-450_000L, snapshot.netCashFlow)
    assertEquals(18_000_000L, snapshot.initialDebt)
    assertEquals("2026-05", snapshot.debtSinceMonthKey)
    assertEquals(2, snapshot.pendingItems.size)
    assertEquals(PendingType.EXPENSE, snapshot.pendingItems[0].type)
    assertEquals(PendingType.INCOME, snapshot.pendingItems[1].type)
    assertEquals("Nómina", snapshot.pendingItems[1].name)
    assertEquals(listOf("2026-10", "2026-11"), snapshot.trend.map { it.monthKey })
    // 2026-11-11T15:42:07.123Z
    assertEquals(1_794_411_727_123L, snapshot.updatedAtEpochMillis)
  }

  @Test
  fun acceptsAmountsAboveIntRangeAsLong() {
    val big = 9_007_199_254_740_991L
    val snapshot = parse(validSnapshot().put("totalSavings", big).put("reserveBalance", -big))
    assertEquals(big, snapshot?.totalSavings)
    assertEquals(-big, snapshot?.reserveBalance)
  }

  @Test
  fun acceptsNullableMonthKeysAsNull() {
    val snapshot = parse(
      validSnapshot().put("debtSinceMonthKey", JSONObject.NULL).put("estimatedPayoffMonthKey", JSONObject.NULL)
    )
    assertNotNull(snapshot)
    assertNull(snapshot!!.debtSinceMonthKey)
    assertNull(snapshot.estimatedPayoffMonthKey)
  }

  @Test
  fun acceptsTimestampsWithoutMilliseconds() {
    val snapshot = parse(validSnapshot().put("updatedAtIso", "2026-11-11T15:42:07Z"))
    assertEquals(1_794_411_727_000L, snapshot?.updatedAtEpochMillis)
  }

  @Test
  fun ignoresUnknownKeys() {
    assertNotNull(parse(validSnapshot().put("futureField", "x")))
  }

  @Test
  fun acceptsEmptyThousandsSeparatorAndPendingList() {
    val snapshot = parse(validSnapshot().put("thousandsSeparator", "").put("pendingItems", JSONArray()))
    assertEquals("", snapshot?.thousandsSeparator)
    assertEquals(0, snapshot?.pendingItems?.size)
  }

  @Test
  fun rejectsOtherSchemaVersions() {
    assertNull(parse(validSnapshot().put("schemaVersion", 1)))
    assertNull(parse(validSnapshot().put("schemaVersion", 3)))
    assertNull(parse(validSnapshot().put("schemaVersion", "2")))
  }

  @Test
  fun rejectsEveryMissingRequiredField() {
    val keys = validSnapshot().keys().asSequence().toList()
    for (key in keys) {
      val json = validSnapshot()
      json.remove(key)
      assertNull("Falta $key y aun asi se acepto", parse(json))
    }
  }

  @Test
  fun rejectsNonIntegerOrUnsafeAmounts() {
    assertNull(parse(validSnapshot().put("paidExpenses", 1.5)))
    assertNull(parse(validSnapshot().put("paidExpenses", "1000")))
    assertNull(parse(validSnapshot().put("paidExpenses", 9_007_199_254_740_992L)))
    assertNull(parse(validSnapshot().put("paidExpenses", JSONObject.NULL)))
  }

  @Test
  fun acceptsIntegralNumbersWrittenAsDecimals() {
    // JSON.stringify nunca los emite, pero 1000.0 sigue siendo un entero seguro.
    val json = validSnapshot().toString().replace("\"paidExpenses\":2100000", "\"paidExpenses\":2100000.0")
    assertEquals(2_100_000L, WidgetSnapshotParser.parse(json)?.paidExpenses)
  }

  @Test
  fun rejectsNegativeAmountsWhereTheContractForbidsThem() {
    assertNull(parse(validSnapshot().put("receivedIncome", -1)))
    assertNull(parse(validSnapshot().put("totalDebt", -1)))
    assertNull(parse(validSnapshot().put("checklistTotal", -1)))
  }

  @Test
  fun rejectsChecklistCompletedAboveTotal() {
    assertNull(parse(validSnapshot().put("checklistCompleted", 13)))
  }

  @Test
  fun rejectsInvalidMonthKeysAndTimestamps() {
    assertNull(parse(validSnapshot().put("monthKey", "2026-13")))
    assertNull(parse(validSnapshot().put("monthKey", "2026-1")))
    assertNull(parse(validSnapshot().put("debtSinceMonthKey", "nov")))
    assertNull(parse(validSnapshot().put("updatedAtIso", "ayer")))
    assertNull(parse(validSnapshot().put("updatedAtIso", "2026-02-30T00:00:00Z")))
  }

  @Test
  fun rejectsTrendThatDoesNotEndInTheSnapshotMonth() {
    val trend = JSONArray()
      .put(JSONObject().put("monthKey", "2026-10").put("receivedIncome", 1).put("paidExpenses", 1).put("netCashFlow", 0))
    assertNull(parse(validSnapshot().put("trend", trend)))
    assertNull(parse(validSnapshot().put("trend", JSONArray())))
  }

  @Test
  fun rejectsTooManyItems() {
    val items = JSONArray()
    repeat(9) { index ->
      items.put(JSONObject().put("id", "i$index").put("name", "Item").put("amount", 1).put("type", "expense"))
    }
    assertNull(parse(validSnapshot().put("pendingItems", items)))

    val trend = JSONArray()
    for (month in 4..11) {
      trend.put(
        JSONObject().put("monthKey", "2026-%02d".format(month)).put("receivedIncome", 1).put("paidExpenses", 1).put("netCashFlow", 0)
      )
    }
    assertNull(parse(validSnapshot().put("trend", trend)))
  }

  @Test
  fun rejectsUnknownPendingTypeAndEmptyNames() {
    val badType = JSONArray().put(JSONObject().put("id", "a").put("name", "X").put("amount", 1).put("type", "transfer"))
    assertNull(parse(validSnapshot().put("pendingItems", badType)))
    assertNull(parse(validSnapshot().put("reserveName", "")))
    assertNull(parse(validSnapshot().put("currencySymbol", "")))
  }

  @Test
  fun rejectsMalformedInput() {
    assertNull(WidgetSnapshotParser.parse(null))
    assertNull(WidgetSnapshotParser.parse(""))
    assertNull(WidgetSnapshotParser.parse("{"))
    assertNull(WidgetSnapshotParser.parse("[]"))
    assertNull(WidgetSnapshotParser.parse("x".repeat(WidgetSnapshotParser.MAX_PAYLOAD_LENGTH + 1)))
  }
}
