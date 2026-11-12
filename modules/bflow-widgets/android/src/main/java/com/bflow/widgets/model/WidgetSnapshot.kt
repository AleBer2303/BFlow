package com.bflow.widgets.model

import com.bflow.widgets.format.IsoInstant
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.math.BigDecimal
import java.math.BigInteger

/**
 * Decodificador Android del contrato `WidgetSnapshotV2` (ADR 0021).
 *
 * Fuente de verdad: `src/platform/widgets/widgetSnapshot.ts` (`widgetSnapshotV2Schema`). Los
 * widgets solo pintan lo que la app ya calculo con el dominio; aqui no se recalcula nada. Un
 * campo nuevo se anade alla, aqui y en `targets/widgets/WidgetSnapshotModels.swift` en el mismo
 * cambio.
 *
 * Diferencia deliberada con Zod: las claves desconocidas se ignoran (Zod usa `.strict()`), para
 * que una app mas nueva no deje en blanco un widget instalado con una version anterior del
 * modulo. Todo lo demas (tipos, enteros seguros, rangos, topes) se valida igual: si algo no
 * cumple, el snapshot completo se descarta y el widget muestra el estado "sin datos".
 *
 * Kotlin puro + org.json: sin dependencias de Android, se prueba en JVM (`src/test`).
 */
enum class PendingType(val wireValue: String) {
  INCOME("income"),
  EXPENSE("expense");

  companion object {
    fun fromWire(value: String): PendingType? = entries.firstOrNull { it.wireValue == value }
  }
}

data class WidgetPendingItem(
  val id: String,
  val name: String,
  val amount: Long,
  val type: PendingType,
)

data class WidgetTrendPoint(
  val monthKey: String,
  val receivedIncome: Long,
  val paidExpenses: Long,
  val netCashFlow: Long,
)

data class WidgetSnapshot(
  val updatedAtIso: String,
  /** `updatedAtIso` como instante (ms desde la epoca, UTC); se usa para comparar versiones. */
  val updatedAtEpochMillis: Long,
  val monthKey: String,
  val currencySymbol: String,
  val thousandsSeparator: String,
  val plannedIncome: Long,
  val receivedIncome: Long,
  val pendingIncome: Long,
  val plannedExpenses: Long,
  val paidExpenses: Long,
  val pendingExpenses: Long,
  val netCashFlow: Long,
  val checklistCompleted: Long,
  val checklistTotal: Long,
  val totalDebt: Long,
  val initialDebt: Long,
  val debtSinceMonthKey: String?,
  val paidDebtThisMonth: Long,
  val estimatedPayoffMonthKey: String?,
  val reserveName: String,
  val reserveBalance: Long,
  val savingsName: String,
  val savingsBalance: Long,
  val otherSavingsBalance: Long,
  val totalSavings: Long,
  val pendingItems: List<WidgetPendingItem>,
  val trend: List<WidgetTrendPoint>,
)

object WidgetSnapshotParser {
  const val SCHEMA_VERSION = 2
  const val MAX_PENDING_ITEMS = 8
  const val MAX_TREND_POINTS = 6

  /** Tope defensivo del JSON aceptado (la app y las reglas de Firestore limitan a 16.000). */
  const val MAX_PAYLOAD_LENGTH = 64_000

  /** `Number.MAX_SAFE_INTEGER` de JavaScript: el dinero de BFlow nunca sale de este rango. */
  const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L
  const val MIN_SAFE_INTEGER = -MAX_SAFE_INTEGER

  private val MONTH_KEY_REGEX = Regex("^\\d{4}-(0[1-9]|1[0-2])$")

  fun isValidMonthKey(value: String): Boolean = MONTH_KEY_REGEX.matches(value)

  /** Devuelve el snapshot si cumple el contrato V2; `null` en cualquier otro caso. */
  fun parse(json: String?): WidgetSnapshot? {
    if (json.isNullOrBlank() || json.length > MAX_PAYLOAD_LENGTH) return null
    return try {
      decode(JSONObject(json))
    } catch (_: JSONException) {
      null
    } catch (_: InvalidSnapshotException) {
      null
    }
  }

