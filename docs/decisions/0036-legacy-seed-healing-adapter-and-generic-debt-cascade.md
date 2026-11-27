# 0036. Saneamiento de la cuenta semilla aislado y orden genérico de la cascada de cuotas

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Extiende el ADR [0005](0005-universal-domain-refactoring-and-bias-elimination.md) (dominio universal) y el [0028](0028-archived-history-window-and-widget-sync-coalescing.md) (carga de la cuenta). Implementa la parte de CC-05 de la Fase 4 del [plan consolidado de auditorías](../Improvements/AUDITS/plan_consolidado_pendientes_auditorias.md).
- **Autores:** Architect, QA Engineer y Reviewer

---

## 1. Contexto y problema

El ADR 0005 sacó del dominio los nombres de la cuenta semilla (el Excel de octubre de 2026), pero quedaban tres restos en código universal:

1. **Saneamiento en la carga.** `loadFullCloudAccount` corregía, mezclado con el resto de la carga, valores que versiones antiguas escribieron en la cuenta semilla (`EXPO_PUBLIC_OWNER_SEED_EMAIL`):
   - El fondo `savings` con apertura de 14.800.000, 13.800.000 o 16.880.000 (un error que copiaba saldos entre cuentas) vuelve a 1.000.000.
   - Si el primer mes cargado es octubre de 2026 pero las deudas y los fondos ya se habían pasado a un mes posterior, se restauran las aperturas de octubre (`debt_cb300f_moto` 4.400.000, `debt_esp_ia` y `debt_especializacion` 3.600.000, `moto` 1.600.000, `savings` 1.000.000) para no contar dos veces los meses intermedios.
   - Al encadenar saldos, la apertura guardada de esas deudas no cuenta como edición del usuario si es el valor de octubre de un reinicio antiguo.
2. **Prioridad de una deuda en el dominio.** `buildDebtPaymentsForInstallment` ordenaba la cascada con la deuda objetivo explícita primero, después `debt_cb300f_moto` («por compatibilidad con el fixture») y luego por `id`.
3. **Respaldo en la vista.** `DebtsFunfamiView` buscaba `debt_cb300f_moto` cuando ninguna deuda estaba liquidada.

---

## 2. Decisión

### 2.1. Adaptador `legacySeedHealing.ts`

1. Las tres correcciones del punto 1 viven solo en `src/data/repositories/legacySeedHealing.ts`, como funciones que reciben lo leído y devuelven una copia corregida, o `null` si no aplica: `healCorruptedOwnerSavingsBucket`, `restoreOwnerSeedFirstMonthDebt`, `restoreOwnerSeedFirstMonthBucket` e `isLegacySeedResetOpening`.
2. Solo se aplican a la cuenta semilla sin reiniciar (`isOwnerSeedAccount` de `accountHydration.ts`). La excepción es `isLegacySeedResetOpening`, que compara por id; esos ids solo existen en esa cuenta.
3. Ningún otro archivo de `src/` fuera de los tests nombra esos ids ni esos importes. El fondo saneado se escribe de vuelta desde el repositorio, igual que antes.
4. **No se elimina todavía.** Desde este entorno no se puede leer el proyecto de Firebase real, así que no se puede demostrar que la cuenta semilla ya no tiene esos valores. Para eliminarlo:
   1. En la consola de Firestore, en `users/{uid de la cuenta semilla}`, comprobar que `savingsBuckets/savings.openingBalance` no es ninguno de los tres valores.
   2. Comprobar que ningún documento de `debts` ni de `savingsBuckets` tiene `monthKey` posterior a `2026-10` con la apertura de octubre, o que la cuenta ya tiene el `monthSnapshot` de `2026-10` (con él, el primer mes se reconstruye desde el snapshot y la restauración no se usa).
   3. Borrar `legacySeedHealing.ts`, sus llamadas en `accountHydration.ts` y su test, y anotar aquí la fecha.

### 2.2. Orden genérico de la cascada

1. `orderDebtsForCascade` (en `src/domain/debts/debtCalculator.ts`) pone primero la deuda objetivo explícita (`defaultTargetDebtId` del concepto o la elegida al pagar) y luego el resto por `id`.
2. Se ordena por `id` y no por el orden de llegada para que todos los dispositivos calculen los mismos abonos, lleguen las deudas de Firestore (por id de documento) o de la memoria (por orden de inserción). `Debt` no tiene `sortOrder` ni fecha de creación; añadirlos sería un cambio de esquema y de `firestore.rules` que no hace falta para quitar el sesgo.
3. **Los tests dorados no cambian.** En el fixture, el concepto `exp_cuota_funfami` tiene `defaultTargetDebtId: debt_cb300f_moto`, así que esa deuda va primero por ser el objetivo explícito. Además, `debt_cb300f_moto` va antes que `debt_esp_ia` también por `id`.

### 2.3. Vista de deudas

`DebtsFunfamiView` celebra la primera deuda que tenía saldo este mes y llegó a 0. El respaldo a `debt_cb300f_moto` nunca podía mostrar el aviso (la condición exige saldo inicial mayor que 0 y saldo final 0, que es lo que ya busca la primera búsqueda), así que se quita sin cambiar lo que se ve. Los `testID` (`moto-debt-completed-banner`, `moto-debt-banner-dismiss-button`) se conservan.

---

## 3. Consecuencias

- **Positivas:**
  - El dominio y las vistas ya no conocen la cuenta semilla; la carga de la cuenta es genérica salvo por un adaptador con nombre propio.
  - El saneamiento tiene tests propios y se puede borrar de una vez.
- **Compensaciones:**
  - Cambia el orden de la cascada en un caso: una cuota sin deuda objetivo, en la cuenta semilla, con una deuda cuyo `id` vaya antes que `debt_cb300f_moto` (por ejemplo `debt_auto`). Antes se abonaba primero la moto; ahora, esa otra deuda. Con el concepto de la semilla, que apunta a la moto, no cambia nada.
- **Pendiente de verificar:**
  - Que la cuenta semilla real ya no tiene los valores corregidos (§2.1.4).
  - Nada se ha probado contra el emulador de Firestore ni contra el Excel en este cambio; la paridad se mantiene con `fixtures/october-2026.json`.
