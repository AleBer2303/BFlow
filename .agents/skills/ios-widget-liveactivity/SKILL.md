---
name: ios-widget-liveactivity
description: >-
  Guides development of BFlow's home-screen widgets: the unified iOS WidgetKit +
  ActivityKit target (targets/widgets), the Android widgets module
  (modules/bflow-widgets) and the WidgetSnapshotV2 contract and adapters in
  src/platform/widgets/. Use when editing any of those paths.
---

# Widgets iOS / Android y Live Activity (`ios-widget-liveactivity`)

Decisión completa: `docs/decisions/0021-home-screen-widgets-ios-android.md`.

## 1. Regla de la cuenta Apple gratuita (máx. 2 App IDs)
- **Todos** los widgets (`BFlowNetFlowWidget`, `BFlowSummaryWidget`, `BFlowPendingWidget`, `BFlowDebtWidget`, `BFlowSavingsWidget`) y cualquier `ActivityConfiguration` futura de la Isla Dinámica viven en **un único** target de extensión (`targets/widgets`, un solo `WidgetBundle`).
- Nunca crear targets separados: una cuenta gratuita permite 10 App IDs cada 7 días.

## 2. Contrato tipado `WidgetSnapshotV2`
- Fuente de verdad: `src/platform/widgets/widgetSnapshot.ts` (Zod `.strict()`, `buildWidgetSnapshot`, que reutiliza `buildMonthlyHistory`).
- Solo TypeScript calcula; Swift (`targets/widgets/WidgetSnapshotModels.swift`) y Kotlin (`modules/bflow-widgets/android/src/main/java/com/bflow/widgets/model/WidgetSnapshot.kt`) decodifican y pintan.
- **Un campo nuevo se añade en los tres en el mismo cambio**, con tests (Jest y JVM).
- Montos enteros (`Number.isSafeInteger` / `Int` / `Long`). El mes del widget es el mes en curso (`resolveWidgetMonthKey`), no la pestaña abierta.
- Valores dorados (octubre 2026): flujo neto 1.080.000, recibido 4.000.000, pagado 2.920.000, por pagar 450.000, checklist 6/12, deuda 6.200.000, total ahorros 4.380.000.

## 3. Sincronización
- **Mismo dispositivo, al instante:** `triggerWidgetSync` → `syncWidgetSnapshot` (iOS: `ExtensionStorage` en el App Group + `reloadAllTimelines`; Android: `BFlowWidgets.setSnapshot`).
- **Otros dispositivos:** el store sube `users/{uid}/widgetSnapshots/current` (`widgetSnapshotRepository.ts`, debounce 1,5 s). Los widgets lo leen por REST con el refresh token que entrega `widgetAuthBridge` (`bflow_widget_auth_v1`), cada ~15 min o con «Actualizar». Gana el `updatedAtIso` más reciente.
- **Cerrar sesión:** `clearWidgetData()` borra snapshot y credenciales. Nunca mostrar datos de ejemplo: el estado vacío es «Abre BFlow para ver tu mes».

## 4. App Group dinámico
- Resolver el App Group desde `Bundle.main.bundleIdentifier` (`group.<bundle id principal>`) para soportar los sufijos de `iloader`. El adaptador JS escribe en el dinámico y en `group.com.bflow.app`.
- `ActivityKit` (`Activity.request` / `.update`) pasa el `ContentState` en proceso y funciona sin App Group.

## 5. Android
- Módulo Expo local (API clásica `Module`, compilado desde fuentes, ADR 0019), RemoteViews XML (no Glance) y WorkManager. No editar `android/` a mano.
- Colores de `androidPalettes`; en Android 12+, colores dinámicos del sistema para fondo y texto. R8: `consumer-rules.pro` del módulo.
- Tests: `cd android && ./gradlew :bflow-widgets:testDebugUnitTest`.
