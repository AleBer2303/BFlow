/**
 * ADR 0037: the names older builds stored are read under the current ones, and only there.
 */

import {
  parseConceptFromFirestore,
  parseMonthSnapshotFromFirestore,
  parseSavingsBucketFromFirestore,
  serializeConceptForFirestore,
  serializeMonthSnapshotForFirestore,
  serializeSavingsBucketForFirestore,
} from '../mappers/firestoreSchemas';
import {
  RESERVE_BUCKET_ID,
  hasLegacyFields,
  isLegacyBucketDocId,
  migrateBucketId,
  migrateRawConcept,
  migrateRawMonthSnapshot,
  migrateRawSavingsBucket,
} from '../migrations/legacyFieldMigration';
import { buildSampleWorkspace } from '../sample/sampleWorkspace';
import { closeMonthAndRollover } from '../../domain/month-close/monthClose';

const legacyConcept = {
  id: 'exp_fuel',
  name: 'Gasolina',
  type: 'expense',
  group: 'fixed',
  defaultAmount: 200_000,
  allowMultiplePerMonth: false,
  recurrence: { kind: 'monthly' },
  savingsContribution: { bucketId: 'moto', onlyWhenCompleted: true },
  idealMotoCategoryKey: 'FUEL',
  archived: false,
  order: 1,
};

function sampleSnapshot() {
  const sample = buildSampleWorkspace();
  return closeMonthAndRollover({
    closingMonthKey: sample.monthKey,
    closedAtIso: '2026-11-01T00:00:00.000Z',
    concepts: sample.concepts,
    entries: sample.entries,
    debts: sample.debts,
    debtPayments: sample.debtPayments,
    savingsBuckets: sample.savingsBuckets,
  }).snapshot;
}

describe('legacyFieldMigration (ADR 0037)', () => {
  it('maps the old reserve bucket id and leaves the rest alone', () => {
    expect(migrateBucketId('moto')).toBe(RESERVE_BUCKET_ID);
    expect(migrateBucketId('savings')).toBe('savings');
    expect(migrateBucketId('bucket_viaje')).toBe('bucket_viaje');
    expect(isLegacyBucketDocId('moto', 'reserve')).toBe(true);
    expect(isLegacyBucketDocId('reserve', 'reserve')).toBe(false);
    expect(isLegacyBucketDocId('copy', 'reserve')).toBe(false);
  });

  it('reads an old savings bucket under its current id', () => {
    const raw = { id: 'moto', name: 'Fondo', openingBalance: 1_600_000 };
    expect(parseSavingsBucketFromFirestore(raw)).toEqual({ ...raw, id: 'reserve' });
    expect(serializeSavingsBucketForFirestore({ ...raw, id: 'moto' }).id).toBe('reserve');
    expect(migrateRawSavingsBucket(raw)).not.toBe(raw);
    const current = { id: 'savings', name: 'Ahorros', openingBalance: 1 };
    expect(migrateRawSavingsBucket(current)).toBe(current);
    expect(migrateRawSavingsBucket(null)).toBeNull();
  });

  it('reads an old concept with the current contribution and category names', () => {
    const parsed = parseConceptFromFirestore(legacyConcept);
    expect(parsed.savingsContribution).toEqual({ bucketId: 'reserve', onlyWhenCompleted: true });
    expect(parsed.provisionCategoryKey).toBe('FUEL');
    expect(parsed).not.toHaveProperty('idealMotoCategoryKey');

    const written = serializeConceptForFirestore(parsed);
    expect(written).not.toHaveProperty('idealMotoCategoryKey');
    expect(hasLegacyFields('concept', written)).toBe(false);
    expect(hasLegacyFields('concept', legacyConcept)).toBe(true);
  });

  it('keeps a current category key over the old one', () => {
    const migrated = migrateRawConcept({
      ...legacyConcept,
      provisionCategoryKey: 'NEW',
    }) as Record<string, unknown>;
    expect(migrated.provisionCategoryKey).toBe('NEW');
    expect(migrated).not.toHaveProperty('idealMotoCategoryKey');
    expect(migrateRawConcept('not a record')).toBe('not a record');
  });

  it('reads an old closed month with the reserve balance under its current name', () => {
    const current = serializeMonthSnapshotForFirestore(sampleSnapshot());
    const closingSavings = current.closingSavings as Record<string, unknown>;
    const { reserveClosingBalance, ...rest } = closingSavings;
    const legacy = {
      ...current,
      closingSavings: {
        ...rest,
        motoClosingBalance: reserveClosingBalance,
        buckets: [{ id: 'moto', name: 'Fondo', closingBalance: 1 }],
      },
    };

    const parsed = parseMonthSnapshotFromFirestore(legacy);
    expect(parsed.closingSavings.reserveClosingBalance).toBe(reserveClosingBalance);
    expect(parsed.closingSavings).not.toHaveProperty('motoClosingBalance');
    expect(parsed.closingSavings.buckets?.[0]?.id).toBe('reserve');
    expect(hasLegacyFields('monthSnapshot', legacy)).toBe(true);
    expect(hasLegacyFields('monthSnapshot', current)).toBe(false);
    expect(hasLegacyFields('savingsBucket', { id: 'moto', name: 'x', openingBalance: 0 })).toBe(true);
    expect(migrateRawMonthSnapshot({ monthKey: '2026-10' })).toEqual({ monthKey: '2026-10' });
  });
});
