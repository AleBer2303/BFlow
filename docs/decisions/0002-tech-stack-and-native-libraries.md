# ADR 0002: Selección de Stack Tecnológico y Librerías Nativas (Expo SDK)

- **Estado:** Propuesto (Fase 0)
- **Fecha:** 2026-10-28
- **Contexto:** Selección y verificación de librerías compatibles con Expo SDK moderno, Modo A (Expo Go en iPhone / Web en Windows) y Modo B (Build nativo `.ipa` en GitHub Actions para iOS 26).

---

## 1. Core del Proyecto

- **Framework:** **Expo (SDK estable vigente en Expo Go App Store) + React Native + Expo Router (file-based routing)**.
- **Lenguaje:** **TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`)**.
- **Nota de compatibilidad con Expo Go:** Expo Go en iOS solo ejecuta el SDK estable publicado actualmente en el App Store (SDK 54/55+). En la Fase 1 fijaremos exactamente la versión del SDK que soporte tu app Expo Go instalada en el iPhone 16 Pro Max para que puedas probar al instante en Windows sin fricción.

---

## 2. Matriz de Evaluación de Librerías Candidatas

| Categoría | Candidatas Investigadas | Decisión | Alternativa descartada y razón |
| :--- | :--- | :--- | :--- |
| **Widgets + Live Activities (Isla Dinámica)** | 1. `@bacons/apple-targets`<br>2. `expo-widgets`<br>3. `expo-live-activity` | **`@bacons/apple-targets` (target único `targets/widgets`) + módulo puente Expo Module local (`modules/bflow-native-bridge`)** | Usar `expo-widgets` por un lado y `expo-live-activity` por otro puede generar **2 extensiones separadas** (consumiendo más App IDs de la cuenta gratuita) o conflictos en `prebuild`. Con `@bacons/apple-targets` definimos **un único `WidgetBundle` en SwiftUI** que aloja tanto los 6 Widgets como el `ActivityConfiguration` de la Isla Dinámica con diseño Liquid Glass nativo de iOS 26. |
| **Efecto Liquid Glass (iOS 26)** | 1. `expo-glass-effect`<br>2. `expo-blur` | **`expo-glass-effect` (Modo B) con fallback automático a `expo-blur` (Modo A / Web / iOS < 26)** detrás de `<GlassSurface />` | `expo-glass-effect` expone `UIVisualEffectView` / `UIGlassEffect` nativo de iOS 26 a 120 fps en el hilo de UI. En Expo Go o web cae limpiamente a `BlurView` (`expo-blur`) + gradiente especular en CSS/RN. |
| **Autenticación con Google** | 1. `@react-native-google-signin/google-signin`<br>2. `expo-auth-session` | **Email/Password (Modo A y B) + `@react-native-google-signin/google-signin` (Modo B) + `expo-auth-session` (Web/Modo A opcional)** | `@react-native-google-signin/google-signin` ofrece el diálogo nativo de iOS de un toque en el `.ipa` (Modo B), pero requiere binario nativo (no corre en Expo Go). Por ello se aísla en `src/platform/auth/googleAuth.ts`; en Expo Go el usuario entra con Email/Contraseña (o flujo web) sin crashear por `TurboModuleRegistry`. |
| **Gestión de Estado** | 1. `zustand`<br>2. `@tanstack/react-query` | **`zustand` + suscripciones reactivas de Firestore (`onSnapshot`)** | Firestore JS SDK ya provee caché persistente en disco, lecturas optimistas e invalidación en tiempo real vía `onSnapshot`. `zustand` mantiene una huella mínima (< 2 KB), evita duplicar cachés y permite selectores puros sobre `src/domain/`. |
| **Validación de Esquemas y Contratos** | `zod` | **`zod`** | Valida el fixture extraído del Excel (`fixtures/october-2026.json`), los documentos leídos/escritos en Firestore y el contrato versionado `WidgetSnapshot` (`v1`) compartido con la extensión de iOS. |
| **Gráficos Animados** | 1. `react-native-gifted-charts`<br>2. `victory-native` (XL) | **`react-native-gifted-charts` + `react-native-svg` + `react-native-reanimated`** | `react-native-gifted-charts` funciona al 100% tanto en Expo Go como en build nativo sin requerir compilación de shaders C++ de Skia cuando cambia la versión menor de Expo Go, y soporta barras agrupadas, apiladas, líneas/áreas suavizadas, donas interactivas y tooltips al tocar. |
| **Animaciones y Gestos** | `react-native-reanimated` + `react-native-gesture-handler` + `expo-haptics` | **Incluidos de serie** | Soporte de 120 fps (ProMotion en iPhone 16 Pro Max), física de resortes (`withSpring`) al marcar un ítem del checklist y feedback háptico (`Haptics.notificationAsync`). |

---

## 3. Dinero y Soporte de `Intl` en Hermes

- **Regla de Oro de Dinero:** Todos los montos en memoria, Firestore y JSON son **enteros en pesos colombianos (COP)** (`number` validado con `Number.isSafeInteger(amount)`). Cero decimales y cero floats en operaciones financieras.
- **Formateador propio (`formatCop`):** Aunque Hermes soporta `Intl.NumberFormat`, la salida de `es-CO` varía según el ICU del sistema operativo (`"$ 1.080.000"` vs `"$1.080.000"` vs `"COP 1.080.000"`, o uso de espacio de no separación `\u00A0` en lugar de espacio normal). Por tanto, implementamos un formateador propio determinístico en `src/domain/money/money.ts` que produce siempre `"$ 1.080.000"` (igual al Excel) con tests unitarios exhaustivos.
