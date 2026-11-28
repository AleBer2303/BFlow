# Cómo endurecer Firebase Authentication en la consola

> **Tipo Diátaxis:** How-To Guide. Objetivo: activar en el proyecto de Firebase los controles de seguridad que la app no puede aplicar por sí sola.
>
> Contexto y decisiones: [ADR 0026](../decisions/0026-auth-hardening-password-policy-and-usage-limits.md), [ADR 0025](../decisions/0025-firebase-auth-account-emails.md), [ADR 0038](../decisions/0038-app-check.md) (App Check) y [ADR 0039](../decisions/0039-firestore-rules-require-verified-email.md) (correo verificado en las reglas, propuesto).
>
> **Estado:** ninguno de estos pasos se ha ejecutado desde este repositorio (`needs_validation`). Los datos de Firebase salen de su documentación oficial, consultada el 2026-11-13 y, para App Check, el 2026-11-27; los nombres de los menús de la consola pueden cambiar.

La app valida la contraseña al crear la cuenta y limita los intentos en el dispositivo. Eso no cubre dos casos: la página donde se escribe la contraseña nueva tras un restablecimiento, que la aloja Firebase, y las llamadas a Firebase hechas por fuera de la app.

## 1. Política de contraseñas

Así la página de restablecimiento exige lo mismo que el formulario de registro.

1. Abre la consola de Firebase, proyecto de BFlow.
2. Ve a **Authentication → Settings → Password policy**.
3. Marca los requisitos con los valores de `src/domain/auth/passwordPolicy.ts`:

| Requisito en la consola | Valor |
| :--- | :--- |
| Longitud mínima | 8 |
| Longitud máxima | 128 |
| Carácter en mayúscula | Sí |
| Carácter en minúscula | Sí |
| Carácter numérico | Sí |
| Carácter no alfanumérico | Sí |

4. Elige el modo de aplicación:
   - **Require:** el registro y el restablecimiento fallan si la contraseña no cumple.
   - **Notify:** se acepta la contraseña y Firebase informa de lo que falta.
5. **No actives «Force upgrade on sign-in»** mientras haya cuentas con contraseñas anteriores a la política: les impediría entrar hasta cambiarla. Firebase recomienda no activarlo salvo que se quiera bloquear a esos usuarios.

Qué esperar:

- Firebase acepta longitudes mínimas de 6 a 30 y máximas de hasta 4096.
- Firebase cuenta como no alfanuméricos estos caracteres: `^ $ * . [ ] { } ( ) ? " ! @ # % & / \ , > < ' : ; | _ ~`. La app usa el mismo conjunto. `+`, `-` y `=` no cuentan.
- La regla «sin espacios al inicio ni al final» solo existe en la app.
- Si Firebase rechaza una contraseña, la app muestra «La contraseña no cumple los requisitos de seguridad».

Comprobación: pide un restablecimiento desde la app, abre el enlace e intenta guardar `abc12345`. Con el modo **Require** la página debe rechazarla.

## 2. Protección contra enumeración de correos

1. Ve a **Authentication → Settings → User actions**.
2. Comprueba que **Email enumeration protection** esté activado.

Firebase lo activa por defecto en proyectos creados desde el 15 de septiembre de 2023. Con la protección activa, un correo sin cuenta y una contraseña equivocada responden igual. La app ya trata los dos casos igual.

## 3. App Check

App Check hace que Firebase solo atienda a la app auténtica. Es el control contra quien salte los límites del dispositivo llamando a Firebase por fuera. Decisión y alternativas en el [ADR 0038](../decisions/0038-app-check.md).

**Estado del código:**

| Plataforma | Integración | Cómo se activa |
| :--- | :--- | :--- |
| Web | reCAPTCHA Enterprise (`src/platform/appCheck/installAppCheck.web.ts`) | `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY` |
| iOS y Android | Solo el enganche: falta un módulo nativo que emita tokens | `EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE=1` (hoy queda `unavailable`) |
| Widgets (lectura REST de otros dispositivos) | Ninguna | — |

**No pulses *Enforce* en ningún producto todavía.** App Check se exige por producto, no por plataforma: exigirlo en Cloud Firestore o en Authentication bloquearía a todos los usuarios de iOS y Android y dejaría los widgets sin datos de otros dispositivos.

### 3.1. Activar Web en modo supervisión

