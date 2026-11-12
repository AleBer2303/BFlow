import { z } from 'zod';

import {
  buildMonthlyHistory,
  calculateChecklistProgress,
  calculateDebtsSummary,
  calculateMonthlyBudgetSummary,
  isValidMonthKey,
  toAppMonthKey,
  type Concept,
  type Debt,
  type DebtPayment,
  type MonthEntry,
  type MonthSnapshot,
  type SavingsBucket,
} from '../../domain';

/**
 * Contrato compartido con los widgets nativos (ADR 0021).
 *
 * La app (cualquier plataforma) calcula el snapshot con el dominio y lo entrega ya resuelto:
 * los widgets de iOS (`targets/widgets/WidgetSnapshotModels.swift`) y Android
 * (`modules/bflow-widgets/android/.../WidgetSnapshot.kt`) solo lo pintan. Cualquier campo
 * nuevo se añade aquí y en ambos decodificadores en el mismo cambio.
 */
export const WIDGET_SNAPSHOT_SCHEMA_VERSION = 2 as const;

/** Clave del snapshot en el App Group (iOS) y en las preferencias del widget (Android). */
export const WIDGET_STORAGE_KEY = 'bflow_widget_snapshot_v2';

/** Clave de las credenciales con las que el widget refresca el snapshot desde Firestore. */
export const WIDGET_AUTH_STORAGE_KEY = 'bflow_widget_auth_v1';

/** Documento derivado en la nube: `users/{uid}/widgetSnapshots/current`. */
export const WIDGET_CLOUD_COLLECTION = 'widgetSnapshots';
export const WIDGET_CLOUD_DOC_ID = 'current';

export const WIDGET_MAX_PENDING_ITEMS = 8;
export const WIDGET_MAX_TREND_POINTS = 6;
/** Tope del JSON serializado; las reglas de Firestore aplican el mismo límite. */
export const WIDGET_MAX_PAYLOAD_LENGTH = 16_000;

export interface WidgetPendingItemV2 {
  id: string;
  name: string;
  amount: number;
  type: 'income' | 'expense';
}

export interface WidgetTrendPointV2 {
  monthKey: string;
  receivedIncome: number;
  paidExpenses: number;
  netCashFlow: number;
}

export interface WidgetSnapshotV2 {
  schemaVersion: typeof WIDGET_SNAPSHOT_SCHEMA_VERSION;
  updatedAtIso: string;
  monthKey: string;
  currencySymbol: string;
  thousandsSeparator: string;
  plannedIncome: number;
  receivedIncome: number;
  pendingIncome: number;
  plannedExpenses: number;
  paidExpenses: number;
  pendingExpenses: number;
  netCashFlow: number;
  checklistCompleted: number;
  checklistTotal: number;
  totalDebt: number;
  /** Deuda al abrir el mes más antiguo conocido: base de la barra de progreso. */
  initialDebt: number;
  /** Mes desde el que se mide `initialDebt` (null si no hay deudas). */
  debtSinceMonthKey: string | null;
  paidDebtThisMonth: number;
  estimatedPayoffMonthKey: string | null;
  reserveName: string;
  reserveBalance: number;
  savingsName: string;
  savingsBalance: number;
  otherSavingsBalance: number;
  totalSavings: number;
  pendingItems: WidgetPendingItemV2[];
  /** Hasta 6 meses, el más antiguo primero; el último es `monthKey`. */
  trend: WidgetTrendPointV2[];
}

const safeIntegerSchema = z
  .number()
  .int()
  .refine((val) => Number.isSafeInteger(val), {
    message: 'Amount must be a safe integer (no decimals or floats)',
  });

const nonNegativeIntegerSchema = safeIntegerSchema.refine((val) => val >= 0, {
  message: 'Amount must be a non-negative safe integer',
});

const monthKeySchema = z.string().refine((val) => isValidMonthKey(val), {
  message: 'Invalid monthKey format (expected YYYY-MM)',
});

export const widgetPendingItemV2Schema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  amount: nonNegativeIntegerSchema,
  type: z.enum(['income', 'expense']),
});

export const widgetTrendPointV2Schema = z.object({
  monthKey: monthKeySchema,
  receivedIncome: nonNegativeIntegerSchema,
  paidExpenses: nonNegativeIntegerSchema,
  netCashFlow: safeIntegerSchema,
});

