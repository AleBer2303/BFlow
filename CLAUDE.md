# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

BFlow es una app de presupuesto personal multiplataforma (iOS, Android y Web; Expo SDK 58 / React Native 0.88 / React 19 / TypeScript estricto / Zustand / Cloud Firestore) que reemplaza un Excel mensual. Las reglas de ingeniería completas (roles de agentes, Definition of Done, protocolo de documentación Diátaxis, criterios de ADR) viven en [`AGENTS.md`](AGENTS.md) y **son vinculantes**; este archivo solo resume lo esencial y añade lo que hay que leer en varios archivos para entender.

Idioma: comunicación, comentarios, ADRs y commits en español; código, identificadores y claves de datos en inglés.

## Comandos

```bash
npm ci --legacy-peer-deps      # instalar (.npmrc ya fija legacy-peer-deps). postinstall parchea node_modules/@bacons/apple-targets (ExtensionStorageModule.swift)
npm run web                    # Modo A en navegador (flujo diario en Windows), con Firebase real
npm run web:demo               # Modo vitrina: sesión demo + presupuesto de ejemplo del mes actual, sin Firebase. ?skin=ios|android|web y ?theme=dark|light
npm start                      # Expo Go (QR); `npm run ios` / `npm run android` abren en simulador/dispositivo
npm run typecheck              # tsc --noEmit (strict + noUncheckedIndexedAccess)
npm run lint                   # NO es ESLint: scripts/lint-check.mjs y scripts/docs-link-guard.mjs (ver "Reglas que aplica el lint")
npm test                       # jest --watchAll=false (preset jest-expo)
npm test -- --coverage --ci    # igual que CI
npm run test:domain            # solo src/domain (lógica contable)
npm run test:changed           # solo los tests afectados por los cambios sin confirmar (jest --onlyChanged)
npx jest src/domain/debts                       # un directorio/archivo
npx jest path/to/file.test.ts -t "nombre del test"   # un solo test
npm run test:phase0            # paridad del fixture dorado (node --test scripts/verify-phase0-fixture.test.mjs)
npm run test:scripts           # tests de scripts/release.mjs, guardias de los workflows, de worklets y de enlaces de los Markdown, y compresión de iconos (CI corre este mismo script)
npm run compress:icons         # comprime casi sin pérdida assets/icon.png y adaptive-icon.png (--dry-run, --compare <carpeta>); no recomprime lo ya comprimido
npm run release -- patch --dry-run   # plan del release sin escribir nada (ADR 0023); el release real es el workflow release.yml
node scripts/check-src-tests-guard.mjs origin/main   # guardia: cambios en src/ exigen tests en el mismo rango
```

Antes de dar algo por terminado: `typecheck`, `lint` y `npm test` en 0 errores (AGENTS.md §4). Para saltar la guardia de tests en un commit, `[skip-test-guard]` en el mensaje.

Notas de tests:
- Solo se descubren archivos `**/__tests__/**/*.test.[jt]s?(x)`; un `*.test.ts` fuera de `__tests__/` no corre.
- La cobertura solo se mide sobre `src/domain/`. `jest.config.js` aplica umbral global 80%, pero la regla del proyecto (AGENTS.md) exige ≥ 90% en sentencias y líneas.
- `jest.config.js` fija `maxWorkers: '50%'` y guarda la caché de transformación en `.jest-cache/` (ignorado en git); la primera ejecución tras borrarla tarda casi el doble.
- Con `jest.useFakeTimers()`, el `requestAnimationFrame` de React Native (`setTimeout(…, 0)`) dispara un cuadro por milisegundo simulado. Un test que avance segundos de una animación por cuadros debe fijar su cadencia, como `installFrameClock` en `features/summary/__tests__/vectorCurve.test.tsx` (`PERF_BASELINE.md` §8, 05).
- `scripts/extract-excel-fixture.mjs` (`npm run extract:excel`) necesita `docs/reference/Control_Ingresos_y_gastos_mensuales.xlsx`, que **no está en el repo**; CI valida solo los JSON ya generados en `fixtures/`. No regenerar los fixtures sin ese Excel.
- E2E (ADR 0023): `e2e/flows/*.yaml` son flujos de Maestro sobre un APK en modo vitrina que `e2e.yml` compila solo para eso y nunca publica. No se han ejecutado todavía en un emulador ni en GitHub. `scripts/workflow-guards.test.mjs` falla si un flujo usa un `testID` que no existe en `src/`: al renombrar un `testID`, actualiza el flujo.

## Reglas que aplica el lint (`scripts/lint-check.mjs` y `scripts/docs-link-guard.mjs`)

1. `src/domain/` no puede importar `react`, `react-native`, `expo*`, `firebase*`, `zustand` ni `data/platform/design-system/features/app`.
2. Prohibido literal `'#RRGGBB'` en `src/app/` y `src/features/` (usar `src/design-system/tokens.ts`).
3. Prohibido `console.log` en `src/` (fuera de tests).
4. `expo-glass-effect` y `@react-native-google-signin/google-signin` solo pueden importarse desde `src/platform/**/*.native.{ts,tsx}`.
5. `expo-blur` solo puede importarse en `src/platform/glass/GlassSurface.tsx` y `src/design-system/components/IosWheelPickerModal.tsx` (Liquid Glass es exclusivo de la piel iOS).
6. Prohibido el `Pressable` de React Native en `src/app/` y `src/features/`: usar `AppPressable`.
7. Ningún `.md` del repositorio (versionado o nuevo sin ignorar, fuera de `node_modules`) puede tener enlaces `file://` o rutas de Windows, enlaces relativos a archivos o carpetas que git no conozca, ni anclas que no existan. Las anclas se calculan como GitHub (un título con emoji delante da `#-titulo`), y la línea de un `.md` se enlaza con `archivo.md?plain=1#L10`. El código en línea y los bloques de código no se revisan. Las skills de terceros de `skills-lock.json` tampoco: editarlas cambia su hash.

