---
name: write-tests-for-change
description: >-
  Mandatory QA skill triggered on every code change. Ensures unit tests, Excel
  golden parity tests, component tests (RNTL), and Firestore emulator tests are
  written and passing with >=80% domain coverage.
---

# Write Tests for Change (`write-tests-for-change`)

## Mandatory QA Checklist
No task in `src/` is complete until all applicable test layers are written and green:

1. **Golden Parity Check (`src/domain/__tests__/golden-october-2026.test.ts`):**
   - Feeds `fixtures/october-2026.json` into domain calculators and asserts exact COP integer equality with the Excel table (`4_000_000`, `6_000_000`, `3_370_000`, `2_920_000`, `450_000`, `1_080_000`, `6_200_000`, `2_300_000`, `2_080_000`, `4_380_000`, `872_667`, `1_372_667`, `6/12`).
2. **Checklist Edge Cases:**
   - Concept hidden after completion in current month; reappears next month; reappears when unchecked/deleted; `allowMultiplePerMonth` always remains available; year rollover (`2026-12` → `2027-01`); `America/Bogota` timezone boundary (`23:59` vs `00:01`); idempotent `ensureMonthPlan`.
3. **Money & Rounding:**
   - Integer validation (`Number.isSafeInteger`), `formatCop()` (`"$ 1.080.000"`), and `Math.ceil(cost / periodMonths)` for provision items.
4. **CI Gate:**
   - Run `npm run typecheck && npm run lint && npm test -- --coverage` and verify domain coverage is `>= 80%`.