1. **Google Cloud Console** (mismo proyecto que Firebase) → **Security → reCAPTCHA** → **Create key**: tipo *Website*, con los dominios donde se publica la app web. Añade `localhost` solo si vas a probar `npm run web` contra el proyecto real.
2. **Firebase Console → App Check → Apps** → la app web → **reCAPTCHA Enterprise** → pega la clave de sitio → **Save**.
3. Pon la clave en `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY` (`.env` y entorno del despliegue web) y vuelve a publicar la web.
4. Comprobación (herramientas del navegador → **Red**, con **Conservar registro** y el filtro en **Todo**):
   1. En la pantalla de inicio de sesión, filtra por `recaptcha`: deben aparecer `enterprise.js` y `anchor?…&k=<tu clave>`.
   2. Inicia sesión y filtra por `identitytoolkit`. En `accounts:signInWithPassword` → **Encabezados de solicitud** debe estar `X-Firebase-AppCheck: eyJ…`. En Cloud Firestore la cabecera viaja dentro del parámetro `$httpHeaders` de la URL, así que es más fácil comprobarla en Auth.
   3. La petición `…:exchangeRecaptchaEnterpriseToken` (filtro `firebaseappcheck`) solo aparece cuando no hay token guardado. Para verla, borra en **Aplicación → IndexedDB** la base `firebase-app-check-database` y recarga: debe responder **200**.
   4. El panel **Problemas** puede avisar de una CSP que bloquea `eval`. Es del `iframe` de reCAPTCHA (Google), no de BFlow: ignóralo.
   5. En **App Check → APIs → Cloud Firestore** y **Authentication**, las peticiones de Web deben aparecer como *Verified* en unas horas.

### 3.2. Pasar a *enforce* sin bloquear a los usuarios actuales

Solo cuando se cumplan las tres condiciones:

1. iOS y Android envían tokens: existe el módulo nativo (ADR nuevo), las apps están registradas en **App Check → Apps** con su proveedor y los builds se publican con `EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE=1`. Los `.ipa` firmados con `iloader` caducan a los 7 días, así que en una semana no queda ninguno anterior; los `.apk` hay que esperar a que se actualicen.
2. La lectura REST de los widgets envía el token o deja de depender de Firestore.
3. En **App Check → APIs**, los últimos 7 días muestran casi todo el tráfico como *Verified*, y *Outdated client* (sin token) es residual.

Entonces:

1. **Cloud Firestore → Enforce.** Firebase avisa de que tarda hasta 15 minutos en aplicarse.
2. Comprueba el inicio de sesión y la sincronización en Web, iOS y Android.
3. Después, **Authentication → Enforce** (su soporte de App Check sigue en vista previa).
4. **Vuelta atrás:** **Unenforce** en la misma pantalla; no hace falta publicar otro build.

Datos a tener en cuenta: reCAPTCHA Enterprise no tiene coste hasta 10.000 evaluaciones al mes y el SDK renueva el token dos veces por hora (cada renovación es una evaluación); en el plan Spark solo hay cuatro umbrales de puntuación (0,1, 0,3, 0,7 y 0,9); Play Integrity tiene una cuota diaria de 10.000 llamadas en su nivel estándar.

## 4. Reglas de Firestore para cuentas sin verificar (propuesto, sin aplicar)

`firestore.rules` no exige correo verificado. El motivo está en el ADR 0026 §2.5: dejaría sin acceso a las cuentas anteriores al 13 de noviembre de 2026, que están exentas de la verificación.

El [ADR 0039](../decisions/0039-firestore-rules-require-verified-email.md) propone cómo hacerlo sin dejarlas fuera: inventario con el Admin SDK, aviso en la app, un *custom claim* `bflowLegacyUnverified` para las que no verifiquen, la regla nueva y tests en el emulador. **No cambies las reglas hasta que el ADR esté aprobado.** Lo primero que pide es el inventario:

1. En **Authentication → Users**, filtra por proveedor *Email/Password* y cuenta las cuentas sin verificar creadas antes del 13 de noviembre de 2026.
2. Si son cero, el ADR se simplifica: no hacen falta los claims.

## 5. Restringir la clave de API

En **Google Cloud Console → APIs & Services → Credentials**, limita la clave de API de Firebase a las APIs que usa la app (Identity Toolkit, Token Service y Cloud Firestore) y a los identificadores de la app y los dominios web autorizados.

Hazlo con cuidado: una restricción de más deja la app sin iniciar sesión. Comprueba el inicio de sesión en Web, iOS y Android después de cada cambio.
