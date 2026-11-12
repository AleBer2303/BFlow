package com.bflow.widgets.storage

import android.content.Context
import android.util.Log
import com.bflow.widgets.model.WidgetAuth
import com.bflow.widgets.model.WidgetSnapshot
import com.bflow.widgets.model.WidgetSnapshotParser
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.io.IOException

/**
 * Estado persistente de los widgets en archivos bajo `context.noBackupFilesDir/bflow_widgets/`.
 *
 * `noBackupFilesDir` queda fuera de Auto Backup y de la transferencia entre dispositivos: el
 * snapshot financiero no viaja a otro telefono y, como la clave del AndroidKeyStore tampoco
 * viaja, nunca queda un snapshot "huerfano" pintando cifras sin sesion tras una restauracion.
 *
 * - `snapshot_v2.json`: JSON `WidgetSnapshotV2` (`WIDGET_STORAGE_KEY` = bflow_widget_snapshot_v2).
 * - `auth_v1.enc`: JSON `WidgetAuthV1` cifrado con `AuthCipher` (`WIDGET_AUTH_STORAGE_KEY`).
 * - `id_token_v1.enc`: ID token en cache (cifrado) hasta `expires_in - 60 s`.
 * - `auth_rejected_v1`: marca de que securetoken rechazo el refresh token de forma definitiva.
 *
 * Cada escritura es atomica (archivo temporal + rename) y todas las operaciones van bajo un
 * mismo candado: la app (hilo de JS) y el worker (WorkManager) escriben a la vez, y un `clear()`
 * al cerrar sesion no puede ser pisado por un worker que termina despues.
 *
 * Las versiones previas del modulo usaban las SharedPreferences `bflow_widgets` (que si entran
 * en el backup); se migran una vez al crear el almacen y despues se borran.
 */
internal class WidgetStore private constructor(context: Context) {
  private val lock = Any()
  private val dir: File = File(context.noBackupFilesDir, DIRECTORY_NAME)
  private val snapshotFile = File(dir, FILE_SNAPSHOT)
  private val authFile = File(dir, FILE_AUTH)
  private val idTokenFile = File(dir, FILE_ID_TOKEN)
  private val rejectedFile = File(dir, FILE_AUTH_REJECTED)

  init {
    synchronized(lock) { migrateLegacyPreferences(context) }
  }

  // ---- Snapshot -------------------------------------------------------------------------

  fun readSnapshot(): WidgetSnapshot? = WidgetSnapshotParser.parse(synchronized(lock) { read(snapshotFile) })

  /** Guarda un snapshot ya validado por el llamador (la app siempre gana en su telefono). */
  fun writeSnapshot(json: String) {
    synchronized(lock) { write(snapshotFile, json) }
  }

  /**
   * Guarda el snapshot remoto solo si es mas reciente que el local (por `updatedAtIso` como
   * instante) y si la sesion con la que se descargo sigue siendo la actual.
   */
  fun saveRemoteIfNewer(json: String, remote: WidgetSnapshot, expectedUid: String): Boolean = synchronized(lock) {
    val currentAuth = readAuthLocked() ?: return false
    if (currentAuth.uid != expectedUid) return false
    val local = WidgetSnapshotParser.parse(read(snapshotFile))
    if (local != null && local.updatedAtEpochMillis >= remote.updatedAtEpochMillis) return false
    write(snapshotFile, json)
  }

  // ---- Credenciales ---------------------------------------------------------------------

  fun hasAuth(): Boolean = synchronized(lock) { authFile.exists() }

  fun readAuth(): WidgetAuth? = synchronized(lock) { readAuthLocked() }

  /** Cifra y guarda; devuelve false si el keystore no esta disponible (no se guarda en claro). */
  fun writeAuth(auth: WidgetAuth): Boolean = synchronized(lock) {
    val encrypted = AuthCipher.encrypt(auth.toJson()) ?: return false
    if (!write(authFile, encrypted)) return false
    idTokenFile.delete()
    rejectedFile.delete()
    true
  }

  /** Sustituye el refresh token solo si las credenciales no cambiaron mientras tanto. */
  fun rotateRefreshToken(expected: WidgetAuth, newRefreshToken: String): Boolean = synchronized(lock) {
    if (readAuthLocked() != expected) return false
    val encrypted = AuthCipher.encrypt(expected.copy(refreshToken = newRefreshToken).toJson()) ?: return false
    write(authFile, encrypted)
  }

  fun clearAuth() {
    synchronized(lock) {
      authFile.delete()
      idTokenFile.delete()
      rejectedFile.delete()
    }
  }

  var isAuthRejected: Boolean
    get() = synchronized(lock) { rejectedFile.exists() }
    set(value) {
      synchronized(lock) {
        if (value) write(rejectedFile, "1") else rejectedFile.delete()
      }
    }

