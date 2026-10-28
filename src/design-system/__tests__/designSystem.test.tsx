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

  it('toggles theme mode between dark and light and handles interaction button presses', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    const themeBtn = screen.getByTestId('theme-toggle-button');
    expect(screen.getByText('Modo Claro')).toBeTruthy();
    fireEvent.press(themeBtn);
    expect(screen.getByText('Modo Oscuro')).toBeTruthy();

    const hapticBtn = screen.getByTestId('haptic-verification-button');
    fireEvent.press(hapticBtn);
    expect(screen.getByText('Tubería Verificada (1 toque)')).toBeTruthy();
  });
});
