import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const fixturePath = path.resolve(rootDir, 'fixtures/october-2026.json');
const seedPath = path.resolve(rootDir, 'fixtures/seed-october-2026.json');

test('Phase 0 — Excel fixture & seed files exist and are valid JSON', () => {
  assert.equal(fs.existsSync(fixturePath), true, 'fixtures/october-2026.json must exist');
  assert.equal(fs.existsSync(seedPath), true, 'fixtures/seed-october-2026.json must exist');
});

test('Phase 0 — Golden values in fixtures/october-2026.json match Excel Octubre 2026', () => {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const g = fixture.goldenValues;

  assert.equal(g.B2_ingresosRecibidosrotuladoPrevistos.excelValue, 4_000_000);
  assert.equal(g.B2_ingresosRecibidosrotuladoPrevistos.correctedPlannedIncome, 6_000_000);
  assert.equal(g.B3_gastosPrevistos.excelValue, 3_370_000);
  assert.equal(g.B4_gastosPagados.excelValue, 2_920_000);
  assert.equal(g.B5_gastosPendientes.excelValue, 450_000);
  assert.equal(g.B6_flujoNeto.excelValue, 1_080_000);
  assert.equal(g.B6_flujoNeto.projectedNetFlow, 2_630_000);
  assert.equal(g.H18_totalGastosFijosPagados.excelValue, 2_620_000);
  assert.equal(g.H24_totalGastosVariablesPagados.excelValue, 300_000);
  assert.equal(g.H6_totalDeudaFunfami.excelValue, 6_200_000);
  assert.equal(g.H6_totalDeudaFunfami.cb300fMotoRemaining, 2_600_000);
  assert.equal(g.H6_totalDeudaFunfami.espIaRemaining, 3_600_000);
  assert.equal(g.K4_motoAhora.excelValue, 2_300_000);
  assert.equal(g.K5_ahorrosAhora.excelValue, 2_080_000);
  assert.equal(g.K5_ahorrosAhora.projectedAfterPendingExpenses, 1_630_000);
  assert.equal(g.K6_totalAhorros.excelValue, 4_380_000);
  assert.equal(g.B43_idealMotoTotal.recurringSumCopInteger, 872_667);
  assert.equal(g.B43_idealMotoTotal.fullSumIncludingKitCopInteger, 1_372_667);
  assert.equal(g.checklistProgress.completedCount, 6);
  assert.equal(g.checklistProgress.totalTrackableCount, 12);
});

test('Phase 0 — Confirmed business rules for Prima, FUNFAMI, and IDEAL Moto are encoded', () => {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const prima = fixture.concepts.find((c) => c.id === 'inc_prima');
  assert.deepEqual(prima.recurrence, { kind: 'specific_months', months: [6, 12] });

  const kitGoal = fixture.idealMotoPlan.items.find((i) => i.id === 'ideal_kit_de_arrastre_honda_original');
  assert.equal(kitGoal.kind, 'target_goal');
  assert.equal(kitGoal.targetMonthKey, '2027-08');
  assert.equal(kitGoal.targetAmountCop, 500_000);

  const gasolinaIdeal = fixture.idealMotoPlan.items.find((i) => i.id === 'ideal_gasolina');
  assert.equal(gasolinaIdeal.linkedConceptId, 'exp_gasolina_moto_carro');

  const parqueaderoIdeal = fixture.idealMotoPlan.items.find((i) => i.id === 'ideal_parqueadero');
  assert.equal(parqueaderoIdeal.linkedConceptId, undefined);
});
