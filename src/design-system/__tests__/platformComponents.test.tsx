/**
 * Skin-aware building blocks: surface material, pressable feedback and touch targets, the
 * primary action look and the three navigation patterns.
 */

import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, Text, type ViewStyle } from 'react-native';
import { GlassSurface } from '../../platform/glass/GlassSurface';
import { usePrimaryActionLook } from '../components/actionLook';
import {
  AppPressable,
  buildWebInteractionStyle,
  resolveTouchTargetFix,
} from '../components/AppPressable';
import { ThemeToggleIconButton } from '../components/BrandAndThemeIcons';
import {
  WebAppHeader,
  WebTabBar,
  resolveWebHeaderHeight,
} from '../components/navigation/WebNavigation';
import { WORKSPACE_TABS } from '../components/navigation/workspaceTabs';
import { ResponsiveColumns } from '../components/ResponsiveColumns';
import { TactilePressable } from '../components/TactilePressable';
import { AppText } from '../components/Typography';
import { resolveResponsiveLayout } from '../layout/responsiveLayout';
import { BFlowThemeProvider, useBFlowTheme } from '../theme/ThemeContext';
import {
  palettesBySkin,
  radiusBySkin,
  typographyBySkin,
  webMotion,
  type PlatformSkinId,
} from '../tokens';

function renderWithSkin(skin: PlatformSkinId, ui: React.ReactElement, mode: 'dark' | 'light' = 'dark') {
  return render(
    <BFlowThemeProvider skin={skin} initialMode={mode}>
      {ui}
    </BFlowThemeProvider>
  );
}

function flat(style: unknown): ViewStyle {
  return StyleSheet.flatten(style as ViewStyle) ?? {};
}

function restingStyle(testID: string): ViewStyle {
  return flat(screen.getByTestId(testID).props.style);
}

describe('BFlowThemeProvider skins', () => {
  it('defaults to the skin of the running platform and exposes its tokens', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BFlowThemeProvider>{children}</BFlowThemeProvider>
    );
    const { result } = renderHook(() => useBFlowTheme(), { wrapper });

    // Jest runs as iOS.
    expect(result.current.skin).toBe('ios');
    expect(result.current.colors).toBe(palettesBySkin.ios.dark);
    expect(result.current.minTouchTarget).toBe(44);
  });

  it.each(['android', 'web'] as const)('serves the %s palette, radius and type scale', (skin) => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BFlowThemeProvider skin={skin} initialMode="light">
        {children}
      </BFlowThemeProvider>
    );
    const { result } = renderHook(() => useBFlowTheme(), { wrapper });

    expect(result.current.skin).toBe(skin);
    expect(result.current.colors).toBe(palettesBySkin[skin].light);
    expect(result.current.radius).toBe(radiusBySkin[skin]);
    expect(result.current.typography).toBe(typographyBySkin[skin]);
  });

  it('renders text in the type scale of the skin', () => {
    renderWithSkin('web', <AppText testID="copy">Hola</AppText>);
    expect(flat(screen.getByTestId('copy').props.style)).toMatchObject({
      fontSize: 16,
      fontFamily: typographyBySkin.web.body.fontFamily,
    });
  });
});

describe('GlassSurface material per skin', () => {
  it('is blurred Liquid Glass on iOS', () => {
    renderWithSkin(
      'ios',
      <GlassSurface testID="card">
        <Text>Contenido</Text>
      </GlassSurface>
    );

    expect(screen.UNSAFE_queryAllByType(BlurView)).toHaveLength(1);
    expect(restingStyle('card')).toMatchObject({
      borderWidth: 1,
      backgroundColor: palettesBySkin.ios.dark.glass.surfaceTint,
      borderRadius: radiusBySkin.ios.lg,
    });
  });

  it('is an opaque tonal container on Android: no blur, no specular edge', () => {
    renderWithSkin(
      'android',
      <>
        <GlassSurface testID="card">
          <Text>Contenido</Text>
        </GlassSurface>
        <GlassSurface testID="raised" elevated>
          <Text>Elevada</Text>
        </GlassSurface>
      </>
    );

    expect(screen.UNSAFE_queryAllByType(BlurView)).toHaveLength(0);
    const card = restingStyle('card');
    expect(card.borderWidth).toBeUndefined();
    expect(card.backgroundColor).toBe(palettesBySkin.android.dark.glass.surfaceTint);
    expect(card.borderRadius).toBe(16);
    expect(card.elevation).toBe(0);

    const raised = restingStyle('raised');
    expect(raised.backgroundColor).toBe(palettesBySkin.android.dark.glass.surfaceElevatedTint);
    expect(raised.elevation).toBe(2);
  });

  it('is a flat card on a hairline on Web: no blur, no shadow', () => {
    renderWithSkin(
      'web',
      <GlassSurface testID="card" elevated>
        <Text>Contenido</Text>
      </GlassSurface>,
      'light'
    );

    expect(screen.UNSAFE_queryAllByType(BlurView)).toHaveLength(0);
    const card = restingStyle('card');
    expect(card).toMatchObject({
      borderWidth: 1,
      borderColor: palettesBySkin.web.light.glass.specularBorder,
      backgroundColor: palettesBySkin.web.light.glass.surfaceElevatedTint,
      borderRadius: 8,
    });
    expect(card.elevation).toBeUndefined();
    expect(card.shadowOpacity).toBeUndefined();
  });

  it('keeps padding optional on every material', () => {
    for (const skin of ['ios', 'android', 'web'] as const) {
      const view = renderWithSkin(
        skin,
        <GlassSurface testID="bare" noPadding>
          <Text>Sin relleno</Text>
        </GlassSurface>
      );
      expect(restingStyle('bare').padding).toBeUndefined();
      view.unmount();
    }
  });
});

