import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import { AccountProfileWorkspaceView } from '../components/AccountProfileWorkspaceView';
import type { BFlowAuthUser } from '../../../platform/auth/authAdapter';

describe('AccountProfileWorkspaceView', () => {
  const mockUser: BFlowAuthUser = {
    uid: 'usr_test_abernal_123',
    email: 'abernal@bflow.app',
    displayName: 'Alejandro Bernal',
    phone: '+57 300 123 4567',
    financialGoal: 'Comprar CB300F y fondo de paz',
    authProvider: 'password',
    activeMonthKey: '2026-10',
    provider: 'local-demo',
  };

  it('renders user details, initials monogram, and financial goal', () => {
    const onSignOut = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <AccountProfileWorkspaceView
          authUser={mockUser}
          syncStatusMessage="Sincronizado"
          isSyncing={false}
          onSignOut={onSignOut}
        />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('authenticated-user-profile-card')).toBeTruthy();
    expect(screen.getByTestId('authenticated-user-name')).toHaveTextContent('Hola, Alejandro Bernal');
    expect(screen.getByText('AB')).toBeTruthy(); // Initials monogram
    expect(screen.getByText('abernal@bflow.app')).toBeTruthy();
    expect(screen.getByText('Meta: Comprar CB300F y fondo de paz')).toBeTruthy();
    expect(screen.getByText('Sincronizado')).toBeTruthy();
  });

  it('renders a button that directs user to a dedicated profile update window and allows updating data', async () => {
    const onSignOut = jest.fn();
    const onUpdateProfile = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <AccountProfileWorkspaceView
          authUser={mockUser}
          syncStatusMessage="En línea"
          isSyncing={false}
          onSignOut={onSignOut}
          onUpdateProfile={onUpdateProfile}
        />
      </BFlowThemeProvider>
    );

    // Profile settings card exists in the main account menu
    expect(screen.getByTestId('account-settings-card')).toBeTruthy();
    const openButton = screen.getByTestId('open-profile-settings-button');
    expect(openButton).toBeTruthy();
    expect(screen.getByText('Actualizar mis datos')).toBeTruthy();

    // Dedicated window (modal) is initially closed
    expect(screen.queryByTestId('profile-settings-modal')).toBeNull();

    // Pressing the button directs the user to the dedicated update window
    fireEvent.press(openButton);
    expect(screen.getByTestId('profile-settings-modal')).toBeTruthy();
    expect(screen.getByText('Actualizar Datos')).toBeTruthy();

    // Verify financial goal input has the generic, non-specific placeholder
    const goalInput = screen.getByTestId('profile-input-goal');
    expect(goalInput.props.placeholder).toBe('Ej. Ahorro para un proyecto personal');

    // Update fields inside the dedicated window
    fireEvent.changeText(screen.getByTestId('profile-input-name'), 'Alejandro Bernal G.');
    fireEvent.changeText(screen.getByTestId('profile-input-email'), 'abernal.nuevo@bflow.app');
    fireEvent.changeText(goalInput, 'Viaje a Japón y CB300F');

    await act(async () => {
      fireEvent.press(screen.getByTestId('save-profile-settings-button'));
    });

    expect(onUpdateProfile).toHaveBeenCalledWith({
      displayName: 'Alejandro Bernal G.',
      email: 'abernal.nuevo@bflow.app',
      financialGoal: 'Viaje a Japón y CB300F',
    });

    // Close button returns user to main account menu
    fireEvent.press(screen.getByTestId('close-profile-settings-modal'));
    expect(screen.queryByTestId('profile-settings-modal')).toBeNull();
  });

  it('allows user to request 6-digit verification code and update password internally inside the dedicated window', async () => {
    const onSignOut = jest.fn();
    const onRequestPasswordResetCode = jest.fn();
    const onConfirmPasswordResetWithCode = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <AccountProfileWorkspaceView
          authUser={mockUser}
          syncStatusMessage="En línea"
          isSyncing={false}
          onSignOut={onSignOut}
          onRequestPasswordResetCode={onRequestPasswordResetCode}
          onConfirmPasswordResetWithCode={onConfirmPasswordResetWithCode}
        />
      </BFlowThemeProvider>
    );

    // Open dedicated window
    fireEvent.press(screen.getByTestId('open-profile-settings-button'));
    expect(screen.getByTestId('profile-settings-modal')).toBeTruthy();

    // Security & Password card is present inside the dedicated window
    expect(screen.getByTestId('account-password-card')).toBeTruthy();
    expect(screen.getByText('Seguridad y Contraseña')).toBeTruthy();

    // Request 6-digit verification code
    await act(async () => {
      fireEvent.press(screen.getByTestId('request-password-code-button'));
    });

    expect(onRequestPasswordResetCode).toHaveBeenCalledWith('abernal@bflow.app');
    expect(screen.getByText(/Código de 6 dígitos enviado/i)).toBeTruthy();

    // Verification code and new password inputs now visible
    expect(screen.getByTestId('security-verification-code-input')).toBeTruthy();
    expect(screen.getByTestId('security-new-password-input')).toBeTruthy();
    expect(screen.getByTestId('security-confirm-password-input')).toBeTruthy();

    // Fill verification code and matching passwords
    fireEvent.changeText(screen.getByTestId('security-verification-code-input'), '543210');
    fireEvent.changeText(screen.getByTestId('security-new-password-input'), 'miNuevaClave123');
    fireEvent.changeText(screen.getByTestId('security-confirm-password-input'), 'miNuevaClave123');

    // Toggle password visibility
    fireEvent.press(screen.getByTestId('security-password-toggle'));
    fireEvent.press(screen.getByTestId('security-confirm-password-toggle'));

    // Confirm internal password update
    await act(async () => {
      fireEvent.press(screen.getByTestId('security-submit-password-button'));
    });

    expect(onConfirmPasswordResetWithCode).toHaveBeenCalledWith(
      'abernal@bflow.app',
      '543210',
      'miNuevaClave123'
    );
  });

  it('supports danger zone account reset with confirmation', () => {
    const onSignOut = jest.fn();
    const onResetFullAccount = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <AccountProfileWorkspaceView
          authUser={mockUser}
          syncStatusMessage="En línea"
          isSyncing={false}
          onSignOut={onSignOut}
          onResetFullAccount={onResetFullAccount}
        />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('reset-account-card')).toBeTruthy();

    // Clicking initial reset button opens confirmation
    fireEvent.press(screen.getByTestId('reset-full-account-button'));
    expect(screen.getByTestId('confirm-reset-full-account-button')).toBeTruthy();
    expect(screen.getByTestId('cancel-reset-full-account-button')).toBeTruthy();

    // Canceling hides confirmation
    fireEvent.press(screen.getByTestId('cancel-reset-full-account-button'));
    expect(screen.queryByTestId('confirm-reset-full-account-button')).toBeNull();

    // Confirming triggers onResetFullAccount
    fireEvent.press(screen.getByTestId('reset-full-account-button'));
    fireEvent.press(screen.getByTestId('confirm-reset-full-account-button'));
    expect(onResetFullAccount).toHaveBeenCalledTimes(1);
  });

  it('calls onSignOut when the sign out button is pressed', () => {
    const onSignOut = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <AccountProfileWorkspaceView
          authUser={mockUser}
          syncStatusMessage=""
          isSyncing={false}
          onSignOut={onSignOut}
        />
      </BFlowThemeProvider>
    );

    fireEvent.press(screen.getByTestId('sign-out-button'));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('displays discrete app version watermark at the end without technical details clutter', () => {
    const onSignOut = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <AccountProfileWorkspaceView
          authUser={mockUser}
          syncStatusMessage="En línea"
          isSyncing={false}
          onSignOut={onSignOut}
        />
      </BFlowThemeProvider>
    );

    expect(screen.getByText('BFlow v1.0.0 (Liquid Glass)')).toBeTruthy();
    // Verify technical UID / timezone details are no longer shown
    expect(screen.queryByText('Identificador (UID)')).toBeNull();
    expect(screen.queryByText('Zona Horaria')).toBeNull();
  });
});