## Arquitectura

Flujo de datos de extremo a extremo:

```
src/app/index.tsx  ──(hooks/props)──>  features/*/components
        │                                     │
        └── useBudgetStore (Zustand) <────────┘
               │  slices: auth · sync · budget · debts · savings · provisions
               ├── domain/*            cálculo puro (resúmenes, checklist, deudas, cierre de mes)
               ├── data/repositories   FirestoreBudgetRepository (users/{uid}/...)
               └── platform/*          auth, storage (caché offline), widgets, haptics, glass
```

- **`src/app/index.tsx`** es una única pantalla grande (~550 líneas) que hace de orquestador: puerta de autenticación (`AuthScreen` si no hay `authUser`), sincronización con la nube (`syncUserCloudAccount`: hidrata primero desde `platform/storage/accountCache`, luego `FirestoreBudgetRepository.loadFullCloudAccount`), selección de pestaña (`summary | checklist | debts | savings | analytics | account`) y derivación de todos los resúmenes con `useMemo` llamando a funciones de `domain`. `_layout.tsx` monta `BFlowThemeProvider` y el `Stack`, reserva la barra de estado en Android y sincroniza el fondo del sistema (`platform/system/systemChrome`, con variante `.web.ts` que inyecta foco, tipografía y variables CSS). El contenido se pinta dentro de `features/shell/WorkspaceShell` (cabecera, columna centrada y navegación de la piel). Las pantallas de `features/` reciben datos ya calculados por props.
- **Store** (`src/features/budget/store/`): `useBudgetStore.ts` solo compone los slices de `slices/`; los tipos, helpers y `buildInitialState` están en `slices/sliceTypes.ts`. Patrón de escritura en cada acción: (1) calcular el nuevo estado con funciones puras de `domain`, (2) `set()` optimista, (3) `triggerWidgetSync`, (4) si `isRealAuthUser(...)`, persistir con `getBudgetRepository()` y, **en el `catch`, revertir al estado previo** y poner un `syncMessage` amigable (AGENTS.md §6.2 lo exige para toda escritura).
  - **Fase 2 del plan consolidado** (`PERF_BASELINE.md` §20):
    - `getBudgetRepository()` (`sliceTypes.ts`) es el repositorio compartido y perezoso: no uses `new FirestoreBudgetRepository()` en los slices. Los tests lo reemplazan con `__setBudgetRepositoryForTests`, o espían el prototipo como hasta ahora.
    - La caché local se guarda desde un único punto: `startPersistedAccountAutoSave` (`persistedAccountFields.ts`), suscrito al store. No programes guardados desde las acciones ni desde `index.tsx`.
  - Los contenedores de pestaña (`features/*/components/*Tab.tsx`) y los hooks que usan (`useActiveMonthSummaries`, `useChartHistory`) leen el store con `useTabStore`, no con `useBudgetStore`. Así, una pestaña oculta no recalcula; al volver lee el store una vez (OPT-01).
- **Cola offline (ADR 0017 y 0035, `platform/storage/offlineWriteQueue.ts`):**
  - `QueuedWritePayloads` tipa el payload de cada operación. Un tipo nuevo necesita su payload, su esquema en `PAYLOAD_SCHEMAS` y su caso en `executeQueuedOperation`.
  - Las colas guardadas se validan con Zod al leerlas: lo que no encaja se descarta y `drainOfflineWriteQueue` devuelve `discarded` para el aviso.
  - La compactación va por objetivo: un borrado reemplaza los guardados pendientes de su objetivo, y conserva el concepto como `save_concept`. Dos guardados seguidos se fusionan, y lo demás va al final.
  - `deleteDebt` y `deleteSavingsBucket` limpian en cascada los conceptos y los abonos, en lotes de 450.
