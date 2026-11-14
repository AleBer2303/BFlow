# 0026. Política de contraseñas, límite de intentos y esperas de las acciones de cuenta

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Fase 1 de la auditoría de producción (`docs/Improvements/AUDITS/auditoria_produccion_bflow.md`, AUD-01, AUD-02 y AUD-03). Continúa el [ADR 0025](0025-firebase-auth-account-emails.md). Registra también la decisión de **no** cambiar `firestore.rules` en esta fase (`AGENTS.md` §5.2, punto 2).
- **Autores:** Architect, UI Builder, Security Auditor, QA Engineer y Documentation Expert

---

## 1. Contexto y problema

1. **Contraseñas débiles.** El registro solo exigía 6 caracteres.
2. **Intentos sin límite.** El inicio de sesión y la confirmación de contraseña al cambiar el correo se podían repetir sin freno en la app. El único límite era el de Firebase (`auth/too-many-requests`).
3. **Envíos y lecturas repetibles.** El enlace de restablecimiento, el correo de verificación y «Sincronizar datos ahora» se podían pulsar una y otra vez. La sincronización manual relee toda la cuenta (`forceFullSync`), contra la cuota de lecturas del plan Spark.
4. **Sincronización antes de verificar.** `index.tsx` sincronizaba el presupuesto de una cuenta nueva mientras esta seguía en la pantalla de verificación de correo.

## 2. Decisión

### 2.1. Política de contraseñas al crear la cuenta

`src/domain/auth/passwordPolicy.ts` (puro) define seis reglas: de 8 a 128 caracteres, una mayúscula, una minúscula, un número, un carácter especial y sin espacios al inicio ni al final.

