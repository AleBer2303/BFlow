import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { TextInput } from 'react-native';
import PhaseOneHomeScreen from '../../app/index';
import { useBudgetStore } from '../../features/budget/store/useBudgetStore';
import { AppTextInput } from '../components/AppTextInput';
import { CurrencyText } from '../components/CurrencyText';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { StatusBadge } from '../components/StatusBadge';
import { AppText } from '../components/Typography';
import { BFlowThemeProvider } from '../theme/ThemeContext';
import { palettes, radius, spacing, springConfigs, typography } from '../tokens';

describe('design-system & PhaseOneHomeScreen (RNTL)', () => {
  beforeEach(() => {
    useBudgetStore.getState().resetToOctober2026GoldenState();
  });

  it('renders Golden October 2026 metrics and Liquid Glass cards accurately', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    expect(screen.getByText('BFlow · Octubre 2026')).toBeTruthy();
    expect(screen.getByTestId('golden-net-flow')).toHaveTextContent('$ 1.080.000');
    expect(screen.getByText('Checklist 6 de 12')).toBeTruthy();
    expect(screen.getByText('Control Deudas')).toBeTruthy();
    expect(screen.getByText('Control Ahorros')).toBeTruthy();
  });

  it('toggles theme mode, completes/uncompletes checklist items live, and updates FUNFAMI debt', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    const themeBtn = screen.getByTestId('theme-toggle-button');
    expect(screen.getByTestId('theme-icon-sun')).toBeTruthy();
    fireEvent.press(themeBtn);
    expect(screen.getByTestId('theme-icon-moon')).toBeTruthy();

    // Unchecking Cuota FUNFAMI restores total debt to $ 8.000.000 and checklist to 5 de 12
    const funfamiRow = screen.getByTestId('checklist-item-exp_cuota_funfami');
    fireEvent.press(funfamiRow);
    expect(screen.getByTestId('total-debt-amount')).toHaveTextContent('$ 8.000.000');
    expect(screen.getByText('Checklist 5 de 12')).toBeTruthy();

    // Re-checking Cuota FUNFAMI brings total debt back to $ 6.200.000 and checklist to 6 de 12
    fireEvent.press(funfamiRow);
    expect(screen.getByTestId('total-debt-amount')).toHaveTextContent('$ 6.200.000');
    expect(screen.getByText('Checklist 6 de 12')).toBeTruthy();
  });

  it('renders core typography, currency, and status badge design system components', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <AppText variant="heroCurrency" testID="sample-text">
          Texto de Prueba
        </AppText>
        <CurrencyText amount={1080000} variant="title1" tone="income" testID="sample-currency" />
        <StatusBadge label="Al Día" status="completed" testID="sample-badge" />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('sample-text')).toHaveTextContent('Texto de Prueba');
    expect(screen.getByTestId('sample-currency')).toHaveTextContent('$ 1.080.000');
    expect(screen.getByTestId('sample-badge')).toHaveTextContent('Al Día');
  });

  it('renders KeyboardAwareScrollView and AppTextInput with automatic focus tracking and forwardRef', () => {
    const onFocusMock = jest.fn();
    const inputRef = React.createRef<any>();

    render(
      <BFlowThemeProvider initialMode="dark">
        <KeyboardAwareScrollView testID="test-keyboard-scroll-view" extraScrollHeight={24}>
          <AppText variant="headline">Formulario de Prueba</AppText>
          <AppTextInput
            ref={inputRef}
            testID="test-app-text-input"
            placeholder="Campo de prueba"
            onFocus={onFocusMock}
            focusScrollOffset={24}
          />
        </KeyboardAwareScrollView>
      </BFlowThemeProvider>
    );

    const input = screen.getByTestId('test-app-text-input');
    expect(input).toBeTruthy();
    expect(screen.getByTestId('test-keyboard-scroll-view')).toBeTruthy();

    // Verify focus handling
    fireEvent(input, 'focus');
    expect(onFocusMock).toHaveBeenCalledTimes(1);

    // Verify forwarded ref is attached
    expect(inputRef.current).toBeTruthy();
  });

  it('validates DESIGN.md token specifications for neutral minimal palettes, typography and kinematics', () => {
    // Dark mode warm obsidian luxury foundation
    expect(palettes.dark.background.primary).toBe('#0D0F12');
    expect(palettes.dark.background.secondary).toBe('#14171C');
    expect(palettes.dark.background.elevated).toBe('#1B1F26');
    expect(palettes.dark.text.primary).toBe('#F4F5F7');
    expect(palettes.dark.semantic.income).toBe('#2EBD85');
    expect(palettes.dark.semantic.expense).toBe('#E06A6A');

    // Light mode warm ivory alabaster luxury foundation
    expect(palettes.light.background.primary).toBe('#F8F8F6');
    expect(palettes.light.background.secondary).toBe('#EFEFEA');
    expect(palettes.light.background.elevated).toBe('#FFFFFF');
    expect(palettes.light.text.primary).toBe('#12151B');
    expect(palettes.light.semantic.income).toBe('#16825B');
    expect(palettes.light.semantic.expense).toBe('#B83A3A');

    // Typography additions and refinements
    expect(typography.heroCurrency.fontSize).toBe(38);
    expect(typography.heroCurrency.letterSpacing).toBe(-1.0);
    expect(typography.callout.fontSize).toBe(14);
    expect(typography.callout.fontWeight).toBe('500');

    // Spacing and radius additions
    expect(spacing.huge).toBe(56);
    expect(radius.xs).toBe(6);

    // Spring kinematics
    expect(springConfigs.snappy.stiffness).toBe(260);
    expect(springConfigs.sheet.damping).toBe(30);
    expect(springConfigs.sheet.stiffness).toBe(160);
  });
});
