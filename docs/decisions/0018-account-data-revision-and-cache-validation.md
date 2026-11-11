# ADR 0018: Revisión de Datos de Cuenta (`dataRevision`) y Validación Condicional de Caché en Arranque (R-11 a R-14)

**Fecha:** 2026-11-10 · **Estado:** Aprobado · **Rama:** `perf/phase-4-firestore-reads`

---

## 1. Contexto y Problema

De acuerdo con la auditoría de rendimiento (`docs/Improvements/PERFORMANCE_AUDIT_2026-11-09.md`, hallazgos **R-11, R-12, R-13 y R-14**) y la política de consumo eficiente en el plan gratuito Spark (`AGENTS.md` §6.3), el arranque de BFlow presentaba dos problemas de lecturas en Cloud Firestore:

1. **Lecturas redundantes y secuenciales (Parte A — R-11, R-12, R-14):**
   - `seedOctober2026IfEmpty` ejecutaba un `getDoc(users/{uid})` secuencial antes de lanzar el `Promise.all` de `loadFullCloudAccount`, provocando al menos dos viajes de red y leyendo `users/{uid}` hasta 3 veces en el arranque y 4 en el login.
   - `syncUserProfileDocument` se ejecutaba por duplicado durante el inicio de sesión (`signInWithEmail` y el listener `onAuthStateChanged`) y escribía `lastLoginAt` en cada arranque.
   - `deleteOrResetEntry` hacía dos `getDoc` secuenciales (`entries/{entryId}` y `concepts/{conceptId}`) para obtener documentos que ya residen en el store de Zustand.
2. **Descarga completa del historial en cada arranque (Parte B — R-13):**
   - Debido a que el arrastre contable de deudas y fondos de ahorro entre meses depende de la cadena histórica de movimientos y cierres (invariante dorada del Excel), cuando se requiere reconstruir el estado desde la nube es necesario leer las colecciones de la cuenta (34 documentos con 1 mes, 177 con 12 meses, 333 con 24 meses, 801 con 60 meses).
   - Sin embargo, en la inmensa mayoría de los arranques diarios el usuario abre la aplicación en el mismo dispositivo donde ya tiene la caché local persistida (Fases 1 a 3) y **ningún dato ha cambiado en la nube**. Descargar cientos de documentos en cada apertura desperdicia cuota Spark y ancho de banda móvil sin aportar ningún cambio al estado.

---

## 2. Opciones Consideradas para R-13

### Opción 1: Acotar las consultas de `loadFullCloudAccount` a una ventana móvil de meses
- **Descartada:** El cálculo de saldos iniciales de deudas (`rolledDebts`) y fondos de ahorro (`savingsBucketsByMonth`) encadena los resultados desde el primer mes de la cuenta si existen meses abiertos sin `MonthSnapshot`. Recortar la descarga a una ventana parcial rompería la paridad contable con el Excel cuando un usuario edita o reabre meses anteriores.

### Opción 2: Contador entero incremental (`revisionNumber`) o `updatedAt` con reloj del servidor
- **Descartada:** Un `serverTimestamp()` o un `increment(1)` en Firestore impide que el cliente conozca de forma determinista e inmediata el valor exacto tras una escritura propia sin hacer una lectura adicional al servidor, o sufre desfases de reloj entre dispositivos.

### Opción 3 (Elegida): Cadena aleatoria `users/{uid}.dataRevision` generada por el cliente en cada escritura
- **Adoptada:** Cada vez que el cliente realiza **cualquier escritura de datos presupuestarios** en Firestore, genera un identificador aleatorio de revisión (`dataRevision`, ej. `"rev_<timestamp36>_<random>"`) y lo escribe atómicamente en `users/{uid}.dataRevision` dentro del mismo `writeBatch` (y actualiza simultáneamente la revisión del sobre local en `accountCache`).

---

## 3. Decisión Arquitectónica

