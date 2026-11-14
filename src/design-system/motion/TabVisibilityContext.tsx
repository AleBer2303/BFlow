/**
 * src/design-system/motion/TabVisibilityContext.tsx
 *
 * Tracks whether the enclosing workspace tab is currently visible and active.
 * Kept-alive tabs stay mounted with `display: 'none'` to avoid tearing down native views;
 * consumers (SVG curve, chart transitions) pause `requestAnimationFrame` loops while hidden.
 */

import React, { createContext, useContext } from 'react';

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