  private fun decode(root: JSONObject): WidgetSnapshot {
    if (root.requireLong("schemaVersion") != SCHEMA_VERSION.toLong()) {
      throw InvalidSnapshotException("schemaVersion")
    }
    val updatedAtIso = root.requireString("updatedAtIso", minLength = 1, maxLength = 64)
    val updatedAtMillis = IsoInstant.parseEpochMillis(updatedAtIso)
      ?: throw InvalidSnapshotException("updatedAtIso")
    val monthKey = root.requireMonthKey("monthKey")

    val checklistCompleted = root.requireLong("checklistCompleted", min = 0)
    val checklistTotal = root.requireLong("checklistTotal", min = 0)
    if (checklistCompleted > checklistTotal) {
      throw InvalidSnapshotException("checklistCompleted")
    }

    val pendingItems = root.requireArray("pendingItems", maxLength = MAX_PENDING_ITEMS) { item ->
      WidgetPendingItem(
        id = item.requireString("id", minLength = 1, maxLength = 200),
        name = item.requireString("name", minLength = 1, maxLength = 120),
        amount = item.requireLong("amount", min = 0),
        type = PendingType.fromWire(item.requireString("type", minLength = 1, maxLength = 16))
          ?: throw InvalidSnapshotException("pendingItems.type"),
      )
    }

    val trend = root.requireArray("trend", maxLength = MAX_TREND_POINTS) { point ->
      WidgetTrendPoint(
        monthKey = point.requireMonthKey("monthKey"),
        receivedIncome = point.requireLong("receivedIncome", min = 0),
        paidExpenses = point.requireLong("paidExpenses", min = 0),
        netCashFlow = point.requireLong("netCashFlow"),
      )
    }
    if (trend.isEmpty() || trend.last().monthKey != monthKey) {
      throw InvalidSnapshotException("trend")
    }

    return WidgetSnapshot(
      updatedAtIso = updatedAtIso,
      updatedAtEpochMillis = updatedAtMillis,
      monthKey = monthKey,
      currencySymbol = root.requireString("currencySymbol", minLength = 1, maxLength = 8),
      thousandsSeparator = root.requireString("thousandsSeparator", minLength = 0, maxLength = 2),
      plannedIncome = root.requireLong("plannedIncome", min = 0),
      receivedIncome = root.requireLong("receivedIncome", min = 0),
      pendingIncome = root.requireLong("pendingIncome", min = 0),
      plannedExpenses = root.requireLong("plannedExpenses", min = 0),
      paidExpenses = root.requireLong("paidExpenses", min = 0),
      pendingExpenses = root.requireLong("pendingExpenses", min = 0),
      netCashFlow = root.requireLong("netCashFlow"),
      checklistCompleted = checklistCompleted,
      checklistTotal = checklistTotal,
      totalDebt = root.requireLong("totalDebt", min = 0),
      initialDebt = root.requireLong("initialDebt", min = 0),
      debtSinceMonthKey = root.optionalMonthKey("debtSinceMonthKey"),
      paidDebtThisMonth = root.requireLong("paidDebtThisMonth", min = 0),
      estimatedPayoffMonthKey = root.optionalMonthKey("estimatedPayoffMonthKey"),
      reserveName = root.requireString("reserveName", minLength = 1, maxLength = 120),
      reserveBalance = root.requireLong("reserveBalance"),
      savingsName = root.requireString("savingsName", minLength = 1, maxLength = 120),
      savingsBalance = root.requireLong("savingsBalance"),
      otherSavingsBalance = root.requireLong("otherSavingsBalance"),
      totalSavings = root.requireLong("totalSavings"),
      pendingItems = pendingItems,
      trend = trend,
    )
  }
}

internal class InvalidSnapshotException(field: String) : Exception("Invalid widget field: $field")

/**
 * Entero seguro estricto. org.json entrega `Integer`/`Long` para literales enteros, pero
 * tambien `Double`/`BigDecimal` para "1.5" o "1e3" y `String` para "\"12\"": solo se aceptan
 * valores enteros exactos dentro de +-(2^53 - 1), igual que `Number.isSafeInteger`.
 */
internal fun JSONObject.requireLong(key: String, min: Long = WidgetSnapshotParser.MIN_SAFE_INTEGER): Long {
  if (!has(key) || isNull(key)) throw InvalidSnapshotException(key)
  val value = toSafeLong(get(key)) ?: throw InvalidSnapshotException(key)
  if (value < min) throw InvalidSnapshotException(key)
  return value
}

internal fun toSafeLong(raw: Any?): Long? {
  val value: Long = when (raw) {
    is Int -> raw.toLong()
    is Long -> raw
    is Short -> raw.toLong()
    is Byte -> raw.toLong()
    is BigInteger -> if (raw.bitLength() < 64) raw.toLong() else return null
    is BigDecimal -> try {
      raw.stripTrailingZeros().longValueExact()
    } catch (_: ArithmeticException) {
      return null
    }
    is Double -> doubleToExactLong(raw) ?: return null
    is Float -> doubleToExactLong(raw.toDouble()) ?: return null
    else -> return null
  }
  return if (value in WidgetSnapshotParser.MIN_SAFE_INTEGER..WidgetSnapshotParser.MAX_SAFE_INTEGER) value else null
}

private fun doubleToExactLong(value: Double): Long? {
  if (value.isNaN() || value.isInfinite() || value != Math.floor(value)) return null
  if (kotlin.math.abs(value) > WidgetSnapshotParser.MAX_SAFE_INTEGER.toDouble()) return null
  return value.toLong()
}

internal fun JSONObject.requireString(key: String, minLength: Int, maxLength: Int): String {
  if (!has(key) || isNull(key)) throw InvalidSnapshotException(key)
  val value = get(key) as? String ?: throw InvalidSnapshotException(key)
  if (value.length < minLength || value.length > maxLength) throw InvalidSnapshotException(key)
  return value
}

private fun JSONObject.requireMonthKey(key: String): String {
  val value = requireString(key, minLength = 7, maxLength = 7)
  if (!WidgetSnapshotParser.isValidMonthKey(value)) throw InvalidSnapshotException(key)
  return value
}

/** Mes anulable: la clave debe existir (puede valer `null`), igual que `.nullable()` en Zod. */
private fun JSONObject.optionalMonthKey(key: String): String? {
  if (!has(key)) throw InvalidSnapshotException(key)
  if (isNull(key)) return null
  return requireMonthKey(key)
}

private inline fun <T> JSONObject.requireArray(
  key: String,
  maxLength: Int,
  decodeItem: (JSONObject) -> T,
): List<T> {
  if (!has(key) || isNull(key)) throw InvalidSnapshotException(key)
  val array = get(key) as? JSONArray ?: throw InvalidSnapshotException(key)
  if (array.length() > maxLength) throw InvalidSnapshotException(key)
  val result = ArrayList<T>(array.length())
  for (index in 0 until array.length()) {
    val item = array.opt(index) as? JSONObject ?: throw InvalidSnapshotException(key)
    result.add(decodeItem(item))
  }
  return result
}
