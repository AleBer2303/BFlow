# 0035. Integridad de la cola offline y borrados en cascada

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Extiende los ADR [0017](0017-offline-writes-persistent-queue-and-rollback.md), [0018](0018-account-data-revision-and-cache-validation.md) y [0034](0034-credit-cards-and-debit-accounts.md). Implementa la Fase 1 del [plan consolidado de auditorías](../Improvements/AUDITS/plan_consolidado_pendientes_auditorias.md) (BUG-01 a BUG-04).
- **Autores:** Architect, QA Engineer, Security Auditor y Reviewer

---

## 1. Contexto y problema

1. **BUG-01.** `deleteEntryById` encolaba `delete_or_reset_entry`. Sin red, al reconectar, la cola llamaba a `deleteOrResetEntry`, que **restablece** un movimiento de concepto único en vez de borrarlo: el movimiento borrado volvía como pendiente.
2. **BUG-02.** El payload era `Record<string, unknown>` y `getOperationTargetKey` buscaba `payload.entry.id` o `payload.id`. Los borrados envían `entryId`, `conceptId` o `debtId`, así que su clave salía `null`: editar y borrar el mismo objeto sin red dejaba las dos operaciones, y además en el orden en que llegaron. La deduplicación, por su parte, reemplazaba en su sitio cualquier operación con la misma clave, incluso las de mes (cerrar y reabrir).
3. **BUG-03.** `completeInitialAccountSetup` llamaba a `saveInitialAccountSetup` con un `try/catch` propio. Si fallaba la red, la configuración quedaba solo en el dispositivo y nunca se reintentaba.
4. **BUG-04.** `deleteDebt` y `deleteSavingsBucket` borraban solo su documento. En la nube quedaban conceptos con `defaultTargetDebtId` o `savingsContribution` apuntando a un objeto inexistente, y los `debtPayments` de la deuda quedaban huérfanos. El store limpiaba los conceptos del fondo, pero no los de la deuda.

---

## 2. Decisión

### 2.1. Payload tipado y validado (`src/platform/storage/offlineWriteQueue.ts`)

1. `QueuedWritePayloads` define el payload exacto de cada `type`. `QueuedWriteRequest` es la unión discriminada que reciben `enqueueOfflineWrite` y `executeOptimisticCloudWrite`, y `executeQueuedOperation` despacha sin conversiones de tipo.
2. Tipos nuevos:
   - `delete_entry_completely` (`repo.deleteEntryCompletely`), que usa `deleteEntryById`. `removeOrResetEntry` sigue con `delete_or_reset_entry`, que ahora exige el movimiento.
   - `save_initial_account_setup` (`repo.saveInitialAccountSetup`).
3. **Lectura de colas guardadas.** Cada operación se valida con Zod: el sobre (`id`, `uid`, `type`, `createdAtIso`, `retryCount`) y la forma del payload (ids y campos que la cola lee). La validación completa de cada documento sigue en los mappers de `firestoreSchemas.ts`.
   - Lo que no encaja se descarta sin lanzar: la cola limpia se guarda de nuevo y el descarte se cuenta (`consumeDiscardedOfflineWritesCount`).
   - `drainOfflineWriteQueue` devuelve `discarded` y el slice de sincronización lo añade a `syncMessage` («Se descartaron N cambios pendientes guardados con un formato anterior.»).
4. **Migración.** Un `delete_or_reset_entry` sin `entry` solo lo generaban las versiones anteriores desde `deleteEntryById`. Al leerlo se convierte en `delete_entry_completely`, para que los dispositivos con borrados pendientes no repitan el BUG-01.
5. **Errores de validación.** Un `ZodError` cuenta como error permanente (`isPermanentCloudError`): sin esto, un documento que los mappers rechazan bloqueaba la cola para siempre.

### 2.2. Claves y compactación

1. Cada operación resuelve la clave de su objetivo (`getOperationTargetKey`). El guardado y el borrado del mismo objeto comparten clave: `entry_`, `concept_`, `debt_`, `account_`, `bucket_` y `month_`. `save_custom_concept_and_entry` usa la clave de su `entry`.
2. **Un borrado reemplaza los guardados pendientes del mismo objetivo** y va al final. Aplica a `delete_entry_completely`, `delete_concept`, `delete_debt`, `delete_financial_account` y `delete_savings_bucket`.
   - Un guardado de movimiento también escribía su concepto. Esa parte se conserva como `save_concept` en el mismo lugar de la cola, porque el borrado del movimiento no toca el concepto. Por eso, editar un movimiento y borrarlo sin red deja **una sola operación sobre el movimiento** (el borrado) y, si la edición llevaba el concepto, un `save_concept`.
   - `delete_or_reset_entry` no reemplaza nada: un restablecimiento conserva el movimiento y no borra los abonos que el guardado anterior habría limpiado.