- **Comportamiento distinto en tests**: con `NODE_ENV === 'test'`, `buildInitialState` carga el presupuesto de ejemplo (`data/sample/sampleWorkspace.ts`) con el usuario local `DEMO_USER`, y `isRealAuthUser` solo acepta uids que empiecen por `uid_cloud_test`, así que los tests del store no tocan Firestore. Solo `DEMO_USER` (`provider: 'local-demo'`) recibe esos datos; cualquier otro usuario arranca con un workspace vacío. `jest.setup.js` fija el mes del ejemplo con `BFLOW_SAMPLE_MONTH_KEY`; en el modo vitrina es el mes actual. `src/app/index.tsx` omite listeners de sesión/widget en test.
- **Dominio** (`src/domain/`): exporta todo desde `src/domain/index.ts` (los consumidores importan de `'../domain'`). Tras el ADR 0005 el dominio es genérico (`calculateDebtsSummary`, `calculateProvisionPlanSummary`, `formatCurrency`, `toAppMonthKey`/`toAppIsoDate`) y conserva los alias `formatCop` y `toBogotaMonthKey`. Los tests dorados (`domain/__tests__/golden-october-2026.test.ts`) comparan contra `fixtures/october-2026.json`, que solo se usa ahí y se lee a través de `legacyFieldMigration.ts`; cualquier cambio de fórmula debe mantenerlos verdes y requiere ADR. Ningún otro archivo nombra datos de ese fixture (ADR 0037).
- **Dinero y fechas**: enteros validados con `Number.isSafeInteger`, nunca decimales; `Math.ceil` en divisiones de provisiones; `monthKey`/fechas en `America/Bogota`. El saldo de una deuda nunca se almacena: se deriva de apertura − abonos completados (`debtPayments`). AGENTS.md menciona `format(amount)`; la función real es `formatCurrency` (`formatCop` como alias). Helpers únicos del dominio (CC-02), no repitas sus cuerpos:
  - `toSlugId`: ids nuevos a partir de un nombre, con las tildes plegadas. Los ids guardados no se regeneran.
  - `parseDigitsInput` / `extractDigits`: montos y números escritos en formularios.
  - `annualToMonthlyRate` / `monthlyToAnnualRate`: tasas de deuda, redondeadas a 4 decimales.
- **Datos** (`src/data/`): `repositories/budgetRepository.ts` es solo la fachada que reexporta todo (Fase 4); el contrato `BudgetRepository` y sus tipos están en `budgetRepositoryTypes.ts`, `FirestoreBudgetRepository` (~1.450 líneas) en `firestoreBudgetRepository.ts` e `InMemoryBudgetRepository` (para pruebas) en `inMemoryBudgetRepository.ts`. Los pasos de `loadFullCloudAccount` son funciones puras de `accountHydration.ts`; las lecturas siguen en la clase (`readCloudAccountDocuments`). No hay cuenta semilla (ADR 0037). Los nombres que guardaron versiones anteriores (`savingsBuckets/moto`, `motoClosingBalance`, `idealMotoCategoryKey`, `provisionPlans/moto_ideal`, `seededOctober2026`) solo los conoce `data/migrations/legacyFieldMigration.ts`: los mappers traducen al leer y al escribir, y `loadFullCloudAccount` reescribe en segundo plano los documentos viejos. El plan vive en `provisionPlans/default`. Una escritura decidida antes de su lote va como `PendingSetWrite` (`batchWrites.ts`), nunca como un `WriteBatch` falso; un método nuevo de la clase debe pasar la guardia de `phase4FirestoreReads.test.ts` (escritura por `commitUserDataMutationBatch` o lectura declarada). Todo vive bajo `users/{uid}/{concepts,entries,debts,debtPayments,savingsBuckets,provisionPlans,monthSnapshots}`; los `entries` usan id `${monthKey}_${conceptId}` y las consultas se acotan por `monthKey` (límite Spark). Los mappers Zod de `mappers/firestoreSchemas.ts` validan en ambos sentidos (usar `stripUndefinedFields` antes de escribir). Si cambias esquema o `firestore.rules` (627 líneas el 2026-11-27, deny-by-default, validación de campos), hace falta ADR y actualizar `firestore.indexes.json` si procede. `firebaseConfig.ts` usa caché persistente solo en web (IndexedDB) y en memoria en nativo; no trae ningún proyecto por defecto (ver "Almacenamiento local y configuración por entorno").
- **Doble modo** (`src/platform/`): `mode/runtimeMode.ts` resuelve `mode-a-web | mode-a-expo-go | mode-b-native-ipa`. Los adaptadores con variante nativa se separan por extensión de Metro: `widgetAdapter.ts` (Modo A: valida el `WidgetSnapshotV2` con Zod y lo guarda en memoria) vs `widgetAdapter.native.ts` (Modo B: App Group vía `@bacons/apple-targets` en iOS, módulo local `modules/bflow-widgets` en Android). El contrato `WidgetSnapshotV2` (`platform/widgets/widgetSnapshot.ts`) debe mantenerse sincronizado con los modelos Swift de `targets/widgets/` (un único target de extensión para respetar el límite de 2 App IDs) y con el parser Kotlin de `modules/bflow-widgets`. `GlassSurface` usa `expo-blur` en Modo A (y `View` plano en web).
- **Sistema de diseño** (`src/design-system/`, documentado en `DESIGN.md`): todo color/espaciado/radio/tipografía sale de `useBFlowTheme()`; cifras monetarias con `CurrencyText` (tabular-nums) o con `formatAmount`/`formatSignedAmount` de `useAmountPrivacy()`, nunca con `formatCurrency` directo: el ojo del Resumen oculta todos los montos (`DESIGN.md` §3.1); áreas táctiles ≥ `minTouchTarget` del tema (44 en iOS y Web, 48 en Android); háptica vía `hapticService`, en `onPress` (nunca en `onPressIn`).
  - Editar / Eliminar de una lista: `ActionModeToggleRow` (con `compact` en cabeceras) e `InlineItemActionPill` (con `iconOnly` en filas estrechas), de `design-system/components/ListActionControls.tsx`.
  - Los formularios de movimiento del checklist comparten `MovementAmountField`, `MovementFrequencyField` y `MovementOptionalFields`.
  - Nada de emojis en la interfaz: iconos SVG de `BrandAndThemeIcons` o texto.
  - `TactilePressable` ya no existe: usa `AppPressable`.
