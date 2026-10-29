import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { FirestoreBudgetRepository } from '../data/repositories/budgetRepository';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
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
import { resolveRuntimeCapabilities } from '../platform/mode/runtimeMode';

const WORKSPACE_TABS: ReadonlyArray<{ id: BFlowWorkspaceTab; label: string }> = [
  { id: 'summary', label: 'Resumen' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'debts', label: 'Deudas' },
  { id: 'savings', label: 'Ahorros & Moto' },
  { id: 'analytics', label: 'Análisis & Cierre' },
];

export default function PhaseOneHomeScreen(): React.JSX.Element {
  const { colors, spacing, radius, mode, toggleTheme } = useBFlowTheme();
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
    syncMessage,
    isSyncing,
    setActiveTab,
    setActiveMonthKey,
    setAuthUser,
    setSyncStatus,
    applyFullCloudAccount,
    toggleEntryStatus,
    addOrCompleteMovement,
    removeOrResetEntry,
    closeCurrentMonth,
    resetToOctober2026GoldenState,
  } = useBudgetStore();

  const [pulseCount, setPulseCount] = useState(0);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [authStatusMessage, setAuthStatusMessage] = useState<string | null>(null);

  const runtime = resolveRuntimeCapabilities();
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
    setSyncStatus('Cargando tu presupuesto e historial desde Cloud Firestore...', true);
    try {
      const repo = new FirestoreBudgetRepository();
      const fullAccount = await repo.loadFullCloudAccount(user.uid);
      applyFullCloudAccount(fullAccount);
      setSyncStatus(
        `Sincronizado en Cloud Firestore (${fullAccount.entries.length} movimientos · ${fullAccount.availableMonths.length} ${fullAccount.availableMonths.length === 1 ? 'mes' : 'meses'})`,
        false
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al sincronizar con Firestore';
      setSyncStatus(`Aviso Firestore: ${message}`, false);
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

  const handleSignInWithEmail = async (email: string, password: string) => {
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Verificando credenciales en Firebase Auth...', true);
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

  const handleCloseMonth = async () => {
    await closeCurrentMonth();
    await triggerHaptic('success');
  };

  const handleTestHaptic = async () => {
    setPulseCount((prev) => prev + 1);
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
        <View style={{ flex: 1, gap: spacing.xs }}>
          <StatusBadge testID="runtime-mode-badge" label={runtime.label} status="info" />
          <AppText variant="title1">{`BFlow · ${activeMonthLabel}`}</AppText>
        </View>

        <Pressable
          testID="theme-toggle-button"
          accessibilityRole="button"
          accessibilityLabel="Cambiar tema claro u oscuro"
          onPress={toggleTheme}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            minWidth: MIN_TOUCH_TARGET_PT,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            backgroundColor: colors.glass.surfaceElevatedTint,
            borderWidth: 1,
            borderColor: colors.glass.specularBorder,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText variant="caption">{mode === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</AppText>
        </Pressable>
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
            <AppText variant="micro" color={colors.text.muted}>
              {syncMessage}
            </AppText>
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
                  Flujo Neto (En caja hoy · B6)
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
                  Ingresos Recibidos (B2)
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
                  Gastos Pagados (B4)
                </AppText>
                <CurrencyText amount={budget.paidExpenses} variant="title2" tone="expense" />
                <AppText variant="micro" color={colors.semantic.pending}>
                  {`Pendientes (B5): ${formatCop(budget.pendingExpenses)}`}
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
                <AppText variant="headline">Control Deuda FUNFAMI (H6)</AppText>
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
                <AppText variant="headline">Control Ahorros y Moto (K6)</AppText>
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
                accessibilityLabel="Ir a Checklist para agregar nuevo movimiento"
                onPress={() => setActiveTab('checklist')}
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
                  + Agregar o Registrar Nuevo Movimiento
                </AppText>
              </Pressable>

              {trackableEntries.map((entry) => {
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

          <Pressable
            testID="haptic-verification-button"
            accessibilityRole="button"
            accessibilityLabel="Verificar respuesta táctil y tubería Fase 1"
            onPress={handleTestHaptic}
            style={{
              minHeight: MIN_TOUCH_TARGET_PT,
              borderRadius: radius.lg,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              backgroundColor: colors.semantic.incomeSoft,
              borderWidth: 1,
              borderColor: colors.semantic.income,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="headline" color={colors.semantic.income}>
              {pulseCount === 0
                ? 'Probar Haptics & Liquid Glass (Fase 1)'
                : `Tubería Verificada (${pulseCount} ${pulseCount === 1 ? 'toque' : 'toques'})`}
            </AppText>
          </Pressable>
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
          onRemoveRepeatableEntry={removeOrResetEntry}
        />
      ) : null}

      {activeTab === 'debts' ? (
        <DebtsFunfamiView
          debtSummary={debtSummary}
          funfamiEntry={funfamiEntry}
          onToggleFunfamiInstallment={handleToggleEntry}
        />
      ) : null}

      {activeTab === 'savings' ? (
        <SavingsAndMotoIdealView
          savingsSummary={savingsSummary}
          motoIdealSummary={motoIdealSummary}
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
          onResetOctoberSeed={resetToOctober2026GoldenState}
        />
      ) : null}
    </ScrollView>
  );
}
