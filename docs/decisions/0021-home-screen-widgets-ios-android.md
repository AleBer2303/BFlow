# 0021. Widgets de iOS y Android con sincronización sin abrir la app (Fase 7)

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Fase 7 de `PROMT BFLOW.md` («widgets ios, android») y su sección ISLA DINÁMICA Y WIDGETS. Sustituye el contrato `WidgetSnapshotV1` y el widget único de iOS. Respeta el límite de 2 App IDs del ADR [0001](0001-dual-mode-architecture-and-apple-free-tier.md), las reglas R8 del ADR [0013](0013-android-release-keep-rules.md) y la alineación de expo-modules del ADR [0019](0019-expo-modules-runtime-alignment.md).
- **Autores:** Architect, UI Builder, QA Engineer y Reviewer

---

## 1. Contexto y problema

En iOS ya había un widget (`BFlowWidget`) con todas las familias. Tenía estos problemas:

- Mezclaba todo en un solo `kind`, así que no existían los widgets de deuda y de ahorros que pide el prompt.
- Usaba colores RGB sueltos y textos inventados: «En Meta» siempre, y el flujo neto en verde aunque fuera negativo.
- Si no había datos, pintaba un snapshot de ejemplo.
- Mostraba el mes que el usuario estuviera *consultando*, no el mes en curso.
- Solo cambiaba cuando la app escribía en el App Group.

En Android no había nada.

El usuario pide que los widgets se sincronicen al instante y muestren la información en tiempo real **sin entrar a la app**. Eso tiene dos casos:

1. **El cambio se hace en el mismo teléfono.** Basta con escribir el snapshot y repintar en el momento.
2. **El cambio se hace en otro dispositivo** (la web, el otro teléfono). El widget tiene que enterarse con la app cerrada.

El caso 2 tiene un límite duro con las cuentas gratuitas:

- **iOS:** la recarga por push de WidgetKit necesita APNs, que exige el Apple Developer Program de pago.
- **Android:** un push FCM de datos necesita un servidor que lo envíe. Cloud Functions requiere el plan Blaze, y el proyecto está en Spark.

Por eso el caso 2 se resuelve con **refresco periódico y bajo demanda**, no con push.

## 2. Decisiones

### 2.1. Contrato `WidgetSnapshotV2`, calculado solo en TypeScript

- `src/platform/widgets/widgetSnapshot.ts` define el contrato (Zod `.strict()`) y `buildWidgetSnapshot`. El constructor reutiliza `buildMonthlyHistory` (ADR 0020), así que widget, tarjetas y gráficos dicen lo mismo.
- Los widgets nativos **no recalculan nada**: decodifican y pintan. Swift (`targets/widgets/WidgetSnapshotModels.swift`) y Kotlin (`modules/bflow-widgets/.../model/WidgetSnapshot.kt`) replican las validaciones. Si el snapshot no las cumple, el widget lo trata como «sin datos».
- **Campos nuevos frente a V1:**
  - previstos y pendientes de ingresos y gastos;
  - `initialDebt` y `debtSinceMonthKey`, para la barra de progreso de deuda;
  - `paidDebtThisMonth` y `estimatedPayoffMonthKey`;
  - los nombres reales de los bolsillos (`reserveName`, `savingsName`) y `otherSavingsBalance`;
  - hasta 8 pendientes;
  - `trend`, con hasta 6 meses para el mini gráfico;
  - `currencySymbol` y `thousandsSeparator`, porque el dominio es genérico (ADR 0005).
- Los montos se renombran sin el sufijo `Cop`.
- **Mes del widget:** `resolveWidgetMonthKey` elige el mes calendario en curso en `America/Bogota`. Si la cuenta aún no lo tiene, usa el último mes anterior conocido. Ya no depende de la pestaña que esté abierta.
- **Diferencia deliberada en Kotlin:** ignora claves desconocidas. Así un widget antiguo no se queda en blanco si una versión nueva de la app añade campos.

### 2.2. Caso 1: el mismo teléfono, al instante

Las 46 acciones del store llaman a `triggerWidgetSync`, que construye el snapshot y lo entrega al adaptador:

- **iOS:** `ExtensionStorage.setString` (parcheado por `scripts/patch-extension-storage.mjs`) escribe en UserDefaults y en el archivo del App Group. Después, `reloadWidget()` llama a `WidgetCenter.reloadAllTimelines()`.
- **Android:** `BFlowWidgets.setSnapshot(json)` valida, guarda y repinta todos los widgets con `AppWidgetManager.updateAppWidget`, en milisegundos.
- **Deduplicación:** si el contenido no cambió (ignorando `updatedAtIso`), no se escribe ni se recarga (R-19).

