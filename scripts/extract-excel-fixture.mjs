#!/usr/bin/env node
/**
 * scripts/extract-excel-fixture.mjs
 *
 * Reproducible zero-dependency extractor that reads
 * `docs/reference/Control_Ingresos_y_gastos_mensuales.xlsx` (sheet "Octubre 2026")
 * without modifying the source Excel file, and generates:
 *   1. `fixtures/october-2026.json` (Golden test fixture + raw cell/formula audit)
 *   2. `fixtures/seed-october-2026.json` (Domain seed data for October 2026)
 *
 * Usage (Windows PowerShell / CI):
 *   node scripts/extract-excel-fixture.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const EXCEL_RELATIVE_PATH = 'docs/reference/Control_Ingresos_y_gastos_mensuales.xlsx';
const FIXTURE_OUTPUT_PATH = 'fixtures/october-2026.json';
const SEED_OUTPUT_PATH = 'fixtures/seed-october-2026.json';

function readZipEntries(filePath) {
  const buf = fs.readFileSync(filePath);
  const entries = new Map();

  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error(`Invalid .xlsx ZIP file: ${filePath}`);
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  let ptr = cdOffset;
  for (let idx = 0; idx < totalEntries; idx++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error('Corrupt Central Directory header in .xlsx');
    }
    const compressionMethod = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const fileNameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const fileName = buf.toString('utf8', ptr + 46, ptr + 46 + fileNameLen);

    const localFileNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
    const rawSlice = buf.subarray(dataStart, dataStart + compressedSize);

    const content =
      compressionMethod === 0
        ? rawSlice
        : compressionMethod === 8
          ? zlib.inflateRawSync(rawSlice)
          : (() => {
              throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
            })();

    entries.set(fileName, content.toString('utf8'));
    ptr += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let siMatch;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const inner = siMatch[1];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tMatch;
    let text = '';
    while ((tMatch = tRegex.exec(inner)) !== null) {
      text += decodeXmlEntities(tMatch[1]);
    }
    strings.push(text);
  }
  return strings;
}

function parseSheetCells(sheetXml, sharedStrings) {
  const cells = {};
  const cRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let match;
  while ((match = cRegex.exec(sheetXml)) !== null) {
    const attrs = match[1];
    const body = match[2] || '';
    const refMatch = /\br="([A-Z]+\d+)"/.exec(attrs);
    if (!refMatch) continue;
    const ref = refMatch[1];
    const typeMatch = /\bt="([^"]+)"/.exec(attrs);
    const cellType = typeMatch ? typeMatch[1] : 'n';

    const fMatch = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body);
    const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);

    const formula = fMatch ? decodeXmlEntities(fMatch[1]) : null;
    const rawVal = vMatch ? decodeXmlEntities(vMatch[1]) : null;

    let value = null;
    if (rawVal !== null) {
      if (cellType === 's') {
        value = sharedStrings[Number(rawVal)] ?? rawVal;
      } else if (cellType === 'b') {
        value = rawVal === '1' || rawVal.toUpperCase() === 'TRUE';
      } else if (cellType === 'str') {
        value = rawVal;
      } else {
        const num = Number(rawVal);
        value = Number.isNaN(num) ? rawVal : num;
      }
    }

    if (value !== null || formula !== null) {
      cells[ref] = {
        ref,
        type: cellType,
        value,
        ...(formula ? { formula } : {}),
      };
    }
  }
  return cells;
}

function excelSerialToIsoDate(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return undefined;
  const epochMs = Date.UTC(1899, 11, 30);
  const dateMs = epochMs + Math.round(serial) * 86400 * 1000;
  return new Date(dateMs).toISOString().slice(0, 10);
}

function parseCopTextToFloat(str) {
  if (typeof str === 'number') return str;
  const cleaned = String(str)
    .replace(/\$/g, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return Number(cleaned);
}

function slugify(text, prefix) {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${prefix}_${normalized}`;
}

function main() {
  const rootDir = process.cwd();
  const excelPath = path.resolve(rootDir, EXCEL_RELATIVE_PATH);

  if (!fs.existsSync(excelPath)) {
    console.error(`ERROR: Excel file not found at ${excelPath}`);
    process.exit(1);
  }

  const entries = readZipEntries(excelPath);
  const sharedStrings = parseSharedStrings(entries.get('xl/sharedStrings.xml'));
  const sheetXml = entries.get('xl/worksheets/sheet1.xml');
  if (!sheetXml) {
    throw new Error('Could not find xl/worksheets/sheet1.xml in workbook.');
  }

  const cells = parseSheetCells(sheetXml, sharedStrings);

  // Confirmed business rules:
  // - Prima recurrence is strictly June and December ([6, 12]), while October 2026 keeps its historical pending row
  // - Cuota FUNFAMI ($1.800.000) goes 100% to principal on CB300F - MOTO ($4.400.000 -> $2.600.000)
  // - Both CB300F ($500.000) and Gasolina Moto/Carro ($200.000) contribute to Moto savings ($2.300.000)
  // - Gasolina in IDEAL is linked to exp_gasolina_moto_carro; Parqueadero in IDEAL is independent of Parqueadero CEM
  // - Kit de arrastre Honda original ($500.000) is a target goal for 2027-08
  const incomeRows = [
    { row: 10, group: 'fixed', allowMultiplePerMonth: false, recurrence: { kind: 'monthly' } },
    { row: 11, group: 'fixed', allowMultiplePerMonth: false, recurrence: { kind: 'specific_months', months: [6, 12] } },
    { row: 15, group: 'variable', allowMultiplePerMonth: true, recurrence: { kind: 'monthly' } },
  ];

  const expenseRows = [
    { row: 10, group: 'fixed', allowMultiplePerMonth: false, savingsBucketId: 'moto' },
    {
      row: 11,
      group: 'fixed',
      allowMultiplePerMonth: false,
      linkedDebtGroup: 'FUNFAMI',
      defaultTargetDebtId: 'debt_cb300f_moto',
    },
    { row: 12, group: 'fixed', allowMultiplePerMonth: false },
    { row: 13, group: 'fixed', allowMultiplePerMonth: false },
    { row: 14, group: 'fixed', allowMultiplePerMonth: false },
    { row: 15, group: 'fixed', allowMultiplePerMonth: false },
    { row: 16, group: 'fixed', allowMultiplePerMonth: false, savingsBucketId: 'moto', idealMotoMatch: 'GASOLINA' },
    { row: 17, group: 'fixed', allowMultiplePerMonth: false },
    { row: 21, group: 'variable', allowMultiplePerMonth: false },
    { row: 22, group: 'variable', allowMultiplePerMonth: false },
    { row: 23, group: 'variable', allowMultiplePerMonth: true },
  ];

  const monthKey = '2026-10';
  const concepts = [];
  const monthEntries = [];

  incomeRows.forEach((meta, idx) => {
    const r = meta.row;
    const name = String(cells[`A${r}`]?.value ?? '').trim();
    const amount = Math.round(Number(cells[`B${r}`]?.value ?? 0));
    const received = Boolean(cells[`C${r}`]?.value);
    const completedAt = excelSerialToIsoDate(cells[`D${r}`]?.value);
    const note = cells[`E${r}`]?.value ? String(cells[`E${r}`].value) : undefined;
    const conceptId = slugify(name, 'inc');

    concepts.push({
      id: conceptId,
      name,
      type: 'income',
      group: meta.group,
      defaultAmount: amount,
      allowMultiplePerMonth: meta.allowMultiplePerMonth,
      recurrence: meta.recurrence,
      archived: false,
      order: idx + 1,
      excelRow: r,
    });

    monthEntries.push({
      id: `${monthKey}_${conceptId}`,
      monthKey,
      conceptId,
      conceptName: name,
      type: 'income',
      group: meta.group,
      plannedAmount: amount,
      actualAmount: amount,
      status: received ? 'completed' : 'pending',
      ...(completedAt ? { completedAt } : {}),
      ...(note ? { note } : {}),
      excelCoords: {
        nameCell: `A${r}`,
        amountCell: `B${r}`,
        statusCell: `C${r}`,
        dateCell: `D${r}`,
      },
    });
  });

  expenseRows.forEach((meta, idx) => {
    const r = meta.row;
    const name = String(cells[`G${r}`]?.value ?? '').trim();
    const amount = Math.round(Number(cells[`H${r}`]?.value ?? 0));
    const paid = Boolean(cells[`I${r}`]?.value);
    const excelStateText = String(cells[`J${r}`]?.value ?? (paid ? 'Pagado' : 'Pendiente'));
    const completedAt = excelSerialToIsoDate(cells[`K${r}`]?.value);
    const note = cells[`L${r}`]?.value ? String(cells[`L${r}`].value) : undefined;
    const conceptId = slugify(name, 'exp');

    concepts.push({
      id: conceptId,
      name,
      type: 'expense',
      group: meta.group,
      defaultAmount: amount,
      allowMultiplePerMonth: meta.allowMultiplePerMonth,
      recurrence: { kind: 'monthly' },
      ...(meta.linkedDebtGroup ? { linkedDebtGroup: meta.linkedDebtGroup } : {}),
      ...(meta.defaultTargetDebtId ? { defaultTargetDebtId: meta.defaultTargetDebtId } : {}),
      ...(meta.savingsBucketId
        ? { savingsContribution: { bucketId: meta.savingsBucketId, onlyWhenCompleted: true } }
        : {}),
      ...(meta.idealMotoMatch ? { idealMotoCategoryKey: meta.idealMotoMatch } : {}),
      archived: false,
      order: idx + 1,
      excelRow: r,
    });

    monthEntries.push({
      id: `${monthKey}_${conceptId}`,
      monthKey,
      conceptId,
      conceptName: name,
      type: 'expense',
      group: meta.group,
      plannedAmount: amount,
      actualAmount: amount,
      status: paid ? 'completed' : 'pending',
      excelDerivedState: excelStateText,
      ...(completedAt ? { completedAt } : {}),
      ...(note ? { note } : {}),
      excelCoords: {
        nameCell: `G${r}`,
        amountCell: `H${r}`,
        statusCell: `I${r}`,
        derivedStateCell: `J${r}`,
        dateCell: `K${r}`,
      },
    });
  });

  const debts = [
    {
      id: 'debt_cb300f_moto',
      groupKey: 'FUNFAMI',
      name: String(cells.G2?.value),
      lender: 'FUNFAMI',
      openingBalance: Math.round(Number(cells.H2?.value)),
      currentBalanceAfterOctInstallment: Math.round(Number(cells.H2?.value)) - 1_800_000,
      monthKey,
      excelCells: { name: 'G2', openingBalance: 'H2' },
    },
    {
      id: 'debt_esp_ia',
      groupKey: 'FUNFAMI',
      name: String(cells.G3?.value),
      lender: 'FUNFAMI',
      openingBalance: Math.round(Number(cells.H3?.value)),
      currentBalanceAfterOctInstallment: Math.round(Number(cells.H3?.value)),
      monthKey,
      excelCells: { name: 'G3', openingBalance: 'H3' },
    },
  ];

  const debtPayments = [
    {
      id: '2026-10_exp_cuota_funfami_debt_cb300f_moto',
      entryId: '2026-10_exp_cuota_funfami',
      monthKey,
      debtId: 'debt_cb300f_moto',
      principalAmount: 1_800_000,
      interestAmount: 0,
      totalApplied: 1_800_000,
      completedAt: '2026-10-27',
      active: true,
    },
  ];

  const savingsBuckets = [
    {
      id: 'moto',
      name: 'Moto',
      excelOpeningLabel: String(cells.J2?.value),
      openingBalance: Math.round(Number(cells.K2?.value)),
      excelCurrentLabel: String(cells.J4?.value),
      excelCurrentValue: Math.round(Number(cells.K4?.value)),
      excelCurrentFormula: cells.K4?.formula,
    },
    {
      id: 'savings',
      name: 'Ahorros',
      excelOpeningLabel: String(cells.J3?.value),
      openingBalance: Math.round(Number(cells.K3?.value)),
      excelCurrentLabel: String(cells.J5?.value),
      excelCurrentValue: Math.round(Number(cells.K5?.value)),
      excelCurrentFormula: cells.K5?.formula,
    },
  ];

  // Confirmed annual cycle costs for prorated items in IDEAL Moto
  const annualCycleSpecs = {
    SOAT: { cycleCostCop: 800_000, periodMonths: 12 },
    GASOLINA: { cycleCostCop: 200_000, periodMonths: 1, linkedConceptId: 'exp_gasolina_moto_carro' },
    IMPUESTO: { cycleCostCop: 252_000, periodMonths: 12 },
    MANTEMIENTO: { cycleCostCop: 200_000, periodMonths: 1 },
    PARQUEADERO: { cycleCostCop: 210_000, periodMonths: 1 }, // Confirmed independent from Parqueadero CEM ($120.000)
    CASCO: { cycleCostCop: 500_000, periodMonths: 12 },
    'CAMBIO DE ACEITE': { cycleCostCop: 50_000, periodMonths: 1 },
    LLANTAS: { cycleCostCop: 1_000_000, periodMonths: 12 },
  };

  const idealRows = [34, 35, 36, 37, 38, 39, 40, 41, 42];
  const idealItems = idealRows.map((r) => {
    const rawName = String(cells[`A${r}`]?.value ?? '').trim();
    const rawTextValue = String(cells[`B${r}`]?.value ?? '').trim();
    const numericAmount = Math.round(parseCopTextToFloat(rawTextValue));
    const isTargetGoal = r === 42;
    const cycleSpec = annualCycleSpecs[rawName];
    return {
      id: slugify(rawName, 'ideal'),
      excelRow: r,
      excelRawName: rawName,
      displayName: rawName === 'MANTEMIENTO' ? 'Mantenimiento' : rawName,
      excelRawTextValue: rawTextValue,
      monthlyAmountCop: numericAmount,
      ...(cycleSpec
        ? {
            cycleCostCop: cycleSpec.cycleCostCop,
            periodMonths: cycleSpec.periodMonths,
            ceilMonthlyCop: Math.ceil(cycleSpec.cycleCostCop / cycleSpec.periodMonths),
            ...(cycleSpec.linkedConceptId ? { linkedConceptId: cycleSpec.linkedConceptId } : {}),
          }
        : {}),
      ...(isTargetGoal
        ? {
            targetAmountCop: 500_000,
            targetMonthKey: '2027-08',
            targetDateIso: '2027-08-31',
          }
        : {}),
      includedInExcelTotalB43: !isTargetGoal,
      kind: isTargetGoal ? 'target_goal' : 'recurring_provision',
    };
  });

  const goldenValues = {
    B2_ingresosRecibidosrotuladoPrevistos: {
      cell: 'B2',
      label: String(cells.A2?.value),
      formula: cells.B2?.formula,
      excelValue: Math.round(Number(cells.B2?.value)),
      correctedPlannedIncome: 6_000_000,
      correctedReceivedIncome: 4_000_000,
    },
    B3_gastosPrevistos: {
      cell: 'B3',
      label: String(cells.A3?.value),
      formula: cells.B3?.formula,
      excelValue: Math.round(Number(cells.B3?.value)),
    },
    B4_gastosPagados: {
      cell: 'B4',
      label: String(cells.A4?.value),
      formula: cells.B4?.formula,
      excelValue: Math.round(Number(cells.B4?.value)),
    },
    B5_gastosPendientes: {
      cell: 'B5',
      label: String(cells.A5?.value),
      formula: cells.B5?.formula,
      excelValue: Math.round(Number(cells.B5?.value)),
    },
    B6_flujoNeto: {
      cell: 'B6',
      label: String(cells.A6?.value),
      formula: cells.B6?.formula,
      excelValue: Math.round(Number(cells.B6?.value)),
      projectedNetFlow: 2_630_000,
    },
    H18_totalGastosFijosPagados: {
      cell: 'H18',
      label: String(cells.G18?.value),
      formula: cells.H18?.formula,
      excelValue: Math.round(Number(cells.H18?.value)),
      plannedFixedExpenses: 2_970_000,
      pendingFixedExpenses: 350_000,
    },
    H24_totalGastosVariablesPagados: {
      cell: 'H24',
      label: String(cells.G24?.value),
      formula: cells.H24?.formula,
      excelValue: Math.round(Number(cells.H24?.value)),
      plannedVariableExpenses: 400_000,
      pendingVariableExpenses: 100_000,
    },
    H6_totalDeudaFunfami: {
      cell: 'H6',
      label: String(cells.G6?.value),
      formula: cells.H6?.formula,
      excelValue: Math.round(Number(cells.H6?.value)),
      openingDebtTotal: 8_000_000,
      installmentApplied: 1_800_000,
      cb300fMotoRemaining: 2_600_000,
      espIaRemaining: 3_600_000,
    },
    K4_motoAhora: {
      cell: 'K4',
      label: String(cells.J4?.value),
      formula: cells.K4?.formula,
      excelValue: Math.round(Number(cells.K4?.value)),
    },
    K5_ahorrosAhora: {
      cell: 'K5',
      label: String(cells.J5?.value),
      formula: cells.K5?.formula,
      excelValue: Math.round(Number(cells.K5?.value)),
      projectedAfterPendingExpenses: 1_630_000,
    },
    K6_totalAhorros: {
      cell: 'K6',
      label: String(cells.J6?.value),
      formula: cells.K6?.formula,
      excelValue: Math.round(Number(cells.K6?.value)),
    },
    B43_idealMotoTotal: {
      cell: 'B43',
      label: String(cells.A43?.value),
      excelRawTextValue: String(cells.B43?.value),
      excelNumericFloat: parseCopTextToFloat(cells.B43?.value),
      recurringSumCopInteger: 872_667,
      fullSumIncludingKitCopInteger: 1_372_667,
    },
    checklistProgress: {
      completedCount: 6,
      totalTrackableCount: 12,
      excludedMultiplePerMonthConceptIds: ['inc_otros_ingresos_variables', 'exp_otro'],
    },
  };

  const fixturePayload = {
    meta: {
      sourceFile: EXCEL_RELATIVE_PATH,
      sheetName: 'Octubre 2026',
      monthKey,
      currency: 'COP',
      timezone: 'America/Bogota',
      generatedBy: 'scripts/extract-excel-fixture.mjs',
    },
    goldenValues,
    concepts,
    monthEntries,
    debts,
    debtPayments,
    savingsBuckets,
    idealMotoPlan: {
      items: idealItems,
      excelReportedTotalText: String(cells.B43?.value),
      recurringMonthlyTotalCop: 872_667,
      totalWithTargetGoalCop: 1_372_667,
    },
    rawCells: cells,
  };

  const seedPayload = {
    version: 1,
    monthKey,
    concepts,
    entries: monthEntries.filter((e) => {
      const c = concepts.find((concept) => concept.id === e.conceptId);
      return !c?.allowMultiplePerMonth;
    }),
    debts,
    debtPayments,
    savingsBuckets: savingsBuckets.map((b) => ({
      id: b.id,
      name: b.name,
      openingBalance: b.openingBalance,
      baseMonthKey: monthKey,
    })),
    provisionPlan: {
      id: 'moto_ideal',
      name: 'Provisión IDEAL Moto (CB300F)',
      recurringItems: idealItems.filter((i) => i.kind === 'recurring_provision'),
      targetGoals: idealItems.filter((i) => i.kind === 'target_goal'),
    },
  };

  fs.mkdirSync(path.dirname(path.resolve(rootDir, FIXTURE_OUTPUT_PATH)), { recursive: true });
  fs.writeFileSync(
    path.resolve(rootDir, FIXTURE_OUTPUT_PATH),
    JSON.stringify(fixturePayload, null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(
    path.resolve(rootDir, SEED_OUTPUT_PATH),
    JSON.stringify(seedPayload, null, 2) + '\n',
    'utf8'
  );

  console.log(`✅ Extracted fixture -> ${FIXTURE_OUTPUT_PATH}`);
  console.log(`✅ Extracted seed    -> ${SEED_OUTPUT_PATH}`);
}

main();
