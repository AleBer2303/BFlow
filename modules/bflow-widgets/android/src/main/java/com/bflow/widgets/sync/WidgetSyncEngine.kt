package com.bflow.widgets.sync

import android.content.Context
import android.util.Log
import com.bflow.widgets.model.WidgetAuth
import com.bflow.widgets.model.WidgetSnapshotParser
import com.bflow.widgets.storage.WidgetStore
import com.bflow.widgets.widget.WidgetRenderer

/**
 * Un ciclo de sincronizacion con la nube (sin abrir la app). Sincrono: lo ejecuta el worker en
 * un hilo de E/S.
 *
 * Regla de convergencia: gana el snapshot con el `updatedAtIso` mas reciente (comparado como
 * instante) entre el guardado en el telefono y `users/{uid}/widgetSnapshots/current`. Si gana el
 * remoto se guarda y se repintan todos los widgets; si no, no se toca nada.
 */
internal class WidgetSyncEngine(
  private val context: Context,
  private val store: WidgetStore = WidgetStore.get(context),
  private val client: WidgetCloudClient = WidgetCloudClient(context),
  private val clock: () -> Long = System::currentTimeMillis,
) {
  enum class Outcome { NO_AUTH, AUTH_REJECTED, UNAVAILABLE, UNCHANGED, UPDATED }

  /** @param manual true si lo pidio el boton "Actualizar": se intenta aunque securetoken rechazara antes. */
  fun sync(manual: Boolean): Outcome {
    val auth = store.readAuth()
    if (auth == null) {
      if (store.hasAuth()) {
        // Hay credenciales que ya no se pueden descifrar (clave del keystore perdida): se borra
        // todo, snapshot incluido, para no pintar cifras sin sesion; la app volvera a entregarlas.
        store.clearAll()
        WidgetRenderer.updateAll(context)
      }
      WidgetSyncScheduler.cancelPeriodic(context)
      return Outcome.NO_AUTH
    }
    if (store.isAuthRejected && !manual) return Outcome.AUTH_REJECTED

    var idToken = store.readIdToken(auth.uid, clock()) ?: when (val step = refresh(auth)) {
      is TokenStep.Token -> step.value
      is TokenStep.Stop -> return step.outcome
    }

    var document = client.fetchSnapshotDocument(auth, idToken)
    if (document is WidgetCloudClient.DocumentResult.Unauthorized) {
      // El ID token en cache caduco antes de tiempo (revocado, reloj del telefono): un solo reintento.
      store.clearIdToken()
      idToken = when (val step = refresh(auth)) {
        is TokenStep.Token -> step.value
        is TokenStep.Stop -> return step.outcome
      }
      document = client.fetchSnapshotDocument(auth, idToken)
    }

    return when (document) {
      is WidgetCloudClient.DocumentResult.Found -> applyRemote(auth, document.payload)
      WidgetCloudClient.DocumentResult.Missing -> Outcome.UNCHANGED
      WidgetCloudClient.DocumentResult.Unauthorized,
      WidgetCloudClient.DocumentResult.Unavailable -> Outcome.UNAVAILABLE
    }
  }

  /** ID token nuevo, o el `Outcome` con el que termina el ciclo. */
  private sealed interface TokenStep {
    data class Token(val value: String) : TokenStep
    data class Stop(val outcome: Outcome) : TokenStep
  }

  private fun refresh(auth: WidgetAuth): TokenStep = when (val result = client.refreshIdToken(auth)) {
    is WidgetCloudClient.TokenResult.Success -> {
      if (result.refreshToken != null && result.refreshToken != auth.refreshToken) {
        store.rotateRefreshToken(auth, result.refreshToken)
      }
      val lifetimeMillis = (result.expiresInSeconds - TOKEN_SAFETY_MARGIN_SECONDS).coerceAtLeast(0L) * 1_000L
      store.writeIdToken(auth.uid, result.idToken, clock() + lifetimeMillis)
      if (store.isAuthRejected) {
        // Un "Actualizar" manual funciono despues de un rechazo: se reanuda el periodico.
        store.isAuthRejected = false
        WidgetSyncScheduler.ensurePeriodic(context)
      }
      TokenStep.Token(result.idToken)
    }
    WidgetCloudClient.TokenResult.Rejected -> {
      // Solo errores definitivos (SecureTokenErrors): se marca y se detiene el periodico hasta
      // que la app reenvie credenciales (setAuth) o se toque "Actualizar".
      Log.w(TAG, "securetoken rechazo el refresh token del widget; se detiene el refresco periodico")
      store.clearIdToken()
      store.isAuthRejected = true
      WidgetSyncScheduler.cancelPeriodic(context)
      TokenStep.Stop(Outcome.AUTH_REJECTED)
    }
    WidgetCloudClient.TokenResult.Unavailable -> TokenStep.Stop(Outcome.UNAVAILABLE)
  }

  private fun applyRemote(auth: WidgetAuth, payload: String): Outcome {
    val remote = WidgetSnapshotParser.parse(payload) ?: return Outcome.UNCHANGED
    if (!store.saveRemoteIfNewer(payload, remote, auth.uid)) return Outcome.UNCHANGED
    WidgetRenderer.updateAll(context)
    return Outcome.UPDATED
  }

  private companion object {
    const val TAG = "BFlowWidgets"
    const val TOKEN_SAFETY_MARGIN_SECONDS = 60L
  }
}
