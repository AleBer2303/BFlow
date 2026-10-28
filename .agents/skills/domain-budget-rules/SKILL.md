---
name: domain-budget-rules
description: >-
  Enforces the exact business logic, formulas, checklist availability rules, and
  October 2026 golden values extracted from the source-of-truth Excel workbook
  (Control_Ingresos_y_gastos_mensuales.xlsx). Activate whenever implementing,
  modifying, or testing domain calculations in src/domain/.
---

# Domain Budget Rules & Golden Values (`domain-budget-rules`)

## 1. Golden Values (October 2026 — `monthKey: "2026-10"`)

Every domain calculation in `src/domain/` MUST reproduce these exact integer values (in COP) when fed `fixtures/october-2026.json`:

| Metric | Excel Cell / Formula | Golden Value (COP) | Notes |
| :--- | :--- | ---: | :--- |
| `receivedIncome` | `B2` (`=B17`) | `4_000_000` | Salario Principal (`2026-10-21`) |
| `plannedIncome` | `SUM(B10:B15)` | `6_000_000` | Salario (`4M`) + Prima (`2M`) |
| `pendingIncome` | `SUMIF(C=FALSE)` | `2_000_000` | Prima (`2M`) |
| `plannedExpenses` | `B3` (`SUM(H10:H17)+SUM(H21:H23)`) | `3_370_000` | Fixed (`2.97M`) + Variable (`400k`) |
| `paidExpenses` | `B4` (`=H25`) | `2_920_000` | Fixed paid (`2.62M`) + Variable paid (`300k`) |
| `pendingExpenses` | `B5` (`SUMIF(I=FALSE)`) | `450_000` | Fixed pending (`350k`) + Variable pending (`100k`) |
| `netCashFlow` | `B6` (`=B2-B4`) | `1_080_000` | `receivedIncome - paidExpenses` |
| `projectedNetFlow` | `plannedIncome - plannedExpenses` | `2_630_000` | `6_000_000 - 3_370_000` |
| `paidFixedExpenses` | `H18` | `2_620_000` | CB300F + FUNFAMI + Parqueadero + Gasolina |
| `paidVariableExpenses` | `H24` | `300_000` | Tarjeta Nu |
| `totalDebtFunfami` | `H6` (`=SUM(H2:H3)-H11`) | `6_200_000` | `(4_400_000 + 3_600_000) - 1_800_000` (only when paid) |
| `motoCurrentBalance` | `K4` (`=K2+H10+H16`) | `2_300_000` | `1_600_000 + 500_000 + 200_000` (only when paid) |
| `savingsCurrentBalance` | `K5` (`=K3+B6`) | `2_080_000` | `1_000_000 + 1_080_000` |
| `savingsProjectedAfterPending` | `K5 - B5` | `1_630_000` | `2_080_000 - 450_000` |
| `totalSavings` | `K6` (`=SUM(K4:K5)`) | `4_380_000` | `2_300_000 + 2_080_000` |
| `idealMotoRecurringMonthly` | `B43` (rounded COP integer) | `872_667` | Sum of `B34:B41` (`66.667 + 200k + 21k + 200k + 210k + 41.667 + 50k + 83.333`) |
| `idealMotoWithTargetGoal` | `SUM(B34:B42)` | `1_372_667` | Includes Kit de Arrastre Honda Original (`500_000`) |
| `checklistProgress` | Completed / Trackable | `6 / 12` | Excludes `allowMultiplePerMonth` concepts |

## 2. Checklist & Availability Rules

1. **`ensureMonthPlan(monthKey, concepts, existingEntries)`**:
   - Idempotent pure function.
   - Creates a `pending` `MonthEntry` with deterministic ID `${monthKey}_${concept.id}` for every non-archived concept whose `recurrence` includes `monthKey` AND where `allowMultiplePerMonth === false`.
   - Never creates pre-populated entries for `allowMultiplePerMonth === true` (`Otros Ingresos Variables`, `Otro`).
2. **`getAvailableConcepts(concepts, entries, monthKey, type)`**:
   - Returns active concepts of `type` where either:
     - `concept.allowMultiplePerMonth === true`, OR
     - There is NO entry for `(monthKey, concept.id)` with `status === 'completed'`.
3. **Checklist Progress**:
   - Only concepts with `allowMultiplePerMonth === false` active for `monthKey` count toward the `completed / total` ratio (`6 / 12` in October 2026).
