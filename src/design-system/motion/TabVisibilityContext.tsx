/**
 * src/design-system/motion/TabVisibilityContext.tsx
 *
 * Tracks whether the enclosing workspace tab is currently visible and active.
 * Kept-alive tabs stay mounted with `display: 'none'` to avoid tearing down native views;
 * consumers (SVG curve, chart transitions) pause `requestAnimationFrame` loops while hidden.
 *
 * Two ways to read it:
 * - `useIsTabActive()`: React context, re-renders the consumer on every change (animations).
 * - `useTabVisibilityStore()`: a stable external store that never re-renders by itself; the
 *   tab store selectors (`useTabStore`, OPT-01) read it to freeze while the tab is hidden and
 *   to refresh once when it comes back.
 */

import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';

const TabVisibilityContext = createContext<boolean>(true);

export interface TabVisibilityStore {
  isActive: () => boolean;
  /** Called after the tab becomes active or hidden (layout effect, before paint). */
  subscribe: (listener: () => void) => () => void;
}

const ALWAYS_ACTIVE_STORE: TabVisibilityStore = {
  isActive: () => true,
  subscribe: () => () => undefined,
};

const TabVisibilityStoreContext = createContext<TabVisibilityStore>(ALWAYS_ACTIVE_STORE);

function createTabVisibilityStore(initialActive: boolean) {
  let active = initialActive;
  const listeners = new Set<() => void>();
  return {
    isActive: () => active,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setActive: (next: boolean) => {
      if (next === active) return;
      active = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

export interface TabVisibilityProviderProps {
  isActive: boolean;
  children: React.ReactNode;
}

export function TabVisibilityProvider({
  isActive,
  children,
}: TabVisibilityProviderProps): React.JSX.Element {
  const [store] = useState(() => createTabVisibilityStore(isActive));
  // Layout effect: a tab that comes back refreshes its data before the frame is painted.
  useLayoutEffect(() => {
    store.setActive(isActive);
  }, [store, isActive]);

  return (
    <TabVisibilityStoreContext.Provider value={store}>
      <TabVisibilityContext.Provider value={isActive}>{children}</TabVisibilityContext.Provider>
    </TabVisibilityStoreContext.Provider>
  );
}

export function useIsTabActive(): boolean {
  return useContext(TabVisibilityContext);
}

/** Stable visibility store of the enclosing tab (always active outside a provider). */
export function useTabVisibilityStore(): TabVisibilityStore {
  return useContext(TabVisibilityStoreContext);
}

/**
 * Zero-render leaf that invokes `onLeave` when the enclosing tab becomes inactive.
 * Subscribing only this leaf to `TabVisibilityContext` prevents heavy workspace views
 * from re-rendering on rapid tab switches when no transient state is open.
 */
export const TabLeaveResetter = React.memo(function TabLeaveResetter({
  onLeave,
}: {
  onLeave: () => void;
}): null {
  const isTabActive = useIsTabActive();
  useEffect(() => {
    if (!isTabActive) {
      onLeave();
    }
  }, [isTabActive, onLeave]);
  return null;
});
