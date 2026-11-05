import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import PhaseOneHomeScreen from '../../../app/index';
import { InMemoryBudgetRepository } from '../../../data/repositories/budgetRepository';
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

    // Google login option must be completely removed
    expect(screen.queryByTestId('auth-google-button')).toBeNull();
    expect(screen.queryByText(/Continuar con Google/i)).toBeNull();

    // Password visibility toggle must allow viewing password while typing with minimalist eye icons
    expect(screen.getByTestId('auth-password-input').props.secureTextEntry).toBe(true);
    expect(screen.getByTestId('icon-eye-closed')).toBeTruthy();
    fireEvent.press(screen.getByTestId('auth-password-visibility-toggle'));
    expect(screen.getByTestId('auth-password-input').props.secureTextEntry).toBe(false);
    expect(screen.getByTestId('icon-eye-open')).toBeTruthy();
    fireEvent.press(screen.getByTestId('auth-password-visibility-toggle'));
    expect(screen.getByTestId('auth-password-input').props.secureTextEntry).toBe(true);
    expect(screen.getByTestId('icon-eye-closed')).toBeTruthy();

    // Switch to Personal Registration ("Crear cuenta")
    fireEvent.press(screen.getByTestId('auth-mode-register'));
    expect(screen.getByText('Registra tus datos personales')).toBeTruthy();
    expect(screen.getByTestId('auth-name-input')).toBeTruthy();
    expect(screen.getByTestId('auth-phone-input')).toBeTruthy();
    expect(screen.getByTestId('auth-goal-input')).toBeTruthy();

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

  it('guarantees 100% account isolation when switching between a newly created user and abernalg2303@gmail.com', async () => {
    const ownerUser: BFlowAuthUser = {
      uid: 'uid_owner_abernalg',
      email: 'abernalg2303@gmail.com',
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

    // 1. Start in owner account (abernalg2303@gmail.com) and verify canonical savings ($ 4.380.000)
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

    // 4. Sign out and log back into abernalg2303@gmail.com:
    // Zero data from secondUser may remain, and abernalg2303@gmail.com must retain exact golden balances ($ 4.380.000)
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
      'abernalg2303@gmail.com'
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
      'abernalg2303@gmail.com'
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

  it('defaults onboarding to Enero of the current year with 0 default funds, never re-prompts after blank setup, and allows editing/deleting any fund including Moto & Ahorros', async () => {
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

    // 2. Default month must be Enero ('01') and current year (not Octubre 2026),
    // and Section 2 must have 0 pre-populated savings funds (no Fondo Moto, no Fondo Ahorros)
    expect(screen.queryByTestId('onboarding-bucket-balance-savings')).toBeNull();
    expect(screen.queryByTestId('onboarding-bucket-balance-moto')).toBeNull();
    expect(screen.getByTestId('complete-initial-setup-button')).toHaveTextContent(/Enero \d{4}/);

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

    // 4. Switch to owner account (abernalg2303@gmail.com) and verify editing/deleting Fondo Moto & Fondo Ahorros
    const ownerUser: BFlowAuthUser = {
      uid: 'uid-owner-123',
      email: 'abernalg2303@gmail.com',
      displayName: 'Alejandro Bernal',
      provider: 'firebase',
    };
    act(() => {
      useBudgetStore.getState().setAuthUser(ownerUser);
    });

    fireEvent.press(screen.getByTestId('workspace-tab-savings'));
    expect(screen.getByTestId('bucket-moto-card')).toBeTruthy();
    expect(screen.getByTestId('bucket-savings-card')).toBeTruthy();

    // Edit Fondo Moto name and balance
    fireEvent.press(screen.getByTestId('edit-savings-bucket-moto'));
    fireEvent.changeText(screen.getByTestId('moto-bucket-name-input'), 'Fondo Moto Personal');
    fireEvent.changeText(screen.getByTestId('moto-opening-balance-input'), '2000000');
    await act(async () => {
      fireEvent.press(screen.getByTestId('save-opening-balances-button'));
    });
    expect(screen.getByText('Fondo Moto Personal')).toBeTruthy();

    // Delete Fondo Moto and Fondo Ahorros
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
});