export const widgetSnapshotV2Schema = z
  .object({
    schemaVersion: z.literal(WIDGET_SNAPSHOT_SCHEMA_VERSION),
    updatedAtIso: z.string().datetime(),
    monthKey: monthKeySchema,
    currencySymbol: z.string().min(1).max(8),
    thousandsSeparator: z.string().max(2),
    plannedIncome: nonNegativeIntegerSchema,
    receivedIncome: nonNegativeIntegerSchema,
    pendingIncome: nonNegativeIntegerSchema,
    plannedExpenses: nonNegativeIntegerSchema,
    paidExpenses: nonNegativeIntegerSchema,
    pendingExpenses: nonNegativeIntegerSchema,
    netCashFlow: safeIntegerSchema,
    checklistCompleted: z.number().int().min(0),
    checklistTotal: z.number().int().min(0),
    totalDebt: nonNegativeIntegerSchema,
    initialDebt: nonNegativeIntegerSchema,
    debtSinceMonthKey: monthKeySchema.nullable(),
    paidDebtThisMonth: nonNegativeIntegerSchema,
    estimatedPayoffMonthKey: monthKeySchema.nullable(),
    reserveName: z.string().min(1).max(120),
    reserveBalance: safeIntegerSchema,
    savingsName: z.string().min(1).max(120),
    savingsBalance: safeIntegerSchema,
    otherSavingsBalance: safeIntegerSchema,
    totalSavings: safeIntegerSchema,
    pendingItems: z.array(widgetPendingItemV2Schema).max(WIDGET_MAX_PENDING_ITEMS),
    trend: z.array(widgetTrendPointV2Schema).min(1).max(WIDGET_MAX_TREND_POINTS),
  })
  .strict()
  .refine((s) => s.checklistCompleted <= s.checklistTotal, {
    message: 'checklistCompleted cannot exceed checklistTotal',
  })
  .refine((s) => s.trend[s.trend.length - 1]?.monthKey === s.monthKey, {
    message: 'The last trend point must be the snapshot month',
  });

/** Credenciales mínimas para que el widget lea su propio documento de Firestore. */
export interface WidgetAuthV1 {
  schemaVersion: 1;
  uid: string;
  refreshToken: string;
  apiKey: string;
  projectId: string;
}

export const widgetAuthV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    uid: z.string().min(1).max(128),
    refreshToken: z.string().min(1).max(4096),
    apiKey: z.string().min(1).max(256),
    projectId: z.string().min(1).max(128),
  })
  .strict();

export interface BuildWidgetSnapshotInput {
  /** Meses que conoce la cuenta (`availableMonths`). */
  monthKeys: readonly string[];
  /** Mes que pinta el widget; ver `resolveWidgetMonthKey`. */
  monthKey: string;
  concepts: readonly Concept[];
  entries: readonly MonthEntry[];
  debtPayments: readonly DebtPayment[];
  debtsByMonth: Readonly<Record<string, readonly Debt[]>>;
  savingsBucketsByMonth: Readonly<Record<string, readonly SavingsBucket[]>>;
  closedSnapshots: Readonly<Record<string, MonthSnapshot>>;
  updatedAtIso?: string;
  currencySymbol?: string;
  thousandsSeparator?: string;
}

/**
 * El widget muestra el mes calendario en curso (America/Bogota), no el que el usuario esté
 * consultando en la app: abrir septiembre para revisar algo no debe cambiar la pantalla de
 * inicio. Si el mes en curso aún no existe en la cuenta, se usa el último mes anterior
 * conocido; si no hay ninguno, el mes activo.
 */
export function resolveWidgetMonthKey(
  monthKeys: readonly string[],
  activeMonthKey: string,
  now: Date = new Date()
): string {
  const currentMonthKey = toAppMonthKey(now);
  const known = monthKeys.filter((key) => isValidMonthKey(key));
  if (known.includes(currentMonthKey)) {
    return currentMonthKey;
  }
  const previous = known.filter((key) => key < currentMonthKey).sort();
  const latestPrevious = previous[previous.length - 1];
  return latestPrevious ?? activeMonthKey;
}

/**
 * Resuelve el App Group a partir del bundle id de la app o de la extensión
 * (`group.<bundle id principal>`), para que los sufijos de equipo que añade `iloader`
 * (`com.bflow.app.TEAM123.widgets`) apunten al mismo contenedor.
 */
export function resolveDynamicAppGroupId(bundleIdentifier = 'com.bflow.app'): string {
  const trimmed = bundleIdentifier.trim() || 'com.bflow.app';
  const mainBundleId = trimmed.replace(/\.widgets$/i, '');
  return `group.${mainBundleId}`;
}

