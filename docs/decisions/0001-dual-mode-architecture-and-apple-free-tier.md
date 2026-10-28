# ADR 0001: Arquitectura de Doble Modo (Modo A / Modo B) y Viabilidad con Cuenta Apple Gratuita

- **Estado:** Propuesto (Fase 0)
- **Fecha:** 2026-10-28
- **Contexto:** Desarrollo en Windows 11 + VS Code sin Mac local, probando en iPhone 16 Pro Max (iOS 26) mediante Expo Go y `.ipa` compilado en GitHub Actions (macOS runner) e instalado vía `iloader` con Apple ID gratuito (Personal Team).

---

## 1. Contexto y Problema

El proyecto **BFlow** requiere características nativas avanzadas de iOS 26 (Widgets de pantalla de inicio y bloqueo, Live Activities / Isla Dinámica, efectos nativos Liquid Glass y Google Sign-In nativo), pero el entorno de desarrollo diario es **Windows 11 sin Mac** y sin suscripción de pago a Apple Developer Program ($99 USD/año) ni EAS Build de pago.

Adicionalmente, **Expo Go** no incluye módulos nativos personalizados ni extensiones de aplicación (`WidgetKit` / `ActivityKit`), por lo que acoplar el código directamente a APIs nativas rompería el ciclo rápido de desarrollo en Windows + Expo Go.

---

## 2. Decisión: Arquitectura de Doble Modo (Modo A y Modo B)

Se establece una frontera arquitectónica estricta mediante adaptadores en `src/platform/`:

| Capacidad | Modo A (Expo Go / Web — Desarrollo diario) | Modo B (Build Nativo `.ipa` — CI macOS + `iloader`) |
| :--- | :--- | :--- |
| **Detección en runtime** | `Constants.executionEnvironment === ExecutionEnvironment.StoreClient` o `Platform.OS === 'web'` | Build standalone/development (`prebuild` + `xcodebuild`) |
| **Autenticación** | Firebase JS SDK (`signInWithEmailAndPassword`) + Mock/Web OAuth | Firebase JS SDK + `@react-native-google-signin/google-signin` nativo |
| **Persistencia Offline** | Firestore JS SDK con caché persistente local (IndexedDB / AsyncStorage) | Firestore JS SDK con caché persistente local |
| **Efecto Liquid Glass** | Fallback automático a `expo-blur` (`BlurView`) + bordes translúcidos | `expo-glass-effect` (`GlassView` nativo `UIVisualEffectView` iOS 26) |
| **Widgets (WidgetKit)** | No-op / Vista previa simulada dentro de la app (Debug Panel) | Extensión nativa WidgetKit sincronizada por `WidgetBridge` |
| **Isla Dinámica / Live Activity** | Banner simulado en la parte superior de la app (Modo Preview) | `ActivityKit` nativo (Isla Dinámica compacta, mínima y expandida) |

### Regla de Aislamiento
Ninguna pantalla (`src/app/`) ni lógica de dominio (`src/domain/`) puede importar paquetes nativos de Modo B directamente. Todo acceso pasa por interfaces tipadas en `src/platform/`:
- `src/platform/widgets/widgetBridge.ts` (implementaciones `.native.ts` y `.expo-go.ts`)
- `src/platform/live-activity/liveActivityService.ts`
- `src/platform/glass/GlassSurface.tsx`
- `src/platform/auth/googleAuth.ts`

---

## 3. Análisis de Riesgos de Cuenta Apple Gratuita (Personal Team) y Mitigaciones

Al firmar un `.ipa` sin firmar desde GitHub Actions usando una herramienta de sideloading como **iloader** (o Sideloadly / AltStore / SideStore) con un Apple ID gratuito, Apple impone cuatro restricciones técnicas críticas:

### Riesgo 1: Límite de 3 Apps Activas instaladas simultáneamente
- **Restricción de Apple:** Un Apple ID gratuito solo permite tener **máximo 3 apps firmadas activas** al mismo tiempo en un dispositivo físico iOS.
- **Impacto:** Si tienes otras 2 apps instaladas vía sideloading, funcionará; si tienes 3, la instalación de BFlow fallará.
- **Mitigación:** Mantener máximo 2 apps adicionales firmadas con esa cuenta o usar un Apple ID secundario gratuito exclusivo para BFlow.

### Riesgo 2: Límite de 10 App IDs cada 7 días (CRÍTICO para Extensiones)
- **Restricción de Apple:** Una cuenta gratuita solo puede registrar **10 App IDs nuevos por semana móvil (7 días)**.
- **Impacto directo en BFlow:** Cada target de Xcode consume 1 App ID distinto:
  1. App principal (`com.bflow.app`) → **1 App ID**
  2. Widget + Live Activity Extension (`com.bflow.app.widgets`) → **1 App ID**
  - **Error común a evitar:** Crear targets separados para cada widget o separar el Widget Extension del Live Activity Extension consumiría 4-6 App IDs de golpe.
