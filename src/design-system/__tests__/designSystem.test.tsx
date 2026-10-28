import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import PhaseOneHomeScreen from '../../app/index';
import { BFlowThemeProvider } from '../theme/ThemeContext';

describe('design-system & PhaseOneHomeScreen (RNTL)', () => {
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
    expect(screen.getByText('Modo Claro')).toBeTruthy();
    fireEvent.press(themeBtn);
    expect(screen.getByText('Modo Oscuro')).toBeTruthy();

    // Unchecking Cuota FUNFAMI restores total debt to $ 8.000.000 and checklist to 5 de 12
    const funfamiRow = screen.getByTestId('checklist-item-exp_cuota_funfami');
    fireEvent.press(funfamiRow);
    expect(screen.getByTestId('total-debt-amount')).toHaveTextContent('$ 8.000.000');
    expect(screen.getByText('Checklist 5 de 12')).toBeTruthy();

    // Re-checking Cuota FUNFAMI brings total debt back to $ 6.200.000 and checklist to 6 de 12
    fireEvent.press(funfamiRow);
    expect(screen.getByTestId('total-debt-amount')).toHaveTextContent('$ 6.200.000');
    expect(screen.getByText('Checklist 6 de 12')).toBeTruthy();

    const hapticBtn = screen.getByTestId('haptic-verification-button');
    fireEvent.press(hapticBtn);
    expect(screen.getByText('Tubería Verificada (1 toque)')).toBeTruthy();
  });
});
