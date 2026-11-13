# Cómo endurecer Firebase Authentication en la consola

> **Tipo Diátaxis:** How-To Guide. Objetivo: activar en el proyecto de Firebase los controles de seguridad que la app no puede aplicar por sí sola.
>
> Contexto y decisiones: [ADR 0026](../decisions/0026-auth-hardening-password-policy-and-usage-limits.md) y [ADR 0025](../decisions/0025-firebase-auth-account-emails.md).
>
> **Estado:** ninguno de estos pasos se ha ejecutado desde este repositorio. Los datos de Firebase salen de su documentación oficial, consultada el 2026-11-13; los nombres de los menús de la consola pueden cambiar.

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

App Check hace que Firebase solo atienda a la app auténtica. Es el control contra quien salte los límites del dispositivo llamando a Firebase por fuera.

**No lo exijas todavía.** La app no envía tokens de App Check: usa el SDK de JavaScript de Firebase en las tres plataformas y no tiene código de App Check. Si activas la exigencia (**Enforce**) en Cloud Firestore, la app deja de leer y escribir.

Orden correcto:

1. **Integrar el cliente** (cambio de código, con su ADR):
   - Web: `initializeAppCheck` con el proveedor reCAPTCHA Enterprise.
   - iOS y Android: App Attest o DeviceCheck y Play Integrity necesitan un módulo nativo, que solo existe en el Modo B (`.ipa` y `.apk`). Expo Go no puede obtener esos tokens.
2. **Registrar las apps** en **App Check** de la consola, cada una con su proveedor.
3. **Observar** las métricas de App Check sin exigirlo, hasta que casi todas las peticiones lleguen verificadas.
4. **Exigirlo** en Cloud Firestore.

Datos a tener en cuenta: reCAPTCHA Enterprise no tiene coste hasta 10.000 evaluaciones al mes; Play Integrity tiene una cuota diaria de 10.000 llamadas en su nivel estándar; el soporte de App Check para Firebase Authentication está en vista previa.

## 4. Reglas de Firestore para cuentas sin verificar (pendiente)

`firestore.rules` no exige correo verificado. El motivo está en el ADR 0026 §2.5: dejaría sin acceso a las cuentas anteriores al 13 de noviembre de 2026, que están exentas de la verificación.

Antes de cambiarlo:

1. En **Authentication → Users**, confirma que no quedan cuentas con contraseña sin verificar que deban conservar el acceso.
2. Escribe un ADR nuevo (`AGENTS.md` §5.2).
3. Cambia el ayudante de `firestore.rules`:

```
function isOwner(uid) {
  return isAuthenticated() &&
    request.auth.uid == uid &&
    (request.auth.token.email_verified == true ||
      request.auth.token.firebase.sign_in_provider != 'password');
}
```

4. El registro escribe el perfil `users/{uid}` antes de verificar el correo. Con la regla nueva esa escritura se rechaza, así que hay que moverla a después de la verificación.
5. Prueba las reglas en el emulador de Firestore antes de desplegarlas.

## 5. Restringir la clave de API

En **Google Cloud Console → APIs & Services → Credentials**, limita la clave de API de Firebase a las APIs que usa la app (Identity Toolkit, Token Service y Cloud Firestore) y a los identificadores de la app y los dominios web autorizados.

Hazlo con cuidado: una restricción de más deja la app sin iniciar sesión. Comprueba el inicio de sesión en Web, iOS y Android después de cada cambio.