### 2.3. Caso 2: otros dispositivos, con la app cerrada

1. **La app escribe un documento derivado.** En cualquier plataforma, incluida la web, `scheduleCloudWidgetSnapshotWrite` (`src/data/repositories/widgetSnapshotRepository.ts`) guarda `users/{uid}/widgetSnapshots/current` con estos campos: `schemaVersion: 2`, `monthKey`, `payload` (el JSON del snapshot) y `updatedAt: serverTimestamp()`.
   - Las ráfagas se agrupan con un *debounce* de 1,5 s, y no se escribe si el contenido ya está en la nube.
   - Al pasar a segundo plano y antes de cerrar sesión se hace `flush`.
   - **No se sube mientras `isSyncing`:** al arrancar, la app aplica primero la caché local, que puede ser vieja, y un snapshot viejo con fecha nueva pisaría el de otro dispositivo. `syncUserCloudAccount` marca `isSyncing` antes de aplicar la caché y vuelve a llamar a `triggerWidgetSync` al terminar. Tras un rollback del store también se vuelve a sincronizar el widget.
   - Es una **caché de lectura**: la app nunca la lee, no es fuente de verdad y no entra en el rollback optimista de AGENTS.md §6.2. Si una escritura falla, la siguiente la reemplaza.
   - **Coste en Spark:** como mucho una escritura por ráfaga de cambios, muy por debajo de 20.000 al día.
2. **El widget lee ese documento por REST.**
   1. Refresca el ID token en `securetoken.googleapis.com/v1/token` con el refresh token y lo guarda en caché hasta `expires_in − 60 s`.
   2. Hace `GET` del documento en la API REST de Firestore y lee `fields.payload.stringValue`.
   3. Se queda con el snapshot más reciente entre el local y el remoto, comparando `updatedAtIso` como instante. Si gana el remoto, lo persiste.
   - **Cabeceras:** iOS envía `X-Ios-Bundle-Identifier` y Android `X-Android-Package` y `X-Android-Cert`, por si la API key está restringida por app.
   - **Presupuesto:** 8 s por intento.
3. **Cuándo se refresca:**

   | | iOS | Android |
   | :--- | :--- | :--- |
   | Periódico | `Timeline(policy: .after(+15 min))`. WidgetKit decide el presupuesto real de recargas, del orden de 40 a 70 al día. | `PeriodicWorkRequest` de WorkManager de 15 min (el mínimo) con red, mientras haya algún widget y credenciales. `updatePeriodMillis=0`. |
   | Bajo demanda | Botón «Actualizar» (`RefreshWidgetIntent`, AppIntent de iOS 17+) en los widgets mediano y grande. | Botón «Actualizar» en todos: un `OneTimeWorkRequest`, *expedited* en Android 12+. |
   | Consultas | Una sola consulta compartida por todos los widgets, con ventana de 30 s. | Trabajo único (`KEEP`). |