- **Curva del mes** (`src/domain/overview/`, `src/features/summary/`): el escenario lo decide el token `skinSpec.curveStage`. Desde el ADR 0032 las tres pieles dibujan la escena three.js/`expo-gl` (ADR 0007 y 0008): iOS y Android la importan directo y Web la carga como fragmento aparte (`MonthlyCurveStageLoader.web.tsx`, ~198 KB gzip tras el primer pintado). Si la escena no puede dibujar (incluida la superficie GL que no llega en `GL_CONTEXT_TIMEOUT_MS`), se usa `MonthlyCurveVectorStage` (SVG animado por `scene/vectorCurveAnimator.ts`) con gesto táctil o puntero. **A prueba en Android:** en Expo Go la superficie de `expo-gl` no refrescaba los cuadros y la curva se veía quieta (ADR 0014); ese fallo no lanza error, así que el respaldo no lo detecta. Si vuelve a pasar, poner `platformSkins.android.curveStage` en `vector`. La curva nunca va dentro de `ScrollRevealSection` (su opacidad y escala aplanaban la escena en iOS). El lienzo es transparente (shaders con color premultiplicado, `setClearColor(…, 0)`) para que la galaxia se vea detrás. La escena importa three.js por módulos (`three/src/...`), nunca la entrada `three` (Metro no hace tree-shaking; lo vigila `scripts/worklet-closure-guard.test.mjs`). Ambas comparten la geometría de `scene/curveGeometry.ts` y los tiempos de `scene/curveMotion.ts`.

- **Movimiento e interacción (Fase 8, ADR 0022, `DESIGN.md` §6.4):** `src/design-system/motion/`.
  - Ningún componente escribe milisegundos, distancias ni curvas: pide una especificación a `motionSpec.ts` (`resolveEntranceSpec`, `resolvePresenceSpec`), que lee `motionDuration` / `motionDistance` / `motionScale` / `motionBySkin` de `tokens.ts`. Se usa `Animated` de React Native con `USE_NATIVE_DRIVER`. La única excepción es el dock de iOS (ADR 0030), que usa Reanimated 4 + Gesture Handler 3.
  - `useBFlowTheme().reducedMotion` es el ajuste del sistema; con él no hay recorrido ni escala. Bajo Jest (`IS_MOTION_STATIC`) todo se pinta en su estado final.
  - `AppPressable` responde al toque por piel (se hunde con resorte en iOS, se hunde sin sobrepaso en Android, pasos en Web). **Android no usa `android_ripple`:** el usuario lo pidió quitar porque dejaba un recuadro gris de esquinas rectas al mantener el dedo. `AppPressable` y en Web convierte `accessibilityState` en `aria-*`, porque `react-native-web` lo descarta. Lo oculto a lectores de pantalla lleva también `aria-hidden`.
  - Los formularios de añadir y editar se abren con `RevealDown` (el espacio se despliega y la tarjeta se asienta después). Otras piezas: `CheckIndicator`, `ProgressFill`, `useReplayOnChange`, `Entrance`.
  - Errores y avisos de formulario: `FormMessage` (sacude, vibra con `error` y se anuncia). Confirmaciones destructivas: `confirmDestructive` de `src/platform/dialogs/`, no `Alert.alert` (en Web no hace nada).
  - Háptica: una por acción, en `onPress`; `warning` para eliminar.
  - Partículas de ambiente (`AmbientParticles`, `DESIGN.md` §6.6): puntos tenues, estrellas que titilan y estrellas fugaces detrás del contenido de `WorkspaceShell`, hechos con `View` planos, en las tres pieles (driver nativo en iOS y Android; keyframes CSS en Web, que react-native-web solo genera desde `StyleSheet.create`), montados 600 ms tras el primer pintado y memoizados, quietos con *Reducir movimiento* y detenidos en segundo plano. Tokens en `ambientParticlesBySkin`.

- **Correos de cuenta (ADR 0025):** los envía Firebase Authentication con sus plantillas; no hay Resend ni códigos de 6 dígitos.
  - `src/platform/auth/accountEmailActions.ts`: `sendPasswordResetLink`, `sendVerificationEmail`, `requestEmailChange` (reautentica y usa `verifyBeforeUpdateEmail`) y `refreshAccountIdentity` (`reload`).
  - El registro envía la verificación y `index.tsx` muestra `EmailVerificationScreen` mientras `requiresEmailVerification(authUser)` sea cierto. Solo se exige a cuentas con contraseña creadas desde `EMAIL_VERIFICATION_ENFORCED_SINCE_MS`.
  - El correo de la cuenta nunca se edita en el store: cambia cuando el usuario abre el enlace, y Firebase cierra entonces la sesión.
  - En tests, espiar `accountEmailActions` (`jest.spyOn`); un usuario con `provider: 'firebase'`, `emailVerified: false` y `emailVerificationRequired: true` activa la puerta.
  - Ningún correo real se ha enviado ni abierto desde este entorno.

