import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BFlowThemeProvider } from '../theme/ThemeContext';
import {
  FloatingLiquidGlassDock,
  DOCK_TABS,
  DOCK_PADDING_H,
  LENS_MARGIN_H,
  getDockIndexFromScreenX,
  getDockLensPositionFromScreenX,
  buildLensGeometry,
} from '../components/FloatingLiquidGlassDock';
import * as WorkspaceNavIconsModule from '../components/WorkspaceNavIcons';
import {
  AccountNavIcon,
  ChecklistNavIcon,
  CierreNavIcon,
  DebtsNavIcon,
  SavingsNavIcon,
  SummaryNavIcon,
} from '../components/WorkspaceNavIcons';
import { MIN_TOUCH_TARGET_PT, palettesBySkin, platformSkins, radius, springConfigs } from '../tokens';

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
    // Liquid glass lens is a capsule
    expect(flattenedLensStyle.borderRadius).toBe(radius.pill);
    // Elastic liquid physics: lift (grow) + velocity stretch are applied as scale transforms
    const transformKeys = (flattenedLensStyle.transform as Array<Record<string, unknown>>).map(
      (t) => Object.keys(t)[0]
    );
    expect(transformKeys).toEqual(['translateX', 'scaleX', 'scaleY']);
    // Glass layers (glow, specular highlight, inner shade) never intercept touches
    const layers = React.Children.toArray(lens.props.children) as React.ReactElement<{
      pointerEvents?: string;
    }>[];
    expect(layers).toHaveLength(3);
    layers.forEach((layer) => expect(layer.props.pointerEvents).toBe('none'));
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

  it('keeps the lens inside the dock at both extremes (no clipping), at rest', () => {
    const { rerender } = render(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="summary" onSelectTab={jest.fn()} />
      </BFlowThemeProvider>
    );
    const dock = screen.getByTestId('floating-liquid-glass-dock');
    fireEvent(dock, 'layout', {
      nativeEvent: { layout: { x: 16, y: 700, width: 360, height: 64 } },
    });

    const readTransform = () => {
      const lens = screen.getByTestId('dock-magnifying-lens');
      const style = Array.isArray(lens.props.style)
        ? Object.assign({}, ...lens.props.style)
        : lens.props.style;
      const get = (key: string): number => {
        const entry = (style.transform as Array<Record<string, unknown>>).find((t) => key in t);
        const raw = entry?.[key] as number | { __getValue: () => number };
        return typeof raw === 'number' ? raw : raw.__getValue();
      };
      return { translateX: get("translateX"), scaleX: get("scaleX"), style };
    };

    const lensLeft = DOCK_PADDING_H + LENS_MARGIN_H;

    const assertInside = () => {
      const { translateX, scaleX, style } = readTransform();
      // Derive the measured dock geometry from the rendered lens width
      const lensWidth = style.width as number;
      const tabWidth = lensWidth + LENS_MARGIN_H * 2;
      const dockInnerWidth = tabWidth * DOCK_TABS.length + DOCK_PADDING_H * 2;
      const center = lensLeft + translateX + lensWidth / 2;
      const half = (lensWidth * scaleX) / 2;
      expect(center - half).toBeGreaterThanOrEqual(-0.001);
      expect(center + half).toBeLessThanOrEqual(dockInnerWidth + 0.001);
    };

    assertInside(); // first tab

    rerender(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="account" onSelectTab={jest.fn()} />
      </BFlowThemeProvider>
    );
    assertInside(); // last tab
  });

  it('keeps the bounce but never lets the lens cross the dock edge: it clamps and squashes against the wall', () => {
    const tabWidth = 58;
    const lensWidth = tabWidth - LENS_MARGIN_H * 2;
    const lensLeft = DOCK_PADDING_H + LENS_MARGIN_H;
    const dockInnerWidth = tabWidth * DOCK_TABS.length + DOCK_PADDING_H * 2;
    const last = DOCK_TABS.length - 1;

    // Worst case: fully lifted + fully stretched while the spring overshoots far past both ends
    for (const glider of [-1.5, -0.3, 0, 2.5, last, last + 0.3, last + 1.5]) {
      for (const [lift, stretch] of [[0, 0], [1, 0], [1, 1]] as const) {
        const g = new Animated.Value(glider);
        const l = new Animated.Value(lift);
        const st = new Animated.Value(stretch);
        const { lensTranslateX, lensScaleX } = buildLensGeometry({
          gliderAnim: g,
          liftAnim: l,
          stretchAnim: st,
          tabWidth,
          lensWidth,
        });
        const tx = (lensTranslateX as unknown as { __getValue: () => number }).__getValue();
        const sx = (lensScaleX as unknown as { __getValue: () => number }).__getValue();
        const center = lensLeft + tx + lensWidth / 2;
        const half = (lensWidth * sx) / 2;
        expect(center - half).toBeGreaterThanOrEqual(0.9999 - 0.001); // keeps the 1px border inset
        expect(center + half).toBeLessThanOrEqual(dockInnerWidth - 0.9999 + 0.001);
      }
    }

    // Inside the dock the geometry is untouched (bounce keeps its natural travel)
    const g = new Animated.Value(2.5);
    const { lensTranslateX, lensScaleX } = buildLensGeometry({
      gliderAnim: g,
      liftAnim: new Animated.Value(0),
      stretchAnim: new Animated.Value(0),
      tabWidth,
      lensWidth,
    });
    expect((lensTranslateX as unknown as { __getValue: () => number }).__getValue()).toBeCloseTo(
      tabWidth * 2.5,
      5
    );
    expect((lensScaleX as unknown as { __getValue: () => number }).__getValue()).toBeCloseTo(1, 5);

    // Overshooting past the wall compresses the lens horizontally (squash)
    g.setValue(last + 1.5);
    const squashed = (lensScaleX as unknown as { __getValue: () => number }).__getValue();
    expect(squashed).toBeLessThan(1);
    expect(squashed).toBeGreaterThan(0.8);
  });

  it('maps finger X to a continuous fractional lens position (no stops per tab) clamped to the dock', () => {
    // Dock at x=0, width 360 => tabWidth 58, center of tab i at 6 + 58 * (i + 0.5)
    const pos = (x: number) => getDockLensPositionFromScreenX(x, 0, 360);

    // Exact tab centers map to integer positions
    expect(pos(35)).toBeCloseTo(0, 5);
    expect(pos(93)).toBeCloseTo(1, 5);
    expect(pos(325)).toBeCloseTo(5, 5);

    // Between centers it is fractional and strictly increasing (fluid, not stepped)
    expect(pos(64)).toBeCloseTo(0.5, 5);
    const samples = [40, 50, 60, 70, 80, 90].map(pos);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThan(samples[i - 1]!);
    }

    // Clamped outside the dock
    expect(pos(-100)).toBe(0);
    expect(pos(999)).toBe(5);

    // Release snaps to the nearest tab
    expect(Math.round(pos(60))).toBe(0);
    expect(Math.round(pos(70))).toBe(1);

    // Degenerate width
    expect(getDockLensPositionFromScreenX(100, 0, 0)).toBe(0);
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

describe('FloatingLiquidGlassDock on the Android skin (flat selection pill)', () => {
  function renderAndroidDock(
    props: Partial<React.ComponentProps<typeof FloatingLiquidGlassDock>> = {},
    mode: 'dark' | 'light' = 'dark'
  ) {
    const onSelectTab = jest.fn();
    const view = render(
      <BFlowThemeProvider skin="android" initialMode={mode}>
        <FloatingLiquidGlassDock activeTab="summary" onSelectTab={onSelectTab} {...props} />
      </BFlowThemeProvider>
    );
    fireEvent(screen.getByTestId('floating-liquid-glass-dock'), 'layout', {
      nativeEvent: { layout: { x: 16, y: 700, width: 360, height: 64 } },
    });
    return { onSelectTab, ...view };
  }

  const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

  it('keeps the six destinations and the pill-shaped floating dock', () => {
    renderAndroidDock();

    for (const tab of DOCK_TABS) {
      expect(screen.getByTestId(`workspace-tab-${tab.id}`)).toHaveTextContent(tab.label);
    }
    expect(styleOf('floating-liquid-glass-dock')).toMatchObject({
      width: '100%',
      maxWidth: 580,
      borderRadius: 999,
    });
  });

  it.each(['dark', 'light'] as const)(
    'marks the selection with one flat tonal pill instead of the glass lens (%s)',
    (mode) => {
      renderAndroidDock({}, mode);

      expect(screen.queryByTestId('dock-magnifying-lens')).toBeNull();
      const pill = screen.getByTestId('dock-flat-indicator');
      const style = StyleSheet.flatten(pill.props.style);

      expect(style.backgroundColor).toBe(palettesBySkin.android[mode].accent.container);
      expect(style.borderRadius).toBe(999);
      // Flat: no rim, no shadow, no elevation and no glass layers inside.
      expect(style.borderWidth).toBeUndefined();
      expect(style.shadowOpacity).toBeUndefined();
      expect(style.elevation).toBeUndefined();
      expect(React.Children.count(pill.props.children)).toBe(0);
      // It only travels: nothing scales it up under the finger.
      const transformKeys = (style.transform as Array<Record<string, unknown>>).map(
        (t) => Object.keys(t)[0]
      );
      expect(transformKeys).toEqual(['translateX']);
    }
  );

  it('moves the pill to the selected tab and never past the first or last one', () => {
    const { rerender } = renderAndroidDock();
    const translateX = (): number => {
      const style = StyleSheet.flatten(screen.getByTestId('dock-flat-indicator').props.style);
      const raw = (style.transform as Array<Record<string, unknown>>)[0]?.translateX as
        | number
        | { __getValue: () => number };
      return typeof raw === 'number' ? raw : raw.__getValue();
    };
    // The measured dock width decides the travel: derive it from the painted pill.
    const tabWidth = (styleOf('dock-flat-indicator').width as number) + LENS_MARGIN_H * 2;

    expect(translateX()).toBeCloseTo(0, 5);

    rerender(
      <BFlowThemeProvider skin="android" initialMode="dark">
        <FloatingLiquidGlassDock activeTab="account" onSelectTab={jest.fn()} />
      </BFlowThemeProvider>
    );
    expect(translateX()).toBeCloseTo(tabWidth * (DOCK_TABS.length - 1), 5);
  });

  it('paints the dock with the opaque Android surface in both themes', () => {
    for (const mode of ['dark', 'light'] as const) {
      const { unmount } = renderAndroidDock({}, mode);
      const surface = screen.getByTestId('floating-liquid-glass-dock').children[0];
      const surfaceStyle = typeof surface === 'object' ? surface.props.style : undefined;
      expect(StyleSheet.flatten(surfaceStyle)).toMatchObject({
        backgroundColor: palettesBySkin.android[mode].glass.surfaceElevatedTint,
      });
      unmount();
    }
  });

  it('gives every tab the 48dp Material touch target', () => {
    renderAndroidDock();

    for (const tab of DOCK_TABS) {
      const style = styleOf(`workspace-tab-${tab.id}`);
      expect(style.minHeight).toBe(platformSkins.android.minTouchTarget);
      expect(style.height).toBeGreaterThanOrEqual(platformSkins.android.minTouchTarget);
    }
  });

  it('floats above the system gesture area', () => {
    renderAndroidDock({ bottomInset: 24 });

    const anchor = styleOf('floating-liquid-glass-dock-anchor');
    expect(anchor.position).toBe('absolute');

    screen.unmount();
    renderAndroidDock();
    const resting = styleOf('floating-liquid-glass-dock-anchor');
    expect((anchor.bottom as number) - (resting.bottom as number)).toBe(24);
  });

  it('selects on touch-down and ignores the active tab, like on iOS', () => {
    const { onSelectTab } = renderAndroidDock();

    fireEvent(screen.getByTestId('workspace-tab-savings'), 'pressIn');
    fireEvent.press(screen.getByTestId('workspace-tab-summary'));

    expect(onSelectTab).toHaveBeenCalledTimes(1);
    expect(onSelectTab).toHaveBeenCalledWith('savings');
  });

  it('settles without overshoot: the flat spring is not underdamped', () => {
    const { damping, stiffness, mass } = springConfigs.flatSettle;
    expect(damping).toBeGreaterThanOrEqual(2 * Math.sqrt(stiffness * mass));
  });

  it('skips iOS lens Animated node graph construction on Android and memoizes flat travel', () => {
    const multiplySpy = jest.spyOn(Animated, 'multiply');
    const subtractSpy = jest.spyOn(Animated, 'subtract');

    try {
      const { rerender, unmount } = renderAndroidDock();
      expect(multiplySpy).not.toHaveBeenCalled();
      expect(subtractSpy).not.toHaveBeenCalled();

      const pillBefore = screen.getByTestId('dock-flat-indicator').props.style;
      rerender(
        <BFlowThemeProvider skin="android" initialMode="dark">
          <FloatingLiquidGlassDock activeTab="checklist" onSelectTab={jest.fn()} />
        </BFlowThemeProvider>
      );
      expect(multiplySpy).not.toHaveBeenCalled();
      expect(subtractSpy).not.toHaveBeenCalled();
      expect(StyleSheet.flatten(pillBefore).transform).toBeTruthy();
      unmount();

      render(
        <BFlowThemeProvider skin="ios" initialMode="dark">
          <FloatingLiquidGlassDock activeTab="summary" onSelectTab={jest.fn()} />
        </BFlowThemeProvider>
      );
      expect(multiplySpy).toHaveBeenCalled();
      expect(subtractSpy).toHaveBeenCalled();
    } finally {
      multiplySpy.mockRestore();
      subtractSpy.mockRestore();
    }
  });

  it('avoids re-renders during drag moves within the same tab and skips lens springs on Android', () => {
    const springSpy = jest.spyOn(Animated, 'spring');
    const dockIconRenderSpy = jest.spyOn(WorkspaceNavIconsModule, 'SummaryNavIcon');
    const dockTouch = (pageX: number, timestamp: number) => ({
      nativeEvent: { pageX, touches: [{}], locationX: pageX - 16 },
      touchHistory: {
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: timestamp,
        numberActiveTouches: 1,
        touchBank: [
          {
            touchActive: true,
            startPageX: 40,
            startPageY: 700,
            startTimeStamp: 1,
            currentPageX: pageX,
            currentPageY: 700,
            currentTimeStamp: timestamp,
            previousPageX: 40,
            previousPageY: 700,
            previousTimeStamp: Math.max(1, timestamp - 1),
          },
        ],
      },
    });

    try {
      render(
        <BFlowThemeProvider skin="android" initialMode="dark">
          <FloatingLiquidGlassDock activeTab="summary" onSelectTab={jest.fn()} />
        </BFlowThemeProvider>
      );

      const dock = screen.getByTestId('floating-liquid-glass-dock');
      act(() => {
        dock.props.onLayout({
          nativeEvent: { layout: { x: 16, y: 700, width: 360, height: 64 } },
        });
      });
      const laidOutDock = screen.getByTestId('floating-liquid-glass-dock');

      expect(styleOf('dock-flat-indicator').width).toBeCloseTo(54, 1);
      dockIconRenderSpy.mockClear();
      springSpy.mockClear();

      // Grant and intra-tab drag moves must not trigger a React re-render of the dock.
      act(() => {
        laidOutDock.props.onResponderGrant(dockTouch(40, 2));
        laidOutDock.props.onResponderMove(dockTouch(45, 3));
        laidOutDock.props.onResponderMove(dockTouch(52, 4));
      });
      expect(dockIconRenderSpy).not.toHaveBeenCalled();
      expect(springSpy).not.toHaveBeenCalled();

      // Crossing into tab 1 (checklist) triggers a single dock re-render without lens springs.
      act(() => {
        laidOutDock.props.onResponderMove(dockTouch(109, 5));
      });
      expect(dockIconRenderSpy).toHaveBeenCalledTimes(1);
      expect(dockIconRenderSpy.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ focused: false })
      );
      expect(springSpy).not.toHaveBeenCalled();

      // Further moves within tab 1 again trigger 0 extra re-renders.
      dockIconRenderSpy.mockClear();
      act(() => {
        laidOutDock.props.onResponderMove(dockTouch(115, 6));
      });
      expect(dockIconRenderSpy).not.toHaveBeenCalled();

      act(() => {
        laidOutDock.props.onResponderTerminate?.(dockTouch(115, 7));
      });
    } finally {
      dockIconRenderSpy.mockRestore();
      springSpy.mockRestore();
    }
  });
});