  // ---- ID token en cache ----------------------------------------------------------------

  fun readIdToken(uid: String, nowMillis: Long): String? = synchronized(lock) {
    val json = AuthCipher.decrypt(read(idTokenFile)) ?: return null
    try {
      val root = JSONObject(json)
      val token = root.optString("idToken")
      if (root.optString("uid") != uid || token.isEmpty()) return null
      if (nowMillis >= root.optLong("expiresAtMillis", 0L)) return null
      token
    } catch (_: JSONException) {
      null
    }
  }

  fun writeIdToken(uid: String, idToken: String, expiresAtMillis: Long) {
    synchronized(lock) {
      if (readAuthLocked()?.uid != uid) return
      val payload = JSONObject()
        .put("uid", uid)
        .put("idToken", idToken)
        .put("expiresAtMillis", expiresAtMillis)
        .toString()
      val encrypted = AuthCipher.encrypt(payload) ?: return
      write(idTokenFile, encrypted)
    }
  }

  fun clearIdToken() {
    synchronized(lock) { idTokenFile.delete() }
  }

  // ---- Todo -----------------------------------------------------------------------------

  fun clearAll() {
    synchronized(lock) {
      snapshotFile.delete()
      authFile.delete()
      idTokenFile.delete()
      rejectedFile.delete()
    }
  }

  // ---- Archivos ---------------------------------------------------------------------------

  private fun readAuthLocked(): WidgetAuth? = WidgetAuth.parse(AuthCipher.decrypt(read(authFile)))

  private fun read(file: File): String? = try {
    if (file.exists()) file.readText(Charsets.UTF_8) else null
  } catch (error: IOException) {
    Log.w(TAG, "No se pudo leer ${file.name}: ${error.javaClass.simpleName}")
    null
  }

  /** Escritura atomica: un lector nunca ve un archivo a medias (rename en el mismo directorio). */
  private fun write(file: File, contents: String): Boolean {
    if (!dir.exists() && !dir.mkdirs()) return false
    val temp = File(dir, "${file.name}.tmp")
    return try {
      temp.writeText(contents, Charsets.UTF_8)
      if (temp.renameTo(file)) {
        true
      } else {
        temp.delete()
        false
      }
    } catch (error: IOException) {
      Log.w(TAG, "No se pudo escribir ${file.name}: ${error.javaClass.simpleName}")
      temp.delete()
      false
    }
  }

  /**
   * Migra las SharedPreferences de versiones anteriores y las borra. Solo se conserva algo si la
   * credencial se puede descifrar en ESTE telefono: si vienen de un backup restaurado (clave del
   * keystore ausente), se descarta todo, snapshot incluido.
   */
  private fun migrateLegacyPreferences(context: Context) {
    val legacyFile = File(context.applicationInfo.dataDir, "shared_prefs/$LEGACY_PREFS_NAME.xml")
    if (!legacyFile.exists()) return
    val prefs = context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
    val legacyAuth = prefs.getString(LEGACY_KEY_AUTH, null)
    val legacySnapshot = prefs.getString(LEGACY_KEY_SNAPSHOT, null)
    val authIsReadable = WidgetAuth.parse(AuthCipher.decrypt(legacyAuth)) != null
    if (authIsReadable && !authFile.exists()) {
      write(authFile, legacyAuth!!)
      if (legacySnapshot != null && !snapshotFile.exists()) write(snapshotFile, legacySnapshot)
      if (prefs.getBoolean(LEGACY_KEY_AUTH_REJECTED, false)) write(rejectedFile, "1")
    }
    prefs.edit().clear().commit()
    if (!context.deleteSharedPreferences(LEGACY_PREFS_NAME)) {
      legacyFile.delete()
    }
  }

  companion object {
    private const val TAG = "BFlowWidgets"
    const val DIRECTORY_NAME = "bflow_widgets"
    const val FILE_SNAPSHOT = "snapshot_v2.json"
    const val FILE_AUTH = "auth_v1.enc"
    const val FILE_ID_TOKEN = "id_token_v1.enc"
    const val FILE_AUTH_REJECTED = "auth_rejected_v1"

    // Almacen anterior (SharedPreferences, incluido en Auto Backup): solo para migrar.
    private const val LEGACY_PREFS_NAME = "bflow_widgets"
    private const val LEGACY_KEY_SNAPSHOT = "bflow_widget_snapshot_v2"
    private const val LEGACY_KEY_AUTH = "bflow_widget_auth_v1"
    private const val LEGACY_KEY_AUTH_REJECTED = "bflow_widget_auth_rejected_v1"

    @Volatile
    private var instance: WidgetStore? = null

    fun get(context: Context): WidgetStore =
      instance ?: synchronized(this) {
        instance ?: WidgetStore(context.applicationContext).also { instance = it }
      }
  }
}