- **Seguridad de la cuenta (ADR 0026, `docs/guides/firebase-auth-hardening-guide.md`):**
  - `src/domain/auth/passwordPolicy.ts`: política del registro (8 a 128 caracteres, mayúscula, minúscula, número, carácter especial del conjunto de Firebase, sin espacios en los extremos). Iniciar sesión no la aplica.
  - `src/platform/auth/authRateLimiter.ts`: 5 contraseñas equivocadas bloquean 15 min el inicio de sesión o el cambio de correo (`runPasswordAttempt`); esperas de 60 s entre correos de cuenta y de 30 s entre sincronizaciones manuales. Estado cifrado en `persistentStorage`; es un freno en el cliente, no sustituye a Firebase ni a App Check.
  - Las pantallas muestran la cuenta atrás con `features/auth/hooks/useCountdown.ts`. El aviso de bloqueo es un texto fijo y el tiempo va en el botón: `FormMessage` vibra y se anuncia cada vez que cambia su mensaje.
  - `index.tsx` no sincroniza el presupuesto mientras `requiresEmailVerification(authUser)` sea cierto; lo hace al confirmarse la verificación.
  - En tests, el estado del limitador vive en memoria: reiniciarlo en `beforeEach` con `__resetAuthRateLimiterForTests()` o `persistentStorage.clear()`. Las contraseñas de registro de los tests deben cumplir la política.
  - `firestore.rules` no exige correo verificado (dejaría fuera a las cuentas anteriores, ADR 0026 §2.5) y App Check no está integrado.

- **Almacenamiento local y configuración por entorno (ADR 0027):**
  - `src/platform/storage/secureRandom.ts`: las llaves y los IV salen de WebCrypto o de `expo-crypto` (Hermes no trae WebCrypto). Sin CSPRNG, `randomBytes` lanza `SecureRandomUnavailableError`; no hay respaldo con `Math.random`. Una salida toda en ceros también se rechaza (el `expo-crypto` simulado de Jest devuelve ceros).
  - El token del dispositivo nunca comparte almacén con el cifrado: en nativo solo va al Keychain/Keystore (si falla, queda en memoria; nunca en SQLite) y en Web a `sessionStorage` (por pestaña). Las claves de sesión, que ya son cifrado, sí pueden caer a SQLite.
  - En Web, por eso, la caché local, el estado de `authRateLimiter` y la cola offline no sobreviven a cerrar la pestaña ni se comparten entre pestañas.
  - `resolveFirebaseEnvironment()` devuelve `source`: `environment`, `offline-mock` (tests sin variables y modo vitrina siempre, proyecto `demo-bflow`) o `missing` (build real sin variables: `getFirebaseApp()` lanza). Leer `process.env.EXPO_PUBLIC_*` siempre con acceso estático: Metro no sustituye `env[clave]`.
  - Ya no hay cuenta semilla ni `EXPO_PUBLIC_OWNER_SEED_EMAIL` (ADR 0037). El usuario local de la vitrina y los tests es `DEMO_USER` (`demo@bflow.example`); un test falla si aparece un buzón personal en `src/` fuera de `__tests__`.
  - `build-android.yml` y `build-ios.yml` toman `EXPO_PUBLIC_FIREBASE_*` de las variables del repositorio y `scripts/check-build-env.mjs` corta el build si faltan.
  - `package.json` lleva `overrides` para `@grpc/grpc-js`; dentro de `@bacons/xcode`, `@xmldom/xmldom` y `uuid`; `minimatch` 11 en `@expo/fingerprint` y `glob` 14 en `@bacons/apple-targets` (ADR 0027 §2.5: `npm audit --omit=dev` en 0). No los hagas globales: Jest usa `glob` 7 y 10. `npm ls` marca *invalid* esos `glob` de Jest; es un falso positivo de `overrides`. `zod` es la versión 4.
  - El *pepper* del cifrado local (`DEFAULT_APPLICATION_PEPPER` en `storageCipher.ts`) es público y no se cambia nunca: todo lo guardado en los dispositivos está cifrado con él. Si un build define `EXPO_PUBLIC_LOCAL_CIPHER_PEPPER`, `decryptStorageValue` cae al de por defecto para leer lo anterior (ADR 0027 §2.6).
  - Sin verificar en dispositivo ni en un build: `expo-crypto`, el fallo real de SecureStore y el prebuild de iOS con los `overrides`.

- **App Check (ADR 0038, `src/platform/appCheck/`):** `getFirebaseApp()` llama a `installAppCheck` justo después de `initializeApp`.
  - Web (`installAppCheck.web.ts`): reCAPTCHA Enterprise si hay `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY`.
  - Nativo (`installAppCheck.ts`): con `EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE=1` conecta un `CustomProvider` a la fuente que registre un módulo nativo (`registerNativeAppCheckTokenSource`). Ese módulo no existe: el estado queda `unavailable`.
  - Apagado siempre en tests, modo vitrina y sin proyecto (`resolveAppCheckPlan`). Nunca lanza; `getAppCheckStatus()` da el estado.
  - **No se exige en la consola**: iOS, Android y la lectura REST de los widgets no envían token. Web verificado contra el proyecto real el 2026-11-27 (`X-Firebase-AppCheck` en Identity Toolkit, ADR 0038 §7). El token se guarda en IndexedDB (`firebase-app-check-database`): una recarga no repite `exchangeRecaptchaEnterpriseToken`.
  - El [ADR 0039](docs/decisions/0039-firestore-rules-require-verified-email.md) (exigir `email_verified` en las reglas) está **propuesto, no aplicado**.

