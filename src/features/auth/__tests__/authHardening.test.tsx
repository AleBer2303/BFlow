/**
 * ADR 0026 on the three skins: the password policy of the registration form, the lockout
 * after five wrong passwords, the wait between reset links, and the rule that an account
 * with an unverified email never synchronizes its budget.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import PhaseOneHomeScreen from '../../../app/index';
import { FirestoreBudgetRepository } from '../../../data/repositories/budgetRepository';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import { PLATFORM_SKIN_IDS, type PlatformSkinId } from '../../../design-system/tokens';
import * as accountEmailActions from '../../../platform/auth/accountEmailActions';
import * as authAdapter from '../../../platform/auth/authAdapter';
import { savePersistedSession, type BFlowAuthUser } from '../../../platform/auth/authAdapter';
import {
  recordFailedAuthAttempt,
  runPasswordAttempt,
} from '../../../platform/auth/authRateLimiter';
import { persistentStorage } from '../../../platform/storage/persistentStorageAdapter';
import { useBudgetStore } from '../../budget/store/useBudgetStore';
import { AuthScreen, type AuthScreenProps } from '../components/AuthScreen';

const STRONG_PASSWORD = 'Presupuesto2026!';
const RULE_IDS = ['length', 'uppercase', 'lowercase', 'digit', 'special', 'edgeSpaces'] as const;

function elapse(milliseconds: number) {
  act(() => {
    jest.advanceTimersByTime(milliseconds);
  });
}

function renderAuthScreen(props: Partial<AuthScreenProps> = {}, skin?: PlatformSkinId) {
  const handlers = {
    onSignInWithEmail: jest.fn().mockResolvedValue(undefined),
    onRegisterPersonalAccount: jest.fn().mockResolvedValue(undefined),
    onSendPasswordRecovery: jest.fn().mockResolvedValue(undefined),
    ...props,
  };
  render(
    <BFlowThemeProvider initialMode="dark" skin={skin}>
      <AuthScreen isSubmitting={false} errorMessage={null} statusMessage={null} {...handlers} />
    </BFlowThemeProvider>
  );
  return handlers;
}

function ruleStates(): string[] {
  return RULE_IDS.map(
    (id) => String(screen.getByTestId(`auth-password-rule-${id}`).props.accessibilityLabel).split(':')[0] as string
  );
}

async function pressSubmit() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('auth-primary-submit-button'));
  });
}

beforeEach(() => {
  persistentStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe.each(PLATFORM_SKIN_IDS)('AuthScreen security on the %s skin (ADR 0026)', (skin) => {
  describe('password policy of the registration form', () => {
    it('lists the rules only when creating an account and marks each one as it is met', () => {
      renderAuthScreen({}, skin);
      expect(screen.queryByTestId('auth-password-rules')).toBeNull();
      expect(screen.getByTestId('auth-password-input').props.placeholder).toBe('Tu contraseña');

      fireEvent.press(screen.getByTestId('auth-mode-register'));
      expect(screen.getByTestId('auth-password-input').props.placeholder).toBe('Mínimo 8 caracteres');
      expect(screen.getByTestId('auth-password-input').props.maxLength).toBe(128);
      expect(ruleStates()).toEqual(Array(6).fill('Pendiente'));
      expect(screen.getByTestId('auth-password-rule-uppercase')).toHaveTextContent(
        '○Una letra mayúscula'
      );

      fireEvent.changeText(screen.getByTestId('auth-password-input'), 'presupuesto');
      expect(ruleStates()).toEqual([
        'Cumplido',
        'Pendiente',
        'Cumplido',
        'Pendiente',
        'Pendiente',
        'Cumplido',
      ]);

      fireEvent.changeText(screen.getByTestId('auth-password-input'), STRONG_PASSWORD);
      expect(ruleStates()).toEqual(Array(6).fill('Cumplido'));
      expect(screen.getByTestId('auth-password-rule-uppercase')).toHaveTextContent(
        '✓Una letra mayúscula'
      );
      expect(screen.getByTestId('auth-password-rule-length').props.accessibilityLabel).toBe(
        'Cumplido: Mínimo 8 caracteres (máximo 128)'
      );
    });

    it('does not create the account until the password meets every rule', async () => {
      const handlers = renderAuthScreen({}, skin);
      fireEvent.press(screen.getByTestId('auth-mode-register'));
      fireEvent.changeText(screen.getByTestId('auth-name-input'), 'Cuenta Nueva');
      fireEvent.changeText(screen.getByTestId('auth-email-input'), 'cuenta@correo.com');

      fireEvent.changeText(screen.getByTestId('auth-password-input'), 'secreto123');
      fireEvent.changeText(screen.getByTestId('auth-confirm-password-input'), 'secreto123');
      await pressSubmit();
      expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
        'La contraseña no cumple este requisito: una letra mayúscula.'
      );
      expect(handlers.onRegisterPersonalAccount).not.toHaveBeenCalled();

      fireEvent.changeText(screen.getByTestId('auth-password-input'), STRONG_PASSWORD);
      fireEvent.changeText(screen.getByTestId('auth-confirm-password-input'), STRONG_PASSWORD);
      await pressSubmit();
      expect(handlers.onRegisterPersonalAccount).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'cuenta@correo.com', password: STRONG_PASSWORD })
      );
    });

    it('does not apply the policy when signing in', async () => {
      const handlers = renderAuthScreen({}, skin);
      fireEvent.changeText(screen.getByTestId('auth-email-input'), 'cuenta@correo.com');
      fireEvent.changeText(screen.getByTestId('auth-password-input'), 'abc123');
      await pressSubmit();
      expect(handlers.onSignInWithEmail).toHaveBeenCalledWith('cuenta@correo.com', 'abc123');
    });
  });

  describe('lockout after five wrong passwords', () => {
    it('locks the sign-in, counts down on the button and keeps the password reset at hand', async () => {
      // What the platform does: every rejected password is counted on the device.
      const handlers = renderAuthScreen(
        {
          onSignInWithEmail: jest.fn(async () => {
            recordFailedAuthAttempt('login_password');
          }),
        },
        skin
      );
      const submit = () => screen.getByTestId('auth-primary-submit-button');
      fireEvent.changeText(screen.getByTestId('auth-email-input'), 'cuenta@correo.com');
      fireEvent.changeText(screen.getByTestId('auth-password-input'), 'claveMala');

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await pressSubmit();
        expect(submit()).not.toBeDisabled();
      }
      await pressSubmit();
      expect(handlers.onSignInWithEmail).toHaveBeenCalledTimes(5);

      expect(submit()).toBeDisabled();
      expect(submit()).toHaveTextContent('Podrás intentarlo en 15 min');
      expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
        /el inicio de sesión con contraseña queda bloqueado 15 min en este dispositivo.*restablécela por correo/
      );
      expect(screen.getByTestId('auth-mode-recover')).toBeTruthy();

      elapse(1_000);
      expect(submit()).toHaveTextContent('Podrás intentarlo en 14 min 59 s');
      await pressSubmit();
      expect(handlers.onSignInWithEmail).toHaveBeenCalledTimes(5);

      // Creating an account or asking for the reset link is not locked.
      fireEvent.press(screen.getByTestId('auth-mode-recover'));
      expect(submit()).not.toBeDisabled();
      expect(submit()).toHaveTextContent('Enviar enlace de restablecimiento');
      fireEvent.press(screen.getByTestId('auth-back-to-login-button'));
      expect(submit()).toBeDisabled();

      elapse(15 * 60_000);
      expect(submit()).not.toBeDisabled();
      expect(submit()).toHaveTextContent('Entrar a mi presupuesto');
      expect(screen.queryByTestId('auth-error-banner')).toBeNull();
    });

    it('is still locked when the app is opened again', () => {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        recordFailedAuthAttempt('login_password');
      }
      elapse(5 * 60_000);

      renderAuthScreen({}, skin);

      expect(screen.getByTestId('auth-primary-submit-button')).toBeDisabled();
      expect(screen.getByTestId('auth-primary-submit-button')).toHaveTextContent(
        'Podrás intentarlo en 10 min'
      );
    });
  });

  describe('wait between password reset links', () => {
    it('disables the request for 60 s after sending a link', async () => {
      const handlers = renderAuthScreen({}, skin);
      const submit = () => screen.getByTestId('auth-primary-submit-button');

      fireEvent.press(screen.getByTestId('auth-mode-recover'));
      fireEvent.changeText(screen.getByTestId('auth-email-input'), 'cuenta@correo.com');
      await pressSubmit();
      expect(handlers.onSendPasswordRecovery).toHaveBeenCalledWith('cuenta@correo.com');
      expect(screen.getByTestId('auth-status-banner')).toHaveTextContent(/recibirás un enlace/);

      // Back on the sign-in form nothing is held back.
      expect(submit()).not.toBeDisabled();

      fireEvent.press(screen.getByTestId('auth-mode-recover'));
      expect(submit()).toBeDisabled();
      expect(submit()).toHaveTextContent('Podrás pedir otro enlace en 60 s');
      await pressSubmit();
      expect(handlers.onSendPasswordRecovery).toHaveBeenCalledTimes(1);

      elapse(30_000);
      expect(submit()).toHaveTextContent('Podrás pedir otro enlace en 30 s');
      elapse(30_000);
      expect(submit()).not.toBeDisabled();
      await pressSubmit();
      expect(handlers.onSendPasswordRecovery).toHaveBeenCalledTimes(2);
    });

    it('starts no wait when the link could not be sent', async () => {
      renderAuthScreen(
        { onSendPasswordRecovery: jest.fn().mockRejectedValue(new Error('Sin red.')) },
        skin
      );
      fireEvent.press(screen.getByTestId('auth-mode-recover'));
      fireEvent.changeText(screen.getByTestId('auth-email-input'), 'cuenta@correo.com');
      await pressSubmit();

      expect(screen.getByTestId('auth-error-banner')).toHaveTextContent('Sin red.');
      expect(screen.getByTestId('auth-primary-submit-button')).not.toBeDisabled();
    });
  });
});

describe('PhaseOneHomeScreen: account limits and unverified accounts (ADR 0026)', () => {
  const unverifiedUser: BFlowAuthUser = {
    uid: 'uid_cloud_test_unverified',
    email: 'nueva.cuenta@correo.com',
    displayName: 'Cuenta Nueva',
    authProvider: 'password',
    emailVerified: false,
    emailVerificationRequired: true,
    provider: 'firebase',
  };
  const verifiedUser: BFlowAuthUser = {
    ...unverifiedUser,
    emailVerified: true,
    emailVerificationRequired: false,
  };

  let loadSpy: jest.SpyInstance;

  function renderApp() {
    return render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );
  }

  async function submitCredentials(password: string) {
    fireEvent.changeText(screen.getByTestId('auth-email-input'), 'nueva.cuenta@correo.com');
    fireEvent.changeText(screen.getByTestId('auth-password-input'), password);
    await pressSubmit();
  }

  beforeEach(() => {
    savePersistedSession(null);
    act(() => {
      useBudgetStore.getState().resetToOctober2026GoldenState();
      useBudgetStore.getState().requireAuthenticationGate();
    });
    loadSpy = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'loadFullCloudAccount')
      .mockRejectedValue(new Error('sin conexión'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    act(() => {
      useBudgetStore.setState({ authUser: authAdapter.DEMO_OWNER_USER, needsOnboarding: false });
      useBudgetStore.getState().resetToOctober2026GoldenState();
    });
  });

  it('holds the budget sync of a new account until its email is verified, then opens the setup', async () => {
    jest.spyOn(authAdapter, 'registerWithPersonalProfile').mockResolvedValue(unverifiedUser);
    const refreshSpy = jest
      .spyOn(accountEmailActions, 'refreshAccountIdentity')
      .mockResolvedValue(unverifiedUser);
    renderApp();

    fireEvent.press(screen.getByTestId('auth-mode-register'));
    fireEvent.changeText(screen.getByTestId('auth-name-input'), 'Cuenta Nueva');
    fireEvent.changeText(screen.getByTestId('auth-confirm-password-input'), STRONG_PASSWORD);
    await submitCredentials(STRONG_PASSWORD);

    expect(screen.getByTestId('email-verification-screen')).toBeTruthy();
    expect(useBudgetStore.getState().isSyncing).toBe(false);
    expect(loadSpy).not.toHaveBeenCalled();

    // Still unverified: checking does not sync either.
    await act(async () => {
      fireEvent.press(screen.getByTestId('email-verification-check-button'));
    });
    expect(loadSpy).not.toHaveBeenCalled();

    refreshSpy.mockResolvedValue(verifiedUser);
    await act(async () => {
      fireEvent.press(screen.getByTestId('email-verification-check-button'));
    });
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy.mock.calls[0]?.[0]).toBe('uid_cloud_test_unverified');
    expect(loadSpy.mock.calls[0]?.[2]).toMatchObject({ isRegistration: true });
  });

  it('does not sync an unverified account that signs in, and lets Firestore decide the setup later', async () => {
    jest.spyOn(authAdapter, 'signInWithEmail').mockResolvedValue(unverifiedUser);
    jest.spyOn(accountEmailActions, 'refreshAccountIdentity').mockResolvedValue(verifiedUser);
    renderApp();

    await submitCredentials('abc123');
    expect(screen.getByTestId('email-verification-screen')).toBeTruthy();
    expect(loadSpy).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId('email-verification-check-button'));
    });
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy.mock.calls[0]?.[2]).not.toHaveProperty('isRegistration');
  });

  it('syncs a verified account as soon as it signs in', async () => {
    jest.spyOn(authAdapter, 'signInWithEmail').mockResolvedValue(verifiedUser);
    renderApp();

    await submitCredentials('abc123');

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy.mock.calls[0]?.[2]).toMatchObject({ isRegistration: false });
  });

  it('shows the attempts left, then the lockout notice with its countdown', async () => {
    jest.spyOn(authAdapter, 'signInWithEmail').mockImplementation(() =>
      runPasswordAttempt('login_password', 'Correo o contraseña incorrectos.', () =>
        Promise.reject(new Error('Firebase: Error (auth/invalid-credential).'))
      )
    );
    renderApp();

    await submitCredentials('claveMala');
    expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
      'Correo o contraseña incorrectos. Te quedan 4 intentos antes de un bloqueo de 15 min.'
    );

    await pressSubmit();
    await pressSubmit();
    await pressSubmit();
    expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(/Te queda 1 intento/);

    await pressSubmit();
    expect(screen.getByTestId('auth-primary-submit-button')).toBeDisabled();
    expect(screen.getByTestId('auth-primary-submit-button')).toHaveTextContent(
      'Podrás intentarlo en 15 min'
    );
    expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
      /queda bloqueado 15 min en este dispositivo/
    );
    expect(loadSpy).not.toHaveBeenCalled();

    // When the lockout ends the notice leaves with it: no stale message stays behind.
    elapse(15 * 60_000);
    expect(screen.getByTestId('auth-primary-submit-button')).not.toBeDisabled();
    expect(screen.queryByTestId('auth-error-banner')).toBeNull();
  });

  it('reads the whole account once however many times the manual sync is pressed', async () => {
    act(() => {
      useBudgetStore.setState({ authUser: verifiedUser, needsOnboarding: false });
      useBudgetStore.getState().resetToOctober2026GoldenState();
    });
    renderApp();
    fireEvent.press(screen.getByTestId('workspace-tab-account'));
    const sync = await screen.findByTestId('manual-sync-button');

    await act(async () => {
      fireEvent.press(sync);
    });
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy.mock.calls[0]?.[2]).toMatchObject({ forceFullSync: true });

    await act(async () => {
      fireEvent.press(screen.getByTestId('manual-sync-button'));
    });
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('manual-sync-button')).toHaveTextContent(
      /Podrás sincronizar de nuevo en \d+ s/
    );

    elapse(30_000);
    await act(async () => {
      fireEvent.press(screen.getByTestId('manual-sync-button'));
    });
    expect(loadSpy).toHaveBeenCalledTimes(2);
  });
});
