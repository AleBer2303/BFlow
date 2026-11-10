import React, { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import {
  ensureStandardSavingsBuckets,
  FirestoreBudgetRepository,
} from '../data/repositories/budgetRepository';
import { hapticService, type HapticType } from '../design-system';
import {
  buildMonthlyCurve,
  calculateChecklistProgress,
  calculateDebtsSummary,
  calculateFunfamiDebtSummary,
  calculateMonthlyBudgetSummary,
  calculateMonthlySavingsSummary,
  calculateMotoIdealSummary,
  calculateProvisionPlanSummary,
  formatMonthKeyLabelEs,
  toAppIsoDate,
  type ConceptGroup,
  type ConceptType,
  type MonthEntry,
  type RegisterOrCompleteMovementInput,
} from '../domain';
import { AnalyticsAndHistoryView } from '../features/analytics/components/AnalyticsAndHistoryView';
import { AccountProfileWorkspaceView } from '../features/auth/components/AccountProfileWorkspaceView';
import { AuthScreen } from '../features/auth/components/AuthScreen';
import {
  useBudgetStore,
  type BFlowWorkspaceTab,
} from '../features/budget/store/useBudgetStore';
import { ChecklistWorkspaceView } from '../features/checklist/components/ChecklistWorkspaceView';
import { DebtsWorkspaceView } from '../features/debts/components/DebtsWorkspaceView';
import { InitialAccountSetupView } from '../features/onboarding/components/InitialAccountSetupView';
import { SavingsAndProvisionsView } from '../features/savings/components/SavingsAndProvisionsView';
import { WorkspaceShell } from '../features/shell/components/WorkspaceShell';
import { SummaryOverview } from '../features/summary/components/SummaryOverview';
import {
  formatAuthError,
  registerWithPersonalProfile,
  sendPasswordRecoveryEmail,
  signInWithEmail,
  signOutCurrentUser,
  subscribeToAuthUser,
  type BFlowAuthUser,
  type RegisterPersonalAccountInput,
} from '../platform/auth/authAdapter';
import {
  confirmPasswordResetWithCode,
  requestPasswordResetCode,
} from '../platform/auth/verificationCodeService';
import { isDemoModeEnabled } from '../platform/mode/demoMode';
import {
  clearPersistedAccount,
  loadPersistedAccount,
  savePersistedAccount,
} from '../platform/storage/accountCache';

export default function PhaseOneHomeScreen(): React.JSX.Element {
  const {
    activeTab,
    activeMonthKey,
    availableMonths,
    concepts,
    entries,
    debtsByMonth,
    debtPayments,
    savingsBucketsByMonth,
    idealMotoPlan,
    closedSnapshots,
    needsOnboarding,
    authUser,
    syncMessage,
    isSyncing,
    isAccountHydrated,
    setActiveTab,
    setActiveMonthKey,
    setAuthUser,
    updateAuthUserProfile,
    clearWorkspaceSession,
    setSyncStatus,
    applyFullCloudAccount,
    toggleEntryStatus,
    addOrCompleteMovement,
    createCustomConceptAndMovement,
    updateConcept,
    deleteConcept,
    createDebt,
    updateDebt,
    deleteDebt,
    updateSavingsOpeningBalance,
    createSavingsBucket,
    deleteSavingsBucket,
    saveProvisionItem,
    deleteProvisionItem,
    completeInitialAccountSetup,
    resetFullAccount,
    editEntry,
    deleteEntryById,
    removeOrResetEntry,
    updateFunfamiInstallmentAmount,
    closeCurrentMonth,
    reopenClosedMonth,
    deleteOrRevertMonth,
    resetToOctober2026GoldenState,
    syncActiveWidget,
  } = useBudgetStore();

  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [authStatusMessage, setAuthStatusMessage] = useState<string | null>(null);

  const activeMonthLabel = formatMonthKeyLabelEs(activeMonthKey);

  const triggerHaptic = (type: HapticType) => {
    hapticService.trigger(type);
  };

  const syncInFlightRef = React.useRef<Map<string, Promise<void>>>(new Map());

  const syncUserCloudAccount = async (
    user: BFlowAuthUser,
    options?: { isRegistration?: boolean }
  ): Promise<void> => {
    const activePromise = syncInFlightRef.current.get(user.uid);
    if (activePromise) {
      return activePromise;
    }

    const runSync = (async () => {
      // 1. Instant offline cold-start: rehydrate from local cache if available
      const cached = loadPersistedAccount(user.uid);
      if (cached) {
        applyFullCloudAccount(cached);
      }

      setSyncStatus('Cargando tu presupuesto e historial...', true);
      try {
        const repo = new FirestoreBudgetRepository();
        const fullAccount = await repo.loadFullCloudAccount(user.uid, user.email, options);
        const currentUid = useBudgetStore.getState().authUser?.uid;
        if (currentUid && currentUid !== user.uid) {
          return;
        }
        savePersistedAccount(user.uid, fullAccount);
        applyFullCloudAccount(fullAccount);
        setSyncStatus('Sincronizado', false);
      } catch {
        setSyncStatus('', false);
      } finally {
        syncInFlightRef.current.delete(user.uid);
      }
    })();

    syncInFlightRef.current.set(user.uid, runSync);
    return runSync;
  };

  // Automatic session restoration listener in live runtime.
  // The local showcase (demo) mode never talks to Firebase, so it keeps its seeded session.
  useEffect(() => {
    if (process.env.NODE_ENV === 'test' || isDemoModeEnabled()) {
      return;
    }
    const initialUser = useBudgetStore.getState().authUser;
    if (initialUser) {
      void syncUserCloudAccount(initialUser);
    }
    const unsubscribe = subscribeToAuthUser((restoredUser) => {
      if (restoredUser) {
        setAuthUser(restoredUser);
        void syncUserCloudAccount(restoredUser);
      } else {
        setAuthUser(null);
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time WidgetKit synchronization: triggers on mount and whenever user leaves app / switches to background
  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    void syncActiveWidget();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        void syncActiveWidget();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [syncActiveWidget]);

  const handleSignInWithEmail = async (email: string, password: string) => {
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Verificando credenciales...', true);
    try {
      const user = await signInWithEmail(email, password);
      setAuthUser(user);
      triggerHaptic('success');
      await syncUserCloudAccount(user, { isRegistration: false });
    } catch (err) {
      const msg = formatAuthError(err, 'No fue posible iniciar sesión.');
      setAuthErrorMessage(msg);
      setSyncStatus(msg, false);
    }
  };

  const handleRegisterPersonalAccount = async (input: RegisterPersonalAccountInput) => {
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Creando tu cuenta personal y preparando tu presupuesto...', true);
    try {
      const user = await registerWithPersonalProfile(input);
      setAuthUser(user);
      triggerHaptic('success');
      await syncUserCloudAccount(user, { isRegistration: true });
    } catch (err) {
      const msg = formatAuthError(err, 'No fue posible crear tu cuenta.');
      setAuthErrorMessage(msg);
      setSyncStatus(msg, false);
    }
  };

  const handleSendPasswordRecovery = async (email: string) => {
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Enviando código de verificación...', true);
    try {
      const res = await requestPasswordResetCode(email);
      setAuthStatusMessage(res.message);
      setSyncStatus('Código de verificación enviado.', false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'No fue posible enviar el código de recuperación.';
      setAuthErrorMessage(msg);
      setSyncStatus(msg, false);
    }
  };

  const handleRequestPasswordResetCode = async (email: string) => {
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Enviando código de verificación de 6 dígitos...', true);
    try {
      const res = await requestPasswordResetCode(email);
      setAuthStatusMessage(res.message);
      setSyncStatus('Código enviado a tu correo.', false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'No fue posible enviar el código de verificación.';
      setAuthErrorMessage(msg);
      setSyncStatus(msg, false);
      throw err;
    }
  };

  const handleConfirmPasswordResetWithCode = async (
    email: string,
    code: string,
    newPassword: string
  ) => {
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Actualizando contraseña internamente...', true);
    try {
      const res = await confirmPasswordResetWithCode(email, code, newPassword);
      setAuthStatusMessage(res.message);
      setSyncStatus('Contraseña actualizada correctamente.', false);
      triggerHaptic('success');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'No fue posible actualizar la contraseña.';
      setAuthErrorMessage(msg);
      setSyncStatus(msg, false);
      throw err;
    }
  };

  const handleSignOut = async () => {
    const outgoingUid = authUser?.uid;
    await signOutCurrentUser();
    if (outgoingUid) {
      clearPersistedAccount(outgoingUid);
    }
    clearWorkspaceSession();
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Sesión cerrada correctamente.', false);
  };

  const activeDebts = useMemo(
    () => debtsByMonth[activeMonthKey] ?? [],
    [activeMonthKey, debtsByMonth]
  );
  const activeSavingsBuckets = useMemo(
    () => ensureStandardSavingsBuckets(savingsBucketsByMonth[activeMonthKey] ?? [], 0, 0),
    [activeMonthKey, savingsBucketsByMonth]
  );
  const activeDebtPayments = useMemo(
    () => debtPayments.filter((dp) => dp.monthKey === activeMonthKey),
    [activeMonthKey, debtPayments]
  );

  const budget = useMemo(
    () => calculateMonthlyBudgetSummary(entries, activeMonthKey),
    [entries, activeMonthKey]
  );
  const checklist = useMemo(
    () => calculateChecklistProgress(concepts, entries, activeMonthKey),
    [concepts, entries, activeMonthKey]
  );
  const debtSummary = useMemo(
    () => calculateDebtsSummary(activeDebts, entries, activeMonthKey, activeDebtPayments),
    [activeDebts, entries, activeMonthKey, activeDebtPayments]
  );
  const savingsSummary = useMemo(
    () =>
      calculateMonthlySavingsSummary(
        activeSavingsBuckets,
        concepts,
        entries,
        budget,
        activeMonthKey
      ),
    [activeSavingsBuckets, concepts, entries, budget, activeMonthKey]
  );
  const motoIdealSummary = useMemo(
    () =>
      calculateProvisionPlanSummary(
        idealMotoPlan,
        entries,
        savingsSummary.moto.paidContributionsThisMonth,
        activeMonthKey
      ),
    [idealMotoPlan, entries, savingsSummary.moto.paidContributionsThisMonth, activeMonthKey]
  );
  const monthlyCurve = useMemo(
    () =>
      buildMonthlyCurve({
        monthKey: activeMonthKey,
        todayIso: toAppIsoDate(),
        entries,
        concepts,
        debtPayments: activeDebtPayments,
        budget,
        savings: savingsSummary,
        debts: debtSummary,
      }),
    [activeMonthKey, entries, concepts, activeDebtPayments, budget, savingsSummary, debtSummary]
  );

  const isAwaitingInitialHydration =
    Boolean(authUser) && !isAccountHydrated && !needsOnboarding;

  // AUTHENTICATION GATE: If no authenticated user session is active (or initial cloud hydration is in flight without local cache), render AuthScreen first
  if (!authUser || isAwaitingInitialHydration) {
    return (
      <AuthScreen
        isSubmitting={isSyncing || isAwaitingInitialHydration}
        errorMessage={authErrorMessage}
        statusMessage={
          isAwaitingInitialHydration
            ? syncMessage || 'Cargando tu presupuesto e historial...'
            : authStatusMessage
        }
        onSignInWithEmail={handleSignInWithEmail}
        onRegisterPersonalAccount={handleRegisterPersonalAccount}
        onSendPasswordRecovery={handleSendPasswordRecovery}
        onRequestPasswordResetCode={handleRequestPasswordResetCode}
        onConfirmPasswordResetWithCode={handleConfirmPasswordResetWithCode}
      />
    );
  }

  const handleToggleEntry = async (entry: MonthEntry) => {
    await toggleEntryStatus(entry.id, toAppIsoDate());
  };

  const handleAddMovement = async (input: RegisterOrCompleteMovementInput) => {
    triggerHaptic('success');
    await addOrCompleteMovement(input);
  };

  const handleCloseMonth = async () => {
    triggerHaptic('success');
    await closeCurrentMonth();
  };

  const installmentEntry = entries.find(
    (e) =>
      e.monthKey === activeMonthKey &&
      (e.conceptId === 'exp_cuota_funfami' ||
        e.conceptName.toLowerCase().includes('cuota') ||
        e.conceptId.includes('cuota'))
  );

  return (
    <WorkspaceShell
      monthLabel={activeMonthLabel}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      showNavigation={!needsOnboarding}
    >
      {needsOnboarding ? (
        <InitialAccountSetupView
          onCompleteSetup={(config) => {
            void completeInitialAccountSetup(config);
            void triggerHaptic('success');
          }}
        />
      ) : (
        <>
          {/* Active Workspace Content */}
          {activeTab === 'summary' ? (
            <SummaryOverview budget={budget} checklist={checklist} curve={monthlyCurve} />
          ) : null}

          {activeTab === 'checklist' ? (
            <ChecklistWorkspaceView
              monthKey={activeMonthKey}
              concepts={concepts}
              entries={entries}
              budget={budget}
              debts={activeDebts}
              savingsBuckets={activeSavingsBuckets}
              onToggleEntry={handleToggleEntry}
              onAddOrCompleteMovement={handleAddMovement}
              onCreateCustomMovement={(input) => {
                triggerHaptic('success');
                void createCustomConceptAndMovement(input);
              }}
              onUpdateConcept={(conceptId, updates) => {
                triggerHaptic('success');
                void updateConcept(conceptId, updates);
              }}
              onDeleteConcept={(conceptId) => {
                triggerHaptic('light');
                void deleteConcept(conceptId);
              }}
              onEditEntry={(entryId, updates) => {
                triggerHaptic('success');
                void editEntry(entryId, updates);
              }}
              onDeleteEntry={(entryId) => {
                triggerHaptic('light');
                void deleteEntryById(entryId);
              }}
              onRemoveRepeatableEntry={removeOrResetEntry}
            />
          ) : null}

          {activeTab === 'debts' ? (
            <DebtsWorkspaceView
              debtSummary={debtSummary}
              onCreateDebt={(input) => {
                triggerHaptic('success');
                void createDebt(activeMonthKey, input);
              }}
              onUpdateDebt={(debtId, updates) => {
                triggerHaptic('success');
                void updateDebt(activeMonthKey, debtId, updates);
              }}
              onDeleteDebt={(debtId) => {
                triggerHaptic('light');
                void deleteDebt(activeMonthKey, debtId);
              }}
            />
          ) : null}

          {activeTab === 'savings' ? (
            <SavingsAndProvisionsView
              savingsSummary={savingsSummary}
              motoIdealSummary={motoIdealSummary}
              provisionPlan={idealMotoPlan}
              onUpdateOpeningBalance={(bucketId, newBalanceCop, newName) => {
                triggerHaptic('success');
                void updateSavingsOpeningBalance(activeMonthKey, bucketId, newBalanceCop, newName);
              }}
              onCreateSavingsBucket={(name, openingBalanceCop) => {
                triggerHaptic('success');
                void createSavingsBucket(activeMonthKey, name, openingBalanceCop);
              }}
              onDeleteSavingsBucket={(bucketId) => {
                triggerHaptic('light');
                void deleteSavingsBucket(activeMonthKey, bucketId);
              }}
              onSaveProvisionItem={(item) => {
                triggerHaptic('success');
                void saveProvisionItem(item);
              }}
              onDeleteProvisionItem={(itemId) => {
                triggerHaptic('light');
                void deleteProvisionItem(itemId);
              }}
            />
          ) : null}

          {activeTab === 'analytics' ? (
            <AnalyticsAndHistoryView
              activeMonthKey={activeMonthKey}
              availableMonths={availableMonths}
              concepts={concepts}
              entries={entries}
              budget={budget}
              checklist={checklist}
              debtSummary={debtSummary}
              savingsSummary={savingsSummary}
              closedSnapshots={closedSnapshots}
              onSelectMonth={setActiveMonthKey}
              onCloseCurrentMonth={handleCloseMonth}
              onReopenClosedMonth={(mk) => {
                triggerHaptic('light');
                void reopenClosedMonth(mk);
              }}
              onDeleteOrRevertMonth={(mk) => {
                triggerHaptic('light');
                void deleteOrRevertMonth(mk);
              }}
              onResetOctoberSeed={resetToOctober2026GoldenState}
            />
          ) : null}

          {activeTab === 'account' ? (
            <AccountProfileWorkspaceView
              authUser={authUser}
              syncStatusMessage={syncMessage}
              isSyncing={isSyncing}
              onSignOut={handleSignOut}
              onManualSync={() => {
                triggerHaptic('light');
                void syncUserCloudAccount(authUser);
              }}
              onUpdateProfile={async (updates) => {
                triggerHaptic('success');
                await updateAuthUserProfile(updates);
              }}
              onSendPasswordReset={async (email) => {
                triggerHaptic('light');
                await handleSendPasswordRecovery(email);
              }}
              onRequestPasswordResetCode={async (email) => {
                triggerHaptic('light');
                await handleRequestPasswordResetCode(email);
              }}
              onConfirmPasswordResetWithCode={async (email, code, newPassword) => {
                await handleConfirmPasswordResetWithCode(email, code, newPassword);
              }}
              onResetFullAccount={() => {
                triggerHaptic('light');
                void resetFullAccount();
              }}
            />
          ) : null}
        </>
      )}
    </WorkspaceShell>
  );
}