function clampName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 119)}…` : trimmed || 'Sin nombre';
}

function resolveInitialDebt(
  input: BuildWidgetSnapshotInput
): { initialDebt: number; debtSinceMonthKey: string | null } {
  const monthsWithDebts = Object.keys(input.debtsByMonth)
    .filter(
      (key) =>
        isValidMonthKey(key) && key <= input.monthKey && (input.debtsByMonth[key]?.length ?? 0) > 0
    )
    .sort();
  const firstMonth = monthsWithDebts[0];
  if (!firstMonth) {
    return { initialDebt: 0, debtSinceMonthKey: null };
  }
  const summary = calculateDebtsSummary(
    input.debtsByMonth[firstMonth] ?? [],
    input.entries,
    firstMonth,
    input.debtPayments
  );
  return { initialDebt: summary.openingTotalDebt, debtSinceMonthKey: firstMonth };
}

/**
 * Constructor puro del snapshot: reutiliza `buildMonthlyHistory`, la misma función que
 * alimenta los gráficos, para que widget, tarjetas y gráficos digan siempre lo mismo.
 */
export function buildWidgetSnapshot(input: BuildWidgetSnapshotInput): WidgetSnapshotV2 {
  const history = buildMonthlyHistory({
    monthKeys: input.monthKeys,
    activeMonthKey: input.monthKey,
    concepts: input.concepts,
    entries: input.entries,
    debtPayments: input.debtPayments,
    debtsByMonth: input.debtsByMonth,
    savingsBucketsByMonth: input.savingsBucketsByMonth,
    closedSnapshots: input.closedSnapshots,
    maxMonths: WIDGET_MAX_TREND_POINTS,
  });
  const current = history[history.length - 1];
  if (!current) {
    throw new Error('buildMonthlyHistory returned an empty window');
  }

  const budget = calculateMonthlyBudgetSummary(input.entries, input.monthKey);
  const checklist = calculateChecklistProgress(input.concepts, input.entries, input.monthKey);
  const debts = calculateDebtsSummary(
    input.debtsByMonth[input.monthKey] ?? [],
    input.entries,
    input.monthKey,
    input.debtPayments
  );
  const { initialDebt, debtSinceMonthKey } = resolveInitialDebt(input);

  const pendingItems: WidgetPendingItemV2[] = input.entries
    .filter((entry) => entry.monthKey === input.monthKey && entry.status === 'pending')
    .sort((a, b) => b.plannedAmount - a.plannedAmount || a.conceptName.localeCompare(b.conceptName))
    .slice(0, WIDGET_MAX_PENDING_ITEMS)
    .map((entry) => ({
      id: entry.id,
      name: clampName(entry.conceptName),
      amount: entry.plannedAmount,
      type: entry.type,
    }));

  const snapshot: WidgetSnapshotV2 = {
    schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    updatedAtIso: input.updatedAtIso ?? new Date().toISOString(),
    monthKey: input.monthKey,
    currencySymbol: input.currencySymbol ?? '$',
    thousandsSeparator: input.thousandsSeparator ?? '.',
    plannedIncome: budget.plannedIncome,
    receivedIncome: budget.receivedIncome,
    pendingIncome: budget.pendingIncome,
    plannedExpenses: budget.plannedExpenses,
    paidExpenses: budget.paidExpenses,
    pendingExpenses: budget.pendingExpenses,
    netCashFlow: budget.netCashFlow,
    checklistCompleted: checklist.completedCount,
    checklistTotal: checklist.totalTrackableCount,
    totalDebt: debts.totalRemainingDebt,
    initialDebt: Math.max(initialDebt, debts.totalRemainingDebt),
    debtSinceMonthKey,
    paidDebtThisMonth: debts.appliedInstallmentThisMonth,
    estimatedPayoffMonthKey: debts.totalRemainingDebt > 0 ? debts.projection.estimatedPayoffMonthKey : null,
    reserveName: clampName(current.reserveName),
    reserveBalance: current.reserveBalance,
    savingsName: clampName(current.savingsName),
    savingsBalance: current.savingsBalance,
    otherSavingsBalance: current.otherSavingsBalance,
    totalSavings: current.totalSavings,
    pendingItems,
    trend: history.map((point) => ({
      monthKey: point.monthKey,
      receivedIncome: point.receivedIncome,
      paidExpenses: point.paidExpenses,
      netCashFlow: point.netCashFlow,
    })),
  };

  return widgetSnapshotV2Schema.parse(snapshot);
}

/** Igualdad de contenido ignorando `updatedAtIso`: evita escrituras y recargas inútiles. */
export function isEquivalentWidgetSnapshot(
  a: WidgetSnapshotV2 | null | undefined,
  b: WidgetSnapshotV2 | null | undefined
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const { updatedAtIso: _a, ...restA } = a;
  const { updatedAtIso: _b, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

/** Serializa el snapshot validado; lanza si excede el tope que aceptan las reglas. */
export function serializeWidgetSnapshot(snapshot: WidgetSnapshotV2): string {
  const payload = JSON.stringify(widgetSnapshotV2Schema.parse(snapshot));
  if (payload.length > WIDGET_MAX_PAYLOAD_LENGTH) {
    throw new RangeError(`Widget payload exceeds ${WIDGET_MAX_PAYLOAD_LENGTH} characters.`);
  }
  return payload;
}

/** Lee un payload (local o de Firestore); devuelve null si no cumple el contrato. */
export function parseWidgetSnapshot(payload: string): WidgetSnapshotV2 | null {
  try {
    const result = widgetSnapshotV2Schema.safeParse(JSON.parse(payload));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
