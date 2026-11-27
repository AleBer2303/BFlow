import type { Debt, SavingsBucket } from '../../domain/models/types';
import {
  OWNER_SEED_MONTH_KEY,
  healCorruptedOwnerSavingsBucket,
  isLegacySeedResetOpening,
  restoreOwnerSeedFirstMonthBucket,
  restoreOwnerSeedFirstMonthDebt,
} from '../repositories/legacySeedHealing';

const motoDebt: Debt = {
  id: 'debt_cb300f_moto',
  groupKey: 'FUNFAMI',
  name: 'Moto',
  lender: 'FUNFAMI',
  openingBalance: 2_600_000,
  monthKey: '2026-12',
};

describe('legacySeedHealing (CC-05, ADR 0036)', () => {
  describe('healCorruptedOwnerSavingsBucket', () => {
    it.each([14_800_000, 13_800_000, 16_880_000])(
      'puts the owner savings bucket with %i back to the seed opening',
      (corrupted) => {
        const bucket: SavingsBucket = {
          id: 'savings',
          name: 'Ahorros',
          openingBalance: corrupted,
          monthKey: '2026-11',
        };
        expect(healCorruptedOwnerSavingsBucket(bucket, true)).toEqual({
          id: 'savings',
          name: 'Ahorros',
          openingBalance: 1_000_000,
          monthKey: OWNER_SEED_MONTH_KEY,
        });
      }
    );

    it('leaves every other account, bucket and amount alone', () => {
      const corrupted: SavingsBucket = { id: 'savings', name: 'A', openingBalance: 16_880_000 };
      expect(healCorruptedOwnerSavingsBucket(corrupted, false)).toBeNull();
      expect(healCorruptedOwnerSavingsBucket({ ...corrupted, id: 'moto' }, true)).toBeNull();
      expect(
        healCorruptedOwnerSavingsBucket({ ...corrupted, openingBalance: 16_880_001 }, true)
      ).toBeNull();
    });
  });

  describe('restoreOwnerSeedFirstMonthDebt', () => {
    it('restores the October opening of a seed debt already rolled to a later month', () => {
      expect(restoreOwnerSeedFirstMonthDebt(motoDebt, OWNER_SEED_MONTH_KEY, true)).toEqual({
        ...motoDebt,
        openingBalance: 4_400_000,
        monthKey: OWNER_SEED_MONTH_KEY,
      });
      expect(
        restoreOwnerSeedFirstMonthDebt(
          { ...motoDebt, id: 'debt_especializacion' },
          OWNER_SEED_MONTH_KEY,
          true
        )?.openingBalance
      ).toBe(3_600_000);
    });

    it('does nothing outside the owner seed account, another first month or another debt', () => {
      expect(restoreOwnerSeedFirstMonthDebt(motoDebt, OWNER_SEED_MONTH_KEY, false)).toBeNull();
      expect(restoreOwnerSeedFirstMonthDebt(motoDebt, '2026-11', true)).toBeNull();
      expect(
        restoreOwnerSeedFirstMonthDebt(
          { ...motoDebt, monthKey: OWNER_SEED_MONTH_KEY },
          OWNER_SEED_MONTH_KEY,
          true
        )
      ).toBeNull();
      expect(
        restoreOwnerSeedFirstMonthDebt({ ...motoDebt, id: 'debt_user' }, OWNER_SEED_MONTH_KEY, true)
      ).toBeNull();
    });
  });

  describe('restoreOwnerSeedFirstMonthBucket', () => {
    const moto: SavingsBucket = { id: 'moto', name: 'Moto', openingBalance: 9, monthKey: '2027-01' };

    it('restores the October opening of the seed buckets', () => {
      expect(restoreOwnerSeedFirstMonthBucket(moto, OWNER_SEED_MONTH_KEY, true)).toEqual({
        ...moto,
        openingBalance: 1_600_000,
        monthKey: OWNER_SEED_MONTH_KEY,
      });
      expect(
        restoreOwnerSeedFirstMonthBucket({ ...moto, id: 'savings' }, OWNER_SEED_MONTH_KEY, true)
          ?.openingBalance
      ).toBe(1_000_000);
    });

    it('ignores custom buckets, buckets without a month and other accounts', () => {
      expect(
        restoreOwnerSeedFirstMonthBucket({ ...moto, id: 'bucket_viaje' }, OWNER_SEED_MONTH_KEY, true)
      ).toBeNull();
      const { monthKey: _omit, ...withoutMonth } = moto;
      expect(restoreOwnerSeedFirstMonthBucket(withoutMonth, OWNER_SEED_MONTH_KEY, true)).toBeNull();
      expect(restoreOwnerSeedFirstMonthBucket(moto, OWNER_SEED_MONTH_KEY, false)).toBeNull();
    });
  });

  describe('isLegacySeedResetOpening', () => {
    it('flags the stored seed opening only when the chain disagrees', () => {
      expect(isLegacySeedResetOpening('debt_cb300f_moto', 4_400_000, 2_600_000)).toBe(true);
      expect(isLegacySeedResetOpening('debt_esp_ia', 3_600_000, 1_800_000)).toBe(true);
      expect(isLegacySeedResetOpening('debt_cb300f_moto', 4_400_000, 4_400_000)).toBe(false);
      expect(isLegacySeedResetOpening('debt_cb300f_moto', 2_000_000, 2_600_000)).toBe(false);
      expect(isLegacySeedResetOpening('debt_user', 4_400_000, 2_600_000)).toBe(false);
      expect(isLegacySeedResetOpening('debt_esp_ia', undefined, 2_600_000)).toBe(false);
    });
  });
});
