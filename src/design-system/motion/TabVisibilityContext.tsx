/**
 * src/design-system/motion/TabVisibilityContext.tsx
 *
 * Tracks whether the enclosing workspace tab is currently visible and active.
 * Kept-alive tabs stay mounted with `display: 'none'` to avoid tearing down native views;
 * consumers (SVG curve, chart transitions) pause `requestAnimationFrame` loops while hidden.
 */

import React, { createContext, useContext, useEffect } from 'react';

const TabVisibilityContext = createContext<boolean>(true);

export interface TabVisibilityProviderProps {
  isActive: boolean;
  children: React.ReactNode;
}

export function TabVisibilityProvider({
  isActive,
  children,
}: TabVisibilityProviderProps): React.JSX.Element {
  return (
    <TabVisibilityContext.Provider value={isActive}>{children}</TabVisibilityContext.Provider>
  );
}

export function useIsTabActive(): boolean {
  return useContext(TabVisibilityContext);
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
