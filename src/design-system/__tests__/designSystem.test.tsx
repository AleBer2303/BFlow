import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import PhaseOneHomeScreen from '../../app/index';
import { useBudgetStore } from '../../features/budget/store/useBudgetStore';
import { CurrencyText } from '../components/CurrencyText';
import { StatusBadge } from '../components/StatusBadge';
import { AppText } from '../components/Typography';
import { BFlowThemeProvider } from '../theme/ThemeContext';

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
    expect(screen.getByText('CB300F - MOTO: $ 2.600.000 · ESP. IA: $ 3.600.000')).toBeTruthy();
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
});