- El formulario de registro (`AuthScreen`) lista las reglas y marca cada una al escribir, con signo y color, y con una etiqueta para lectores de pantalla («Cumplido» o «Pendiente»).
- `registerWithPersonalProfile` aplica el mismo validador antes de llamar a Firebase.
- **Iniciar sesión no aplica la política**: las cuentas con contraseñas anteriores siguen entrando.
- **Caracteres especiales: el conjunto de Firebase.** La auditoría proponía un conjunto que incluye `+`, `-`, `=` y el acento grave. Firebase Authentication no los cuenta como no alfanuméricos: su política acepta `^ $ * . [ ] { } ( ) ? " ! @ # % & / \ , > < ' : ; | _ ~` ([documentación](https://firebase.google.com/docs/auth/web/password-auth), consultada el 2026-11-13). Con el conjunto de la auditoría, una contraseña con la lista en verde podía ser rechazada por Firebase al activar su política. `PASSWORD_SPECIAL_CHARACTERS` usa el conjunto de Firebase.
- La página de restablecimiento la aloja Firebase y no usa este validador: aplica la política configurada en la consola ([guía](../guides/firebase-auth-hardening-guide.md)).

### 2.2. Límite de 5 intentos de contraseña

`src/platform/auth/authRateLimiter.ts` cuenta por acción (`login_password`, `reauth_email_change`):

- 5 contraseñas equivocadas seguidas bloquean la acción 15 minutos. Durante el bloqueo no se llama a Firebase. Un acierto reinicia la cuenta; al vencer el bloqueo vuelven los 5 intentos.
- Cuentan `auth/invalid-credential`, `auth/wrong-password`, `auth/invalid-login-credentials` y `auth/user-not-found` (tratarlo distinto revelaría qué correos tienen cuenta). Un fallo de red no cuenta.
- El mensaje dice cuántos intentos quedan (de 4 a 1). Bloqueada, la pantalla muestra un aviso fijo, la cuenta atrás en el botón deshabilitado y la opción de restablecer la contraseña por correo.
- El estado se guarda cifrado con `persistentStorage` (ADR 0016) y sobrevive a cerrar la app.

### 2.3. Esperas entre acciones

| Acción | Espera | Dónde se aplica |
| :--- | :---: | :--- |
| Enlace de restablecimiento de contraseña | 60 s | `sendPasswordResetLink`, `AuthScreen`, Cuenta |
| Correo de verificación | 60 s | `sendVerificationEmail`, `registerWithPersonalProfile`, `EmailVerificationScreen`, Cuenta |
| Sincronización manual | 30 s | `handleManualSync` de `index.tsx`, Cuenta |

La espera empieza cuando la acción sale bien. El botón queda deshabilitado con la cuenta atrás (`useCountdown`). La función de plataforma rechaza la llamada aunque no venga de un botón.

### 2.4. Sin sincronización hasta verificar el correo

Mientras `requiresEmailVerification(authUser)` sea cierto, `index.tsx` no llama a `syncUserCloudAccount`: ni al restaurar la sesión, ni al registrarse, ni al iniciar sesión. Al confirmarse la verificación se sincroniza una vez. Solo la cuenta creada en esa misma sesión abre el asistente inicial (`isRegistration: true`); en los demás casos lo decide lo que haya en Firestore.

Sigue escribiéndose el perfil `users/{uid}` (nombre, celular, meta) al registrarse: es lo que identifica a la cuenta y no es presupuesto.

### 2.5. `firestore.rules` no cambia

Se evaluó exigir `request.auth.token.email_verified == true` en `isOwner(uid)` y **se descarta por ahora**:

1. **Dejaría fuera a cuentas existentes.** El ADR 0025 exime de la verificación a las cuentas con contraseña creadas antes del 13 de noviembre de 2026. Con la regla perderían el acceso a sus datos. Las reglas no pueden distinguirlas: el token no trae la fecha de creación, y un campo `createdAt` del perfil lo escribe el cliente.
2. **No cierra un acceso a datos ajenos.** `isOwner` ya limita cada cuenta a su propio `users/{uid}`. Lo que la regla evitaría es que una cuenta sin verificar gaste cuota en su propio espacio; para ese abuso el control es App Check.
3. **No se puede probar aquí.** No hay emulador de Firestore en este entorno y desplegar reglas lo hace el propietario.

Cuándo revisarlo: cuando todas las cuentas con contraseña estén verificadas (o `EMAIL_VERIFICATION_ENFORCED_SINCE_MS` pase a `0`). La regla exacta está en la [guía](../guides/firebase-auth-hardening-guide.md) §4 y requiere su propio ADR.

## 3. Límites de esta decisión

- **Es un freno en el cliente.** Quien borre los datos de la app, cambie el reloj del dispositivo o llame a la API de Firebase por fuera de la app salta el límite de intentos y las esperas. El límite que no se puede saltar es el de Firebase, y contra clientes que no son la app, App Check.
- **El bloqueo es por dispositivo, no por cuenta.** Cinco fallos bloquean el inicio de sesión con contraseña para cualquier correo en ese dispositivo.
- **Cerrar sesión rota la clave de cifrado** (ADR 0016), así que el contador de `reauth_email_change` no sobrevive a cerrar sesión y reiniciar la app. Volver a entrar exige la contraseña.
- **App Check no se activa en esta fase.** La app usa el SDK de JavaScript de Firebase también en iOS y Android, y no envía tokens de App Check. Exigirlo en la consola sin integrar antes el cliente dejaría la app sin acceso a Firestore.

## 4. Validación

- `src/domain/auth/__tests__/passwordPolicy.test.ts`, `src/platform/auth/__tests__/authRateLimiter.test.ts`, `authAdapterPasswordSecurity.test.ts` y `accountEmailActions.test.ts`.
- En las tres pieles: `src/features/auth/__tests__/authHardening.test.tsx`, `emailVerificationScreen.test.tsx` y `accountProfileWorkspaceView.test.tsx`.
- Revisado en el navegador en modo vitrina, piel Web: lista de reglas del registro y espera de la sincronización manual.
- **Sin verificar:** ningún correo real, ningún inicio de sesión contra Firebase y ningún dispositivo iOS o Android. La política de la consola de Firebase no se ha activado.
