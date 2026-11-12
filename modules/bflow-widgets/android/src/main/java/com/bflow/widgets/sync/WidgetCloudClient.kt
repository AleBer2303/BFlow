package com.bflow.widgets.sync

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.bflow.widgets.model.WidgetAuth
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest

/**
 * Cliente REST minimo (HttpURLConnection, sin dependencias) para que el widget lea su propio
 * documento derivado `users/{uid}/widgetSnapshots/current` sin abrir la app.
 *
 * 1. Refresca el ID token en `securetoken.googleapis.com` con el refresh token de la sesion.
 * 2. Lee el documento por la API REST de Firestore con `Authorization: Bearer <idToken>`; las
 *    reglas de seguridad son las mismas que para la app (solo el dueno lee su documento).
 *
 * Envia `X-Android-Package` y `X-Android-Cert` por si la API key esta restringida a apps
 * Android: Google valida esas cabeceras contra el paquete y el SHA-1 del certificado de firma.
 */
internal class WidgetCloudClient(private val context: Context) {

  sealed class TokenResult {
    data class Success(val idToken: String, val expiresInSeconds: Long, val refreshToken: String?) : TokenResult()
    /**
     * Rechazo definitivo: securetoken dice que el refresh token caduco, no existe o el usuario
     * fue deshabilitado/borrado (`SecureTokenErrors.isDefinitive`). Reintentar no sirve.
     */
    data object Rejected : TokenResult()
    /**
     * Red, 429, 5xx y cualquier otro 4xx (p. ej. API key restringida o SHA-1 no registrado):
     * transitorio, se reintenta en el siguiente ciclo sin cambiar nada.
     */
    data object Unavailable : TokenResult()
  }

  sealed class DocumentResult {
    data class Found(val payload: String) : DocumentResult()
    /** 404 o documento sin `payload`: la cuenta aun no publico su snapshot. */
    data object Missing : DocumentResult()
    /** 401: el ID token ya no vale (se refresca una vez y se reintenta). */
    data object Unauthorized : DocumentResult()
    /** 403, red, 5xx o respuesta ilegible. */
    data object Unavailable : DocumentResult()
  }

  fun refreshIdToken(auth: WidgetAuth): TokenResult {
    val url = URL("$SECURE_TOKEN_URL?key=${encodeQuery(auth.apiKey)}")
    val body = "grant_type=refresh_token&refresh_token=${encodeQuery(auth.refreshToken)}"
    val connection = open(url, "POST")
    return try {
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      when (val status = connection.responseCode) {
        HttpURLConnection.HTTP_OK -> parseToken(readBody(connection.inputStream))
        in 400..499 -> {
          val errorBody = connection.errorStream?.let { readBody(it) }
          if (SecureTokenErrors.isDefinitive(errorBody)) TokenResult.Rejected else TokenResult.Unavailable
        }
        else -> {
          drain(connection, status)
          TokenResult.Unavailable
        }
      }
    } catch (_: IOException) {
      TokenResult.Unavailable
    } finally {
      connection.disconnect()
    }
  }

  fun fetchSnapshotDocument(auth: WidgetAuth, idToken: String): DocumentResult {
    val path = "projects/${auth.projectId}/databases/(default)/documents/users/" +
      "${encodePathSegment(auth.uid)}/$COLLECTION/$DOCUMENT_ID"
    val connection = open(URL("$FIRESTORE_URL/$path"), "GET")
    return try {
      connection.setRequestProperty("Authorization", "Bearer $idToken")
      when (val status = connection.responseCode) {
        HttpURLConnection.HTTP_OK -> parseDocument(readBody(connection.inputStream))
        HttpURLConnection.HTTP_NOT_FOUND -> DocumentResult.Missing
        HttpURLConnection.HTTP_UNAUTHORIZED -> DocumentResult.Unauthorized
        else -> {
          drain(connection, status)
          DocumentResult.Unavailable
        }
      }
    } catch (_: IOException) {
      DocumentResult.Unavailable
    } finally {
      connection.disconnect()
    }
  }

  private fun open(url: URL, method: String): HttpURLConnection =
    (url.openConnection() as HttpURLConnection).apply {
      requestMethod = method
      connectTimeout = TIMEOUT_MILLIS
      readTimeout = TIMEOUT_MILLIS
      useCaches = false
      instanceFollowRedirects = false
      setRequestProperty("Accept", "application/json")
      setRequestProperty("X-Android-Package", context.packageName)
      signingCertSha1(context)?.let { setRequestProperty("X-Android-Cert", it) }
    }

