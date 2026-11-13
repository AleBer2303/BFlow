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

    // The sign-in email is not a profile field: it only changes through its own card
    expect(screen.queryByTestId('profile-input-email')).toBeNull();

    // Update fields inside the dedicated window
    fireEvent.changeText(screen.getByTestId('profile-input-name'), 'Alejandro Bernal G.');
    fireEvent.changeText(goalInput, 'Viaje a Japón y CB300F');

    await act(async () => {
      fireEvent.press(screen.getByTestId('save-profile-settings-button'));
    });

    expect(onUpdateProfile).toHaveBeenCalledWith({
      displayName: 'Alejandro Bernal G.',
      financialGoal: 'Viaje a Japón y CB300F',
    });

    // Close button returns user to main account menu
    fireEvent.press(screen.getByTestId('close-profile-settings-modal'));
    expect(screen.queryByTestId('profile-settings-modal')).toBeNull();
  });

  describe('saving the profile to the cloud', () => {
    function renderProfileForm(onUpdateProfile: jest.Mock) {
      render(
        <BFlowThemeProvider initialMode="dark">
          <AccountProfileWorkspaceView
            authUser={mockUser}
            syncStatusMessage="En línea"
            isSyncing={false}
            onSignOut={jest.fn()}
            onUpdateProfile={onUpdateProfile}
          />
        </BFlowThemeProvider>
      );
      fireEvent.press(screen.getByTestId('open-profile-settings-button'));
    }

    const save = async () => {
      await act(async () => {
        fireEvent.press(screen.getByTestId('save-profile-settings-button'));
      });
    };

    it('confirms the save once the profile is stored', async () => {
      const onUpdateProfile = jest.fn().mockResolvedValue('saved');
      renderProfileForm(onUpdateProfile);

      fireEvent.changeText(screen.getByTestId('profile-input-name'), 'Alejandro Bernal G.');
      await save();

      expect(screen.getByTestId('profile-success-banner')).toHaveTextContent(
        'Perfil actualizado correctamente'
      );
      expect(screen.queryByTestId('profile-error-banner')).toBeNull();
    });

    it('says the change waits for a connection when it was queued on the device', async () => {
      renderProfileForm(jest.fn().mockResolvedValue('queued'));

      fireEvent.changeText(screen.getByTestId('profile-input-goal'), 'Meta sin red');
      await save();

      expect(screen.getByTestId('profile-success-banner')).toHaveTextContent(
        'Perfil guardado en este dispositivo. Se sincronizará al conectar.'
      );
    });

    it('shows the reason and restores the saved values when the cloud rejects the change', async () => {
      renderProfileForm(
        jest
          .fn()
          .mockRejectedValue(new Error('No se pudo guardar tu perfil en la nube. Inténtalo de nuevo.'))
      );

      fireEvent.changeText(screen.getByTestId('profile-input-name'), 'Nombre Rechazado');
      fireEvent.changeText(screen.getByTestId('profile-input-goal'), 'Meta rechazada');
      await save();

      expect(screen.getByTestId('profile-error-banner')).toHaveTextContent(
        'No se pudo guardar tu perfil en la nube. Inténtalo de nuevo.'
      );
      expect(screen.queryByTestId('profile-success-banner')).toBeNull();
      expect(screen.getByTestId('profile-input-name').props.value).toBe('Alejandro Bernal');
      expect(screen.getByTestId('profile-input-goal').props.value).toBe(
        'Comprar CB300F y fondo de paz'
      );
    });

    it('asks for a name instead of saving an empty one', async () => {
      const onUpdateProfile = jest.fn();
      renderProfileForm(onUpdateProfile);

      fireEvent.changeText(screen.getByTestId('profile-input-name'), '   ');
      await save();

      expect(onUpdateProfile).not.toHaveBeenCalled();
      expect(screen.getByTestId('profile-error-banner')).toHaveTextContent('Escribe tu nombre.');
    });

    it('limits both fields to the lengths that firestore.rules accepts', () => {
      renderProfileForm(jest.fn());

      expect(screen.getByTestId('profile-input-name').props.maxLength).toBe(120);
      expect(screen.getByTestId('profile-input-goal').props.maxLength).toBe(240);
    });
  });

  describe('account emails sent by Firebase Authentication (ADR 0025)', () => {
    function renderProfileWindow(
      props: Partial<React.ComponentProps<typeof AccountProfileWorkspaceView>> = {},
      skin?: 'android' | 'web'
    ) {
      render(
        <BFlowThemeProvider initialMode="dark" skin={skin}>
          <AccountProfileWorkspaceView
            authUser={mockUser}
            syncStatusMessage="En línea"
            isSyncing={false}
            onSignOut={jest.fn()}
            {...props}
          />
        </BFlowThemeProvider>
      );
      fireEvent.press(screen.getByTestId('open-profile-settings-button'));
    }

    it('requests the password reset link for the account email, with no code or password typed in the app', async () => {
      const onSendPasswordReset = jest.fn();
      renderProfileWindow({ onSendPasswordReset });

      expect(screen.getByTestId('account-password-card')).toBeTruthy();
      expect(screen.queryByTestId('security-verification-code-input')).toBeNull();
      expect(screen.queryByTestId('security-new-password-input')).toBeNull();

      await act(async () => {
        fireEvent.press(screen.getByTestId('send-password-reset-button'));
      });

      expect(onSendPasswordReset).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('security-success-banner')).toHaveTextContent(
        /Enviamos a abernal@bflow.app un enlace para definir una nueva contraseña/i
      );
    });

    it('shows the reason when the password reset link cannot be sent', async () => {
      const onSendPasswordReset = jest
        .fn()
        .mockRejectedValue(new Error('Error de conexión. Revisa tu internet e intenta nuevamente.'));
      renderProfileWindow({ onSendPasswordReset });

      await act(async () => {
        fireEvent.press(screen.getByTestId('send-password-reset-button'));
      });

      expect(screen.getByTestId('security-error-banner')).toHaveTextContent(
        'Error de conexión. Revisa tu internet e intenta nuevamente.'
      );
      expect(screen.queryByTestId('security-success-banner')).toBeNull();
    });

    it('validates the email change before asking Firebase for the confirmation link', async () => {
      const onRequestEmailChange = jest.fn();
      renderProfileWindow({ onRequestEmailChange });

      expect(screen.getByTestId('account-email-current')).toHaveTextContent('abernal@bflow.app');

      const submit = async () => {
        await act(async () => {
          fireEvent.press(screen.getByTestId('request-email-change-button'));
        });
      };

      await submit();
      expect(screen.getByTestId('email-error-banner')).toHaveTextContent(
        'Escribe el nuevo correo electrónico.'
      );

      fireEvent.changeText(screen.getByTestId('change-email-input'), ' ABERNAL@bflow.app ');
      await submit();
      expect(screen.getByTestId('email-error-banner')).toHaveTextContent(
        'Ese ya es el correo de tu cuenta.'
      );

      fireEvent.changeText(screen.getByTestId('change-email-input'), 'abernal.nuevo@bflow.app');
      await submit();
      expect(screen.getByTestId('email-error-banner')).toHaveTextContent(
        'Escribe tu contraseña actual para confirmar el cambio.'
      );
      expect(onRequestEmailChange).not.toHaveBeenCalled();
    });

    it('sends the new email and the current password, then explains that the change applies after opening the link', async () => {
      const onRequestEmailChange = jest.fn();
      renderProfileWindow({ onRequestEmailChange });

      fireEvent.changeText(screen.getByTestId('change-email-input'), ' Abernal.Nuevo@bflow.app ');
      fireEvent.changeText(screen.getByTestId('change-email-password-input'), 'claveActual123');

      // The current password can be revealed while typing
      expect(screen.getByTestId('change-email-password-input').props.secureTextEntry).toBe(true);
      fireEvent.press(screen.getByTestId('change-email-password-toggle'));
      expect(screen.getByTestId('change-email-password-input').props.secureTextEntry).toBe(false);

      await act(async () => {
        fireEvent.press(screen.getByTestId('request-email-change-button'));
      });

      expect(onRequestEmailChange).toHaveBeenCalledWith('abernal.nuevo@bflow.app', 'claveActual123');
      expect(screen.getByTestId('email-success-banner')).toHaveTextContent(
        /Enviamos un enlace de confirmación a abernal.nuevo@bflow.app/i
      );
      // The account email on screen does not change until the link is opened
      expect(screen.getByTestId('account-email-current')).toHaveTextContent('abernal@bflow.app');
      expect(screen.getByTestId('change-email-password-input').props.value).toBe('');
    });

    it('keeps the form and shows the reason when the email change is rejected', async () => {
      const onRequestEmailChange = jest
        .fn()
        .mockRejectedValue(new Error('La contraseña actual no es correcta.'));
      renderProfileWindow({ onRequestEmailChange });

      fireEvent.changeText(screen.getByTestId('change-email-input'), 'abernal.nuevo@bflow.app');
      fireEvent.changeText(screen.getByTestId('change-email-password-input'), 'claveMala');
      await act(async () => {
        fireEvent.press(screen.getByTestId('request-email-change-button'));
      });

      expect(screen.getByTestId('email-error-banner')).toHaveTextContent(
        'La contraseña actual no es correcta.'
      );
      expect(screen.getByTestId('change-email-input').props.value).toBe('abernal.nuevo@bflow.app');
    });

    it('shows the verification state and lets an unverified account ask for the verification email', async () => {
      const onSendEmailVerification = jest.fn();
      renderProfileWindow({
        authUser: { ...mockUser, emailVerified: false },
        onSendEmailVerification,
      });

      expect(screen.getByTestId('account-email-status-badge')).toHaveTextContent('Sin verificar');

      await act(async () => {
        fireEvent.press(screen.getByTestId('send-email-verification-button'));
      });

      expect(onSendEmailVerification).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('email-success-banner')).toHaveTextContent(
        /Enviamos un enlace de verificación a abernal@bflow.app/i
      );
    });

    it('marks a verified email and hides the verification button', () => {
      renderProfileWindow({ authUser: { ...mockUser, emailVerified: true } });

      expect(screen.getByTestId('account-email-status-badge')).toHaveTextContent('Verificado');
      expect(screen.queryByTestId('send-email-verification-button')).toBeNull();
    });

    it('offers neither email change nor password reset to an account that signs in with Google', () => {
      renderProfileWindow({ authUser: { ...mockUser, authProvider: 'google.com' } });

      expect(screen.getByTestId('account-email-card')).toBeTruthy();
      expect(screen.queryByTestId('change-email-input')).toBeNull();
      expect(screen.queryByTestId('account-password-card')).toBeNull();
    });

    it.each(['android', 'web'] as const)(
      'offers the same email and password actions on the %s skin',
      async (skin) => {
        const onSendPasswordReset = jest.fn();
        const onRequestEmailChange = jest.fn();
        renderProfileWindow({ onSendPasswordReset, onRequestEmailChange }, skin);

        fireEvent.changeText(screen.getByTestId('change-email-input'), 'otro@bflow.app');
        fireEvent.changeText(screen.getByTestId('change-email-password-input'), 'claveActual123');
        await act(async () => {
          fireEvent.press(screen.getByTestId('request-email-change-button'));
        });
        await act(async () => {
          fireEvent.press(screen.getByTestId('send-password-reset-button'));
        });

        expect(onRequestEmailChange).toHaveBeenCalledWith('otro@bflow.app', 'claveActual123');
        expect(onSendPasswordReset).toHaveBeenCalledTimes(1);
      }
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
