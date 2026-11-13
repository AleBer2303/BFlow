# 0025. Los correos de cuenta los envía Firebase Authentication; se elimina Resend

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Sustituye la integración con Resend y el servicio de códigos de 6 dígitos (`src/platform/mail/`, `src/platform/auth/verificationCodeService.ts`). Exigido por `AGENTS.md` §5.2 (sustitución de un servicio externo).
- **Autores:** Architect, UI Builder, QA Engineer y Documentation Expert

---

## 1. Contexto y problema

La recuperación de contraseña generaba un código de 6 dígitos en el cliente y lo enviaba por la API de Resend. Tenía tres problemas:

1. **La API key de Resend viajaba en el cliente.** `EXPO_PUBLIC_RESEND_API_KEY` queda dentro del bundle de Web y de las apps; cualquiera podía leerla y enviar correos con ella.
2. **El código no probaba nada.** Se generaba, guardaba y comparaba en la memoria del propio dispositivo. Sin sesión iniciada, «confirmar» el código no cambiaba la contraseña en Firebase salvo que existiera un endpoint externo (`EXPO_PUBLIC_AUTH_RESET_ENDPOINT`) que nunca se creó.
3. **El correo de la cuenta se editaba solo en local.** «Actualizar datos» cambiaba el correo de la sesión guardada, no el de Firebase Auth: el usuario seguía entrando con el correo anterior.

Además, al crear una cuenta no se comprobaba que el correo fuera del usuario.

## 2. Decisión

Los tres correos de cuenta los envía **Firebase Authentication** con sus plantillas, y el enlace lo atiende la página alojada por Firebase. La app no genera códigos ni habla con otro proveedor de correo.

| Flujo | API del SDK | Dónde |
| :--- | :--- | :--- |
| Verificación del correo al registrarse | `sendEmailVerification` | `registerWithPersonalProfile` (`authAdapter.ts`) |
| Restablecer contraseña (inicio de sesión y Cuenta → Actualizar datos) | `sendPasswordResetEmail` | `sendPasswordResetLink` (`accountEmailActions.ts`) |
| Cambio de correo (Cuenta → Actualizar datos) | `reauthenticateWithCredential` + `verifyBeforeUpdateEmail` | `requestEmailChange` (`accountEmailActions.ts`) |

1. **Puerta de verificación.** Tras registrarse, la cuenta ve `EmailVerificationScreen` en lugar del presupuesto hasta abrir el enlace. La pantalla permite comprobar («Ya verifiqué mi correo»), reenviar y cerrar sesión, y comprueba sola al volver a la app. La sincronización inicial con Firestore sigue en segundo plano. `requiresEmailVerification(authUser)` decide; `index.tsx` la evalúa antes que la puerta de autenticación.
2. **A quién se le exige.** Solo a cuentas con contraseña recién registradas o creadas desde `EMAIL_VERIFICATION_ENFORCED_SINCE_MS` (13 de noviembre de 2026, `America/Bogota`), según `metadata.creationTime` de Firebase. Las cuentas anteriores quedan exentas para no dejarlas fuera, y pueden verificar su correo desde Cuenta → Actualizar datos. Las cuentas de Google y las sesiones locales (modo vitrina, tests) nunca pasan por la puerta. Poner la constante en `0` hace la verificación obligatoria para todas las cuentas con contraseña.
3. **Estado en la sesión.** `BFlowAuthUser` gana `emailVerified` y `emailVerificationRequired`. Se leen del usuario de Firebase en cada evento de sesión (`withFirebaseIdentity`), también cuando se reutiliza la sesión guardada, y `refreshAccountIdentity` los vuelve a leer con `reload`.
4. **Cambio de correo.** Pide el correo nuevo y la contraseña actual. Firebase envía el enlace al correo **nuevo** y el correo de la cuenta no cambia hasta que se abre. `updateAuthUserProfile` del store ya no acepta `email`. Al iniciar sesión con el correo nuevo, `syncUserProfileDocument` actualiza el campo `email` de `users/{uid}` si aún guarda el anterior.
5. **Restablecer contraseña.** Un solo paso en ambas pantallas: se envía el enlace y la contraseña nueva se escribe en la página de Firebase. Desde el inicio de sesión el mensaje no afirma que el correo tenga cuenta, igual que Firebase.
6. **Idioma.** `auth.languageCode = 'es'` antes de cada envío (`ACCOUNT_EMAIL_LANGUAGE`).
7. **Se elimina:** `src/platform/mail/`, `verificationCodeService.ts`, sus tests y las variables `EXPO_PUBLIC_RESEND_API_KEY`, `EXPO_PUBLIC_RESEND_FROM_EMAIL` y `EXPO_PUBLIC_AUTH_RESET_ENDPOINT`.

