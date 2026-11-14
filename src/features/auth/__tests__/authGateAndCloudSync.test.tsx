import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import PhaseOneHomeScreen from '../../../app/index';
import {
  FirestoreBudgetRepository,
  InMemoryBudgetRepository,
} from '../../../data/repositories/budgetRepository';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import { formatMonthKeyLabelEs, toAppMonthKey } from '../../../domain';
import * as accountEmailActions from '../../../platform/auth/accountEmailActions';
import * as authAdapter from '../../../platform/auth/authAdapter';
import { __resetAuthRateLimiterForTests } from '../../../platform/auth/authRateLimiter';
import {
  loadPersistedSession,
  savePersistedSession,
  type BFlowAuthUser,
} from '../../../platform/auth/authAdapter';
import {
  loadPersistedAccount,
  savePersistedAccount,
} from '../../../platform/storage/accountCache';
import {
  __resetMemoryCacheForTests,
  __setStorageBackendForTests,
  persistentStorage,
  type RawStorageBackend,
} from '../../../platform/storage/persistentStorageAdapter';
import {
  buildInitialState,
  useBudgetStore,
} from '../../budget/store/useBudgetStore';

describe('Authentication Gate, Personal Registration & Multi-Device Session Persistence', () => {
  beforeEach(() => {
    persistentStorage.clear();
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

    // Google login option must be completely removed
    expect(screen.queryByTestId('auth-google-button')).toBeNull();
    expect(screen.queryByText(/Continuar con Google/i)).toBeNull();

    // Password visibility toggle must allow viewing password while typing with minimalist eye icons
    expect(screen.getByTestId('auth-password-input').props.secureTextEntry).toBe(true);
    expect(screen.getByTestId('auth-password-input').props.autoCapitalize).toBe('none');
    expect(screen.getByTestId('icon-eye-closed')).toBeTruthy();
    fireEvent.press(screen.getByTestId('auth-password-visibility-toggle'));
    expect(screen.getByTestId('auth-password-input').props.secureTextEntry).toBe(false);
    expect(screen.getByTestId('auth-password-input').props.autoCapitalize).toBe('none');
    expect(screen.getByTestId('icon-eye-open')).toBeTruthy();
    fireEvent.press(screen.getByTestId('auth-password-visibility-toggle'));
    expect(screen.getByTestId('auth-password-input').props.secureTextEntry).toBe(true);
    expect(screen.getByTestId('icon-eye-closed')).toBeTruthy();

    // Switch to Personal Registration ("Crear cuenta")
    fireEvent.press(screen.getByTestId('auth-mode-register'));
    expect(screen.getByText('Registra tus datos personales')).toBeTruthy();
    expect(screen.getByTestId('auth-name-input').props.autoCapitalize).toBe('words');
    expect(screen.getByTestId('auth-phone-input').props.keyboardType).toBe('phone-pad');
    expect(screen.getByTestId('auth-goal-input').props.autoCapitalize).toBe('sentences');

    // Confirm password visibility toggle also works with minimalist eye icons
    expect(screen.getByTestId('auth-confirm-password-input').props.secureTextEntry).toBe(true);
    expect(screen.getByTestId('icon-confirm-eye-closed')).toBeTruthy();
    fireEvent.press(screen.getByTestId('auth-confirm-password-visibility-toggle'));
    expect(screen.getByTestId('auth-confirm-password-input').props.secureTextEntry).toBe(false);
    expect(screen.getByTestId('icon-confirm-eye-open')).toBeTruthy();

    // Validate missing name error
    fireEvent.press(screen.getByTestId('auth-primary-submit-button'));
    expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
      'Escribe tu nombre y apellido para identificar tu presupuesto.'
    );

    // Fill personal fields and test mismatched password confirmation
    fireEvent.changeText(screen.getByTestId('auth-name-input'), 'Alejandro Bernal Garnica');
    fireEvent.changeText(screen.getByTestId('auth-phone-input'), '+57 300 123 4567');
    fireEvent.changeText(screen.getByTestId('auth-email-input'), 'demo.owner@bflow.example');
    fireEvent.changeText(screen.getByTestId('auth-password-input'), 'Secreto123!');
    fireEvent.changeText(screen.getByTestId('auth-confirm-password-input'), 'otraClave');

    fireEvent.press(screen.getByTestId('auth-primary-submit-button'));
    expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
      'Las dos contraseñas no coinciden. Verifícalas e intenta de nuevo.'
    );
  });

  it('persists user session with personal metadata and signs out back to the Auth Gate', async () => {
    const customUser: BFlowAuthUser = {
      uid: 'uid_alejandro_01',
      email: 'demo.owner@bflow.example',
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

    // Navigate to the new Account tab in the floating dock
    fireEvent.press(screen.getByTestId('workspace-tab-account'));

    expect(screen.getByTestId('authenticated-user-name')).toHaveTextContent(
      'Hola, Alejandro Bernal Garnica'
    );
    expect(screen.getByText('Meta: Pagar CB300F y ahorrar para apartamento')).toBeTruthy();

    // Signing out clears the session and returns to the Auth Gate
    fireEvent.press(screen.getByTestId('sign-out-button'));
    expect(await screen.findByTestId('auth-gate-screen')).toBeTruthy();
    expect(loadPersistedSession()).toBeNull();
  });

  it('guarantees 100% account isolation when switching between a newly created user and demo.owner@bflow.example', async () => {
    const ownerUser: BFlowAuthUser = {
      uid: 'uid_owner_abernalg',
      email: 'demo.owner@bflow.example',
      displayName: 'Alejandro Bernal Garnica',
      authProvider: 'password',
      activeMonthKey: '2026-10',
      provider: 'local-demo',
    };
    const secondUser: BFlowAuthUser = {
      uid: 'uid_nuevo_usuario_99',
      email: 'nuevo.usuario@correo.com',
      displayName: 'Nuevo Usuario',
      authProvider: 'password',
      activeMonthKey: '2026-11',
      provider: 'local-demo',
    };

    // 1. Start in owner account (demo.owner@bflow.example) and verify canonical savings ($ 4.380.000)
    useBudgetStore.getState().setAuthUser(ownerUser);
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );
    fireEvent.press(screen.getByTestId('workspace-tab-savings'));
    expect(screen.getByTestId('savings-hero-total')).toHaveTextContent('$ 4.380.000');
    expect(screen.getByTestId('bucket-moto-current')).toHaveTextContent('$ 2.300.000');
    expect(screen.getByTestId('bucket-savings-current')).toHaveTextContent('$ 2.080.000');

    // 2. Switch to a brand-new user account: workspace must immediately wipe owner data
    act(() => {
      useBudgetStore.getState().setAuthUser(secondUser);
    });
    expect(useBudgetStore.getState().concepts).toHaveLength(0);
    expect(useBudgetStore.getState().entries).toHaveLength(0);
    expect(useBudgetStore.getState().savingsBucketsByMonth['2026-10']).toBeUndefined();

    // 3. Configure the new user with $ 12.500.000 in savings (the exact amount that previously leaked)
    await act(async () => {
      await useBudgetStore.getState().completeInitialAccountSetup({
        monthKey: '2026-11',
        incomes: [
          { name: 'Salario Nuevo', amountCop: 5_000_000, group: 'fixed', persistMonthly: true },
        ],
        expenses: [],
        debts: [],
        savingsBuckets: [
          { id: 'savings', name: 'Fondo Ahorros', openingBalanceCop: 12_500_000 },
          { id: 'moto', name: 'Fondo Moto', openingBalanceCop: 0 },
        ],
      });
    });
    expect(
      useBudgetStore
        .getState()
        .savingsBucketsByMonth['2026-11']?.find((b) => b.id === 'savings')?.openingBalance
    ).toBe(12_500_000);

    // 4. Sign out and log back into demo.owner@bflow.example:
    // Zero data from secondUser may remain, and demo.owner@bflow.example must retain exact golden balances ($ 4.380.000)
    act(() => {
      useBudgetStore.getState().clearWorkspaceSession();
    });
    expect(useBudgetStore.getState().savingsBucketsByMonth['2026-11']).toBeUndefined();

    act(() => {
      useBudgetStore.getState().setAuthUser(ownerUser);
    });
    fireEvent.press(screen.getByTestId('workspace-tab-savings'));
    expect(screen.getByTestId('savings-hero-total')).toHaveTextContent('$ 4.380.000');
    expect(screen.getByTestId('bucket-moto-current')).toHaveTextContent('$ 2.300.000');
    expect(screen.getByTestId('bucket-savings-current')).toHaveTextContent('$ 2.080.000');
  });

  it('persists updated debt interest rates across sign-out and sign-in', async () => {
    const repo = new InMemoryBudgetRepository();
    const initialCloud = await repo.loadFullCloudAccount(
      'uid-owner-123',
      'demo.owner@bflow.example'
    );

    const motoDebt = initialCloud.debtsByMonth['2026-10']?.find(
      (d) => d.id === 'debt_cb300f_moto'
    );
    expect(motoDebt).toBeDefined();

    // Update interest rate to 18% annual (1.5% monthly) and save to repository
    await repo.saveDebt('uid-owner-123', {
      ...motoDebt!,
      interestRateType: 'annual',
      annualInterestRate: 18,
      monthlyInterestRate: 1.5,
      monthlyInstallment: 900_000,
    });

    // Also update in store and verify propagation across months
    act(() => {
      useBudgetStore.getState().applyFullCloudAccount(initialCloud);
    });
    await act(async () => {
      await useBudgetStore.getState().updateDebt('2026-10', 'debt_cb300f_moto', {
        interestRateType: 'annual',
        annualInterestRate: 18,
        monthlyInterestRate: 1.5,
        monthlyInstallment: 900_000,
      });
    });

    // Simulate sign-out and sign-in reload from cloud repository
    act(() => {
      useBudgetStore.getState().clearWorkspaceSession();
    });
    const reloadedCloud = await repo.loadFullCloudAccount(
      'uid-owner-123',
      'demo.owner@bflow.example'
    );
    act(() => {
      useBudgetStore.getState().applyFullCloudAccount(reloadedCloud);
    });

    const persistedMotoDebt = useBudgetStore
      .getState()
      .debtsByMonth['2026-10']?.find((d) => d.id === 'debt_cb300f_moto');
    expect(persistedMotoDebt?.interestRateType).toBe('annual');
    expect(persistedMotoDebt?.annualInterestRate).toBe(18);
    expect(persistedMotoDebt?.monthlyInterestRate).toBe(1.5);
    expect(persistedMotoDebt?.monthlyInstallment).toBe(900_000);
  });

  it('always opens in the latest month of the account after signing out and back in, even with 0 movements', async () => {
    const repo = new InMemoryBudgetRepository(false);

    // Case 1: New user starts their account in December 2026 ('2026-12') with 0 movements
    await repo.saveInitialAccountSetup('uid-december-user', {
      monthKey: '2026-12',
      concepts: [],
      entries: [],
      debts: [],
      debtPayments: [],
      savingsBuckets: [
        { id: 'moto', name: 'Fondo Moto', openingBalance: 0, monthKey: '2026-12' },
        { id: 'savings', name: 'Fondo Ahorros', openingBalance: 500_000, monthKey: '2026-12' },
      ],
      provisionPlan: {
        items: [],
        recurringMonthlyTotalCop: 0,
        totalWithTargetGoalCop: 0,
      },
    });

    // Sign out and sign back in
    act(() => {
      useBudgetStore.getState().clearWorkspaceSession();
    });
    const loadedDecemberAccount = await repo.loadFullCloudAccount(
      'uid-december-user',
      'diciembre.user@bflow.app'
    );
    act(() => {
      useBudgetStore.getState().applyFullCloudAccount(loadedDecemberAccount);
    });

    expect(useBudgetStore.getState().activeMonthKey).toBe('2026-12');
    expect(useBudgetStore.getState().availableMonths).toEqual(['2026-12']);

    // Case 2: User advances to January 2027 ('2027-01') with 0 completed movements and signs back in
    await repo.closeMonth('uid-december-user', '2026-12');
    act(() => {
      useBudgetStore.getState().clearWorkspaceSession();
    });
    const loadedJanuaryAccount = await repo.loadFullCloudAccount(
      'uid-december-user',
      'diciembre.user@bflow.app'
    );
    act(() => {
      useBudgetStore.getState().applyFullCloudAccount(loadedJanuaryAccount);
    });

    expect(useBudgetStore.getState().activeMonthKey).toBe('2027-01');
    expect(useBudgetStore.getState().availableMonths).toEqual(['2026-12', '2027-01']);
  });

  it('defaults onboarding to the current month with 0 default funds, never re-prompts after blank setup, and allows editing/deleting any fund including Moto & Ahorros', async () => {
    const repo = new InMemoryBudgetRepository(false);
    const newUser: BFlowAuthUser = {
      uid: 'uid-blank-new-user',
      email: 'blank.user@bflow.app',
      displayName: 'Usuario En Blanco',
      provider: 'firebase',
    };

    // 1. First registration login -> needsOnboarding is true
    const firstRegistrationLoad = await repo.loadFullCloudAccount(
      newUser.uid,
      newUser.email,
      { isRegistration: true }
    );
    expect(firstRegistrationLoad.needsOnboarding).toBe(true);

    act(() => {
      useBudgetStore.getState().setAuthUser(newUser);
      useBudgetStore.getState().applyFullCloudAccount(firstRegistrationLoad);
    });

    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('initial-account-setup-view')).toBeTruthy();

    // 2. Default month must match the user's current month (not hardcoded Enero or Octubre 2026),
    // and Section 2 must have 0 pre-populated savings funds (no Fondo Moto, no Fondo Ahorros)
    expect(screen.queryByTestId('onboarding-bucket-balance-savings')).toBeNull();
    expect(screen.queryByTestId('onboarding-bucket-balance-moto')).toBeNull();
    expect(screen.getByTestId('complete-initial-setup-button')).toHaveTextContent(
      `Guardar e Iniciar ${formatMonthKeyLabelEs(toAppMonthKey())}`
    );

    // 3. Continue with everything in blank -> next sign-in must NOT ask for onboarding again
    await act(async () => {
      fireEvent.press(screen.getByTestId('complete-initial-setup-button'));
    });
    expect(screen.queryByTestId('initial-account-setup-view')).toBeNull();

    // Simulate sign-out and subsequent sign-in (`isRegistration: false`)
    act(() => {
      useBudgetStore.getState().clearWorkspaceSession();
    });
    const subsequentLoginLoad = await repo.loadFullCloudAccount(
      newUser.uid,
      newUser.email,
      { isRegistration: false }
    );
    expect(subsequentLoginLoad.needsOnboarding).toBe(false);

    // 4. Switch to owner account (demo.owner@bflow.example) and verify editing/deleting Fondo Moto & Fondo Ahorros
    const ownerUser: BFlowAuthUser = {
      uid: 'uid-owner-123',
      email: 'demo.owner@bflow.example',
      displayName: 'Alejandro Bernal',
      provider: 'firebase',
    };
    act(() => {
      useBudgetStore.getState().setAuthUser(ownerUser);
    });

    fireEvent.press(screen.getByTestId('workspace-tab-savings'));
    expect(screen.getByTestId('bucket-moto-card')).toBeTruthy();
    expect(screen.getByTestId('bucket-savings-card')).toBeTruthy();

    // Edit Fondo Moto name and balance individually via Editar Fondo mode
    fireEvent.press(screen.getByTestId('bucket-action-edit-button'));
    fireEvent.press(screen.getByTestId('edit-savings-bucket-moto'));
    fireEvent.changeText(screen.getByTestId('edit-bucket-name-input'), 'Fondo Moto Personal');
    fireEvent.changeText(screen.getByTestId('edit-bucket-balance-input'), '2000000');
    await act(async () => {
      fireEvent.press(screen.getByTestId('save-edit-bucket-button'));
    });
    // The savings chart legend repeats the bucket name, so read it from the bucket card.
    expect(within(screen.getByTestId('bucket-moto-card')).getByText('Fondo Moto Personal')).toBeTruthy();

    // Delete Fondo Moto and Fondo Ahorros individually via global Eliminar Fondo mode
    fireEvent.press(screen.getByTestId('bucket-action-delete-button'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('delete-savings-bucket-moto'));
    });
    expect(screen.queryByTestId('bucket-moto-card')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('delete-savings-bucket-savings'));
    });
    expect(screen.queryByTestId('bucket-savings-card')).toBeNull();
    expect(screen.getByTestId('empty-savings-buckets-card')).toBeTruthy();
  });

  it('recovers the password from the Login screen with the reset link that Firebase emails (ADR 0025)', async () => {
    useBudgetStore.getState().requireAuthenticationGate();
    const resetSpy = jest
      .spyOn(accountEmailActions, 'sendPasswordResetLink')
      .mockResolvedValue(undefined);

    try {
      render(
        <BFlowThemeProvider initialMode="dark">
          <PhaseOneHomeScreen />
        </BFlowThemeProvider>
      );

      fireEvent.press(screen.getByTestId('auth-mode-recover'));
      expect(screen.getByText('Recupera el acceso a tu cuenta')).toBeTruthy();

      // Only the email is asked: there is no code and no password field in the app
      expect(screen.queryByTestId('auth-password-input')).toBeNull();
      expect(screen.queryByTestId('auth-recovery-code-input')).toBeNull();

      // An invalid email never reaches Firebase
      await act(async () => {
        fireEvent.press(screen.getByTestId('auth-primary-submit-button'));
      });
      expect(resetSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
        'Escribe el correo electrónico con el que registraste tu cuenta.'
      );

      fireEvent.changeText(screen.getByTestId('auth-email-input'), 'demo.owner@bflow.example');
      await act(async () => {
        fireEvent.press(screen.getByTestId('auth-primary-submit-button'));
      });

      expect(resetSpy).toHaveBeenCalledWith('demo.owner@bflow.example');

      // Back in Login mode, with a message that does not reveal whether the account exists
      expect(screen.getByText('Entra a tu cuenta personal')).toBeTruthy();
      expect(screen.getByTestId('auth-status-banner')).toHaveTextContent(
        /Si demo.owner@bflow.example tiene una cuenta en BFlow, recibirás un enlace/i
      );
      expect(screen.getByTestId('auth-email-input').props.value).toBe('demo.owner@bflow.example');
    } finally {
      resetSpy.mockRestore();
    }
  });

  it('stays in recovery and shows the translated error when Firebase rejects the reset link', async () => {
    useBudgetStore.getState().requireAuthenticationGate();
    const resetSpy = jest
      .spyOn(accountEmailActions, 'sendPasswordResetLink')
      .mockRejectedValue(new Error('Firebase: Error (auth/network-request-failed).'));

    try {
      render(
        <BFlowThemeProvider initialMode="dark">
          <PhaseOneHomeScreen />
        </BFlowThemeProvider>
      );

      fireEvent.press(screen.getByTestId('auth-mode-recover'));
      fireEvent.changeText(screen.getByTestId('auth-email-input'), 'demo.owner@bflow.example');
      await act(async () => {
        fireEvent.press(screen.getByTestId('auth-primary-submit-button'));
      });

      expect(screen.getByText('Recupera el acceso a tu cuenta')).toBeTruthy();
      expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
        'Error de conexión. Revisa tu internet e intenta nuevamente.'
      );
    } finally {
      resetSpy.mockRestore();
    }
  });

  describe('email verification gate (ADR 0025)', () => {
    const unverifiedUser: BFlowAuthUser = {
      uid: 'uid_unverified_account_01',
      email: 'nueva.cuenta@correo.com',
      displayName: 'Cuenta Nueva',
      authProvider: 'password',
      emailVerified: false,
      emailVerificationRequired: true,
      provider: 'firebase',
    };

    it('holds a newly registered account on the verification screen until Firebase reports the email as verified', async () => {
      const refreshSpy = jest.spyOn(accountEmailActions, 'refreshAccountIdentity');
      const resendSpy = jest
        .spyOn(accountEmailActions, 'sendVerificationEmail')
        .mockResolvedValue(undefined);
      const loadSpy = jest
        .spyOn(FirestoreBudgetRepository.prototype, 'loadFullCloudAccount')
        .mockRejectedValue(new Error('sin conexión'));

      try {
        act(() => {
          useBudgetStore.getState().setAuthUser(unverifiedUser);
        });

        render(
          <BFlowThemeProvider initialMode="dark">
            <PhaseOneHomeScreen />
          </BFlowThemeProvider>
        );

        // Neither the workspace nor the sign-in form: only the verification gate
        expect(screen.getByTestId('email-verification-screen')).toBeTruthy();
        expect(screen.getByTestId('email-verification-address')).toHaveTextContent(
          'nueva.cuenta@correo.com'
        );
        expect(screen.queryByTestId('workspace-tab-summary')).toBeNull();
        expect(screen.queryByTestId('auth-gate-screen')).toBeNull();

        // Still unverified in Firebase: the gate stays and explains why
        refreshSpy.mockResolvedValueOnce(unverifiedUser);
        await act(async () => {
          fireEvent.press(screen.getByTestId('email-verification-check-button'));
        });
        expect(screen.getByTestId('email-verification-error-banner')).toHaveTextContent(
          /aún no aparece verificado/i
        );
        // An unverified account never reads its budget from Firestore (ADR 0026)
        expect(loadSpy).not.toHaveBeenCalled();

        // The verification email can be sent again
        await act(async () => {
          fireEvent.press(screen.getByTestId('email-verification-resend-button'));
        });
        expect(resendSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('email-verification-status-banner')).toHaveTextContent(
          /nuevo enlace de verificación a nueva.cuenta@correo.com/i
        );

        // The user opened the link: the gate gives way to the workspace
        refreshSpy.mockResolvedValueOnce({
          ...unverifiedUser,
          emailVerified: true,
          emailVerificationRequired: false,
        });
        await act(async () => {
          fireEvent.press(screen.getByTestId('email-verification-check-button'));
        });
        expect(screen.queryByTestId('email-verification-screen')).toBeNull();
        expect(screen.getByTestId('workspace-tab-summary')).toBeTruthy();
        expect(useBudgetStore.getState().authUser?.emailVerified).toBe(true);
        // Verified: the budget is loaded now, once
        expect(loadSpy).toHaveBeenCalledTimes(1);
      } finally {
        refreshSpy.mockRestore();
        resendSpy.mockRestore();
        loadSpy.mockRestore();
      }
    });

    it('lets the user sign out from the verification screen back to the Auth Gate', async () => {
      act(() => {
        useBudgetStore.getState().setAuthUser(unverifiedUser);
      });

      render(
        <BFlowThemeProvider initialMode="dark">
          <PhaseOneHomeScreen />
        </BFlowThemeProvider>
      );

      fireEvent.press(screen.getByTestId('email-verification-sign-out-button'));
      expect(await screen.findByTestId('auth-gate-screen')).toBeTruthy();
      expect(screen.queryByTestId('email-verification-screen')).toBeNull();
    });

    it('does not gate accounts exempt from verification: older, Google or local sessions', () => {
      const exemptUsers: BFlowAuthUser[] = [
        { ...unverifiedUser, emailVerificationRequired: false },
        { ...unverifiedUser, emailVerified: undefined, emailVerificationRequired: undefined },
        { ...unverifiedUser, provider: 'local-demo' },
      ];

      for (const user of exemptUsers) {
        act(() => {
          useBudgetStore.getState().setAuthUser(user);
        });
        const view = render(
          <BFlowThemeProvider initialMode="dark">
            <PhaseOneHomeScreen />
          </BFlowThemeProvider>
        );
        expect(screen.queryByTestId('email-verification-screen')).toBeNull();
        expect(screen.getByTestId('workspace-tab-summary')).toBeTruthy();
        view.unmount();
      }
    });
  });

  it('saves the profile to Firestore from the account window and reverts it when the cloud rejects it', async () => {
    const cloudUser: BFlowAuthUser = {
      uid: 'uid_cloud_test_profile_window',
      email: 'demo.owner@bflow.example',
      displayName: 'Alejandro Bernal',
      financialGoal: 'Meta anterior',
      authProvider: 'password',
      emailVerified: true,
      provider: 'firebase',
    };
    const saveSpy = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockResolvedValue(undefined);
    const syncNameSpy = jest
      .spyOn(authAdapter, 'syncAuthDisplayName')
      .mockResolvedValue(undefined);

    try {
      act(() => {
        useBudgetStore.getState().setAuthUser(cloudUser);
      });
      render(
        <BFlowThemeProvider initialMode="dark">
          <PhaseOneHomeScreen />
        </BFlowThemeProvider>
      );
      fireEvent.press(screen.getByTestId('workspace-tab-account'));
      fireEvent.press(await screen.findByTestId('open-profile-settings-button'));

      // Saved: Firestore receives both fields and the account card shows the new name
      fireEvent.changeText(screen.getByTestId('profile-input-name'), 'Alejandro Bernal G.');
      fireEvent.changeText(screen.getByTestId('profile-input-goal'), 'Viaje a Japón');
      await act(async () => {
        fireEvent.press(screen.getByTestId('save-profile-settings-button'));
      });

      expect(saveSpy).toHaveBeenCalledWith(cloudUser.uid, {
        displayName: 'Alejandro Bernal G.',
        financialGoal: 'Viaje a Japón',
      });
      expect(screen.getByTestId('profile-success-banner')).toHaveTextContent(
        'Perfil actualizado correctamente'
      );
      expect(screen.getByTestId('authenticated-user-name')).toHaveTextContent(
        'Hola, Alejandro Bernal G.'
      );

      // Rejected by the server: the name goes back and the form says why
      saveSpy.mockRejectedValueOnce(
        Object.assign(new Error('Missing or insufficient permissions.'), {
          code: 'permission-denied',
        })
      );
      fireEvent.changeText(screen.getByTestId('profile-input-name'), 'Nombre Rechazado');
      await act(async () => {
        fireEvent.press(screen.getByTestId('save-profile-settings-button'));
      });

      expect(screen.getByTestId('profile-error-banner')).toHaveTextContent(
        'No se pudo guardar tu perfil en la nube. Inténtalo de nuevo.'
      );
      expect(screen.getByTestId('authenticated-user-name')).toHaveTextContent(
        'Hola, Alejandro Bernal G.'
      );
      expect(useBudgetStore.getState().authUser?.displayName).toBe('Alejandro Bernal G.');
    } finally {
      saveSpy.mockRestore();
      syncNameSpy.mockRestore();
    }
  });

  it('routes the account email actions to Firebase Auth only for real accounts', async () => {
    const resetSpy = jest
      .spyOn(accountEmailActions, 'sendPasswordResetLink')
      .mockResolvedValue(undefined);
    const changeSpy = jest
      .spyOn(accountEmailActions, 'requestEmailChange')
      .mockResolvedValue(undefined);

    try {
      const realUser: BFlowAuthUser = {
        uid: 'uid_account_emails_01',
        email: 'cuenta.real@correo.com',
        displayName: 'Cuenta Real',
        authProvider: 'password',
        emailVerified: true,
        emailVerificationRequired: false,
        provider: 'firebase',
      };
      act(() => {
        useBudgetStore.getState().setAuthUser(realUser);
      });

      const view = render(
        <BFlowThemeProvider initialMode="dark">
          <PhaseOneHomeScreen />
        </BFlowThemeProvider>
      );
      fireEvent.press(screen.getByTestId('workspace-tab-account'));
      fireEvent.press(await screen.findByTestId('open-profile-settings-button'));

      // Password reset goes to the account email, never to one typed on screen
      await act(async () => {
        fireEvent.press(screen.getByTestId('send-password-reset-button'));
      });
      expect(resetSpy).toHaveBeenCalledWith('cuenta.real@correo.com');
      expect(screen.getByTestId('security-success-banner')).toHaveTextContent(
        /cuenta.real@correo.com/
      );

      // Email change: new address plus the current password
      fireEvent.changeText(screen.getByTestId('change-email-input'), 'Otro.Correo@correo.com');
      fireEvent.changeText(screen.getByTestId('change-email-password-input'), 'claveActual1');
      await act(async () => {
        fireEvent.press(screen.getByTestId('request-email-change-button'));
      });
      expect(changeSpy).toHaveBeenCalledWith('otro.correo@correo.com', 'claveActual1');
      view.unmount();

      // A local session (showcase mode, demo owner) has no Firebase account to email.
      // The wait between reset emails belongs to the device: it is over by now.
      __resetAuthRateLimiterForTests();
      resetSpy.mockClear();
      act(() => {
        useBudgetStore.getState().setAuthUser(authAdapter.DEMO_OWNER_USER);
      });
      render(
        <BFlowThemeProvider initialMode="dark">
          <PhaseOneHomeScreen />
        </BFlowThemeProvider>
      );
      fireEvent.press(screen.getByTestId('workspace-tab-account'));
      fireEvent.press(await screen.findByTestId('open-profile-settings-button'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('send-password-reset-button'));
      });
      expect(resetSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('security-error-banner')).toHaveTextContent(
        'Esta acción solo está disponible con una cuenta real de BFlow.'
      );
    } finally {
      resetSpy.mockRestore();
      changeSpy.mockRestore();
    }
  });

  it('deduplicates concurrent cloud account synchronization calls to prevent duplicate Firestore queries', async () => {
    useBudgetStore.getState().requireAuthenticationGate();

    const mockUser: BFlowAuthUser = {
      uid: 'uid_test_dedup_01',
      email: 'demo.owner@bflow.example',
      displayName: 'Alejandro Bernal',
      authProvider: 'password',
      provider: 'local-demo',
    };
    const signInSpy = jest.spyOn(authAdapter, 'signInWithEmail').mockResolvedValue(mockUser);

    let loadCallCount = 0;
    const originalLoad = FirestoreBudgetRepository.prototype.loadFullCloudAccount;
    FirestoreBudgetRepository.prototype.loadFullCloudAccount = jest.fn().mockImplementation(
      async (...args: Parameters<typeof originalLoad>) => {
        loadCallCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return originalLoad.apply(
          new InMemoryBudgetRepository() as unknown as typeof FirestoreBudgetRepository.prototype,
          args
        );
      }
    );

    try {
      render(
        <BFlowThemeProvider initialMode="dark">
          <PhaseOneHomeScreen />
        </BFlowThemeProvider>
      );

      fireEvent.changeText(screen.getByTestId('auth-email-input'), 'demo.owner@bflow.example');
      fireEvent.changeText(screen.getByTestId('auth-password-input'), 'claveValida123');

      await act(async () => {
        fireEvent.press(screen.getByTestId('auth-primary-submit-button'));
        fireEvent.press(screen.getByTestId('auth-primary-submit-button'));
      });

      // Must have invoked loadFullCloudAccount only once thanks to syncInFlightRef deduplication
      expect(loadCallCount).toBe(1);
    } finally {
      signInSpy.mockRestore();
      FirestoreBudgetRepository.prototype.loadFullCloudAccount = originalLoad;
    }
  });

  it('translates common Firebase authentication errors into clear Spanish messages', () => {
    expect(authAdapter.formatAuthError(new Error('Firebase: Error (auth/invalid-credential).'), 'Fallback')).toBe(
      'Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.'
    );
    expect(authAdapter.formatAuthError(new Error('Firebase: Error (auth/email-already-in-use).'), 'Fallback')).toBe(
      'Ya existe una cuenta con este correo. Inicia sesión en su lugar.'
    );
    expect(authAdapter.formatAuthError(new Error('Firebase: Error (auth/invalid-email).'), 'Fallback')).toBe(
      'El formato del correo electrónico no es válido.'
    );
    expect(authAdapter.formatAuthError(new Error('Firebase: Error (auth/network-request-failed).'), 'Fallback')).toBe(
      'Error de conexión. Revisa tu internet e intenta nuevamente.'
    );
    expect(authAdapter.formatAuthError('unknown error', 'Mensaje por defecto')).toBe('Mensaje por defecto');
  });

  it('clears persisted account cache from storage on sign-out and on resetFullAccount (R-03)', async () => {
    const disk = new Map<string, string>();
    const diskBackend: RawStorageBackend = {
      getItem: (key) => disk.get(key) ?? null,
      setItem: (key, value) => {
        disk.set(key, value);
      },
      removeItem: (key) => {
        disk.delete(key);
      },
      clear: () => {
        disk.clear();
      },
    };
    __setStorageBackendForTests(diskBackend);
    persistentStorage.clear();

    try {
      const repo = new InMemoryBudgetRepository();
      const cloudAccount = await repo.loadFullCloudAccount(
        'uid_signout_cleanup_01',
        'demo.owner@bflow.example'
      );
      const user: BFlowAuthUser = {
        uid: 'uid_signout_cleanup_01',
        email: 'demo.owner@bflow.example',
        displayName: 'Alejandro Bernal Garnica',
        authProvider: 'password',
        provider: 'local-demo',
      };

      savePersistedSession(user);
      savePersistedAccount(user.uid, cloudAccount);
      __resetMemoryCacheForTests();
      expect(loadPersistedAccount(user.uid)).not.toBeNull();

      useBudgetStore.getState().setAuthUser(user);

      // 1. resetFullAccount must clear the persisted account cache
      await act(async () => {
        await useBudgetStore.getState().resetFullAccount('2026-11');
      });
      __resetMemoryCacheForTests();
      expect(loadPersistedAccount(user.uid)).toBeNull();

      // Re-save account cache and verify UI sign-out also wipes it
      savePersistedAccount(user.uid, cloudAccount);
      __resetMemoryCacheForTests();
      expect(loadPersistedAccount(user.uid)).not.toBeNull();

      act(() => {
        useBudgetStore.getState().setNeedsOnboarding(false);
      });

      render(
        <BFlowThemeProvider initialMode="dark">
          <PhaseOneHomeScreen />
        </BFlowThemeProvider>
      );

      fireEvent.press(screen.getByTestId('workspace-tab-account'));
      fireEvent.press(screen.getByTestId('sign-out-button'));

      expect(await screen.findByTestId('auth-gate-screen')).toBeTruthy();
      __resetMemoryCacheForTests();
      expect(loadPersistedSession()).toBeNull();
      expect(loadPersistedAccount(user.uid)).toBeNull();
    } finally {
      __setStorageBackendForTests(null);
      persistentStorage.clear();
    }
  });

  it('hydrates user account data synchronously on cold boot and never flashes the October 2026 template or $ 0 values', async () => {
    const disk = new Map<string, string>();
    const diskBackend: RawStorageBackend = {
      getItem: (key) => disk.get(key) ?? null,
      setItem: (key, value) => {
        disk.set(key, value);
      },
      removeItem: (key) => {
        disk.delete(key);
      },
      clear: () => {
        disk.clear();
      },
    };
    __setStorageBackendForTests(diskBackend);
    persistentStorage.clear();

    try {
      const ownerUser: BFlowAuthUser = {
        uid: 'uid_real_owner_iphone',
        email: 'demo.owner@bflow.example',
        displayName: 'Alejandro Bernal Garnica',
        authProvider: 'password',
        activeMonthKey: '2026-11',
        provider: 'firebase',
      };

      savePersistedSession(ownerUser);
      act(() => {
        useBudgetStore.getState().setAuthUser(ownerUser);
      });

      // Configure custom real user data in November 2026 ($ 7.500.000 income, $ 1.200.000 expense -> $ 6.300.000 Net Flow)
      await act(async () => {
        await useBudgetStore.getState().completeInitialAccountSetup({
          monthKey: '2026-11',
          incomes: [
            {
              name: 'Salario Real Noviembre',
              amountCop: 7_500_000,
              group: 'fixed',
              persistMonthly: true,
              completed: true,
            },
          ],
          expenses: [
            {
              name: 'Arriendo Real Noviembre',
              amountCop: 1_200_000,
              group: 'fixed',
              persistMonthly: true,
              completed: true,
            },
          ],
          debts: [],
          savingsBuckets: [
            { id: 'savings', name: 'Fondo Ahorros', openingBalanceCop: 3_000_000 },
            { id: 'moto', name: 'Fondo Moto', openingBalanceCop: 500_000 },
          ],
        });
      });

      // Simulate killing the app on iPhone (wiping in-memory cache while SQLite kv-store disk survives)
      __resetMemoryCacheForTests();

      // Cold-start initial state for the owner must immediately contain their real November 2026 data,
      // NOT the October 2026 template ($ 1.080.000) and NOT empty $ 0 arrays
      const coldBootState = buildInitialState(loadPersistedSession());
      expect(coldBootState.activeMonthKey).toBe('2026-11');
      expect(coldBootState.isAccountHydrated).toBe(true);
      expect(coldBootState.concepts.map((c) => c.name)).toEqual([
        'Salario Real Noviembre',
        'Arriendo Real Noviembre',
      ]);

      // Simulate store cold boot and first frame render
      act(() => {
        useBudgetStore.setState(coldBootState);
      });

      render(
        <BFlowThemeProvider initialMode="dark">
          <PhaseOneHomeScreen />
        </BFlowThemeProvider>
      );

      // Frame 1 must show $ 6.300.000 (real user data), never $ 1.080.000 (template) nor $ 0
      expect(screen.getByTestId('golden-net-flow')).toHaveTextContent('$ 6.300.000');
      expect(screen.getByTestId('golden-net-flow')).not.toHaveTextContent('$ 1.080.000');
    } finally {
      __setStorageBackendForTests(null);
      persistentStorage.clear();
    }
  });

  it('delivers user immediately even if setDoc never resolves (hanging promise simulated, R-04)', async () => {
    let capturedAuthCallback: ((user: unknown) => void) | null = null;
    const fakeAuth = {};
    const mockOnAuthStateChanged = jest.fn((_auth, cb) => {
      capturedAuthCallback = cb;
      return () => {};
    });

    jest.isolateModules(() => {
      jest.doMock('firebase/auth', () => ({
        onAuthStateChanged: mockOnAuthStateChanged,
      }));
      jest.doMock('firebase/firestore', () => ({
        doc: jest.fn(() => ({})),
        getDoc: jest.fn(async () => ({ exists: () => false })),
        setDoc: jest.fn(() => new Promise(() => {})), // Never resolves
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const adapter = require('../../../platform/auth/authAdapter.ts') as typeof authAdapter;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const firebaseConfig = require('../../../data/firebase/firebaseConfig.ts') as {
        getFirebaseAuth: () => unknown;
      };
      jest.spyOn(firebaseConfig, 'getFirebaseAuth').mockReturnValue(fakeAuth);

      const receivedUsers: Array<BFlowAuthUser | null> = [];
      adapter.subscribeToAuthUser((u) => {
        receivedUsers.push(u);
      });

      expect(mockOnAuthStateChanged).toHaveBeenCalled();
      expect(capturedAuthCallback).not.toBeNull();

      // Simulate Firebase Auth reporting user while setDoc hangs
      act(() => {
        capturedAuthCallback!({
          uid: 'uid_fast_immediate',
          email: 'demo.owner@bflow.example',
          displayName: 'Alejandro',
          providerData: [],
        });
      });

      // User must be delivered immediately despite hanging setDoc
      expect(receivedUsers.length).toBeGreaterThanOrEqual(1);
      expect(receivedUsers[0]?.uid).toBe('uid_fast_immediate');
    });
  });

  it('does not sync widget before account is hydrated (R-19)', async () => {
    // Unhydrated clean store state
    act(() => {
      useBudgetStore.setState({ isAccountHydrated: false });
    });

    const res = await useBudgetStore.getState().syncActiveWidget();
    expect(res.synced).toBe(false);
  });
});