- **Carga de la cuenta e historial archivado (ADR 0028):**
  - Con más de 12 meses cerrados en la caché, `loadFullCloudAccount` no vuelve a descargar los `entries` de los meses anteriores (`data/repositories/historyWindow.ts`): lee los meses recientes, los cambios por `updatedAt` y un `count()`. Si el snapshot de un mes archivado cambió o el conteo no cuadra, descarga todo. También aplica a `forceFullSync`.
  - `historySyncedAt` (en `FullCloudAccountData` y en la caché) marca la última carga de la nube; `savePersistedAccount` la conserva en los guardados del store. Toda escritura nueva en `entries` debe llevar `updatedAt`, o la ventana no verá el cambio.
  - `triggerWidgetSync` agrupa las llamadas del mismo tick y calcula el snapshot en una microtarea: en un test, espera la promesa (o `await Promise.resolve()`) antes de comprobar el widget.
  - Los formularios con campos de texto tienen su propio estado y se montan con una `key` nueva al abrirse (`DebtForm`, `SavingsBucketForms`, `ProvisionItemForm`, `AccountProfileForms`, como los del checklist): no subir ese estado a la vista.
  - Sin verificar contra Firestore real ni el emulador: `getCountFromServer` y la consulta por `updatedAt`.

- **Dock de iOS (ADR 0030):** `FloatingLiquidGlassDock` elige `dock/LiquidGlassDock` (iOS) o `dock/FlatPillDock` (Android, ADR 0024); comparten `dock/dockGeometry.ts`.
  - El lente, el hundimiento de la cápsula, el arrastre y el aumento de los iconos son worklets en el hilo de UI; a JS solo vuelven la háptica y el color al cruzar pestaña, la selección al soltar y el encendido del vidrio del lente (`scheduleOnRN`, una microtarea). El toque selecciona en el `onPressIn` de la pestaña.
  - **Regla de worklets (causa de que Expo Go abortara al arrancar):** un worklet nunca lee una variable capturada en un parámetro por defecto (`tabCount = DOCK_TABS.length`). El plugin evalúa los parámetros antes de desempaquetar `this.__closure`; en el runtime de UI eso es un `ReferenceError` y una compilación de producción (Expo Go, `.ipa`) se cierra sin mensaje. En Jest y en web no falla. Lo vigila `scripts/worklet-closure-guard.test.mjs`. Los worklets del dock viven en `LiquidGlassDock.tsx`; `dockGeometry.ts` es solo JS (paridad comprobada por test).
  - Material: `src/platform/glass/LiquidGlassMaterial(.native).tsx` (`GlassView` en iOS 26+, `BlurView` antes, opaco con *Reducir transparencia*; variante `none` para vidrio apagado). Con vidrio del sistema no se dibujan bordes ni brillos propios, y el vidrio nunca anima su opacidad.
  - Iconos: el aumento anima el `viewBox` de un `Svg` animado (`WorkspaceNavIcons` acepta `svgComponent`/`svgProps`), nunca un `scale`: el SVG escalado o fundido se veía pixelado en el iPhone.
  - Jest: `jest.config.js` usa el resolver de Reanimated y `jest.setup.js` (Gesture Handler, Worklets y `expo-glass-effect` simulados). Los tests del dock de iOS usan temporizadores falsos (`jest.advanceTimersByTime`) para que los estilos animados se apliquen, leen `getAnimatedStyle` y arrastran con `createGestureController(getByGestureTestId('dock-pan-gesture'))`. Para el vidrio del sistema, `jest.spyOn` sobre `isLiquidGlassAvailable` y `__resetLiquidGlassAvailabilityForTests()`; el `afterEach` de la suite devuelve el mock a `false`.
  - Verificado en iPhone 16 Pro con iOS 27.2 y Expo Go 58.0.5. Sin verificar: el respaldo en iOS < 26 y el `.ipa`.

- **Tarjetas de crédito y cuentas débito (ADR 0034):** `src/domain/accounts/financialAccounts.ts`, `createAccountsSlice`, colección `users/{uid}/financialAccounts`.
  - El saldo no se guarda: sale de `openingBalance` (al inicio de `openingMonthKey`) más los `entries` completados con `accountId`. En débito, el ingreso suma y el gasto resta. En crédito, el gasto es compra salvo `accountRole: 'payment'`, y el ingreso es abono. `applyEntryAccountLink` guarda el rol solo en gastos con tarjeta de crédito.
  - `financialAccounts` es una lista única (no por mes). Está en `PERSISTED_ACCOUNT_FIELDS` y en `buildPersistedAccountData` (los dos en `persistedAccountFields.ts`): si añades otro campo persistido, ponlo en los dos.
  - Las tarjetas no suman al "Total Deudas" ni a los snapshots: los tests dorados no cambian.
  - Eliminar una cuenta deja el `accountId` en los movimientos; el dominio ignora los ids sin cuenta.
  - Deudas muestra las tarjetas y las cuentas corrientes; Ahorros, las cuentas de ahorros (`debitKind: 'savings'`). Filtrar con `useFinancialAccounts(scope)` / `useFinancialAccountsSummary(scope)` (`'debts' | 'savings' | 'all'`); movimientos y Cierre usan `'all'`. Una cuenta débito sin `debitKind` es corriente.
  - En **+ Nueva Deuda** (`DebtForm`), el selector Deuda / Crédito / Débito (solo corriente) aparece al registrar y si se pasa `onCreateAccount`. En Ahorros, **+ Nuevo Ahorro** (`SavingsForm`) elige Fondo o Cuenta de ahorros.
  - El onboarding usa los mismos dos formularios (ADR 0034 §2.5): tarjetas y cuentas corrientes en el paso de deudas, cuentas de ahorros en el de ahorros, y sus movimientos se vinculan con `accountKey`/`accountRole`. `completeInitialAccountSetup` las construye con `buildFinancialAccount` y las envía en `InitialAccountSetupPayload.financialAccounts` (opcional, para leer colas guardadas antes).
  - `FinancialAccountFormFields` y `FinancialAccountCard` viven en `src/features/accounts/components/`. El tipo de débito lo fija quien abre el formulario (prop `debitKind`).
  - El saldo de las cuentas de ahorros no suma a `totalCurrentSavings`: la tarjeta principal de Ahorros lo muestra aparte.
  - Cierre muestra lo gastado y lo pagado por cuenta en `AccountsMonthPanel`, solo si hay cuentas en el mes.
  - `loadFullCloudAccount` hace una consulta más: `phase4FirestoreReads.test.ts` espera 7 `getDocs` y 35 documentos.
  - Sin verificar contra el emulador ni en un dispositivo.