### 2.1. Alternativas descartadas

| Alternativa | Motivo |
| :--- | :--- |
| Mantener Resend detrás de una Cloud Function | Exige el plan Blaze; el proyecto usa Spark |
| Enlaces que vuelven a la app (`ActionCodeSettings` con deep link) | Necesita dominios autorizados y manejo de enlaces en tres plataformas; la página de Firebase ya resuelve los tres flujos |
| Exigir `request.auth.token.email_verified` en `firestore.rules` | Bloquearía a las cuentas anteriores y cambia las reglas; queda como endurecimiento posterior |
| Exigir verificación a todas las cuentas existentes | Dejaría fuera a cuentas creadas con correos que no reciben mensajes; es un cambio de una constante si se quiere |

## 3. Consecuencias

- **Sin esquema ni reglas nuevas.** `firestore.rules` y `firestore.indexes.json` no cambian; el estado de verificación vive en Firebase Auth y en la sesión local.
- **La puerta es del cliente.** Las reglas de Firestore no comprueban `email_verified`: la verificación garantiza que el correo sirve para recuperar la cuenta, no es un control de acceso a los datos.
- **Confirmar un cambio de correo o de contraseña cierra las sesiones abiertas.** Firebase revoca los tokens de actualización ante esos cambios ([Manage User Sessions](https://firebase.google.com/docs/auth/admin/manage-sessions)). La app lo avisa en el texto de ambas tarjetas. Tras pedir un cambio de correo, al volver a primer plano la app llama a `refreshAccountIdentity`, de modo que el cierre no espera a que venza el token.
- **Los datos del presupuesto no se mueven:** el `uid` es el mismo antes y después de cambiar el correo.
- **Configuración en Firebase Console (fuera del repositorio):** proveedor Correo/contraseña habilitado. Los textos y el remitente se editan en Authentication → Plantillas.
- **Acción pendiente fuera del repositorio:** revocar en Resend la API key que se usó, porque estuvo incluida en builds del cliente, y quitar las variables `EXPO_PUBLIC_RESEND_*` del `.env` local.
- **El nombre y la meta se guardan en `users/{uid}`.** Antes `updateAuthUserProfile` solo cambiaba la sesión local y el cambio se perdía al releer el perfil. Ahora escribe con `saveUserProfile` por `commitUserDataMutationBatch` (ADR 0018) y `executeOptimisticCloudWrite` (ADR 0017): sin red queda en la cola como `save_user_profile` (una sola entrada por perfil) y, si el servidor lo rechaza, se revierte y el formulario lo dice. Los campos ya estaban permitidos en `firestore.rules`; los límites (120 y 240 caracteres) se aplican en el formulario y en el store. Una meta vacía en Firestore cuenta como borrada. El nombre se copia además al perfil de Firebase Auth, sin bloquear.

## 4. Validación

| Verificación | Resultado |
| :--- | :--- |
| `npm run typecheck`, `npm run lint`, `npm test` | Sin errores (71 suites, 894 tests) |
| Acciones de correo (`accountEmailActions.test.ts`) | Envío en español; validaciones antes de llamar a Firebase; reautenticación y contraseña incorrecta; el correo no cambia hasta confirmar; `reload` actualiza la sesión guardada y renueva el token; sesión revocada |
| Adaptador (`authAdapterEmailVerification.test.ts`) | A quién se exige la verificación; el registro envía el correo y devuelve la cuenta pendiente, también si el envío falla; la sesión guardada adopta el estado de Firebase; el perfil de Firestore corrige el correo anterior |
| Pantalla de verificación (`emailVerificationScreen.test.tsx`) | Tres acciones en las pieles iOS, Android y Web; errores; comprobación silenciosa al volver a primer plano |
| App completa (`authGateAndCloudSync.test.tsx`) | La cuenta pendiente no ve el presupuesto hasta verificar; cuentas exentas entran; recuperación por enlace desde el inicio de sesión; las sesiones locales no envían correos |
| Vista de cuenta (`accountProfileWorkspaceView.test.tsx`) | Cambio de correo y restablecimiento en las tres pieles; estado de verificación; cuenta de Google; guardado del perfil (confirmado, en cola, rechazado) |
| Perfil en Firestore (`profileCloudSave.test.ts`, `userProfileRepository.test.ts`) | Escritura en `users/{uid}`; reversión ante rechazo; cola sin red y su reenvío; límites de longitud; sesiones locales sin escritura |

**Sin verificar:** no se envió ningún correo real ni se abrió ningún enlace de Firebase. Los tests sustituyen el SDK de Auth. Quedan por confirmar contra el proyecto `bflow-deaeb` la entrega de los tres correos, su texto en español, y que confirmar un cambio de correo o de contraseña cierra la sesión de la app como describe la documentación de Firebase.