### 3.1. Esquema de `users/{uid}` y Reglas de Seguridad (`firestore.rules`)
- Se añade el campo opcional `dataRevision` (`string`, longitud entre `1` y `120` caracteres) al documento `/users/{uid}`.
- `isValidUserProfile(data, uid)` en `firestore.rules` incorpora `'dataRevision'` en su lista blanca `hasOnlyAllowedFields` y valida `isOptionalString(data, 'dataRevision', 120)`.

### 3.2. Helper Común de Escritura (`commitUserDataMutationBatch` / `touchUserDataRevisionInBatch`)
- **Prohibido ejecutar `setDoc` o `deleteDoc` sueltos sobre subcolecciones de presupuesto.** Todos los caminos de escritura de datos de `FirestoreBudgetRepository` (`saveOrUpdateEntry`, `deleteOrResetEntry`, `deleteEntryCompletely`, `saveCustomConceptAndEntry`, `toggleEntryCompletion`, `addMonthEntry`, `saveConcept`, `deleteConcept`, `saveDebt`, `deleteDebt`, `saveSavingsBucket`, `deleteSavingsBucket`, `saveProvisionPlan`, `persistMonthCloseResult`, `reopenMonthInCloud`, `deleteMonthInCloud`, `saveInitialAccountSetup`, `saveActiveMonthKey`, `resetFullAccountInCloud` y la semilla/autosanación en `seedOctober2026IfEmpty` / `loadFullCloudAccount`) utilizan un helper común que:
  1. Genera una nueva cadena `dataRevision = generateDataRevision()`.
  2. Añade `batch.set(doc(db, 'users', uid), { uid, dataRevision, updatedAt }, { merge: true })` al lote atómico.
  3. Tras confirmar el lote, actualiza la revisión local en el sobre de `accountCache` (`updatePersistedAccountRevision(uid, dataRevision)`).
- Un test de guardia estático y dinámico verifica que **ningún método de escritura** en `FirestoreBudgetRepository` omita el helper de `dataRevision`.

### 3.3. Sobre de Caché (`PersistedAccountEnvelope`) y Cortocircuito en el Arranque
- `PersistedAccountEnvelope` conserva compatibilidad con la versión 2 e incluye el metadato opcional `dataRevision?: string`.
- En el arranque automático (`syncUserCloudAccount` sin `forceFullSync`):
  1. Primero se drena la cola offline (`drainOfflineWriteQueue`).
  2. Si el sobre local tiene menos de **24 horas** (`savedAt` dentro de las últimas 24 h) y posee un `dataRevision` no vacío, `loadFullCloudAccount` recibe `{ cachedAccount, cachedDataRevision, cachedSavedAt }` y lee primero únicamente **`getDoc(doc(db, 'users', uid))`** (**1 documento leído**).
  3. Si `userSnap.data()?.dataRevision === cachedDataRevision`, se omiten las 7 consultas restantes (`concepts`, `entries`, `debts`, `debtPayments`, `savingsBuckets`, `provisionPlans/moto_ideal`, `monthSnapshots`) y se devuelve la cuenta en caché validada.
  4. Si la revisión no coincide, no existe, la caché tiene $\ge 24\text{ h}$, o el usuario pulsa **"Sincronizar datos ahora"** (`forceFullSync: true`), se ejecutan las consultas de todas las colecciones y se guarda la nueva revisión en el sobre local.

---

## 4. Consecuencias

- **Reducción del 97 % – 99,8 % de documentos leídos en arranques sin cambios externos:**
  - Cuenta de 1 mes: **36 $\rightarrow$ 1 documento leído**.
  - Cuenta de 12 meses: **179 $\rightarrow$ 1 documento leído**.
  - Cuenta de 24 meses: **335 $\rightarrow$ 1 documento leído**.
  - Cuenta de 60 meses: **803 $\rightarrow$ 1 documento leído**.
- **Detección inmediata de cambios multi-dispositivo:** Si el usuario edita o borra un movimiento desde la Web, `users/{uid}.dataRevision` cambia en ese mismo `writeBatch`; al abrir el iPhone, la lectura de `users/{uid}` detecta la discrepancia y descarga las colecciones actualizadas.
- **Invariantes contables intactas:** No se modifica ninguna fórmula de `src/domain/` ni la lógica de arrastre de saldos entre meses.