- **Gráficos (Fase 6, ADR 0020):** `src/design-system/components/charts/` (`BarChart`, `LineChart` y `DonutChart` con `react-native-svg`, animados por `chartTransition.ts`), con datos de `src/domain/analytics/chartSeries.ts`:
  - Un mes cerrado anterior al activo lee su snapshot. El mes activo, aunque esté cerrado, y los meses abiertos se calculan en vivo, igual que las tarjetas.
  - La ventana es de 6 meses hasta el mes activo. Cada gráfico muestra los que caben con el objetivo táctil completo por columna (`useChartWindow`).
  - Los gráficos aparecen en Cierre (`AnalyticsChartsPanel`), Deudas (`DebtTrendChart`) y Ahorros (`SavingsTrendCharts`, solo la evolución apilada), alimentados por `useChartHistory`.
  - Los tramos sin significado financiero usan `colors.chart.categorical`.
  - En los tests, el SVG está oculto para accesibilidad: búscalo con `{ includeHiddenElements: true }`.

- **Widgets (Fase 7, ADR 0021):** 5 widgets (flujo neto, resumen, pendientes, deudas, ahorros) en iOS (`targets/widgets`, SwiftUI) y Android (`modules/bflow-widgets`, módulo Expo local con RemoteViews + WorkManager, lo descubre el autolinking).
  - Solo TypeScript calcula: `buildWidgetSnapshot` reutiliza `buildMonthlyHistory`; el mes del widget es el mes en curso (`resolveWidgetMonthKey`), no la pestaña abierta.
  - Mismo teléfono: `triggerWidgetSync` escribe y repinta al instante. Otros dispositivos: el store sube (debounce 1,5 s) `users/{uid}/widgetSnapshots/current` y los widgets lo leen por REST cada ~15 min o con «Actualizar», con el refresh token que entrega `widgetAuthBridge`. Al cerrar sesión se borra todo con `clearWidgetData`.
  - Campo nuevo en el contrato = cambiar Zod, `WidgetSnapshotModels.swift` y `model/WidgetSnapshot.kt` a la vez. Tests JVM: `cd android && ./gradlew :bflow-widgets:testDebugUnitTest` (CI no corre Gradle).

## Multiplataforma: tres pieles (ADR 0010 y 0011)

Reglas vinculantes en `AGENTS.md` §7; tokens y breakpoints en `DESIGN.md` §10 y §11; pasos en `docs/guides/multiplatform-validation-guide.md`.

