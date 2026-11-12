package com.bflow.widgets.sync

import org.json.JSONException
import org.json.JSONObject

/**
 * Clasifica las respuestas de error de `securetoken.googleapis.com/v1/token`.
 *
 * Solo cuatro codigos significan que el refresh token no volvera a funcionar; con ellos el
 * widget deja de intentarlo hasta que la app entregue credenciales nuevas. Cualquier otro error
 * (API key restringida a otra app, SHA-1 no registrado, cuota, cuerpo ilegible) se trata como
 * transitorio para no apagar el refresco por un fallo de configuracion corregible.
 *
 * Forma de la respuesta: `{"error":{"code":400,"message":"TOKEN_EXPIRED","status":"INVALID_ARGUMENT"}}`.
 * El mensaje puede llevar detalle tras el codigo ("USER_DISABLED : ..."), por eso se compara el
 * primer token. Kotlin puro + org.json: se prueba en JVM.
 */
internal object SecureTokenErrors {
  val DEFINITIVE_CODES = setOf("TOKEN_EXPIRED", "INVALID_REFRESH_TOKEN", "USER_DISABLED", "USER_NOT_FOUND")

  fun isDefinitive(errorBody: String?): Boolean {
    if (errorBody.isNullOrBlank()) return false
    val message = try {
      JSONObject(errorBody).optJSONObject("error")?.optString("message").orEmpty()
    } catch (_: JSONException) {
      return false
    }
    val code = message.trim().split(' ', ':').firstOrNull { it.isNotEmpty() } ?: return false
    return code in DEFINITIVE_CODES
  }
}