describe('resolveTouchTargetFix', () => {
  it('leaves controls that declare no size, or a compliant one, alone', () => {
    expect(resolveTouchTargetFix(undefined, 44)).toEqual({ grow: null, hitSlop: null });
    expect(resolveTouchTargetFix({ flex: 1 }, 44)).toEqual({ grow: null, hitSlop: null });
    expect(resolveTouchTargetFix({ minHeight: 44, width: '100%' }, 44)).toEqual({
      grow: null,
      hitSlop: null,
    });
  });

  it('grows or pads a compact chip to the minimum height', () => {
    expect(resolveTouchTargetFix({ minHeight: 34 }, 44)).toEqual({
      grow: { minHeight: 44 },
      hitSlop: { top: 5, bottom: 5, left: 0, right: 0 },
    });
    expect(resolveTouchTargetFix({ minHeight: 34 }, 48).hitSlop).toEqual({
      top: 7,
      bottom: 7,
      left: 0,
      right: 0,
    });
  });

  it('grows or pads a small icon button on both axes', () => {
    expect(resolveTouchTargetFix({ width: 36, height: 36 }, 44)).toEqual({
      grow: { minHeight: 44, height: 44, minWidth: 44, width: 44 },
      hitSlop: { top: 4, bottom: 4, left: 4, right: 4 },
    });
  });
});