- **Piel = plataforma.** `useBFlowTheme()` devuelve `skin` (`ios` Liquid Glass · `android` Material 3 · `web` plano; iOS y Android comparten el dock flotante), `skinSpec` y los tokens de esa piel (`palettesBySkin`, `radiusBySkin`, `typographyBySkin` en `tokens.ts`). Los exports sueltos `palettes`, `radius` y `typography` son la piel iOS y existen solo por compatibilidad. `colors.glass.*` conserva el nombre, pero en Android y Web es un relleno **opaco**.
- **Las features no ramifican por plataforma.** La diferencia vive en: `GlassSurface` (material), `AppPressable` (respuesta al toque / hover / objetivo táctil), `usePrimaryActionLook` (botón principal), `WorkspaceShell` y `FloatingLiquidGlassDock` (dock de iOS y de Android; en Android es opaco y cambia el lente por una píldora plana, ADR 0024) y `design-system/components/navigation/` (`WebAppHeader` + `WebTabBar`). Todas comparten `WORKSPACE_TABS` y los testID `workspace-tab-<id>`.
- **Responsive.** `useResponsiveLayout()` (función pura `resolveResponsiveLayout`): clases `compact` < 600 ≤ `medium` < 840 ≤ `expanded`, columna centrada con tope 560 / 600 / 1280, márgenes Web 24 / 48 / 80. `ResponsiveColumns` reparte paneles; `minCardWidthForAmounts` decide si dos tarjetas con cifras comparten fila. Ancho mínimo 320. No usar `Dimensions.get` ni anchos fijos en features.
- **Tests por piel.** Jest corre como iOS: sin `skin` el proveedor entrega la piel iOS. Forzar con `<BFlowThemeProvider skin="android" | "web">` y cambiar el ancho con `Dimensions.set({ window, screen })` dentro de `act`. Si un test cierra sesión o activa el onboarding, restaurar el store en `beforeEach` (`useBudgetStore.setState({ authUser: DEMO_USER, needsOnboarding: false })` antes de `resetToSampleWorkspace()`). Para probar con un usuario de la nube sin perder el ejemplo, `resetToSampleWorkspace()` y luego `useBudgetStore.setState({ authUser })`: `setAuthUser` con otra cuenta vacía el workspace. Referencias: `features/shell/__tests__/workspacePlatforms.test.tsx`, `design-system/__tests__/skinTokens.test.ts`.
- **Modo vitrina** (`platform/mode/demoMode.ts`, `EXPO_PUBLIC_BFLOW_DEMO=1`): `resolveDefaultInitialAuthUser` devuelve `DEMO_USER` con el presupuesto de ejemplo del mes actual, `index.tsx` no se suscribe a Firebase Auth y, como ese usuario no es "real", ninguna acción escribe en Firestore. `?skin=` y `?theme=` solo se leen en este modo. No definir la variable en builds reales.
- **Sin verificar en dispositivo Android:** la piel Android se validó con tests y en el navegador. La respuesta al toque, los insets de borde a borde, la háptica y el dock flotante (sombra, arrastre de la píldora, separación de la barra de gestos) están pendientes de prueba en hardware.
- **Skill `design-taste-frontend`:** se aplicó su sistema a la piel Web, no sus scripts (`consistency.mjs`, `check.mjs`), que solo leen HTML estático. `.taste-skill/history.json` guarda lo repartido.
- **Shell de este entorno:** los heredocs de bash con comillas invertidas fallan; para ediciones grandes, escribir un script `.mjs` con la herramienta de archivos y ejecutarlo con `node`.

## CI / entorno

- `ci.yml` (ubuntu, Node 22, push a `main`/`develop` y PR a `main`): fixture dorado → tests de scripts y guardias de workflows → guardia de tests (solo PR) → `typecheck` → `lint` → caché `.jest-cache` → `npm test -- --coverage --ci`. `release.yml` (manual, ADR 0023) llama a los dos builds como workflows reutilizables. `build-ios.yml` genera el `.ipa` sin firmar en macOS para `iloader` y `build-android.yml` el `.apk`/`.aab` con keystore de depuración (cambios en ambos requieren ADR). Con el ADR 0029: `ci.yml`, `build-ios.yml` y `build-android.yml` usan `concurrency` (`cancel-in-progress: true`) y cachean `.jest-cache`; los dos builds declaran `paths-ignore` en `docs/**`/`*.md` y omiten su `quality-gate` en `push` a `main` para no triplicarlo respecto a `ci.yml`; `build-ios.yml` cachea CocoaPods con `ios/Podfile` + `package-lock.json`, usa `ccache` y `COMPILER_INDEX_STORE_ENABLE=NO`; `build-android.yml` unifica `./gradlew assembleRelease bundleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,armeabi-v7a` con `org.gradle.caching=true` y `org.gradle.parallel=true`.
- **Release de Android y R8 (ADR 0013):** el `.apk` se compila con R8 (`android.enableMinifyInReleaseBuilds=true` en la plantilla del SDK) y Expo Go no, así que un fallo de minificación solo aparece en el `.apk`. `android/` no está en git: las reglas keep viven en `plugins/withAndroidKeepRules.js` (declarado en `app.json`, tests en `plugins/__tests__/`). Hoy conserva `expo.modules.gl.**`, porque `expo-gl` busca `GLContext.flush()` por nombre vía JNI y no trae reglas de consumidor; sin la regla la app se cierra al montar el primer `GLView` (el Resumen, justo tras iniciar sesión).
- **Runtime de expo-modules (ADR 0019):** los módulos de Expo llegan como AAR precompilados (`node_modules/<pkg>/local-maven-repo`) y deben coincidir con el `expoModulesV2Version` de `expo-modules-core`. Si no coinciden, el `.apk` se cierra al abrir (`Cannot find native module 'ExpoSQLite'`), pero Expo Go funciona. Al actualizar un módulo de Expo, actualiza también `expo` (`npx expo install --fix`). La guardia es `plugins/__tests__/expoModulesRuntimeVersion.test.js`. Para compilar el release en este Windows (ruta con espacio) ver ADR 0019 §4.1.
- `.env` está ignorado; la plantilla es `.env.example`. Si cambias variables de entorno o dependencias, actualiza `.env.example`, `package.json` y `README.md`.
- `scripts/setup-claude.sh` enlaza `.agents/skills` → `.claude/skills` y `.agents/workflows` → `.claude/commands` (junctions en Windows) y fija `core.hooksPath=.githooks`; ese directorio todavía no existe en el repo.
- Las cifras de `README.md` y `PERF_BASELINE.md` §2 y §4 (tests, cobertura, líneas de `firestore.rules`, versiones, peso de los iconos) se midieron el 2026-11-27 y envejecen: vuelve a medirlas antes de citarlas.
