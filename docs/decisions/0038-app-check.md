# 0038. Firebase App Check: reCAPTCHA Enterprise en Web y espera documentada en iOS y Android

- **Estado:** Aceptado. Web integrado y verificado contra el proyecto real el 2026-11-27 (§7), en modo supervisión, sin exigir. iOS y Android: aplazado, con el punto de enganche en código.
- **Fecha:** 2026-11-27
- **Contexto:** Fase 5 del [plan consolidado](../Improvements/AUDITS/plan_consolidado_pendientes_auditorias.md) (hallazgo `AUD-01` de la [auditoría de producción](../Improvements/AUDITS/auditoria_produccion_bflow.md)). Aplica `AGENTS.md` §5.2, puntos 1 (módulo nuevo: `firebase/app-check`) y 2 (cambia lo que Firestore acepta). Continúa los ADR [0026](0026-auth-hardening-password-policy-and-usage-limits.md) y [0027](0027-local-crypto-hardening-env-config-and-dependencies.md).
- **Autores:** Security Auditor, Architect, DevOps y Documentation Expert
- **Tipo Diátaxis:** Explanation

---

## 1. Contexto y problema

El limitador de intentos (`authRateLimiter.ts`, ADR 0026) solo frena a quien usa la app. La configuración de Firebase viaja en el bundle (ADR 0027 §2.3), así que cualquiera puede llamar a Firebase Auth y a Firestore con un script y saltarse esos límites. Las reglas de Firestore protegen los datos de cada usuario, pero no impiden crear cuentas en masa, probar contraseñas contra Identity Toolkit ni gastar la cuota diaria del plan Spark.

App Check añade a cada petición un token que prueba que viene de la app auténtica. Firebase lo valida y, cuando se exige (*enforce*), rechaza las peticiones sin token válido.

Restricciones de BFlow que deciden el diseño:

1. **SDK de JavaScript en las tres plataformas.** No se usa `@react-native-firebase`; Expo Go (Modo A) no puede cargar módulos nativos.
2. **Plan Spark.** No hay Cloud Functions, así que no hay un servidor propio que pueda emitir tokens de App Check.
3. **iOS con cuenta de Apple gratuita y `iloader`.** Máximo 2 App IDs (`app` y `widgets`, `AGENTS.md` §2). El `.ipa` se firma en el equipo de cada usuario con su propio equipo personal (*Personal Team*), con caducidad de 7 días.
4. **Android con keystore de depuración.** `build-android.yml` firma el `.apk` y el `.aab` con el keystore de depuración de la plantilla, que es público. La app no está publicada en Google Play.
5. **Los widgets leen Firestore por REST** (ADR 0021) con el token de sesión que entrega `widgetAuthBridge`, sin el SDK de JavaScript.

## 2. Opciones evaluadas por plataforma

| Plataforma | Opción | ¿Viable hoy? | Motivo |
| :--- | :--- | :---: | :--- |
| Web | `ReCaptchaEnterpriseProvider` de `firebase/app-check` | **Sí** | Funciona con el SDK de JavaScript. Firebase lo recomienda frente a reCAPTCHA v3. Sin coste hasta 10.000 evaluaciones al mes; por defecto el token se renueva dos veces por hora (fuentes en §8). |
| Web | `ReCaptchaV3Provider` | Sí, descartada | Firebase recomienda Enterprise para integraciones nuevas. |
| iOS | App Attest o DeviceCheck vía `@react-native-firebase/app-check` | **No** | Exige el SDK nativo de Firebase (y `GoogleService-Info.plist`), que no corre en Expo Go. App Attest exige la capacidad en el App ID y que Firebase registre el *Team ID* de la app; con `iloader` cada usuario firma con su propio *Personal Team*, así que no hay un *Team ID* estable que registrar. DeviceCheck pide una clave privada creada en una cuenta de Apple Developer. Que una cuenta gratuita no admita la capacidad App Attest es `needs_validation`. |
| iOS / Android | `CustomProvider` del SDK de JavaScript con un servidor propio | **No** | El servidor tendría que validar la atestación y emitir el token con `createToken()` del Admin SDK. Sin Cloud Functions (Spark), no hay dónde ejecutarlo. |
| Android | Play Integrity vía `@react-native-firebase/app-check` | **No** | Exige el SDK nativo, vincular un proyecto de Play Console al de Firebase y registrar la huella SHA-256 del certificado de firma. Con el keystore de depuración, que es público, cualquiera podría firmar un APK con la misma huella. |
| Todas | Token de depuración incrustado en el bundle | **No** | Quien lo extraiga del `.apk` o del JavaScript de Web salta App Check: equivale a no tenerlo. Solo sirve en desarrollo. |

## 3. Decisión

### 3.1. Web: reCAPTCHA Enterprise, activado por variable

