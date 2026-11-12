package com.bflow.widgets.model

import org.json.JSONException
import org.json.JSONObject

/**
 * Credenciales `WidgetAuthV1` (`src/platform/widgets/widgetSnapshot.ts`, `widgetAuthV1Schema`):
 * lo minimo para que el worker lea `users/{uid}/widgetSnapshots/current` sin abrir la app.
 *
 * Nunca se guardan en claro: `WidgetStore` las cifra con una clave AES/GCM del AndroidKeyStore.
 */
data class WidgetAuth(
  val uid: String,
  val refreshToken: String,
  val apiKey: String,
  val projectId: String,
) {
  fun toJson(): String = JSONObject()
    .put("schemaVersion", SCHEMA_VERSION)
    .put("uid", uid)
    .put("refreshToken", refreshToken)
    .put("apiKey", apiKey)
    .put("projectId", projectId)
    .toString()

  /** Sin secretos: apto para logs. */
  override fun toString(): String = "WidgetAuth(uid=<redacted>, projectId=$projectId)"

  companion object {
    const val SCHEMA_VERSION = 1

    /** Id de proyecto de Google Cloud: minusculas, digitos y guiones. */
    private val PROJECT_ID_REGEX = Regex("^[a-z0-9-]{1,128}$")

    fun parse(json: String?): WidgetAuth? {
      if (json.isNullOrBlank() || json.length > 8_192) return null
      return try {
        val root = JSONObject(json)
        if (root.requireLong("schemaVersion") != SCHEMA_VERSION.toLong()) return null
        val auth = WidgetAuth(
          uid = root.requireString("uid", minLength = 1, maxLength = 128),
          refreshToken = root.requireString("refreshToken", minLength = 1, maxLength = 4_096),
          apiKey = root.requireString("apiKey", minLength = 1, maxLength = 256),
          projectId = root.requireString("projectId", minLength = 1, maxLength = 128),
        )
        if (!PROJECT_ID_REGEX.matches(auth.projectId)) null else auth
      } catch (_: JSONException) {
        null
      } catch (_: InvalidSnapshotException) {
        null
      }
    }
  }
}