3. **Dos guardados seguidos del mismo objetivo se fusionan.** Solo se fusionan si el anterior es la última operación de la cola, así ninguna otra operación queda reordenada.
   - Al fusionar se conservan el concepto y los abonos del anterior si el nuevo no los trae.
   - El perfil conserva la foto pendiente.
   - Editar un movimiento creado sin red actualiza la creación pendiente.
4. **Lo demás se añade al final.** Guardar después de borrar conserva el orden FIFO, y las operaciones de mes (`persist_month_close`, `reopen_month`, `delete_month`) nunca se compactan.
5. **Drenado.** `drainOfflineWriteQueue` relee la cabeza de la cola antes de cada operación. Así, una operación que la compactación reemplazó o quitó mientras se subía otra nunca se ejecuta.

### 2.3. Configuración inicial con la cola (BUG-03)

1. `completeInitialAccountSetup` usa `executeOptimisticCloudWrite` con `save_initial_account_setup`. Los errores transitorios encolan la configuración y conservan el estado optimista, y los permanentes revierten al estado previo.
2. `saveInitialAccountSetup` es idempotente: escribe con `batch.set` sobre ids que ya vienen en el payload. Repetirlo, sea por el tiempo de espera de 3,5 s o por el drenado, escribe los mismos documentos sin duplicarlos.

### 2.4. Borrados en cascada (BUG-04)

1. **`deleteDebt`** lee los `concepts` con `defaultTargetDebtId == debtId` y los `debtPayments` con `debtId == debtId`. Después, en el mismo `writeBatch`, quita `defaultTargetDebtId` (con `deleteField()`), borra esos abonos y borra la deuda.
2. **Decisión sobre `debtPayments`: se borran.**
   - El saldo de una deuda nunca se guarda: se deriva de la apertura menos los abonos, así que sin la deuda nadie lee sus abonos.
   - La deuda desaparece de todos los meses (un documento por id), así que reabrir un mes la recalcula ya sin ella.
   - El historial de los meses cerrados no depende de esos abonos: `monthSnapshots` guarda `closingDebts` con `paidPrincipal` y `totalClosingDebt`, y los gráficos leen el snapshot.
   - Conservarlos solo dejaría documentos huérfanos que se descargan en cada carga completa (`debtPayments` no tiene ventana de historial).
3. **`deleteSavingsBucket`** lee los `concepts` con `savingsContribution.bucketId == bucketId`. En el mismo lote les quita `savingsContribution` y borra el fondo.
4. **Límite de 500 escrituras por lote.** `commitUserDataMutationBatch` añade la escritura de `users/{uid}`, así que la cascada se reparte en lotes de 450 (`MAX_CASCADE_WRITES_PER_BATCH`).
   - El borrado principal va siempre en el último lote. Si un lote falla, el objetivo sigue existiendo y repetir la operación termina el trabajo, porque las lecturas encuentran lo que falta.
   - Los errores de lectura no se tragan: uno transitorio deja la operación en la cola.
5. **Store.** `createDebtsSlice.deleteDebt` aplica la misma limpieza en memoria (conceptos y abonos) y la revierte entera en el `catch` (AGENTS.md §6.2). `deleteSavingsBucket` ya limpiaba los conceptos y los revertía. `InMemoryBudgetRepository` hace la misma cascada.
6. **Reglas e índices.**
   - `firestore.rules` no cambia: la actualización de un concepto valida el documento resultante (`isValidConcept`), que acepta los dos campos ausentes, y conserva `id` y `type`.
   - Las consultas son de igualdad sobre un solo campo y usan los índices automáticos, así que `firestore.indexes.json` no cambia.

---

## 3. Consecuencias

- **Positivas:**
  - Borrar sin red borra de verdad al reconectar.
  - La cola no repite escrituras inútiles sobre un objeto borrado.
  - La configuración inicial sobrevive a la falta de red.
  - La nube no conserva vínculos a deudas o fondos inexistentes.
  - Una cola guardada con un formato antiguo o dañado ya no rompe ni bloquea el drenado.
- **Compensaciones:**
  - Borrar una deuda o un fondo hace una o dos lecturas antes del lote, y cuesta un documento leído por concepto o abono afectado.
  - Borrar una deuda elimina sus abonos de los meses abiertos y archivados. Si se reabre un mes cerrado, sus cifras se recalculan sin esa deuda.
  - Las operaciones antiguas que no encajan se pierden. Solo se avisa al usuario: no se intenta repararlas, salvo el borrado del BUG-01.
- **Pendiente de verificar:**
  - Nada se ha probado contra el emulador de Firestore ni contra un proyecto real: el `batch.update` con `deleteField()` frente a `firestore.rules`, las consultas por `savingsContribution.bucketId` y `debtId`, y el reparto en varios lotes.
  - La cola tampoco se ha probado sin red en un dispositivo.
