import React from 'react';
import type { BFlowWorkspaceTab } from '../../features/budget/store/useBudgetStore';
import { useBFlowTheme } from '../theme/ThemeContext';
import { FlatPillDock } from './dock/FlatPillDock';
import { LiquidGlassDock } from './dock/LiquidGlassDock';

export {
  DOCK_BOTTOM_OFFSET,
  DOCK_CAPSULE_HEIGHT,
  DOCK_MAX_WIDTH,
  DOCK_PADDING_H,
  DOCK_TABS,
  LENS_EDGE_INSET,
  LENS_MARGIN_H,
  computeLensFrame,
  getDockIndexFromScreenX,
  getDockLensPositionFromScreenX,
} from './dock/dockGeometry';
export type { DockTabConfig, LensFrame, LensFrameInput } from './dock/dockGeometry';

export interface FloatingLiquidGlassDockProps {
  activeTab: BFlowWorkspaceTab;
  onSelectTab: (tab: BFlowWorkspaceTab) => void;
  /** Called when the user taps the already-active tab (scrolls the workspace back to top). */
  onReselectActiveTab?: () => void;
  /** System gesture / navigation area below the dock (Android draws edge to edge). */
  bottomInset?: number;
  testID?: string;
}

/**
 * Floating dock navigation, shared by iOS and Android (ADR 0024). The selection marker depends
 * on the material of the skin:
 * - liquid-glass (iOS, ADR 0030): Liquid Glass capsule and lens on the UI thread, with press
 *   rebound, a lens that swells past the dock and a continuous drag (`LiquidGlassDock`).
 * - any other (Android): a flat pill in `accent.container` (`FlatPillDock`).
 */
export const FloatingLiquidGlassDock = React.memo(function FloatingLiquidGlassDock(
  props: FloatingLiquidGlassDockProps
): React.JSX.Element {
  const { skinSpec } = useBFlowTheme();
  return skinSpec.surfaceMaterial === 'liquid-glass' ? (
    <LiquidGlassDock {...props} />
  ) : (
    <FlatPillDock {...props} />
  );
});