  private fun parseToken(body: String?): TokenResult {
    if (body == null) return TokenResult.Unavailable
    return try {
      val root = JSONObject(body)
      val idToken = root.optString("id_token")
      // securetoken devuelve expires_in como texto ("3600").
      val expiresIn = root.optString("expires_in").toLongOrNull() ?: DEFAULT_EXPIRES_IN_SECONDS
      val refreshToken = root.optString("refresh_token").takeIf { it.isNotEmpty() }
      if (idToken.isEmpty()) TokenResult.Unavailable else TokenResult.Success(idToken, expiresIn, refreshToken)
    } catch (_: JSONException) {
      TokenResult.Unavailable
    }
  }

  private fun parseDocument(body: String?): DocumentResult {
    if (body == null) return DocumentResult.Unavailable
    return try {
      val fields = JSONObject(body).optJSONObject("fields") ?: return DocumentResult.Missing
      // schemaVersion llega como integerValue en texto ("2"). Otro valor: no es para este modulo.
      val schemaVersion = fields.optJSONObject("schemaVersion")?.optString("integerValue")
      if (schemaVersion != null && schemaVersion.isNotEmpty() && schemaVersion != "2") {
        return DocumentResult.Missing
      }
      val payload = fields.optJSONObject("payload")?.optString("stringValue").orEmpty()
      if (payload.isEmpty()) DocumentResult.Missing else DocumentResult.Found(payload)
    } catch (_: JSONException) {
      DocumentResult.Unavailable
    }
  }

  /** Lee como mucho `MAX_RESPONSE_BYTES`; una respuesta mayor no es un snapshot de BFlow. */
  private fun readBody(stream: InputStream): String? = stream.use { input ->
    val buffer = java.io.ByteArrayOutputStream()
    val chunk = ByteArray(8_192)
    while (true) {
      val read = input.read(chunk)
      if (read < 0) break
      buffer.write(chunk, 0, read)
      if (buffer.size() > MAX_RESPONSE_BYTES) return null
    }
    buffer.toString("UTF-8")
  }

  private fun drain(connection: HttpURLConnection, status: Int) {
    // Consumir el cuerpo de error permite reutilizar la conexion; el contenido no se registra.
    if (status >= 400) {
      try {
        connection.errorStream?.use { it.skip(MAX_RESPONSE_BYTES.toLong()) }
      } catch (_: IOException) {
        // sin efecto
      }
    }
  }

  companion object {
    private const val SECURE_TOKEN_URL = "https://securetoken.googleapis.com/v1/token"
    private const val FIRESTORE_URL = "https://firestore.googleapis.com/v1"
    /** `WIDGET_CLOUD_COLLECTION` y `WIDGET_CLOUD_DOC_ID` del contrato TS. */
    const val COLLECTION = "widgetSnapshots"
    const val DOCUMENT_ID = "current"
    private const val TIMEOUT_MILLIS = 8_000
    private const val MAX_RESPONSE_BYTES = 256 * 1024
    private const val DEFAULT_EXPIRES_IN_SECONDS = 3_600L

    @Volatile
    private var cachedCertSha1: String? = null

    private fun encodeQuery(value: String): String = URLEncoder.encode(value, "UTF-8")

    /** URLEncoder codifica para formularios: el espacio pasa a "+", que en una ruta no vale. */
    private fun encodePathSegment(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    /** SHA-1 del certificado de firma actual en hexadecimal mayusculo y sin ":". */
    fun signingCertSha1(context: Context): String? {
      cachedCertSha1?.let { return it }
      val certificate = try {
        val packageManager = context.packageManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          val info = packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
          // apkContentsSigners: los firmantes actuales, sin los anteriores a una rotacion.
          info.signingInfo?.apkContentsSigners?.firstOrNull()
        } else {
          @Suppress("DEPRECATION")
          val info = packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
          @Suppress("DEPRECATION")
          info.signatures?.firstOrNull()
        }
      } catch (_: PackageManager.NameNotFoundException) {
        null
      } ?: return null
      val digest = MessageDigest.getInstance("SHA-1").digest(certificate.toByteArray())
      val hex = digest.joinToString(separator = "") { byte ->
        String.format(java.util.Locale.ROOT, "%02X", byte.toInt() and 0xFF)
      }
      cachedCertSha1 = hex
      return hex
    }
  }
}
