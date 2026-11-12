package com.bflow.widgets

import android.content.Context
import com.bflow.widgets.model.WidgetAuth
import com.bflow.widgets.model.WidgetSnapshotParser
import com.bflow.widgets.storage.WidgetStore
import com.bflow.widgets.sync.WidgetSyncScheduler
import com.bflow.widgets.widget.WidgetRenderer
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Puente JS -> widgets de Android (Fase 7, ADR 0021). El JavaScript lo obtiene con
 * `requireOptionalNativeModule('BFlowWidgets')`: en iOS, web y Expo Go no existe y devuelve null.
 *
 * Todas las funciones son sincronas y baratas: validan y guardan en el hilo de JS y el repintado
 * (que puede dibujar un Bitmap) se hace en un hilo propio (`WidgetRenderer.updateAllAsync`).
 */
class BFlowWidgetsModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("BFlowWidgets")

    /**
     * Guarda un `WidgetSnapshotV2` y repinta todos los widgets. Devuelve false (sin tocar lo
     * guardado) si el JSON no cumple el contrato.
     */
    Function("setSnapshot") { json: String ->
      if (WidgetSnapshotParser.parse(json) == null) return@Function false
      WidgetStore.get(context).writeSnapshot(json)
      WidgetRenderer.updateAllAsync(context)
      true
    }

    /**
     * Guarda (`WidgetAuthV1` en JSON) o borra (`null`) las credenciales con las que el widget
     * lee `users/{uid}/widgetSnapshots/current`. Devuelve false si el JSON no es valido o si el
     * AndroidKeyStore no pudo cifrarlo (nunca se guarda en claro).
     */
    Function("setAuth") { json: String? ->
      val widgetContext = context
      val store = WidgetStore.get(widgetContext)
      if (json == null) {
        store.clearAuth()
        WidgetSyncScheduler.cancelAll(widgetContext)
        WidgetRenderer.updateAllAsync(widgetContext)
        return@Function true
      }
      val auth = WidgetAuth.parse(json) ?: return@Function false
      if (store.readAuth() == auth) {
        // La app la reenvia en cada arranque: si no cambio, solo se levanta una marca de
        // rechazo anterior (la sesion de la app sigue viva) y se asegura el periodico.
        store.isAuthRejected = false
        WidgetSyncScheduler.ensurePeriodic(widgetContext)
        return@Function true
      }
      if (!store.writeAuth(auth)) return@Function false
      WidgetSyncScheduler.ensurePeriodic(widgetContext)
      // El boton "Actualizar" aparece en cuanto hay credenciales.
      WidgetRenderer.updateAllAsync(widgetContext)
      true
    }

    /** Cierre de sesion: borra snapshot y credenciales, cancela el trabajo y deja "sin sesion". */
    Function("clear") {
      val widgetContext = context
      WidgetStore.get(widgetContext).clearAll()
      WidgetSyncScheduler.cancelAll(widgetContext)
      WidgetRenderer.updateAllAsync(widgetContext)
    }

    /** Repinta desde lo guardado (p. ej. al volver a primer plano o tras cambiar de tema). */
    Function("reloadAll") {
      WidgetRenderer.updateAllAsync(context)
    }
  }
}