describe('AppPressable feedback per skin', () => {
  it('adds nothing visual on iOS but extends an undersized control with hit slop', () => {
    renderWithSkin(
      'ios',
      <>
        <AppPressable testID="row" style={{ padding: 8 }}>
          <Text>Fila</Text>
        </AppPressable>
        <AppPressable testID="chip" style={{ minHeight: 34 }}>
          <Text>Chip</Text>
        </AppPressable>
      </>
    );

    expect(screen.getByTestId('row').props.hitSlop).toBeUndefined();
    expect(restingStyle('row')).toEqual({ padding: 8 });
    expect(screen.getByTestId('chip').props.hitSlop).toEqual({ top: 5, bottom: 5, left: 0, right: 0 });
    expect(restingStyle('chip').minHeight).toBe(34);
  });

  it('paints no ripple on Android and reaches 48dp with hit slop', () => {
    renderWithSkin(
      'android',
      <>
        <AppPressable testID="row" style={{ padding: 8 }}>
          <Text>Fila</Text>
        </AppPressable>
        <AppPressable testID="chip" style={{ minHeight: 34 }}>
          <Text>Chip</Text>
        </AppPressable>
        <AppPressable testID="custom" hitSlop={12} android_ripple={{ color: 'red' }}>
          <Text>Propio</Text>
        </AppPressable>
      </>
    );

    // The native ripple drew a gray box with square corners over rounded controls.
    expect(screen.getByTestId('row').props.android_ripple).toBeUndefined();
    expect(restingStyle('row')).toEqual({ padding: 8 });
    expect(screen.getByTestId('row').props.hitSlop).toBe(2);
    expect(screen.getByTestId('chip').props.hitSlop).toEqual({ top: 7, bottom: 7, left: 0, right: 0 });
    // Explicit props always win.
    expect(screen.getByTestId('custom').props.hitSlop).toBe(12);
  });

  it('grows undersized controls and carries the motion tokens on Web', () => {
    renderWithSkin(
      'web',
      <AppPressable testID="icon" style={{ width: 36, height: 36 }}>
        <Text>i</Text>
      </AppPressable>
    );

    const style = restingStyle('icon') as ViewStyle & { transitionDuration?: string };
    expect(style).toMatchObject({ width: 44, height: 44 });
    expect(style.transitionDuration).toBe(`${webMotion.hoverOutMs}ms`);
    expect(screen.getByTestId('icon').props.hitSlop).toBeUndefined();
  });

  it('still presses, and stays inert when disabled', () => {
    const onPress = jest.fn();
    renderWithSkin(
      'web',
      <>
        <AppPressable testID="live" onPress={onPress}>
          <Text>Activo</Text>
        </AppPressable>
        <AppPressable testID="off" onPress={onPress} disabled>
          <Text>Inactivo</Text>
        </AppPressable>
      </>
    );

    fireEvent.press(screen.getByTestId('live'));
    fireEvent.press(screen.getByTestId('off'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('steps on hover and sinks on press without overshoot (web motion layer)', () => {
    const rest = buildWebInteractionStyle('light', false, false) as ViewStyle & {
      transitionDuration?: string;
      transitionTimingFunction?: string;
    };
    expect(rest.filter).toBeUndefined();
    expect(rest.transitionDuration).toBe('200ms');
    expect(rest.transitionTimingFunction).toBe(webMotion.easing);

    const hover = buildWebInteractionStyle('light', true, false) as ViewStyle & {
      transitionDuration?: string;
    };
    expect(hover.filter).toBe('brightness(0.95)');
    expect(hover.transitionDuration).toBe('140ms');
    expect(buildWebInteractionStyle('dark', true, false).filter).toBe('brightness(1.18)');

    const press = buildWebInteractionStyle('light', true, true) as ViewStyle & {
      transitionDuration?: string;
    };
    expect(press.transform).toEqual([{ scale: 0.985 }]);
    expect(press.transitionDuration).toBe('90ms');
  });
});

describe('TactilePressable and theme toggle sizes', () => {
  it.each([
    ['ios', 44],
    ['android', 48],
    ['web', 44],
  ] as const)('uses the %s minimum touch target (%i)', (skin, size) => {
    renderWithSkin(
      skin,
      <>
        <TactilePressable testID="tactile" haptic="none">
          <Text>Acción</Text>
        </TactilePressable>
        <ThemeToggleIconButton testID="toggle" />
      </>
    );

    expect(restingStyle('tactile')).toMatchObject({ minHeight: size, minWidth: size });
    expect(restingStyle('toggle')).toMatchObject({ width: size, height: size });
  });

  it('keeps the theme toggle round on iOS and Android and sharp on Web', () => {
    const ios = renderWithSkin('ios', <ThemeToggleIconButton testID="toggle" />);
    expect(restingStyle('toggle').borderRadius).toBe(999);
    ios.unmount();

    renderWithSkin('web', <ThemeToggleIconButton testID="toggle" />);
    expect(restingStyle('toggle').borderRadius).toBe(4);
  });
});

describe('usePrimaryActionLook', () => {
  function lookFor(skin: PlatformSkinId) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BFlowThemeProvider skin={skin} initialMode="light">
        {children}
      </BFlowThemeProvider>
    );
    return renderHook(() => usePrimaryActionLook(), { wrapper }).result.current;
  }

  it('stays a glass capsule with the feature label color on iOS', () => {
    const look = lookFor('ios');
    expect(look.labelColor).toBeNull();
    expect(look.container.backgroundColor).toBe(palettesBySkin.ios.light.glass.surfaceElevatedTint);
  });

  it('is a filled, fully rounded Material button on Android', () => {
    const look = lookFor('android');
    expect(look.container).toMatchObject({
      backgroundColor: palettesBySkin.android.light.accent.primary,
      borderRadius: 999,
    });
    expect(look.labelColor).toBe(palettesBySkin.android.light.accent.onPrimary);
  });

  it('is the one filled accent button on Web, on the sharp radius', () => {
    const look = lookFor('web');
    expect(look.container.backgroundColor).toBe('#256F82');
    expect(look.container.borderRadius).toBeUndefined();
    expect(look.labelColor).toBe('#FFFFFF');
  });
});

describe('Web navigation', () => {
  const navigation = { activeTab: 'checklist' as const, onSelectTab: jest.fn(), testID: 'nav' };

  beforeEach(() => navigation.onSelectTab.mockClear());

  it('uses a 72px header on desktop and 56px on phones', () => {
    expect(resolveWebHeaderHeight(1440)).toBe(72);
    expect(resolveWebHeaderHeight(640)).toBe(72);
    expect(resolveWebHeaderHeight(390)).toBe(56);
  });

  it('carries the destinations as words with a bar under the current one from 840px', () => {
    renderWithSkin(
      'web',
      <WebAppHeader
        layout={resolveResponsiveLayout(1440, 900, 'web')}
        contextLabel="Octubre 2026"
        navigation={navigation}
      />,
      'light'
    );

    expect(screen.getByTestId('web-brand-mark')).toBeTruthy();
    expect(screen.getByTestId('web-header-context')).toHaveTextContent('Octubre 2026');
    expect(screen.getByTestId('nav')).toBeTruthy();
    expect(screen.getAllByTestId('web-nav-current-bar')).toHaveLength(1);
    expect(screen.getByTestId('workspace-tab-checklist').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );

    fireEvent.press(screen.getByTestId('workspace-tab-account'));
    fireEvent.press(screen.getByTestId('workspace-tab-checklist'));
    expect(navigation.onSelectTab).toHaveBeenCalledTimes(1);
    expect(navigation.onSelectTab).toHaveBeenCalledWith('account');
  });

  it('is opaque with a hairline: no blur, no shadow, no floating', () => {
    renderWithSkin(
      'web',
      <WebAppHeader layout={resolveResponsiveLayout(1440, 900, 'web')} testID="header" />,
      'light'
    );

    const header = restingStyle('header');
    expect(header).toMatchObject({
      backgroundColor: palettesBySkin.web.light.background.primary,
      borderBottomWidth: 1,
    });
    expect(header.position).toBeUndefined();
    expect(header.shadowOpacity).toBeUndefined();
    expect(screen.UNSAFE_queryAllByType(BlurView)).toHaveLength(0);
  });

  it('drops the words and the month below 840px, keeping the mark and the theme switch', () => {
    renderWithSkin(
      'web',
      <WebAppHeader
        layout={resolveResponsiveLayout(390, 844, 'web')}
        contextLabel="Octubre 2026"
        navigation={navigation}
      />
    );

    expect(screen.queryByTestId('nav')).toBeNull();
    expect(screen.queryByTestId('web-header-context')).toBeNull();
    expect(screen.getByTestId('web-brand-mark')).toBeTruthy();
    expect(screen.getByTestId('theme-toggle-button')).toBeTruthy();
  });

  it('moves the destinations to a foot bar on phones, with labels when they fit', () => {
    const view = renderWithSkin(
      'web',
      <WebTabBar activeTab="summary" onSelectTab={navigation.onSelectTab} layout={resolveResponsiveLayout(390, 844, 'web')} />
    );
    expect(screen.getByTestId('workspace-tab-debts')).toHaveTextContent('Deudas');
    expect(restingStyle('web-tab-bar')).toMatchObject({ height: 64, borderTopWidth: 1 });

    fireEvent.press(screen.getByTestId('workspace-tab-debts'));
    fireEvent.press(screen.getByTestId('workspace-tab-summary'));
    expect(navigation.onSelectTab).toHaveBeenCalledTimes(1);
    view.unmount();

    // 320px: 53px cells cannot hold a 13px label, so the bar shows icons with accessible names.
    renderWithSkin(
      'web',
      <WebTabBar activeTab="summary" onSelectTab={navigation.onSelectTab} layout={resolveResponsiveLayout(320, 568, 'web')} />
    );
    expect(screen.getByTestId('workspace-tab-debts')).not.toHaveTextContent('Deudas');
    expect(screen.getByTestId('workspace-tab-debts').props.accessibilityLabel).toBe('Deudas');
  });
});

describe('ResponsiveColumns', () => {
  const panels = [
    <Text key="a">Panel A</Text>,
    <Text key="b">Panel B</Text>,
    <Text key="c">Panel C</Text>,
  ];

  it('stacks its children when the column is narrow (jest window: 750pt, iOS column 560pt)', () => {
    renderWithSkin('ios', <ResponsiveColumns testID="grid">{panels}</ResponsiveColumns>);

    expect(screen.queryByTestId('grid-row-0')).toBeNull();
    expect(screen.getByText('Panel A')).toBeTruthy();
    expect(screen.getByText('Panel C')).toBeTruthy();
  });

  it('fills a grid row by row when columns fit, padding the last row', () => {
    renderWithSkin(
      'ios',
      <ResponsiveColumns testID="grid" minColumnWidth={200}>
        {panels}
      </ResponsiveColumns>
    );

    expect(restingStyle('grid-row-0').flexDirection).toBe('row');
    expect(screen.getByTestId('grid-row-0').children).toHaveLength(2);
    // The single panel of the last row still sits in a two-cell row, so columns stay aligned.
    expect(screen.getByTestId('grid-row-1').children).toHaveLength(2);
    expect(screen.getByText('Panel C')).toBeTruthy();
  });

  it('never makes more columns than children', () => {
    renderWithSkin(
      'ios',
      <ResponsiveColumns testID="grid" minColumnWidth={100} maxColumns={4}>
        <Text>Único</Text>
      </ResponsiveColumns>
    );
    expect(screen.queryByTestId('grid-row-0')).toBeNull();
    expect(screen.getByText('Único')).toBeTruthy();
  });
});
