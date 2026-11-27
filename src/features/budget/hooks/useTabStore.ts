/**
 * src/features/budget/hooks/useTabStore.ts
 *
 * Store selector for the workspace tabs that freezes while its tab is hidden (OPT-01).
 *
 * Visited tabs stay mounted with `display: 'none'` (keep-alive). With a plain `useBudgetStore`
 * selector, every hidden tab re-ran its selectors and its domain `useMemo` on each change of the
 * data it reads (toggling a checklist row recalculated Summary, Debts, Savings and Analytics).
 *
 * While the tab is hidden this hook ignores store changes and returns the last value it showed.
 * When the tab becomes active again it reads the store once and re-renders only if the value
 * changed meanwhile. Visibility comes from `useTabVisibilityStore`, which never re-renders by
 * itself, so switching tabs does not re-render the containers either.
 *
 * Outside a `TabVisibilityProvider` the tab counts as active, so it behaves like `useBudgetStore`.
 * Same contract as a Zustand selector: it must return a stable reference for the same state
 * (wrap object-returning selectors in `useShallow`).
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useTabVisibilityStore } from '../../../design-system/motion/TabVisibilityContext';
import { useBudgetStore } from '../store/useBudgetStore';

type BudgetStoreState = ReturnType<typeof useBudgetStore.getState>;

export function useTabStore<T>(selector: (state: BudgetStoreState) => T): T {
  const visibility = useTabVisibilityStore();
  const lastValue = useRef<{ value: T } | null>(null);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const unsubscribeStore = useBudgetStore.subscribe(() => {
        if (visibility.isActive()) onChange();
      });
      const unsubscribeVisibility = visibility.subscribe(onChange);
      return () => {
        unsubscribeStore();
        unsubscribeVisibility();
      };
    },
    [visibility]
  );

  const getSnapshot = (): T => {
    if (!visibility.isActive() && lastValue.current) {
      return lastValue.current.value;
    }
    const next = selector(useBudgetStore.getState());
    if (lastValue.current && Object.is(lastValue.current.value, next)) {
      return lastValue.current.value;
    }
    lastValue.current = { value: next };
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
