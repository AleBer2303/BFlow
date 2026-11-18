/**
 * src/design-system/motion/ScrollChoreographyContext.tsx
 *
 * Distributes UI-thread Reanimated SharedValues (`scrollY`, `viewportHeight`, `contentHeight`,
 * `dockHidden`) from `WorkspaceShell` to scroll-aware primitives
 * (`ScrollDepthHero`, `ScrollRevealSection`, `LiquidGlassDock`, `FlatPillDock`) without causing
 * JS-thread React re-renders per scroll frame (ADR 0031).
 */

import React, { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export interface ScrollChoreographyContextValue {
  /** True only when the active skin supports scroll choreography, Reduce Motion is off, and runtime is live. */
  active: boolean;
  scrollY: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  contentHeight: SharedValue<number>;
  /** 0 = resting visible, 1 = retracted downward while reading. */
  dockHidden: SharedValue<number>;
  /** Top viewport inset (pt/dp) used to anchor scroll-up reveals (`insets.top` on iOS, `0` on Android/Web). */
  topEdgeOffset: number;
  /** Immediately reveals the floating dock (e.g., on dock touch, tab change, or scroll-to-top). */
  revealDock: () => void;
  /** Returns the host node of the scroll content column for `measureLayout`. */
  getContentContainerNode: () => unknown;
  /** Registers a listener invoked when scroll content height changes significantly. */
  subscribeLayoutChange: (listener: () => void) => () => void;
}

const ScrollChoreographyContext = createContext<ScrollChoreographyContextValue | null>(null);

export interface ScrollChoreographyProviderProps {
  value: ScrollChoreographyContextValue | null;
  children: React.ReactNode;
}

export function ScrollChoreographyProvider({
  value,
  children,
}: ScrollChoreographyProviderProps): React.JSX.Element {
  return (
    <ScrollChoreographyContext.Provider value={value}>
      {children}
    </ScrollChoreographyContext.Provider>
  );
}

/** Returns null outside `WorkspaceShell` so components degrade cleanly in isolation. */
export function useScrollChoreography(): ScrollChoreographyContextValue | null {
  return useContext(ScrollChoreographyContext);
}
