import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, View } from 'react-native';
import {
  ensureStandardSavingsBuckets,
  FirestoreBudgetRepository,
} from '../data/repositories/budgetRepository';
import {
  AppText,
  AppTextInput,
  CurrencyText,
  FloatingLiquidGlassDock,
  GlassSurface,
  KeyboardAwareScrollView,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  ThemeToggleIconButton,
  hapticService,
  useBFlowTheme,
  type HapticType,
} from '../design-system';
import {
  calculateChecklistProgress,
  calculateFunfamiDebtSummary,
  calculateMonthlyBudgetSummary,
  calculateMonthlySavingsSummary,
  calculateMotoIdealSummary,
  formatCop,
  formatMonthKeyLabelEs,
  getAvailableConcepts,
  toBogotaIsoDate,
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
import { DebtsFunfamiView } from '../features/debts/components/DebtsFunfamiView';
import { InitialAccountSetupView } from '../features/onboarding/components/InitialAccountSetupView';
import { SavingsAndMotoIdealView } from '../features/savings/components/SavingsAndMotoIdealView';
import {
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

export default function PhaseOneHomeScreen(): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
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

  // Summary Add Movement Modal state
  const [isSummaryAddModalOpen, setIsSummaryAddModalOpen] = useState(false);
  const [summaryMovementType, setSummaryMovementType] = useState<ConceptType>('expense');
  const [summarySelectedConceptId, setSummarySelectedConceptId] = useState<string>('');
  const [summaryAmountInput, setSummaryAmountInput] = useState<string>('');
  const [summaryNoteInput, setSummaryNoteInput] = useState<string>('');
  const [summaryCustomName, setSummaryCustomName] = useState<string>('');
  const [summaryCustomGroup, setSummaryCustomGroup] = useState<ConceptGroup>('variable');
  const [isSummaryCustomMode, setIsSummaryCustomMode] = useState<boolean>(false);
  const [summaryFormError, setSummaryFormError] = useState<string | null>(null);

  const activeMonthLabel = formatMonthKeyLabelEs(activeMonthKey);

  const triggerHaptic = (type: HapticType) => {
    hapticService.trigger(type);
  };

  const syncUserCloudAccount = async (
    user: BFlowAuthUser,
    options?: { isRegistration?: boolean }
  ) => {
    setSyncStatus('Cargando tu presupuesto e historial...', true);
    try {
      const repo = new FirestoreBudgetRepository();
      const fullAccount = await repo.loadFullCloudAccount(user.uid, user.email, options);
      const currentUid = useBudgetStore.getState().authUser?.uid;
      if (currentUid && currentUid !== user.uid) {
        return;
      }
      applyFullCloudAccount(fullAccount);
      setSyncStatus('Sincronizado', false);
    } catch {
      setSyncStatus('', false);
    }
  };

  // Automatic session restoration listener in live runtime
  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      return;
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
      const msg = err instanceof Error ? err.message : 'No fue posible iniciar sesión.';
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
      const msg = err instanceof Error ? err.message : 'No fue posible crear tu cuenta.';
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
    await signOutCurrentUser();
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
    () => calculateFunfamiDebtSummary(activeDebts, entries, activeMonthKey, activeDebtPayments),
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
      calculateMotoIdealSummary(
        idealMotoPlan,
        entries,
        savingsSummary.moto.paidContributionsThisMonth,
        activeMonthKey
      ),
    [idealMotoPlan, entries, savingsSummary.moto.paidContributionsThisMonth, activeMonthKey]
  );
  const availableExpenseConcepts = useMemo(
    () => getAvailableConcepts(concepts, entries, activeMonthKey, 'expense'),
    [concepts, entries, activeMonthKey]
  );

  const allMonthEntries = useMemo(
    () => entries.filter((e) => e.monthKey === activeMonthKey),
    [entries, activeMonthKey]
  );

  // AUTHENTICATION GATE: If no authenticated user session is active, render AuthScreen first
  if (!authUser) {
    return (
      <AuthScreen
        isSubmitting={isSyncing}
        errorMessage={authErrorMessage}
        statusMessage={authStatusMessage}
        onSignInWithEmail={handleSignInWithEmail}
        onRegisterPersonalAccount={handleRegisterPersonalAccount}
        onSendPasswordRecovery={handleSendPasswordRecovery}
        onRequestPasswordResetCode={handleRequestPasswordResetCode}
        onConfirmPasswordResetWithCode={handleConfirmPasswordResetWithCode}
      />
    );
  }

  const handleToggleEntry = async (entry: MonthEntry) => {
    const wasCompleted = entry.status === 'completed';
    triggerHaptic(wasCompleted ? 'light' : 'success');
    await toggleEntryStatus(entry.id, toBogotaIsoDate());
  };

  const handleAddMovement = async (input: RegisterOrCompleteMovementInput) => {
    triggerHaptic('success');
    await addOrCompleteMovement(input);
  };

  const handleSummaryOpenAddModal = (type: ConceptType = 'expense') => {
    triggerHaptic('light');
    setSummaryMovementType(type);
    setIsSummaryCustomMode(false);
    setSummaryCustomName('');
    const avail = getAvailableConcepts(concepts, entries, activeMonthKey, type);
    const first = avail[0];
    setSummarySelectedConceptId(first?.id ?? '');
    setSummaryAmountInput(first && first.defaultAmount > 0 ? String(first.defaultAmount) : '');
    setSummaryNoteInput('');
    setSummaryFormError(null);
    setIsSummaryAddModalOpen(true);
  };

  const handleSummarySubmitMovement = async () => {
    const digitsOnly = summaryAmountInput.replace(/[^0-9]/g, '');

    if (isSummaryCustomMode) {
      if (!summaryCustomName.trim()) {
        setSummaryFormError('Ingresa el nombre del nuevo ítem.');
        return;
      }
      const parsedAmount = digitsOnly ? Number(digitsOnly) : 0;
      if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
        setSummaryFormError('Ingresa un monto entero mayor a $ 0 en pesos colombianos.');
        return;
      }
      triggerHaptic('success');
      await createCustomConceptAndMovement({
        monthKey: activeMonthKey,
        name: summaryCustomName.trim(),
        type: summaryMovementType,
        group: summaryCustomGroup,
        amountCop: parsedAmount,
        ...(summaryNoteInput.trim() ? { note: summaryNoteInput.trim() } : {}),
      });
      setIsSummaryAddModalOpen(false);
      setSummaryFormError(null);
      return;
    }

    const available = getAvailableConcepts(concepts, entries, activeMonthKey, summaryMovementType);
    const activeConcept =
      available.find((c) => c.id === summarySelectedConceptId) ?? available[0];
    if (!activeConcept) {
      setSummaryFormError('No hay conceptos disponibles en esta categoría.');
      return;
    }

    const parsedAmount = digitsOnly ? Number(digitsOnly) : activeConcept.defaultAmount;
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setSummaryFormError('Ingresa un monto entero mayor a $ 0 en pesos colombianos.');
      return;
    }

    triggerHaptic('success');
    await handleAddMovement({
      monthKey: activeMonthKey,
      conceptId: activeConcept.id,
      actualAmount: parsedAmount,
      completedAt: toBogotaIsoDate(),
      ...(summaryNoteInput.trim() ? { note: summaryNoteInput.trim() } : {}),
    });

    setIsSummaryAddModalOpen(false);
    setSummaryFormError(null);
  };

  const handleCloseMonth = async () => {
    triggerHaptic('success');
    await closeCurrentMonth();
  };

  const funfamiEntry = entries.find(
    (e) => e.monthKey === activeMonthKey && e.conceptId === 'exp_cuota_funfami'
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xl,
          paddingBottom: Platform.OS === 'ios' ? 84 : 76,
          gap: spacing.md,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <AppText variant="title1">{`BFlow · ${activeMonthLabel}`}</AppText>

          <ThemeToggleIconButton testID="theme-toggle-button" />
        </View>

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
            <>
              <GlassSurface elevated testID="net-flow-hero-card">
                <View style={{ gap: spacing.xs }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: spacing.xs,
                    }}
                  >
                    <AppText variant="caption" color={colors.text.secondary}>
                      Flujo Neto (En caja hoy)
                    </AppText>
                    <StatusBadge
                      testID="checklist-progress-badge"
                      label={
                        checklist.isMonthComplete
                          ? `✨ Mes completo (${checklist.completedCount} de ${checklist.totalTrackableCount})`
                          : `Checklist ${checklist.completedCount} de ${checklist.totalTrackableCount}`
                      }
                      status={checklist.isMonthComplete ? 'completed' : 'pending'}
                    />
                  </View>
                  <CurrencyText
                    testID="golden-net-flow"
                    amount={budget.netCashFlow}
                    variant="heroCurrency"
                    tone="income"
                  />
                  <AppText variant="caption" color={colors.text.secondary}>
                    {`Flujo proyectado del mes: ${formatCop(budget.projectedNetFlow)}`}
                  </AppText>
                </View>
              </GlassSurface>

              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <GlassSurface style={{ flex: 1 }} testID="income-summary-card">
                  <View style={{ gap: spacing.xs }}>
                    <AppText variant="caption" color={colors.text.secondary}>
                      Ingresos Recibidos
                    </AppText>
                    <CurrencyText amount={budget.receivedIncome} variant="title2" tone="income" />
                    <AppText variant="micro" color={colors.text.muted}>
                      {`Previstos: ${formatCop(budget.plannedIncome)}`}
                    </AppText>
                  </View>
                </GlassSurface>

                <GlassSurface style={{ flex: 1 }} testID="expense-summary-card">
                  <View style={{ gap: spacing.xs }}>
                    <AppText variant="caption" color={colors.text.secondary}>
                      Gastos Pagados
                    </AppText>
                    <CurrencyText amount={budget.paidExpenses} variant="title2" tone="expense" />
                    <AppText variant="micro" color={colors.semantic.pending}>
                      {`Pendientes: ${formatCop(budget.pendingExpenses)}`}
                    </AppText>
                  </View>
                </GlassSurface>
              </View>

              <GlassSurface testID="debt-summary-card">
                <View style={{ gap: spacing.xs }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: spacing.xs,
                    }}
                  >
                    <AppText variant="headline">Control Deudas</AppText>
                    <StatusBadge
                      label={
                        debtSummary.appliedInstallmentThisMonth > 0
                          ? `Abonos: ${formatCop(debtSummary.appliedInstallmentThisMonth)}`
                          : 'Sin abonos este mes'
                      }
                      status={debtSummary.appliedInstallmentThisMonth > 0 ? 'debt' : 'pending'}
                    />
                  </View>
                  <CurrencyText
                    testID="total-debt-amount"
                    amount={debtSummary.totalRemainingDebt}
                    variant="title2"
                    tone="debt"
                  />
                </View>
              </GlassSurface>

              <GlassSurface testID="savings-summary-card">
                <View style={{ gap: spacing.xs }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: spacing.xs,
                    }}
                  >
                    <AppText variant="headline">Control Ahorros</AppText>
                    <StatusBadge
                      label={
                        motoIdealSummary.excelRecurringMonthlyTotalCop > 0
                          ? `Provisiones: ${formatCop(motoIdealSummary.excelRecurringMonthlyTotalCop)}/mes`
                          : `${(savingsSummary.hasMotoBucket ? 1 : 0) + (savingsSummary.hasSavingsBucket ? 1 : 0) + (savingsSummary.customBuckets?.length ?? 0)} Fondos`
                      }
                      status="moto"
                    />
                  </View>
                  <CurrencyText
                    testID="total-savings-amount"
                    amount={savingsSummary.totalCurrentSavings}
                    variant="title2"
                    tone="moto"
                  />
                </View>
              </GlassSurface>

              <GlassSurface testID="interactive-checklist-card">
                <View style={{ gap: spacing.sm }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: spacing.xs,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="headline">Checklist Mensual (Toca para marcar)</AppText>
                      <AppText variant="micro" color={colors.text.muted}>
                        {`Disponibles en Gasto: ${availableExpenseConcepts.length}`}
                      </AppText>
                    </View>
                  </View>

                  <Pressable
                    testID="summary-quick-open-checklist-add"
                    accessibilityRole="button"
                    accessibilityLabel="Registrar Nuevo Movimiento"
                    onPressIn={() => triggerHaptic('light')}
                    onPress={() => handleSummaryOpenAddModal('expense')}
                    style={{
                      width: '100%',
                      minHeight: MIN_TOUCH_TARGET_PT,
                      paddingVertical: spacing.xs,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.md,
                      borderCurve: 'continuous',
                      backgroundColor: colors.glass.surfaceElevatedTint,
                      borderWidth: 1,
                      borderColor: colors.glass.specularBorder,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <AppText variant="callout" color={colors.text.primary}>
                      Registrar Nuevo Movimiento
                    </AppText>
                  </Pressable>

                  {isSummaryAddModalOpen ? (
                    <GlassSurface elevated testID="summary-add-movement-modal-card">
                      <View style={{ gap: spacing.sm }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <AppText variant="title2">Registrar Movimiento</AppText>
                          <Pressable
                            accessibilityRole="button"
                            onPressIn={() => triggerHaptic('light')}
                            onPress={() => setIsSummaryAddModalOpen(false)}
                            style={{
                              paddingVertical: 4,
                              paddingHorizontal: spacing.sm,
                              borderRadius: radius.pill,
                              backgroundColor: colors.glass.surfaceTint,
                              borderWidth: 1,
                              borderColor: colors.glass.subtleBorder,
                            }}
                          >
                            <AppText variant="caption" color={colors.text.secondary}>
                              Cerrar
                            </AppText>
                          </Pressable>
                        </View>

                        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                          {(
                            [
                              { type: 'expense', label: 'Gasto' },
                              { type: 'income', label: 'Ingreso' },
                            ] as const
                          ).map((tab) => {
                            const isSelected = summaryMovementType === tab.type;
                            return (
                              <Pressable
                                key={tab.type}
                                accessibilityRole="button"
                                onPressIn={() => triggerHaptic('light')}
                                onPress={() => handleSummaryOpenAddModal(tab.type)}
                                style={{
                                  flex: 1,
                                  minHeight: 36,
                                  borderRadius: radius.md,
                                  backgroundColor: isSelected
                                    ? colors.glass.surfaceElevatedTint
                                    : colors.glass.surfaceTint,
                                  borderWidth: 1,
                                  borderColor: isSelected
                                    ? colors.glass.specularBorder
                                    : colors.glass.subtleBorder,
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                }}
                              >
                                <AppText variant="caption">{tab.label}</AppText>
                              </Pressable>
                            );
                          })}
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                          {getAvailableConcepts(
                            concepts,
                            entries,
                            activeMonthKey,
                            summaryMovementType
                          ).map((concept) => {
                            const isSelected =
                              !isSummaryCustomMode && summarySelectedConceptId === concept.id;
                            return (
                              <Pressable
                                key={concept.id}
                                testID={`summary-concept-chip-${concept.id}`}
                                accessibilityRole="button"
                                onPressIn={() => triggerHaptic('selection')}
                                onPress={() => {
                                  setIsSummaryCustomMode(false);
                                  setSummarySelectedConceptId(concept.id);
                                  setSummaryAmountInput(
                                    concept.defaultAmount > 0 ? String(concept.defaultAmount) : ''
                                  );
                                  setSummaryFormError(null);
                                }}
                                style={{
                                  minHeight: 36,
                                  paddingVertical: spacing.xs,
                                  paddingHorizontal: spacing.md,
                                  borderRadius: radius.pill,
                                  backgroundColor: isSelected
                                    ? colors.semantic.incomeSoft
                                    : colors.glass.surfaceTint,
                                  borderWidth: 1,
                                  borderColor: isSelected
                                    ? colors.glass.specularBorder
                                    : colors.glass.subtleBorder,
                                  justifyContent: 'center',
                                }}
                              >
                                <AppText
                                  variant="caption"
                                  color={isSelected ? colors.semantic.income : colors.text.primary}
                                >
                                  {`${concept.name}${concept.defaultAmount > 0 ? ` (${formatCop(concept.defaultAmount)})` : ' (Múltiple)'}`}
                                </AppText>
                              </Pressable>
                            );
                          })}

                          <Pressable
                            accessibilityRole="button"
                            onPressIn={() => triggerHaptic('light')}
                            onPress={() => {
                              setIsSummaryCustomMode(true);
                              setSummaryAmountInput('');
                              setSummaryFormError(null);
                            }}
                            style={{
                              minHeight: 36,
                              paddingVertical: spacing.xs,
                              paddingHorizontal: spacing.md,
                              borderRadius: radius.pill,
                              backgroundColor: isSummaryCustomMode
                                ? colors.semantic.motoSoft
                                : colors.glass.surfaceTint,
                              borderWidth: 1,
                              borderColor: isSummaryCustomMode
                                ? colors.glass.specularBorder
                                : colors.glass.subtleBorder,
                              justifyContent: 'center',
                            }}
                          >
                            <AppText
                              variant="caption"
                              color={isSummaryCustomMode ? colors.semantic.moto : colors.text.secondary}
                            >
                              + Crear nuevo ítem
                            </AppText>
                          </Pressable>
                        </View>

                        {isSummaryCustomMode ? (
                          <View style={{ gap: spacing.xs }}>
                            <AppTextInput
                              value={summaryCustomName}
                              onChangeText={setSummaryCustomName}
                              placeholder="Nombre del nuevo ítem"
                            />
                            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                              {(
                                [
                                  { id: 'fixed', label: 'Fijo' },
                                  { id: 'variable', label: 'Variable' },
                                ] as const
                              ).map((g) => {
                                const active = summaryCustomGroup === g.id;
                                return (
                                  <Pressable
                                    key={g.id}
                                    accessibilityRole="button"
                                    onPressIn={() => triggerHaptic('selection')}
                                    onPress={() => setSummaryCustomGroup(g.id)}
                                    style={{
                                      flex: 1,
                                      minHeight: 36,
                                      borderRadius: radius.md,
                                      backgroundColor: active
                                        ? colors.glass.surfaceElevatedTint
                                        : colors.glass.surfaceTint,
                                      borderWidth: 1,
                                      borderColor: active
                                        ? colors.glass.specularBorder
                                        : colors.glass.subtleBorder,
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <AppText variant="caption">{g.label}</AppText>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        ) : null}

                        <AppTextInput
                          value={summaryAmountInput}
                          onChangeText={setSummaryAmountInput}
                          keyboardType="numeric"
                          placeholder="Monto en COP enteros"
                        />

                        <AppTextInput
                          value={summaryNoteInput}
                          onChangeText={setSummaryNoteInput}
                          placeholder="Nota opcional"
                        />

                        {summaryFormError ? (
                          <AppText variant="caption" color={colors.semantic.expense}>
                            {summaryFormError}
                          </AppText>
                        ) : null}

                        <Pressable
                          testID="summary-submit-movement-button"
                          accessibilityRole="button"
                          onPressIn={() => triggerHaptic('medium')}
                          onPress={handleSummarySubmitMovement}
                          style={{
                            minHeight: MIN_TOUCH_TARGET_PT,
                            borderRadius: radius.md,
                            borderCurve: 'continuous',
                            backgroundColor: colors.glass.surfaceElevatedTint,
                            borderWidth: 1,
                            borderColor: colors.glass.specularBorder,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <AppText variant="headline" color={colors.semantic.income}>
                            Guardar Movimiento
                          </AppText>
                        </Pressable>
                      </View>
                    </GlassSurface>
                  ) : null}

                  {allMonthEntries.map((entry) => {
                    const isDone = entry.status === 'completed';
                    return (
                      <Pressable
                        key={entry.id}
                        testID={`checklist-item-${entry.conceptId}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isDone }}
                        accessibilityLabel={`${entry.conceptName}, ${formatCop(entry.actualAmount)}`}
                        onPressIn={() => triggerHaptic(isDone ? 'light' : 'success')}
                        onPress={() => handleToggleEntry(entry)}
                        style={{
                          minHeight: MIN_TOUCH_TARGET_PT,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: spacing.sm,
                          paddingVertical: spacing.sm,
                          paddingHorizontal: spacing.md,
                          borderRadius: radius.md,
                          backgroundColor: isDone
                            ? colors.semantic.completedSoft
                            : colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor: isDone
                            ? colors.glass.specularBorder
                            : colors.glass.subtleBorder,
                        }}
                      >
                        <View style={{ flex: 1, gap: spacing.xxs }}>
                          <AppText variant="body">{`${isDone ? '✓ ' : ''}${entry.conceptName}`}</AppText>
                          <AppText variant="micro" color={colors.text.secondary}>
                            {isDone
                              ? `${entry.type === 'income' ? 'Recibido' : 'Pagado'}${entry.completedAt ? ` · ${entry.completedAt}` : ''}`
                              : 'Pendiente · Toca para completar'}
                          </AppText>
                        </View>
                        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                          <CurrencyText
                            amount={entry.actualAmount}
                            variant="body"
                            tone={entry.type === 'income' ? 'income' : 'expense'}
                          />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </GlassSurface>
            </>
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
            <DebtsFunfamiView
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
            <SavingsAndMotoIdealView
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
    </KeyboardAwareScrollView>

    {!needsOnboarding ? (
      <FloatingLiquidGlassDock
        testID="liquid-glass-tab-bar"
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />
    ) : null}
  </View>
);
}