- `src/platform/appCheck/installAppCheck.web.ts` llama a `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true })`.
- `getFirebaseApp()` (`src/data/firebase/firebaseConfig.ts`) lo instala justo después de `initializeApp` y antes de Auth y Firestore, para que sus llamadas ya lleven la cabecera `X-Firebase-AppCheck`. `getAppCheckStatus()` devuelve el estado del proceso.
- La clave de sitio llega por `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY`. Es pública (reCAPTCHA la expone en la página) y se lee con acceso estático, como el resto de `EXPO_PUBLIC_*`.
- Sin clave, en tests, en modo vitrina o sin proyecto Firebase, App Check queda apagado (`resolveAppCheckPlan`, función pura en `appCheckConfig.ts`).
- Si el SDK lanza al iniciar, el estado es `failed` y la app sigue sin App Check: mientras la consola esté en modo supervisión, Firestore acepta la petición.

### 3.2. iOS y Android: punto de enganche detrás de `EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE`

- `src/platform/appCheck/installAppCheck.ts` (variante nativa) no hace nada salvo con `EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE=1`.
- Con la variable, espera a que un módulo nativo de atestación registre su fuente de tokens con `registerNativeAppCheckTokenSource(() => Promise<{ token, expireTimeMillis }>)` y la conecta a un `CustomProvider`. Si ningún módulo la registró, el estado es `unavailable` y no se llama al SDK.
- Ese módulo no existe todavía. Su llegada exige otro ADR y depende de cambiar alguna restricción de §1: cuenta de Apple Developer o distribución por Google Play (proveedores nativos), o plan Blaze (servidor que emita tokens).
- **Hoy ningún build define la variable.** `.env.example` la deja vacía y los workflows no la pasan.

### 3.3. Qué no se exige y por qué

**No se exige App Check en ningún producto mientras iOS y Android no envíen tokens.** Exigirlo en Cloud Firestore o en Authentication bloquearía a todos los usuarios de iOS y Android, y a los widgets (§1.5), que no tienen SDK de App Check. App Check se exige por producto, no por plataforma: no se puede exigir solo a Web.

Lo que sí aporta hoy: las métricas de la consola separan las peticiones de Web verificadas de las demás, y el trabajo de Web ya está hecho para cuando se pueda exigir.

## 4. Cómo pasar a *enforce* sin bloquear a los usuarios actuales (`needs_validation`)

Lo hace el propietario del proyecto Firebase; nada de esto se ha ejecutado desde el repositorio. Pasos en la [guía de endurecimiento](../guides/firebase-auth-hardening-guide.md) §3.

1. **Web, en modo supervisión.**
   1. Google Cloud Console → *reCAPTCHA* → crear una clave de sitio de tipo *Website* con los dominios de la app web. Añade `localhost` solo si se va a probar `npm run web` contra el proyecto real.
   2. Firebase Console → *App Check* → *Apps* → la app web → *reCAPTCHA Enterprise* → pegar la clave de sitio.
   3. Definir `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY` en el `.env` (y en el entorno del despliegue web) y publicar.
   4. Comprobar en *App Check → APIs* que las peticiones de Web de Cloud Firestore y Authentication aparecen como **verificadas**. No pulsar *Enforce*.
2. **Nativo** (requiere el ADR del módulo de §3.2): registrar las apps iOS y Android con su proveedor, publicar builds con `EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE=1` y esperar a que los usuarios actualicen. Los `.ipa` firmados con `iloader` caducan a los 7 días, así que en una semana no debería quedar ninguno anterior.
3. **Widgets:** que la lectura REST envíe el token de App Check, o mover esa lectura a otro producto. Sin esto, exigirlo en Firestore deja los widgets sin datos de otros dispositivos.
4. **Exigir** cuando las métricas de los últimos 7 días muestren casi todo el tráfico como *verified* y lo *outdated client* sea residual. Primero Cloud Firestore; después Authentication, cuyo soporte de App Check sigue en vista previa. Firebase avisa de que la exigencia tarda hasta 15 minutos en aplicarse y rechaza todas las peticiones sin verificar.
5. **Vuelta atrás:** *Unenforce* en la misma pantalla. No hace falta publicar otro build.

## 5. Alternativas descartadas

- **`@react-native-firebase/app-check` ya.** Rompe el Modo A (Expo Go), obliga a mantener los archivos nativos de configuración de Firebase y, con las restricciones de §1, no produce tokens válidos en iOS ni en Android.
- **Exigir solo con Web integrado.** Bloquea iOS, Android y widgets (§3.3).
- **Token de depuración en los builds.** §2, última fila.
- **No integrar nada hasta tener nativo.** Web es la superficie más fácil de automatizar contra Firebase y la integración no cuesta nada mientras no haya clave.

## 6. Consecuencias

