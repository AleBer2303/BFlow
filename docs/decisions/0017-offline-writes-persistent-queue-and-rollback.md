# ADR 0017: Cola Persistente de Escrituras Offline, Rollback Optimista y Sincronización Resiliente (R-07, R-08, R-09)

## 1. Contexto y Problema

En BFlow, la aplicación debe garantizar disponibilidad offline de grado de producción tanto en iOS y Android como en Web, de acuerdo con `AGENTS.md` §6.2 ("Todas las escrituras en Firestore deben disponer de rollback optimista y mensajes amigables ante fallos de conexión").

Tras la auditoría de rendimiento (`docs/Improvements/PERFORMANCE_AUDIT_2026-11-09.md`), se identificaron tres vulnerabilidades críticas en la capa de persistencia y red:

1. **R-07 (Pérdida de escrituras offline en nativo):** En React Native (iOS/Android), el JS SDK de Cloud Firestore no soporta `indexedDB` (inexistente en el runtime Hermes) y se inicializa con `memoryLocalCache()`. Por lo tanto, cualquier escritura realizada sin conexión (`commit()`, `setDoc`, `updateDoc`) se retiene únicamente en la memoria RAM del proceso. Si el usuario cierra o suspende la app antes de recuperar red, dichas mutaciones se pierden definitivamente sin haber disparado error de rechazo.
2. **R-08 (Falta de rollback y supresión de mensajes en 18 de 22 escrituras):** 18 operaciones en los slices de Zustand (`Budget`, `Debts`, `Provisions`, `Savings`, `Auth`) capturaban cualquier excepción en un bloque `catch` silencioso que ejecutaba `set({ syncMessage: '' })`, sin restaurar el estado anterior de la interfaz ni alertar al usuario.
3. **R-09 (Sobrescritura destructiva de estado optimista):** Cuando se disparaba una sincronización con la nube en segundo plano (`syncUserCloudAccount` o `loadFullCloudAccount`), si el usuario había realizado modificaciones locales offline o en tránsito, la respuesta de la nube sobreescribía el estado de Zustand con los datos remotos desactualizados.

---

## 2. Decisión Tomada: Opción A (Cola Persistente FIFO con Rollback Calibrado)

Se adopta la **Opción A** del plan de auditoría:

### 2.1. Separación de Arquitectura de Caché: Nativo vs. Web
- **En Web (Navegador):** Firestore utiliza `persistentLocalCache` con `persistentMultipleTabManager` respaldado en el `indexedDB` del navegador. El propio motor de Firestore en web mantiene su cola persistente de mutaciones indexadas y las drena al reconectar. Por ello, en web se conserva la integración nativa del SDK de Firestore.
- **En Nativo (iOS / Android):** Dado que Hermes carece de `indexedDB`, BFlow implementa una **cola persistente a nivel de aplicación (`offlineWriteQueue`)** almacenada a través de `persistentStorage` (que en iOS y Android está respaldada por `expo-sqlite/kv-store` y cifrada con AES-256 según el ADR 0016).

### 2.2. Semántica de Ejecución de Escrituras (`executeOptimisticCloudWrite`)
Toda mutación en los slices de Zustand se desacopla mediante un ejecutor centralizado que clasifica el resultado en 3 escenarios:

1. **Éxito Inmediato:** La operación se completa contra Firestore antes del tiempo límite (`timeoutMs`, típicamente 3.500 ms). Se limpia cualquier error previo y se actualiza el contador de pendientes.
2. **Falta de Red o Timeout (Offline Transitorio):**
   - El commit en Firestore no responde en el tiempo fijado o falla por error de red (`unavailable`, `failed-precondition: client is offline`, `network-error`, etc.).
   - **NO se realiza rollback:** el usuario conserva su estado optimista para que la app se sienta rápida y funcional.
   - La operación se serializa y se encola en la cola FIFO persistente (`offlineWriteQueue`) bajo el `uid` del usuario.
   - Se muestra un indicador discreto en la cabecera informando los cambios pendientes en cola.
3. **Rechazo Definitivo del Servidor (Error Fatal / Permisos):**
   - El servidor rechaza la escritura con códigos definitivos (`permission-denied`, `invalid-argument`, `unauthenticated`, `not-found`).
   - **SÍ se realiza rollback:** se restaura el estado anterior de los arrays y mapas de Zustand.
   - **NO se encola:** no tiene sentido reintentar una operación no autorizada o inválida.
   - Se fija un mensaje amigable en `syncMessage` alertando de la razón del fallo.

### 2.3. Política de Conflictos: Last-Write-Wins (LWW) e Idempotencia
- **IDs Deterministas:** Los movimientos mensuales (`MonthEntry`) emplean claves compuestas deterministas `${monthKey}_${conceptId}` o UUIDs persistidos; los abonos a deudas y conceptos tienen identificadores inmutables.
- **Operaciones Idempotentes:** Las operaciones de la cola (`save_or_update_entry`, `save_debt`, `save_provision_plan`, `save_savings_bucket`, `save_user_profile`) aplican documentos completos o `merge: true`, por lo que reintentos múltiples sobre la misma clave producen el mismo estado final sin duplicaciones.
- **Operaciones No Seguras para Modo Offline:** Operaciones destructivas masivas como `resetFullAccountInCloud` (reseteo total de la cuenta en la nube) requieren confirmación en línea explícita o se ejecutan de forma atómica; si no hay red, se informa al usuario para evitar inconsistencias en el catálogo histórico.

### 2.4. Protección de Sincronización en Segundo Plano (R-09)
Mientras la cola `offlineWriteQueue` contenga elementos pendientes o se encuentre en proceso de drenado (`isDrainingQueue` o `getPendingWritesCount(uid) > 0`), la reconciliación pasiva `syncUserCloudAccount` **omite sobrescribir el estado de Zustand** con la instantánea remota, preservando la soberanía de los cambios locales hasta que la cola sea completamente vaciada en Firestore.

---

## 3. Consecuencias y Beneficios

1. **Persistencia Garantizada sin Red:** Un usuario puede registrar o marcar pagos en su iPhone en un avión o en un sótano sin señal, forzar el cierre de la app, volver a abrirla y ver sus datos intactos; tan pronto vuelva la señal, la cola vaciará los cambios a Firestore sin intervención manual.
2. **Cumplimiento Estricto de `AGENTS.md` §6.2:** Las 18 escrituras sin rollback disponen ahora de reversión de estado limpia y mensajes claros en caso de fallo real del backend.
3. **Cero Parpadeo ni Regresiones de Saldo:** Se erradica la condición de carrera donde Firestore sobreescribía un gasto recién registrado antes de que el servidor lo procesara.
4. **Cero Dependencias Externas Nuevas:** Utiliza la infraestructura ya aprobada en los ADR 0015 y 0016 (`expo-sqlite/kv-store`, AES-256).

---

## 4. Estado de la Decisión

**Aprobada e implementada en la rama `perf/phase-3-offline-writes`.**