- **Mitigación Arquitectónica:**
  - **Unificar TODOS los Widgets y la Live Activity en UN SOLO `WidgetBundle` dentro de una única extensión (`BFlowWidgetsExtension`).** En iOS 16.2+ / iOS 26, un único target `WidgetKit Extension` declara tanto los `Widget` (pequeño, mediano, grande, deuda, ahorros, pantalla de bloqueo) como el `ActivityConfiguration` de la Isla Dinámica.
  - Consumo total de App IDs de BFlow: **exactamente 2 App IDs** (App + 1 Extensión unificada), dejando 8 App IDs libres en la cuota semanal.
  - En el workflow `build-ios.yml` se generarán **dos variantes del `.ipa`** en cada Release:
    - `BFlow-Full.ipa` (con extensión de Widgets + Isla Dinámica = 2 App IDs)
    - `BFlow-NoExtensions.ipa` (solo app principal = 1 App ID, como salvavidas si alguna vez se agota la cuota de App IDs o `iloader` falla al firmar `.appex`).

### Riesgo 3: Soporte de `App Groups` en Cuenta Gratuita para compartir datos con el Widget
- **Restricción de Apple:** Oficialmente en Xcode, el entitlement `com.apple.security.application-groups` puede presentar restricciones en cuentas gratuitas si la herramienta de firma no registra o reescribe el App Group en el perfil de aprovisionamiento.
- **Estado real con `iloader` / Sideloadly / SideStore:**
  - Los sideloaders suelen reescribir el `CFBundleIdentifier` agregando un sufijo único por equipo (ej. `com.bflow.app.ABC123`). Si el código tiene hardcodeado `group.com.bflow.app`, `UserDefaults(suiteName:)` devuelve `nil` silenciosamente y el widget aparece sin datos.
- **Mitigación en 3 Capas (Defensa en Profundidad):**
  1. **Resolución dinámica del App Group ID:** El bridge nativo resuelve el App Group leyendo `Info.plist` (`AppGroupIdentifier`) o derivándolo dinámicamente del `CFBundleIdentifier` base de la app principal (`group.<base_bundle_id>`).
  2. **Diagnóstico en Ajustes:** La pantalla de Ajustes incluye una tarjeta "Diagnóstico Modo B (Widgets & Isla Dinámica)" que escribe un ping en el contenedor compartido y reporta si el App Group está activo.
  3. **Alternativa de respaldo sin App Group (Zero-AppGroup Fallback):**
     - **Isla Dinámica (Live Activity):** `ActivityKit` **NO necesita App Groups** cuando la app inicia o actualiza la actividad en local (`Activity<BFlowAttributes>.request(...)` y `.update(...)` envían el `ContentState` serializado directamente al demonio del sistema de iOS). Es decir, **la Isla Dinámica funciona al 100% aún sin App Groups**.
     - **Widgets (WidgetKit):** Si `UserDefaults(suiteName:)` no está disponible por restricción del perfil gratuito, el `TimelineProvider` del Widget implementa un fallback de lectura de un documento ligero (`users/{uid}/widgetSnapshot/current`) vía Firebase REST API usando un token compartido en `Keychain` (en iOS, la app principal y su `.appex` firmadas con el mismo Team ID gratuito comparten implícitamente el mismo `TeamID` prefix para Keychain Sharing sin requerir App Group de pago).

### Riesgo 4: Expiración de Firma cada 7 Días y Pérdida de Datos Locales
- **Restricción de Apple:** El certificado de desarrollo gratuito expira exactamente a los **7 días**. Si el usuario borra la app antes de reinstalar, iOS elimina el contenedor local.
- **Mitigación:**
  - **Fuente primaria en la nube (Firestore Spark):** Todos los datos viven en `users/{uid}/...` en Firestore con sincronización inmediata. Aunque se borre y reinstale la app, al iniciar sesión todo el historial, catálogo, deudas y ahorros se restauran en menos de 2 segundos.
  - **Re-firma sin desinstalar:** Documentación paso a paso para re-firmar en `iloader` sobre la app existente conservando la sesión.
  - **Recordatorio automático en el día 6:** Al instalar/abrir el `.ipa`, BFlow agenda una notificación local de iOS a los **5 días y 20 horas**: *"⚠️ Tu firma de 7 días vence mañana. Conecta tu iPhone a iloader para renovar BFlow en 1 minuto"*.