- **Bundle:** `firebase/app-check` entra en los tres bundles. Metro no hace *tree-shaking*, así que el bundle de Android también lleva el código de reCAPTCHA, que no se ejecuta. No se midió el aumento de tamaño.
- **Web, con clave:** al iniciar Firebase se carga `https://www.google.com/recaptcha/enterprise.js` y se dibuja un widget invisible: el SDK lo mete en un `div` con `display: none` (`makeDiv` de `@firebase/app-check`) y usa una clave por puntuación, sin desafío. **El usuario no ve nada**, ni siquiera la insignia de reCAPTCHA. Pendiente (`needs_validation`): las condiciones de reCAPTCHA permiten ocultar la insignia si el flujo muestra su aviso de marca («Este sitio está protegido por reCAPTCHA y se aplican la Política de privacidad y las Condiciones del servicio de Google»); falta confirmarlo para Enterprise y, si aplica, añadir ese texto a `AuthScreen` en Web. Si algún día se añade una CSP, tendrá que permitir ese origen.
- **Coste:** cada renovación del token es una evaluación de reCAPTCHA Enterprise. Con la renovación por defecto (dos por hora), 10.000 evaluaciones al mes dan para unas 5.000 horas de pestañas abiertas; por encima se cobra. Se puede alargar el TTL del token en la consola.
- **Tests:** `src/platform/appCheck/__tests__/appCheck.test.ts` (plan por plataforma, instalación Web y nativa, errores del SDK) y `src/data/__tests__/firebaseAppCheckWiring.test.ts` (`getFirebaseApp` lo instala una sola vez, con el origen de la configuración).

## 7. Verificación de la Fase 5

Medido el 2026-11-27 en la rama `chore/store-readiness`:

| Verificación | Resultado |
| :--- | :--- |
| `npm audit --omit=dev` | **0 vulnerabilidades** (antes: 8 moderadas). Ver [ADR 0027 §2.5](0027-local-crypto-hardening-env-config-and-dependencies.md#25-dependencias) |
| `npm audit` (con desarrollo) | 9 moderadas, todas en `glob` 10.5.0 y `minimatch` 9.0.9 / 10.2.6 de `jest-expo` y `@jest/globals` (cobertura de Jest). No van en ningún build |
| `npx expo export --platform web` con una clave de prueba | La clave y el cargador `recaptcha/enterprise.js` están en el bundle |
| `npx expo export --platform android` | Compila |
| `npm run typecheck` · `npm run lint` | 0 errores · 0 errores (322 archivos) |
| `npm test -- --coverage --ci` | 124 suites, 1.542 tests, 0 fallos; 98,88 % de sentencias y 99,03 % de líneas en `src/domain/` |
| `npm run test:scripts` · `npm run test:phase0` | 37/37 · 3/3 |

**Verificado por el propietario el 2026-11-27** con `npm run web` (`localhost:8081`, Edge 158) contra el proyecto real, con la clave de reCAPTCHA Enterprise creada y la app web registrada en App Check:

- En la pantalla de inicio de sesión se cargan `enterprise.js`, `recaptcha__es_419.js` y el `iframe` `anchor?…&k=<clave de sitio>`.
- Tras iniciar sesión, `accounts:signInWithPassword` y `accounts:lookup` (Identity Toolkit) llevan la cabecera `X-Firebase-AppCheck` con un token emitido por Firebase, cuyo `sub` es el id de la app web. Firebase solo lo emite si acepta la atestación.
- Al recargar no se repite `exchangeRecaptchaEnterpriseToken`: el SDK reutiliza el token guardado en IndexedDB (`firebase-app-check-database`) hasta que caduca.
- El panel *Problemas* de Edge avisa de una CSP que bloquea `eval`. Es la CSP del documento de reCAPTCHA servido por Google (`Content-Security-Policy-Report-Only` en sus respuestas), no de BFlow, que no define ninguna CSP.

**Sin verificar** (`needs_validation`): las métricas de *App Check → APIs* (tardan horas en llenarse) y la cabecera en las peticiones de Cloud Firestore, que viaja dentro del parámetro `$httpHeaders` de su canal.

## 8. Fuentes

Documentación oficial consultada el 2026-11-27:

- [App Check con reCAPTCHA Enterprise en apps web](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
- [Visión general de App Check](https://firebase.google.com/docs/app-check)
- [Supervisar las métricas de App Check](https://firebase.google.com/docs/app-check/monitor-metrics) y [activar la exigencia](https://firebase.google.com/docs/app-check/enable-enforcement)
- [Proveedor personalizado de App Check](https://firebase.google.com/docs/app-check/custom-provider) (emisión de tokens con `createToken()`, TTL de 30 minutos a 7 días)
- [App Attest](https://firebase.google.com/docs/app-check/ios/app-attest-provider), [DeviceCheck](https://firebase.google.com/docs/app-check/ios/devicecheck-provider) y [Play Integrity](https://firebase.google.com/docs/app-check/android/play-integrity-provider)
- [App Check en React Native Firebase](https://rnfirebase.io/app-check/usage)
