import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { FirestoreBudgetRepository } from '../data/repositories/budgetRepository';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  ThemeToggleIconButton,
  useBFlowTheme,
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
import { AuthScreen } from '../features/auth/components/AuthScreen';
import {
  useBudgetStore,
  type BFlowWorkspaceTab,
} from '../features/budget/store/useBudgetStore';
import { ChecklistWorkspaceView } from '../features/checklist/components/ChecklistWorkspaceView';
import { DebtsFunfamiView } from '../features/debts/components/DebtsFunfamiView';
import { SavingsAndMotoIdealView } from '../features/savings/components/SavingsAndMotoIdealView';
import {
  registerWithPersonalProfile,
  sendPasswordRecoveryEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutCurrentUser,
  subscribeToAuthUser,
  type BFlowAuthUser,
  type RegisterPersonalAccountInput,
} from '../platform/auth/authAdapter';

const WORKSPACE_TABS: ReadonlyArray<{ id: BFlowWorkspaceTab; label: string }> = [
  { id: 'summary', label: 'Resumen' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'debts', label: 'Deudas' },
  { id: 'savings', label: 'Ahorros & Moto' },
  { id: 'analytics', label: 'Análisis & Cierre' },
];

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
    authUser,
    isSyncing,
    setActiveTab,
    setActiveMonthKey,
    setAuthUser,
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

  const triggerHaptic = async (type: 'success' | 'light') => {
    if (Platform.OS === 'web') return;
    try {
      if (type === 'success') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // Ignore haptics errors on unsupported devices
    }
  };

  const syncUserCloudAccount = async (user: BFlowAuthUser) => {
    setSyncStatus('Cargando tu presupuesto e historial...', true);
    try {
      const repo = new FirestoreBudgetRepository();
      const fullAccount = await repo.loadFullCloudAccount(user.uid);
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
      await syncUserCloudAccount(user);
      await triggerHaptic('success');
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
      await syncUserCloudAccount(user);
      await triggerHaptic('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No fue posible crear tu cuenta.';
      setAuthErrorMessage(msg);
      setSyncStatus(msg, false);
    }
  };

  const handleSignInWithGoogle = async () => {
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Conectando con tu cuenta de Google...', true);
    try {
      const user = await signInWithGoogle();
      setAuthUser(user);
      await syncUserCloudAccount(user);
      await triggerHaptic('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No fue posible conectar con Google.';
      setAuthErrorMessage(msg);
      setSyncStatus(msg, false);
    }
  };

  const handleSendPasswordRecovery = async (email: string) => {
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Enviando enlace de recuperación...', true);
    try {
      await sendPasswordRecoveryEmail(email);
      setAuthStatusMessage(
        `Enviamos un enlace de recuperación a ${email.trim()}. Revisa tu bandeja de entrada.`
      );
      setSyncStatus('Enlace de recuperación enviado.', false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'No fue posible enviar el correo de recuperación.';
      setAuthErrorMessage(msg);
      setSyncStatus(msg, false);
    }
  };

  const handleSignOut = async () => {
    await signOutCurrentUser();
    setAuthUser(null);
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Sesión cerrada correctamente.', false);
  };

  const activeDebts = useMemo(
    () => debtsByMonth[activeMonthKey] ?? debtsByMonth['2026-10'] ?? [],
    [activeMonthKey, debtsByMonth]
  );
  const activeSavingsBuckets = useMemo(
    () => savingsBucketsByMonth[activeMonthKey] ?? savingsBucketsByMonth['2026-10'] ?? [],
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

  const trackableEntries = useMemo(
    () =>
      entries.filter((e) => {
        const c = concepts.find((concept) => concept.id === e.conceptId);
        return e.monthKey === activeMonthKey && !c?.allowMultiplePerMonth;
      }),
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
        onSignInWithGoogle={handleSignInWithGoogle}
        onSendPasswordRecovery={handleSendPasswordRecovery}
      />
    );
  }

  const handleToggleEntry = async (entry: MonthEntry) => {
    const wasCompleted = entry.status === 'completed';
    await toggleEntryStatus(entry.id, toBogotaIsoDate());
    await triggerHaptic(wasCompleted ? 'light' : 'success');
  };

  const handleAddMovement = async (input: RegisterOrCompleteMovementInput) => {
    await addOrCompleteMovement(input);
    await triggerHaptic('success');
  };

  const handleSummaryOpenAddModal = (type: ConceptType = 'expense') => {
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
      await triggerHaptic('success');
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
    await closeCurrentMonth();
    await triggerHaptic('success');
  };

  const cb300fDebt = debtSummary.debts.find((d) => d.debtId === 'debt_cb300f_moto');
  const espIaDebt = debtSummary.debts.find((d) => d.debtId === 'debt_esp_ia');
  const funfamiEntry = entries.find(
    (e) => e.monthKey === activeMonthKey && e.conceptId === 'exp_cuota_funfami'
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background.primary }}
      contentContainerStyle={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xxxl,
        paddingBottom: spacing.xxl,
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

      {/* Authenticated User Personal Profile & Cloud Session Card */}
      <GlassSurface testID="authenticated-user-profile-card">
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <AppText variant="headline" testID="authenticated-user-name">
              {`Hola, ${authUser.displayName ?? 'Usuario BFlow'}`}
            </AppText>
            <AppText variant="micro" color={colors.text.secondary}>
              {`${authUser.email ?? authUser.uid}${authUser.phone ? ` · ${authUser.phone}` : ''}`}
            </AppText>
            {authUser.financialGoal ? (
              <AppText variant="micro" color={colors.semantic.moto}>
                {`Meta: ${authUser.financialGoal}`}
              </AppText>
            ) : null}
          </View>

          <Pressable
            testID="sign-out-button"
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
            onPress={handleSignOut}
            style={{
              minHeight: MIN_TOUCH_TARGET_PT,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              backgroundColor: colors.glass.surfaceElevatedTint,
              borderWidth: 1,
              borderColor: colors.glass.specularBorder,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText variant="caption">Cerrar sesión</AppText>
          </Pressable>
        </View>
      </GlassSurface>

      {/* Floating iOS 26 Liquid Glass Navigation Tab Bar */}
      <GlassSurface elevated testID="liquid-glass-tab-bar">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {WORKSPACE_TABS.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                testID={`workspace-tab-${tab.id}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setActiveTab(tab.id)}
                style={{
                  flexGrow: 1,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.pill,
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
                <AppText
                  variant="caption"
                  color={isSelected ? colors.text.primary : colors.text.secondary}
                >
                  {tab.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>

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
                <AppText variant="headline">Control Deuda FUNFAMI</AppText>
                <StatusBadge
                  label={
                    debtSummary.isInstallmentPaid
                      ? `Cuota ${formatCop(debtSummary.appliedInstallmentThisMonth)} Pagada`
                      : `Cuota ${formatCop(funfamiEntry?.plannedAmount ?? 1_800_000)} Pendiente`
                  }
                  status={debtSummary.isInstallmentPaid ? 'debt' : 'pending'}
                />
              </View>
              <CurrencyText
                testID="total-debt-amount"
                amount={debtSummary.totalRemainingDebt}
                variant="title2"
                tone="debt"
              />
              <AppText variant="caption" color={colors.text.secondary}>
                {`CB300F - MOTO: ${formatCop(cb300fDebt?.remainingBalance ?? 0)} · ESP. IA: ${formatCop(espIaDebt?.remainingBalance ?? 0)}`}
              </AppText>
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
                <AppText variant="headline">Control Ahorros y Moto</AppText>
                <StatusBadge
                  label={`IDEAL Moto: ${formatCop(motoIdealSummary.excelRecurringMonthlyTotalCop)}/mes`}
                  status="moto"
                />
              </View>
              <CurrencyText
                testID="total-savings-amount"
                amount={savingsSummary.totalCurrentSavings}
                variant="title2"
                tone="moto"
              />
              <AppText variant="caption" color={colors.text.secondary}>
                {`Moto Ahora: ${formatCop(savingsSummary.moto.currentBalance)} · Ahorros Ahora: ${formatCop(savingsSummary.savings.currentBalance)} (Tras pendientes: ${formatCop(savingsSummary.savings.projectedAfterPendingExpenses)})`}
              </AppText>
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
                onPress={() => handleSummaryOpenAddModal('expense')}
                style={{
                  width: '100%',
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.semantic.incomeSoft,
                  borderWidth: 1,
                  borderColor: colors.semantic.income,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="caption" color={colors.semantic.income}>
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
                                ? colors.semantic.income
                                : colors.glass.subtleBorder,
                              justifyContent: 'center',
                            }}
                          >
                            <AppText variant="caption">
                              {`${concept.name}${concept.defaultAmount > 0 ? ` (${formatCop(concept.defaultAmount)})` : ' (Múltiple)'}`}
                            </AppText>
                          </Pressable>
                        );
                      })}

                      <Pressable
                        accessibilityRole="button"
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
                            ? colors.semantic.moto
                            : colors.glass.subtleBorder,
                          justifyContent: 'center',
                        }}
                      >
                        <AppText variant="caption">+ Crear nuevo ítem</AppText>
                      </Pressable>
                    </View>

                    {isSummaryCustomMode ? (
                      <View style={{ gap: spacing.xs }}>
                        <TextInput
                          value={summaryCustomName}
                          onChangeText={setSummaryCustomName}
                          placeholder="Nombre del nuevo ítem"
                          placeholderTextColor={colors.text.muted}
                          style={{
                            minHeight: MIN_TOUCH_TARGET_PT,
                            paddingHorizontal: spacing.md,
                            borderRadius: radius.md,
                            backgroundColor: colors.glass.surfaceTint,
                            borderWidth: 1,
                            borderColor: colors.glass.subtleBorder,
                            color: colors.text.primary,
                          }}
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

                    <TextInput
                      value={summaryAmountInput}
                      onChangeText={setSummaryAmountInput}
                      keyboardType="numeric"
                      placeholder="Monto en COP enteros"
                      placeholderTextColor={colors.text.muted}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                        color: colors.text.primary,
                      }}
                    />

                    <TextInput
                      value={summaryNoteInput}
                      onChangeText={setSummaryNoteInput}
                      placeholder="Nota opcional"
                      placeholderTextColor={colors.text.muted}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                        color: colors.text.primary,
                      }}
                    />

                    {summaryFormError ? (
                      <AppText variant="caption" color={colors.semantic.expense}>
                        {summaryFormError}
                      </AppText>
                    ) : null}

                    <Pressable
                      testID="summary-submit-movement-button"
                      accessibilityRole="button"
                      onPress={handleSummarySubmitMovement}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        borderRadius: radius.md,
                        backgroundColor: colors.semantic.incomeSoft,
                        borderWidth: 1,
                        borderColor: colors.semantic.income,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="body" color={colors.semantic.income}>
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
                        ? colors.semantic.completed
                        : colors.glass.subtleBorder,
                    }}
                  >
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      <AppText variant="body">{`${isDone ? '✓ ' : '○ '}${entry.conceptName}`}</AppText>
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
          onToggleEntry={handleToggleEntry}
          onAddOrCompleteMovement={handleAddMovement}
          onCreateCustomMovement={(input) => {
            void createCustomConceptAndMovement(input);
            void triggerHaptic('success');
          }}
          onUpdateConcept={(conceptId, updates) => {
            void updateConcept(conceptId, updates);
            void triggerHaptic('success');
          }}
          onDeleteConcept={(conceptId) => {
            void deleteConcept(conceptId);
            void triggerHaptic('light');
          }}
          onEditEntry={(entryId, updates) => {
            void editEntry(entryId, updates);
            void triggerHaptic('success');
          }}
          onDeleteEntry={(entryId) => {
            void deleteEntryById(entryId);
            void triggerHaptic('light');
          }}
          onRemoveRepeatableEntry={removeOrResetEntry}
        />
      ) : null}

      {activeTab === 'debts' ? (
        <DebtsFunfamiView
          debtSummary={debtSummary}
          funfamiEntry={funfamiEntry}
          onToggleFunfamiInstallment={handleToggleEntry}
          onUpdateFunfamiInstallmentAmount={(newAmountCop) => {
            void updateFunfamiInstallmentAmount(activeMonthKey, newAmountCop);
            void triggerHaptic('success');
          }}
          onCreateDebt={(input) => {
            void createDebt(activeMonthKey, input);
            void triggerHaptic('success');
          }}
          onUpdateDebt={(debtId, updates) => {
            void updateDebt(activeMonthKey, debtId, updates);
            void triggerHaptic('success');
          }}
          onDeleteDebt={(debtId) => {
            void deleteDebt(activeMonthKey, debtId);
            void triggerHaptic('light');
          }}
        />
      ) : null}

      {activeTab === 'savings' ? (
        <SavingsAndMotoIdealView
          savingsSummary={savingsSummary}
          motoIdealSummary={motoIdealSummary}
          onUpdateOpeningBalance={(bucketId, newBalanceCop) => {
            void updateSavingsOpeningBalance(activeMonthKey, bucketId, newBalanceCop);
            void triggerHaptic('success');
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
            void reopenClosedMonth(mk);
            void triggerHaptic('light');
          }}
          onDeleteOrRevertMonth={(mk) => {
            void deleteOrRevertMonth(mk);
            void triggerHaptic('light');
          }}
          onResetOctoberSeed={resetToOctober2026GoldenState}
        />
      ) : null}
    </ScrollView>
  );
}