4. **Errores:**
   - Solo cuatro errores de securetoken son definitivos: `TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `USER_DISABLED` y `USER_NOT_FOUND` (en `error.message`). Marcan las credenciales como rechazadas y detienen el refresco remoto. Cualquier otro 4xx (por ejemplo, una API key restringida) es transitorio.
   - La marca se borra cuando la app vuelve a entregar credenciales (en cada arranque) y al tocar «Actualizar».
   - Un 401/403 de Firestore descarta el ID token en caché.
   - Cualquier otro error deja el snapshot local.
   - El remoto solo se persiste si siguen las credenciales del mismo `uid`, para que un cierre de sesión no resucite datos.

### 2.4. Credenciales del widget (`WidgetAuthV1`)

- `src/platform/widgets/widgetAuthBridge.ts` escucha `onIdTokenChanged` y entrega `{ uid, refreshToken, apiKey, projectId }`. En Web y en modo vitrina no hace nada.
- **Al cerrar sesión**, `index.tsx` hace lo siguiente, en este orden:
  1. sube lo pendiente, esperando como mucho 2 s (sin red, `setDoc` no resuelve y el botón se quedaría colgado);
  2. cancela la escritura programada;
  3. cierra la sesión de Firebase;
  4. con `clearWidgetData()`, borra el snapshot y las credenciales y repinta el estado vacío.
- **Almacenamiento:** nada de esto entra en las copias de seguridad.

  | Dato | iOS | Android |
  | :--- | :--- | :--- |
  | Snapshot (`bflow_widget_snapshot_v2`) | archivo `<App Group>/<clave>.json` | `noBackupFilesDir/bflow_widgets/snapshot_v2.json` |
  | Credenciales (`bflow_widget_auth_v1`) | archivo `.json` | `auth_v1.enc`, AES-256/GCM con clave en AndroidKeyStore |
  | Caché del ID token y marca de rechazo (`bflow_widget_id_token_v1`) | archivo `.json`, ligado al `uid` y al SHA-256 del refresh token | `id_token_v1.enc` (cifrado) y `auth_rejected_v1` |

  - **iOS:** la app escribe con `ExtensionStorage.setSecureFile` (añadida por `scripts/patch-extension-storage.mjs`): solo el archivo, solo en los App Groups con contenedor accesible, escritura atómica con `completeFileProtectionUntilFirstUserAuthentication` (el widget lee con el teléfono bloqueado) e `isExcludedFromBackup`. **Nada va a UserDefaults**: en un App Group que `iloader` no firmó, `UserDefaults(suiteName:)` crea un plist privado de la extensión que la app no puede borrar al cerrar sesión. Si el parche no está, la app no entrega el token (el widget se queda con lo local). El widget escribe sus propios archivos con la misma protección.
  - **Android:** archivos en `noBackupFilesDir` (Auto Backup no los copia), escritos con `.tmp` + renombrado bajo un candado. Las SharedPreferences de la primera versión se migran una vez si la credencial se descifra en ese teléfono y, si no (backup restaurado), se descartan con el snapshot.
- **Sin sesión no hay cifras.** Sin credenciales, el widget de iOS pinta el estado vacío aunque quede un snapshot. En Android, si la credencial no se puede descifrar, se borra todo.
- **Implicación de seguridad aceptada:** el refresh token vive en el dispositivo y da acceso a `users/{uid}/**` como la propia sesión de la app. Está en el contenedor del App Group (iOS), solo accesible para la app y su extensión, o cifrado con el Keystore (Android), y en ninguno de los dos casos sale del teléfono por backup. No se usa el Keychain compartido de iOS porque, igual que el App Group, depende de lo que firme `iloader`.

### 2.5. Reglas de Firestore

`match /users/{uid}/widgetSnapshots/{snapshotId}`:

- solo el dueño lee, escribe o borra;
- el id debe ser `current`;
- campos exactos;
- `schemaVersion == 2` y `monthKey` válido;
- `payload` es un string de 2 a 16.000 caracteres (el mismo tope de `WIDGET_MAX_PAYLOAD_LENGTH`);
- `updatedAt == request.time`, es decir, `serverTimestamp()`.

Las reglas no validan el JSON interno: el payload solo afecta a los widgets del propio usuario, y los tres decodificadores lo validan.

No hace falta ningún índice nuevo, porque es una lectura por id.

### 2.6. Catálogo de widgets

Todos viven en **un único target de extensión iOS**, con un `WidgetBundle` de 5 tipos (ADR 0001, límite de App IDs), y en **un único módulo Android**.

| Widget | iOS | Android | Contenido | Abre |
| :--- | :--- | :--- | :--- | :--- |
| Flujo neto | systemSmall, accessoryCircular, accessoryRectangular, accessoryInline | 2×2 | Flujo neto con signo y color, mes, checklist x de y | `summary` (el gauge circular, `checklist`) |
| Resumen | systemMedium | 4×2 | Recibido, pagado y por pagar, más un mini gráfico de barras de `trend` | `summary` |
| Pendientes | systemLarge | 4×4 redimensionable | Progreso, por pagar y por recibir, filas de pendientes con montos | `checklist` |
| Deudas | systemSmall, systemMedium, accessoryCircular | 2×2, y diseño mediano desde 220 dp de ancho | Restante, % pagado desde `debtSinceMonthKey`, abonado este mes y cierre estimado; «Sin deudas» si no hay | `debts` |
| Ahorros | systemSmall, systemMedium | 2×2, y diseño mediano desde 220 dp de ancho | Total y bolsillos con sus nombres, más «Otros» si hay | `savings` |

- **Pantalla de bloqueo:** solo en iOS. Android no tiene un equivalente de widget de bloqueo para teléfonos.
- **Deep links:** `bflow://?tab=<pestaña>`. `index.tsx` los atiende con `Linking.getInitialURL` y `Linking.addEventListener('url')`, y `parseWidgetDeepLinkTab` solo acepta las cuatro pestañas de widget.
- **Estado vacío:** «Abre BFlow para ver tu mes». Nunca se muestran datos de ejemplo. La muestra de la galería de iOS se pinta redactada (`.redacted(reason: .placeholder)`), y las vistas previas de Android son vectores sin cifras.

### 2.7. Diseño por piel

- **iOS (Liquid Glass):**
  - Hay 11 colorsets `{ light, dark }` en `targets/widgets/expo-target.config.js`, copiados de la piel iOS de `tokens.ts`. Si cambia un token, hay que actualizar esa lista.
  - En el modo *accented* (tintado de iOS 18 y transparente de iOS 26), la cifra protagonista, los gauges y las barras llevan `.widgetAccentable()`. El significado no depende solo del color: hay signo +/− y flecha, y las series se separan por opacidad.
  - Cifras con `.monospacedDigit()`, `.contentTransition(.numericText())` y `.privacySensitive()`.
  - Gráfico con Swift Charts y botón «Actualizar» con AppIntents. Se añadieron los frameworks `Charts` y `AppIntents`.
  - `targets/widgets/Assets.xcassets/` se genera en cada prebuild y queda en `.gitignore`.
- **Android: el mismo diseño que iOS** (decisión del usuario tras ver ambos; sustituye la primera versión Material 3 con colores dinámicos):
  - Cada widget replica su vista SwiftUI: mismas piezas, orden, textos y signos. `WidgetRenderer.kt` tiene un `bind*` por vista Swift.
  - Colores: los 11 colorsets `{ light, dark }` de `targets/widgets/expo-target.config.js` en `values` y `values-night`, más la pista de las barras (texto secundario al 22 %). **Sin colores dinámicos del sistema.** Si cambia un token de la piel iOS, se actualizan los dos sitios.
  - Tipografía: equivalencias en sp de los estilos de iOS (caption2 11, caption 12, subheadline 15, headline 17, title3 20, title2 22), `sans-serif-medium` para semibold y cifras tabulares (`tnum`). El `minimumScaleFactor` se imita con autosize.
  - Iconos: vectores equivalentes a los SF Symbols usados (flechas del flujo, actualizar, checklist, reloj, etc.).
  - Deudas y Ahorros cambian entre el diseño pequeño y el mediano según el tamaño: `RemoteViews(Map<SizeF, RemoteViews>)` en Android 12+ y `OPTION_APPWIDGET_MIN_WIDTH` antes.
  - Esquinas de 22 dp antes de Android 12; en 12+ el launcher recorta con su propio radio. Margen interno de 16 dp.
  - Los colores elegidos en código usan `setColorInt(claro, oscuro)` y el gráfico se envía como dos `Icon`, para que no se congelen al cambiar de tema. El Bitmap del gráfico no pasa de 360.000 px. Objetivo táctil de 48 dp en «Actualizar».
  - **Diferencias que no se pueden igualar con RemoteViews:** la hora es exacta («Act. 10:42») en lugar del «hace 3 min» que iOS actualiza solo; la barra de reparto de Ahorros son tramos apilados sin el hueco entre ellos; no hay animación numérica, `privacySensitive`, modo tintado ni widgets de pantalla de bloqueo; y las celdas del launcher suelen ser más altas que en iOS, así que los widgets tienen más aire vertical.
- **Formato de dinero:** réplica exacta de `formatCurrency` y `formatCurrencyCompact`, incluido el redondeo de `toFixed` en los empates. Se comprobó contra la función real de JS. Los meses van abreviados en español sin depender del locale.

### 2.8. Android: módulo Expo local, RemoteViews y WorkManager

- `modules/bflow-widgets/` lo descubre el autolinking de Expo, que busca en `./modules` por defecto, y crea el proyecto Gradle `:bflow-widgets`. No necesita `package.json` ni tocar `android/`, que no está en git.
- Usa la API clásica `Module`/`ModuleDefinition` sin publicación: se compila desde fuentes contra el `expo-modules-core` instalado, así que no puede desalinearse del runtime (ADR 0019).
- **RemoteViews XML y no Jetpack Glance:** Glance obliga a activar Compose en el gradle de la app.
- **Dependencia nueva:** `androidx.work:work-runtime-ktx:2.11.2`. `package.json` no cambia.
- **R8 (ADR 0013):** el `consumer-rules.pro` del módulo conserva el módulo, los proveedores y el constructor del worker. Se comprobó en `mapping.txt`, y no hizo falta tocar `withAndroidKeepRules.js`.
- Los receivers tienen `exported="false"`. Los botones usan broadcasts explícitos y `PendingIntent.FLAG_IMMUTABLE`.

## 3. Alternativas descartadas

| Alternativa | Por qué no |
| :--- | :--- |
| Push de WidgetKit (APNs) / FCM de datos | Requieren el Apple Developer Program de pago y un servidor (Cloud Functions → plan Blaze). Queda como mejora futura si cambia el plan. |
| Que el widget lea `entries`, `debts`, etc. y recalcule | Duplicaría el dominio en Swift y Kotlin y rompería la regla de que el Excel manda en TypeScript. Además costaría muchas más lecturas. |
| `react-native-android-widget` (widgets pintados desde JS) | Arranca un *headless JS* en cada refresco y suma una dependencia sin garantía con RN 0.88 + New Architecture. |
| Jetpack Glance | Activa Compose en el gradle de la app, que no está en git. |
| `androidx.security:security-crypto` | Está deprecada; se usa el Keystore directamente. |
| Widgets interactivos que marcan un pendiente como pagado | Escribir desde el widget obligaría a replicar en nativo las reglas de escritura y el rollback. El widget abre la app en Pendientes. Se puede reconsiderar en la Fase 8. |

## 4. Consecuencias

- El cambio de contrato es incompatible con V1. Swift, Kotlin y TS se actualizaron juntos. **Cualquier campo nuevo se añade en los tres decodificadores en el mismo cambio.**
- **Cuando el cambio viene de otro dispositivo, el widget tarda entre 0 y unos 15 min** (lo que permita el sistema), o lo que tarde el usuario en pulsar «Actualizar». Cuando el cambio es en el mismo teléfono, es instantáneo.
- El documento en la nube se actualiza cuando alguna app está abierta. Al empezar un mes nuevo, el widget sigue mostrando el anterior (con su etiqueta de mes) hasta que alguna app lo cree o lo abra.
- **Riesgo de reloj:** si un dispositivo tiene la hora mal, su snapshot puede ganar o perder sin motivo, porque «gana el más reciente» compara `updatedAtIso`.
- **Riesgo de API key:** si se restringe la API key a apps, hay que registrar el bundle id de iOS (que `iloader` puede cambiar con un sufijo) y el SHA-1 del keystore de Android. Si no, el refresco remoto da 403 y el widget se queda con lo local.

## 5. Verificación

- **TypeScript:** `npm run typecheck`, `npm run lint` y `npm test` en verde.
- **Tests nuevos:**
  - contrato y valores dorados de octubre 2026, mes del widget y cambio de mes en Bogotá (`widgetSnapshot.test.ts`);
  - adaptador nativo iOS y Android con módulos simulados (`widgetNativeBridge.test.ts`);
  - credenciales y deep links (`widgetAuthAndLinks.test.ts`);
  - *debounce*, `flush` y cambio de cuenta del documento en la nube, y reglas (`widgetSnapshotRepository.test.ts`);
  - el store no sube el snapshot mientras sincroniza (`widgetCloudSync.test.ts`).
- **Revisión de código independiente:** sus 9 hallazgos (cierre de sesión colgado sin red, cifras que resucitaban tras cerrar sesión en iOS con `iloader`, token en UserDefaults y backups, `import AppIntents` faltante, rechazo demasiado agresivo, snapshots viejos con fecha nueva, backup de Android, caché del ID token sin borrar y rollbacks sin resincronizar) están corregidos.
- **Android:**
  - `:bflow-widgets:testDebugUnitTest` pasa sus 33 tests JVM (parser, formato, fechas ISO, credenciales y clasificación de errores de securetoken). Se ejecutan con `cd android && ./gradlew :bflow-widgets:testDebugUnitTest`; `ci.yml` todavía no corre Gradle.
  - `:app:assembleRelease` con R8 compila.
  - En un emulador API 36 se instaló el `.apk`, el selector muestra los 5 widgets, el de flujo neto se pinta en estado vacío y tocarlo abre la app con su deep link.
- **iOS:** no hay Mac en este entorno. La compilación real ocurre en `build-ios.yml`. Se revisaron el balance sintáctico de los 13 `.swift` y la paridad del redondeo compacto (612.001 casos contra la función de JS).

### Sin verificar

- **iOS:** la compilación en Xcode, los widgets en un iPhone, el AppIntent y Swift Charts en el target, el App Group firmado por `iloader` y el modo tintado/transparente de iOS 26.
- **Android:** el diseño se comprobó en un emulador API 36 con el snapshot dorado inyectado, en claro y oscuro, con los 5 widgets y Deudas/Ahorros en sus dos tamaños; falta verlo con una sesión real (el botón «Actualizar» solo aparece con credenciales), el worker contra Firestore, el botón «Actualizar», la migración de SharedPreferences, la restauración de un backup, un teléfono físico, Android < 12 y los tamaños 2×2 pequeños.
- El refresco remoto de extremo a extremo en ambas plataformas, y las reglas desplegadas en el proyecto real.
