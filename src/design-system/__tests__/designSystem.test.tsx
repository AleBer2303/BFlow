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
    expect(screen.getByTestId('monthly-curve-section')).toBeTruthy();
    expect(screen.queryByText('Control Deudas')).toBeNull();
    expect(screen.queryByText('Control Ahorros')).toBeNull();
  });

  it('toggles theme mode and updates the FUNFAMI debt when its checklist item changes', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    const themeBtn = screen.getByTestId('theme-toggle-button');
    expect(screen.getByTestId('theme-icon-sun')).toBeTruthy();
    fireEvent.press(themeBtn);
    expect(screen.getByTestId('theme-icon-moon')).toBeTruthy();

    const toggleFunfamiFromChecklist = () => {
      fireEvent.press(screen.getByTestId('workspace-tab-checklist'));
      fireEvent.press(screen.getByTestId('checklist-workspace-item-2026-10_exp_cuota_funfami'));
      fireEvent.press(screen.getByTestId('workspace-tab-summary'));
    };

    const readDebtFromCurve = (): string =>
      screen.getByTestId('monthly-curve-metric-debt').props.accessibilityLabel;

    // Unchecking Cuota FUNFAMI restores total debt to $ 8.000.000 and checklist to 5 de 12
    toggleFunfamiFromChecklist();
    expect(readDebtFromCurve()).toContain('$ 8.000.000');
    expect(screen.getByText('Checklist 5 de 12')).toBeTruthy();

    // Re-checking Cuota FUNFAMI brings total debt back to $ 6.200.000 and checklist to 6 de 12
    toggleFunfamiFromChecklist();
    expect(readDebtFromCurve()).toContain('$ 6.200.000');
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

  it.each(['ios', 'android', 'web'] as const)(
    'enforces initial capitalization on text inputs and number-pad + thousands dots on numeric inputs (%s skin)',
    (skin) => {
      const onAmountChange = jest.fn();
      const onRateChange = jest.fn();
      const onTextChange = jest.fn();

      function ControlledHarness() {
        const [amount, setAmount] = React.useState('1000');
        const [rate, setRate] = React.useState('0.9');
        const [label, setLabel] = React.useState('');

        return (
          <BFlowThemeProvider initialMode="dark" skin={skin}>
            <AppTextInput
              testID="harness-text-input"
              value={label}
              onChangeText={(txt) => {
                setLabel(txt);
                onTextChange(txt);
              }}
              placeholder="Concepto"
            />
            <AppTextInput
              testID="harness-email-input"
              value=""
              onChangeText={() => {}}
              keyboardType="email-address"
            />
            <AppTextInput
              testID="harness-password-input"
              value=""
              onChangeText={() => {}}
              secureTextEntry
            />
            <AppTextInput
              testID="harness-numeric-input"
              value={amount}
              onChangeText={(txt) => {
                setAmount(txt);
                onAmountChange(txt);
              }}
              keyboardType="numeric"
            />
            <AppTextInput
              testID="harness-decimal-input"
              value={rate}
              onChangeText={(txt) => {
                setRate(txt);
                onRateChange(txt);
              }}
              keyboardType="decimal-pad"
            />
          </BFlowThemeProvider>
        );
      }

      render(<ControlledHarness />);

      const textInput = screen.getByTestId('harness-text-input');
      const emailInput = screen.getByTestId('harness-email-input');
      const passwordInput = screen.getByTestId('harness-password-input');
      const numericInput = screen.getByTestId('harness-numeric-input');
      const decimalInput = screen.getByTestId('harness-decimal-input');

      expect(textInput.props.autoCapitalize).toBe('sentences');
      expect(emailInput.props.autoCapitalize).toBe('none');
      expect(passwordInput.props.autoCapitalize).toBe('none');

      // "numeric" normalizes to "number-pad" so iOS & Android open the numeric keypad directly.
      expect(numericInput.props.keyboardType).toBe('number-pad');
      expect(numericInput.props.inputMode).toBe('numeric');
      expect(numericInput.props.autoCapitalize).toBe('none');
      expect(numericInput.props.value).toBe('1.000');

      fireEvent.changeText(numericInput, '100000');
      expect(onAmountChange).toHaveBeenLastCalledWith('100.000');
      expect(screen.getByTestId('harness-numeric-input').props.value).toBe('100.000');

      fireEvent.changeText(numericInput, '1000000');
      expect(onAmountChange).toHaveBeenLastCalledWith('1.000.000');
      expect(screen.getByTestId('harness-numeric-input').props.value).toBe('1.000.000');

      // Decimal fields keep decimal-pad and do not get reformatted as integer thousands.
      expect(decimalInput.props.keyboardType).toBe('decimal-pad');
      expect(decimalInput.props.value).toBe('0.9');
      fireEvent.changeText(decimalInput, '12.5');
      expect(onRateChange).toHaveBeenLastCalledWith('12.5');
    }
  );

  it('validates DESIGN.md token specifications for neutral minimal palettes, typography and kinematics', () => {
    // Dark mode warm obsidian luxury foundation
    expect(palettes.dark.background.primary).toBe('#0D0F12');
    expect(palettes.dark.background.secondary).toBe('#14171C');
    expect(palettes.dark.background.elevated).toBe('#1B1F26');
    expect(palettes.dark.text.primary).toBe('#F4F5F7');
    expect(palettes.dark.semantic.income).toBe('#2EBD85');
    expect(palettes.dark.semantic.expense).toBe('#E06A6A');

    // Light mode: warm stone foundation, never pure white (eye comfort)
    expect(palettes.light.background.primary).toBe('#E7E6E0');
    expect(palettes.light.background.secondary).toBe('#DCDBD3');
    expect(palettes.light.background.elevated).toBe('#EFECE3');
    expect(palettes.light.background.elevated).not.toBe('#FFFFFF');
    expect(palettes.light.text.primary).toBe('#12151B');
    expect(palettes.light.semantic.income).toBe('#127551');
    expect(palettes.light.semantic.expense).toBe('#A83232');

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
