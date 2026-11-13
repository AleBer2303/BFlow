/**
 * The device cache is saved when a persisted field changes, and only then: status messages
 * and tab changes must not schedule a save.
 */

import {
  PERSISTED_ACCOUNT_FIELDS,
  havePersistedAccountFieldsChanged,
} from '../persistedAccountFields';
import { getStoreInitialState } from '../slices/sliceTypes';
import { useBudgetStore } from '../useBudgetStore';

describe('havePersistedAccountFieldsChanged', () => {
  it('asks for a save when nothing was saved yet', () => {
    expect(havePersistedAccountFieldsChanged(null, useBudgetStore.getState())).toBe(true);
  });

  it('ignores store changes that are not part of the saved account', () => {
    const saved = useBudgetStore.getState();

    useBudgetStore.getState().setSyncStatus('Sincronizando...', true);
    useBudgetStore.getState().setActiveTab('debts');

    expect(useBudgetStore.getState()).not.toBe(saved);
    expect(havePersistedAccountFieldsChanged(saved, useBudgetStore.getState())).toBe(false);
  });

  it.each(PERSISTED_ACCOUNT_FIELDS)('asks for a save when %s is replaced', (field) => {
    const saved = useBudgetStore.getState();
    const current = saved[field];
    const replaced = typeof current === 'object' ? structuredClone(current) : !current;
    const next = { ...saved, [field]: replaced } as typeof saved;

    expect(havePersistedAccountFieldsChanged(saved, next)).toBe(true);
  });
});

describe('getStoreInitialState', () => {
  it('builds the initial state once and hands the same one to every slice', () => {
    expect(getStoreInitialState()).toBe(getStoreInitialState());
  });

  it('is the state the store starts from', () => {
    const initial = getStoreInitialState();

    expect(initial.activeMonthKey).toBe('2026-10');
    expect(initial.concepts.length).toBeGreaterThan(0);
  });
});
