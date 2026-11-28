# 0039. Exigir correo verificado en `firestore.rules`: migración de las cuentas anteriores

- **Estado:** **Propuesto. No aplicado.** Requiere la aprobación del propietario antes de tocar `firestore.rules` o el código.
- **Fecha:** 2026-11-27
- **Contexto:** Fase 5 del [plan consolidado](../Improvements/AUDITS/plan_consolidado_pendientes_auditorias.md), punto opcional (`AUD-03`). Revisa la decisión del [ADR 0026 §2.5](0026-auth-hardening-password-policy-and-usage-limits.md#25-firestorerules-no-cambia). Aplica `AGENTS.md` §5.2, punto 2 (reglas de seguridad de Firestore).
- **Autores:** Security Auditor, Architect y Documentation Expert
- **Tipo Diátaxis:** Explanation

---

## 1. Contexto y problema

Desde el ADR 0025, la app no deja usar el presupuesto a una cuenta con contraseña creada desde `EMAIL_VERIFICATION_ENFORCED_SINCE_MS` (13 de noviembre de 2026, `src/platform/auth/authAdapter.ts`) hasta que verifique el correo. Es una puerta del cliente: `firestore.rules` solo comprueba `request.auth.uid == uid`, así que una cuenta sin verificar puede leer y escribir su propio `users/{uid}` llamando a Firestore por fuera de la app.

El ADR 0026 §2.5 descartó exigir `email_verified` en las reglas porque:

1. Las cuentas con contraseña anteriores al 13 de noviembre están exentas y perderían el acceso. Las reglas no pueden distinguirlas: el token de Firebase Auth no trae la fecha de creación, y un `createdAt` del perfil lo escribe el cliente.
2. `isOwner` ya impide leer datos ajenos. La regla solo evitaría que una cuenta sin verificar use cuota en su propio espacio.
3. No había emulador de Firestore para probarla.

Este ADR propone cómo quitar el primer obstáculo. Los otros dos siguen en pie: el beneficio es limitado y App Check (ADR 0038) es el control principal contra el abuso por fuera de la app.

## 2. Propuesta

### 2.1. Regla final

```
function isVerifiedOrExempt() {
  return request.auth.token.firebase.sign_in_provider != 'password' ||
    request.auth.token.email_verified == true ||
    request.auth.token.bflowLegacyUnverified == true;
}

function isOwner(uid) {
  return isAuthenticated() && request.auth.uid == uid && isVerifiedOrExempt();
}
```

- Google y los demás proveedores federados siguen igual: Firebase ya verifica su correo.
- `bflowLegacyUnverified` es un *custom claim* que solo puede poner el Admin SDK, nunca el cliente. Lo llevan las cuentas anteriores a la fecha que todavía no verificaron.
- Sin lecturas extra: una lista de permitidos en un documento (`exists(...)`) costaría una lectura por petición en el plan Spark.

### 2.2. Migración en cuatro pasos

| Paso | Quién | Qué | Reversible |
| :--- | :--- | :--- | :---: |
| 1. Inventario | Propietario | Listar con el Admin SDK (script local con cuenta de servicio, sin Cloud Functions) las cuentas `password` con `emailVerified == false` y `metadata.creationTime` anterior a `EMAIL_VERIFICATION_ENFORCED_SINCE_MS`. Si la lista está vacía, saltar al paso 4 sin claims. | Sí |
| 2. Aviso en la app | Código | Mostrar a esas cuentas un aviso no bloqueante con «Enviar enlace de verificación» (`sendVerificationEmail` ya existe) durante un periodo acordado. | Sí |
| 3. Claims | Propietario | A las que sigan sin verificar, `setCustomUserClaims(uid, { bflowLegacyUnverified: true })`. El claim llega al token en la siguiente renovación (como mucho, una hora). | Sí (quitar el claim) |
| 4. Reglas | Código + propietario | Aplicar §2.1, cambiar el registro (§2.3), pasar los tests del emulador (§2.4) y desplegar con `firebase deploy --only firestore:rules`. | Sí (redesplegar las anteriores) |

Cuando una cuenta exenta verifica el correo, el claim deja de hacer falta; se puede quitar en otra pasada del script.

### 2.3. Cambio necesario en el registro

`syncUserProfileDocument` (`src/platform/auth/authAdapter.ts`) lee y escribe `users/{uid}` al registrarse, antes de que exista la verificación. Con la regla nueva ambas operaciones se rechazarían. Hoy los errores se tragan (lectura con tiempo límite, escritura en `try`), pero el perfil no llegaría a la nube hasta verificar. La propuesta es posponer esa sincronización a `refreshAccountIdentity` cuando la verificación se confirme, como ya hace `index.tsx` con el presupuesto. Necesita tests del flujo de registro.

### 2.4. Pruebas con el emulador

Las reglas se prueban con `@firebase/rules-unit-testing` (dependencia de desarrollo nueva) contra el emulador de Firestore que ya declara `firebase.json` (puerto 8080):

- Cuenta `password` verificada: lee y escribe su `users/{uid}`.
- Cuenta `password` sin verificar, sin claim: todo rechazado.
- Cuenta `password` sin verificar con `bflowLegacyUnverified: true`: lee y escribe.
- Cuenta `google.com` sin `email_verified`: lee y escribe.
- Ninguna lee el `users/{uid}` de otra.

CI no tiene el emulador; añadirlo (Java + `firebase-tools`) cambia `ci.yml` y su tiempo de ejecución, y se decidiría en el mismo cambio.

## 3. Alternativas

- **Dejarlo como está (ADR 0026 §2.5).** Es la opción por defecto si no se aprueba este ADR. El riesgo residual es bajo: una cuenta sin verificar solo usa su propio espacio.
- **Comparar con una fecha en las reglas.** El token no trae la fecha de creación de la cuenta; `auth_time` es la del último inicio de sesión.
- **Lista de permitidos en Firestore.** Una lectura extra por petición (§2.1).
- **Forzar a todas las cuentas a verificar.** Bloquea a usuarios actuales sin aviso, justo lo que el ADR 0026 quiso evitar.

## 4. Qué falta para aprobarlo (`needs_validation`)

1. El inventario del paso 1. Con cero cuentas afectadas, los claims sobran y el cambio se reduce a §2.1 sin `bflowLegacyUnverified`, más §2.3.
2. La decisión del propietario sobre el periodo de aviso del paso 2.
3. Ejecutar el emulador de Firestore en este entorno (Java) o en CI.
