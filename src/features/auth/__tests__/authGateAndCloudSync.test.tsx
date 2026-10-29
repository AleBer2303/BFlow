import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import PhaseOneHomeScreen from '../../../app/index';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import {
  loadPersistedSession,
  savePersistedSession,
  type BFlowAuthUser,
} from '../../../platform/auth/authAdapter';
import { useBudgetStore } from '../../budget/store/useBudgetStore';

describe('Authentication Gate, Personal Registration & Multi-Device Session Persistence', () => {
  beforeEach(() => {
    savePersistedSession(null);
    useBudgetStore.getState().resetToOctober2026GoldenState();
  });

  it('requires authentication first when no session is active and validates personal registration inputs', () => {
    useBudgetStore.getState().requireAuthenticationGate();

    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    // Must render full-screen Auth Gate instead of the budget workspace
    expect(screen.getByTestId('auth-gate-screen')).toBeTruthy();
    expect(screen.queryByTestId('net-flow-hero-card')).toBeNull();

    // Switch to Personal Registration ("Crear cuenta")
    fireEvent.press(screen.getByTestId('auth-mode-register'));
    expect(screen.getByText('Registra tus datos personales')).toBeTruthy();
    expect(screen.getByTestId('auth-name-input')).toBeTruthy();
    expect(screen.getByTestId('auth-phone-input')).toBeTruthy();
    expect(screen.getByTestId('auth-goal-input')).toBeTruthy();

    // Validate missing name error
    fireEvent.press(screen.getByTestId('auth-primary-submit-button'));
    expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
      'Escribe tu nombre y apellido para identificar tu presupuesto.'
    );

    // Fill personal fields and test mismatched password confirmation
    fireEvent.changeText(screen.getByTestId('auth-name-input'), 'Alejandro Bernal Garnica');
    fireEvent.changeText(screen.getByTestId('auth-phone-input'), '+57 300 123 4567');
    fireEvent.changeText(screen.getByTestId('auth-email-input'), 'abernalg2303@gmail.com');
    fireEvent.changeText(screen.getByTestId('auth-password-input'), 'secreto123');
    fireEvent.changeText(screen.getByTestId('auth-confirm-password-input'), 'otraClave');

    fireEvent.press(screen.getByTestId('auth-primary-submit-button'));
    expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
      'Las dos contraseñas no coinciden. Verifícalas e intenta de nuevo.'
    );
  });

  it('persists user session with personal metadata and signs out back to the Auth Gate', async () => {
    const customUser: BFlowAuthUser = {
      uid: 'uid_alejandro_01',
      email: 'abernalg2303@gmail.com',
      displayName: 'Alejandro Bernal Garnica',
      phone: '+57 300 987 6543',
      financialGoal: 'Pagar CB300F y ahorrar para apartamento',
      authProvider: 'password',
      provider: 'local-demo',
    };

    savePersistedSession(customUser);
    expect(loadPersistedSession()?.displayName).toBe('Alejandro Bernal Garnica');
    expect(loadPersistedSession()?.phone).toBe('+57 300 987 6543');

    useBudgetStore.getState().setAuthUser(customUser);

    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('authenticated-user-name')).toHaveTextContent(
      'Hola, Alejandro Bernal Garnica'
    );
    expect(screen.getByText('Meta: Pagar CB300F y ahorrar para apartamento')).toBeTruthy();

    // Signing out clears the session and returns to the Auth Gate
    fireEvent.press(screen.getByTestId('sign-out-button'));
    expect(await screen.findByTestId('auth-gate-screen')).toBeTruthy();
    expect(loadPersistedSession()).toBeNull();
  });
});
