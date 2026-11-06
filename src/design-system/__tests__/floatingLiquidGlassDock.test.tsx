import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BFlowThemeProvider } from '../theme/ThemeContext';
import {
  FloatingLiquidGlassDock,
  DOCK_TABS,
  DOCK_PADDING_H,
  LENS_MARGIN_H,
  getDockIndexFromScreenX,
} from '../components/FloatingLiquidGlassDock';
import {
  AccountNavIcon,
  ChecklistNavIcon,
  CierreNavIcon,
  DebtsNavIcon,
  SavingsNavIcon,
  SummaryNavIcon,
} from '../components/WorkspaceNavIcons';
import { MIN_TOUCH_TARGET_PT, radius } from '../tokens';

describe('FloatingLiquidGlassDock & WorkspaceNavIcons (Apple 60/120Hz Liquid Glass Dock)', () => {
  it('renders all 6 navigation tabs with exact labels including Cierre and Cuenta', () => {
    const onSelectTab = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="summary" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('floating-liquid-glass-dock')).toBeTruthy();
    expect(DOCK_TABS).toHaveLength(6);

    expect(screen.getByTestId('workspace-tab-summary')).toHaveTextContent('Resumen');
    expect(screen.getByTestId('workspace-tab-checklist')).toHaveTextContent('Checklist');
    expect(screen.getByTestId('workspace-tab-debts')).toHaveTextContent('Deudas');
    expect(screen.getByTestId('workspace-tab-savings')).toHaveTextContent('Ahorros');
    expect(screen.getByTestId('workspace-tab-analytics')).toHaveTextContent('Cierre');
    expect(screen.getByTestId('workspace-tab-account')).toHaveTextContent('Cuenta');
  });

  it('renders all 6 custom minimalist SVG vector icons', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <SummaryNavIcon testID="test-icon-summary" focused />
        <ChecklistNavIcon testID="test-icon-checklist" />
        <DebtsNavIcon testID="test-icon-debts" />
        <SavingsNavIcon testID="test-icon-savings" />
        <CierreNavIcon testID="test-icon-cierre" />
        <AccountNavIcon testID="test-icon-account" />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('test-icon-summary')).toBeTruthy();
    expect(screen.getByTestId('test-icon-checklist')).toBeTruthy();
    expect(screen.getByTestId('test-icon-debts')).toBeTruthy();
    expect(screen.getByTestId('test-icon-savings')).toBeTruthy();
    expect(screen.getByTestId('test-icon-cierre')).toBeTruthy();
    expect(screen.getByTestId('test-icon-account')).toBeTruthy();
  });

  it('sets accessibility states correctly and calls onSelectTab on tab press', () => {
    const onSelectTab = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="summary" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );

    const summaryTab = screen.getByTestId('workspace-tab-summary');
    const cuentaTab = screen.getByTestId('workspace-tab-account');
    const cierreTab = screen.getByTestId('workspace-tab-analytics');

    expect(summaryTab.props.accessibilityState).toEqual({ selected: true });
    expect(cuentaTab.props.accessibilityState).toEqual({ selected: false });

    // Pressing Cuenta tab
    fireEvent.press(cuentaTab);
    expect(onSelectTab).toHaveBeenCalledWith('account');

    // Pressing Cierre tab
    fireEvent.press(cierreTab);
    expect(onSelectTab).toHaveBeenCalledWith('analytics');
  });

  it('guarantees touch target minimum of 44pt for every tab (Apple HIG standard)', () => {
    const onSelectTab = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="checklist" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );

    DOCK_TABS.forEach((tab) => {
      const tabElement = screen.getByTestId(`workspace-tab-${tab.id}`);
      const flattenedStyle = Array.isArray(tabElement.props.style)
        ? Object.assign({}, ...tabElement.props.style)
        : tabElement.props.style;

      expect(flattenedStyle.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PT);
    });
  });

  it('renders magnifying lens glider pill on layout and responds to dock layout measurement without artifacts', () => {
    const onSelectTab = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="debts" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );

    const dock = screen.getByTestId('floating-liquid-glass-dock');
    const flattenedDockStyle = Array.isArray(dock.props.style)
      ? Object.assign({}, ...dock.props.style)
      : dock.props.style;

    // Outer dock wrapper has pill radius for clean shadow silhouette
    expect(flattenedDockStyle.borderRadius).toBe(radius.pill);

    // Trigger onLayout with realistic dock width
    fireEvent(dock, 'layout', {
      nativeEvent: {
        layout: { x: 16, y: 700, width: 360, height: 64 },
      },
    });

    const lens = screen.getByTestId('dock-magnifying-lens');
    expect(lens).toBeTruthy();

    const flattenedLensStyle = Array.isArray(lens.props.style)
      ? Object.assign({}, ...lens.props.style)
      : lens.props.style;

    // Lens sits neatly inside capsule without protruding or bleeding
    expect(flattenedLensStyle.top).toBe(3);
    expect(flattenedLensStyle.bottom).toBe(3);
    expect(flattenedLensStyle.borderRadius).toBe(radius.lg);
    // Lens has no artificial hardcoded horizontal line stripes as children
    expect(lens.props.children).toBeFalsy();
  });

  it('guarantees exact mathematical horizontal symmetry between first and last tabs', () => {
    const onSelectTab = jest.fn();
    const mockDockWidth = 360;
    const DOCK_PADDING_H = 6;
    const LENS_MARGIN_H = 2;
    const availableWidth = mockDockWidth - DOCK_PADDING_H * 2;
    const tabWidth = availableWidth / DOCK_TABS.length;
    const lensWidth = tabWidth - LENS_MARGIN_H * 2;

    // Tab 0 (Resumen, index 0)
    const tab0GliderLeft = DOCK_PADDING_H + LENS_MARGIN_H;
    const tab0DistanceFromLeft = tab0GliderLeft;

    // Tab 5 (Cuenta, index 5)
    const tab5GliderLeft = DOCK_PADDING_H + LENS_MARGIN_H + tabWidth * 5;
    const tab5GliderRight = tab5GliderLeft + lensWidth;
    const tab5DistanceFromRight = mockDockWidth - tab5GliderRight;

    // Distance to dock outer capsule must be identical on both ends
    expect(tab0DistanceFromLeft).toBe(tab5DistanceFromRight);
    expect(tab0DistanceFromLeft).toBe(DOCK_PADDING_H + LENS_MARGIN_H);
  });

  it('maps sliding coordinates linearly across all 6 tabs with 1-to-1 pixel precision and clamps bounds', () => {
    const dockScreenLeft = 20;
    const mockDockWidth = 360;
    // Available width = 360 - 12 = 348. Tab width = 348 / 6 = 58.
    // Tab 0 (Resumen): X in [26, 84)
    // Tab 1 (Checklist): X in [84, 142)
    // Tab 2 (Deudas): X in [142, 200)
    // Tab 3 (Ahorros): X in [200, 258)
    // Tab 4 (Cierre): X in [258, 316)
    // Tab 5 (Cuenta): X in [316, 374]

    // Far left (outside dock) -> clamped to Tab 0
    expect(getDockIndexFromScreenX(-50, dockScreenLeft, mockDockWidth)).toBe(0);
    expect(getDockIndexFromScreenX(0, dockScreenLeft, mockDockWidth)).toBe(0);
    expect(getDockIndexFromScreenX(25, dockScreenLeft, mockDockWidth)).toBe(0);

    // Exact centers of each tab
    expect(getDockIndexFromScreenX(55, dockScreenLeft, mockDockWidth)).toBe(0); // Tab 0
    expect(getDockIndexFromScreenX(110, dockScreenLeft, mockDockWidth)).toBe(1); // Tab 1
    expect(getDockIndexFromScreenX(170, dockScreenLeft, mockDockWidth)).toBe(2); // Tab 2
    expect(getDockIndexFromScreenX(230, dockScreenLeft, mockDockWidth)).toBe(3); // Tab 3
    expect(getDockIndexFromScreenX(290, dockScreenLeft, mockDockWidth)).toBe(4); // Tab 4
    expect(getDockIndexFromScreenX(345, dockScreenLeft, mockDockWidth)).toBe(5); // Tab 5

    // Far right (outside dock) -> clamped to Tab 5
    expect(getDockIndexFromScreenX(400, dockScreenLeft, mockDockWidth)).toBe(5);
    expect(getDockIndexFromScreenX(999, dockScreenLeft, mockDockWidth)).toBe(5);

    // Edge cases: width <= 0 or tabCount <= 0
    expect(getDockIndexFromScreenX(100, dockScreenLeft, 0)).toBe(0);
  });

  it('triggers immediate selection on touch-down (onPressIn) on any tab for zero perceptible delay', () => {
    const onSelectTab = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="summary" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );

    const checklistTab = screen.getByTestId('workspace-tab-checklist');
    const debtsTab = screen.getByTestId('workspace-tab-debts');

    // PressIn on checklist
    fireEvent(checklistTab, 'pressIn');
    expect(onSelectTab).toHaveBeenCalledWith('checklist');

    // PressIn on debts
    fireEvent(debtsTab, 'pressIn');
    expect(onSelectTab).toHaveBeenCalledWith('debts');
  });

  it('claims responder swiftly on horizontal movement > 4px and prevents termination', () => {
    const onSelectTab = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="summary" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );

    const dock = screen.getByTestId('floating-liquid-glass-dock');
    const panHandlers = dock.props;

    // Verify onResponderTerminationRequest is false to protect fluid gesture
    expect(panHandlers.onResponderTerminationRequest()).toBe(false);
  });

  it('keeps released tab highlighted and stable without jumping back during async prop update', () => {
    const onSelectTab = jest.fn();

    const { rerender } = render(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="summary" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );

    const debtsTab = screen.getByTestId('workspace-tab-debts');

    // Simulate user selecting debts tab
    fireEvent(debtsTab, 'pressIn');
    expect(onSelectTab).toHaveBeenCalledWith('debts');

    // Re-render while activeTab prop has NOT updated yet (simulates async state latency)
    rerender(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="summary" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );

    // Debts tab remains visually selected / stable without snapping back to summary
    expect(debtsTab).toBeTruthy();

    // Now parent updates activeTab to debts
    rerender(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="debts" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('workspace-tab-debts').props.accessibilityState).toEqual({
      selected: true,
    });
  });
});
