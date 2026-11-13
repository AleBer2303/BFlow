import React, { useCallback, useDeferredValue, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { AppState } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import {
  cancelCloudWidgetSnapshotWrite,
  flushCloudWidgetSnapshotWrite,
} from '../data/repositories/widgetSnapshotRepository';
import { Entrance, hapticService, type HapticType } from '../design-system';
import { formatMonthKeyLabelEs } from '../domain';
import { AnalyticsTab } from '../features/analytics/components/AnalyticsTab';
import { AccountTab, type AccountTabProps } from '../features/auth/components/AccountTab';
import { AuthScreen, type AuthScreenProps } from '../features/auth/components/AuthScreen';
import { EmailVerificationScreen } from '../features/auth/components/EmailVerificationScreen';
import {
  havePersistedAccountFieldsChanged,
  type PersistedAccountFields,
} from '../features/budget/store/persistedAccountFields';
import { useBudgetStore } from '../features/budget/store/useBudgetStore';
import { ChecklistTab } from '../features/checklist/components/ChecklistTab';
import { DebtsTab } from '../features/debts/components/DebtsTab';
import { InitialAccountSetupView } from '../features/onboarding/components/InitialAccountSetupView';
import { SavingsTab } from '../features/savings/components/SavingsTab';
import { WorkspaceShell } from '../features/shell/components/WorkspaceShell';
import { SummaryTab } from '../features/summary/components/SummaryTab';
import {
  hasPendingEmailChange,
  refreshAccountIdentity,
  requestEmailChange,
  sendPasswordResetLink,
  sendVerificationEmail,
} from '../platform/auth/accountEmailActions';
import {
  formatAuthError,
  registerWithPersonalProfile,
  requiresEmailVerification,
  signInWithEmail,
  signOutCurrentUser,
  subscribeToAuthUser,
  type BFlowAuthUser,
  type RegisterPersonalAccountInput,
} from '../platform/auth/authAdapter';
import { isDemoModeEnabled } from '../platform/mode/demoMode';
import { markPerf } from '../platform/perf/perfMarks';
import {
  clearPersistedAccount,
  flushPendingPersistedAccount,
  schedulePersistedAccountSave,
} from '../platform/storage/accountCache';
import {
  clearWidgetData,
  parseWidgetDeepLinkTab,
  subscribeWidgetAuthBridge,
} from '../platform/widgets';

const triggerHaptic = (type: HapticType) => {
  hapticService.trigger(type);
};

/**
 * Correo de la cuenta de Firebase con sesión iniciada. Las sesiones locales (modo vitrina,
 * tests) no tienen cuenta en Firebase Auth, así que no pueden pedir correos.
 */
function requireFirebaseAccountEmail(): string {
  const user = useBudgetStore.getState().authUser;
  if (!user || user.provider !== 'firebase' || !user.email) {
    throw new Error('Esta acción solo está disponible con una cuenta real de BFlow.');
  }
  return user.email;
}

type AuthGateScreenProps = Omit<AuthScreenProps, 'isSubmitting' | 'statusMessage'> & {
  isAwaitingInitialHydration: boolean;
  authStatusMessage: string | null;
};

/**
 * Auth screen with its own subscription to the sync status, so status messages never
 * re-render the workspace (PERFORMANCE_AUDIT_2026-11-09, R-15).
 */
function AuthGateScreen({
  isAwaitingInitialHydration,
  authStatusMessage,
  ...authProps
}: AuthGateScreenProps): React.JSX.Element {
  const { syncMessage, isSyncing } = useBudgetStore(
    useShallow((state) => ({ syncMessage: state.syncMessage, isSyncing: state.isSyncing }))
  );
  return (
    <AuthScreen
      {...authProps}
      isSubmitting={isSyncing || isAwaitingInitialHydration}
      statusMessage={
        isAwaitingInitialHydration
          ? syncMessage || 'Cargando tu presupuesto e historial...'
          : authStatusMessage
      }
    />
  );
}

/**
 * Orchestrator: authentication gate, session and persistence effects, shell and dock.
 * Each tab is a container that subscribes only to the data it shows.
 */
export default function PhaseOneHomeScreen(): React.JSX.Element {
  const {
    activeTab,
    activeMonthKey,
    needsOnboarding,
    authUser,
    isAccountHydrated,
    pendingOfflineWritesCount,
    setActiveTab,
    syncActiveWidget,
    flushOfflineWrites,
    completeInitialAccountSetup,
  } = useBudgetStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      activeMonthKey: state.activeMonthKey,
      needsOnboarding: state.needsOnboarding,
      authUser: state.authUser,
      isAccountHydrated: state.isAccountHydrated,
      pendingOfflineWritesCount: state.pendingOfflineWritesCount,
      setActiveTab: state.setActiveTab,
      syncActiveWidget: state.syncActiveWidget,
      flushOfflineWrites: state.flushOfflineWrites,
      completeInitialAccountSetup: state.completeInitialAccountSetup,
    }))
  );

  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [authStatusMessage, setAuthStatusMessage] = useState<string | null>(null);

  const activeMonthLabel = formatMonthKeyLabelEs(activeMonthKey);

  const syncInFlightRef = React.useRef<Map<string, Promise<void>>>(new Map());

  const syncUserCloudAccount = useCallback(
    async (
      user: BFlowAuthUser,
      options?: { isRegistration?: boolean; forceFullSync?: boolean }
    ): Promise<void> => {
      const activePromise = syncInFlightRef.current.get(user.uid);
      if (activePromise) {
        return activePromise;
      }

      const runSync = (async () => {
        try {
          await useBudgetStore.getState().syncUserCloudAccount(user, options);
        } finally {
          syncInFlightRef.current.delete(user.uid);
        }
      })();

      syncInFlightRef.current.set(user.uid, runSync);
      return runSync;
    },
    []
  );

  useEffect(() => {
    markPerf('first_render');
  }, []);

  // Automatic session restoration listener in live runtime.
  // The local showcase (demo) mode never talks to Firebase, so it keeps its seeded session.
  useEffect(() => {
    if (process.env.NODE_ENV === 'test' || isDemoModeEnabled()) {
      return;
    }
    const { authUser: initialUser, setAuthUser } = useBudgetStore.getState();
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
  }, [syncUserCloudAccount]);

  // Credenciales de los widgets nativos: les permiten refrescarse desde Firestore con la app
  // cerrada (ADR 0021). El modo vitrina no usa Firebase.
  useEffect(() => {
    if (process.env.NODE_ENV === 'test' || isDemoModeEnabled()) {
      return;
    }
    return subscribeWidgetAuthBridge();
  }, []);

  // Tocar un widget abre la app en su pestaña: bflow://?tab=checklist
  useEffect(() => {
    const openTabFromUrl = (url: string | null) => {
      const tab = parseWidgetDeepLinkTab(url);
      if (tab) {
        useBudgetStore.getState().setActiveTab(tab);
      }
    };
    void Linking.getInitialURL().then(openTabFromUrl).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => openTabFromUrl(url));
    return () => subscription.remove();
  }, []);

  // Debounced auto-save of store mutations to local encrypted persistent storage (R-06)
  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    let lastSaved: PersistedAccountFields | null = null;
    const unsubscribe = useBudgetStore.subscribe((state) => {
      const uid = state.authUser?.uid;
      if (!uid || uid === 'local-owner' || uid === 'local-demo' || !state.isAccountHydrated) {
        return;
      }
      if (havePersistedAccountFieldsChanged(lastSaved, state)) {
        lastSaved = state;
        schedulePersistedAccountSave(uid, {
          activeMonthKey: state.activeMonthKey,
          availableMonths: state.availableMonths,
          concepts: state.concepts,
          entries: state.entries,
          debtsByMonth: state.debtsByMonth,
          debtPayments: state.debtPayments,
          savingsBucketsByMonth: state.savingsBucketsByMonth,
          provisionPlan: state.idealMotoPlan,
          closedSnapshots: state.closedSnapshots,
          needsOnboarding: state.needsOnboarding,
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Real-time WidgetKit synchronization & Cache flush: triggers on mount and whenever user leaves app / switches to background
  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    void syncActiveWidget();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        flushPendingPersistedAccount();
        void syncActiveWidget().then(() => flushCloudWidgetSnapshotWrite());
      } else if (nextAppState === 'active') {
        void flushOfflineWrites();
        // Tras pedir un cambio de correo, al volver se comprueba si ya se confirmó: Firebase
        // revoca la sesión y el SDK la cierra, sin esperar a que venza el token.
        if (hasPendingEmailChange()) {
          void refreshAccountIdentity()
            .then((refreshed) => {
              if (refreshed) {
                useBudgetStore.getState().setAuthUser(refreshed);
              }
            })
            .catch(() => undefined);
        }
      }
    });

    return () => {
      subscription.remove();
      flushPendingPersistedAccount();
    };
  }, [syncActiveWidget, flushOfflineWrites]);

  const handleSignInWithEmail = useCallback(
    async (email: string, password: string) => {
      const { setSyncStatus, setAuthUser } = useBudgetStore.getState();
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
    },
    [syncUserCloudAccount]
  );

  const handleRegisterPersonalAccount = useCallback(
    async (input: RegisterPersonalAccountInput) => {
      const { setSyncStatus, setAuthUser } = useBudgetStore.getState();
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
    },
    [syncUserCloudAccount]
  );

  // Recuperación desde el inicio de sesión: Firebase Auth envía el enlace (ADR 0025).
  // La pantalla muestra el resultado; aquí solo se refleja el progreso.
  const handleSendPasswordRecovery = useCallback(async (email: string) => {
    const { setSyncStatus } = useBudgetStore.getState();
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Enviando enlace de restablecimiento...', true);
    try {
      await sendPasswordResetLink(email);
      setSyncStatus('Enlace de restablecimiento enviado.', false);
    } catch (err) {
      const msg = formatAuthError(
        err,
        'No fue posible enviar el enlace para restablecer la contraseña.'
      );
      setSyncStatus(msg, false);
      throw new Error(msg);
    }
  }, []);

  const handleResendVerificationEmail = useCallback(async () => {
    triggerHaptic('light');
    try {
      await sendVerificationEmail();
    } catch (err) {
      throw new Error(formatAuthError(err, 'No fue posible enviar el correo de verificación.'));
    }
  }, []);

  const handleCheckEmailVerification = useCallback(async (): Promise<boolean> => {
    try {
      const refreshed = await refreshAccountIdentity();
      if (!refreshed) {
        return false;
      }
      useBudgetStore.getState().setAuthUser(refreshed);
      const isVerified = !requiresEmailVerification(refreshed);
      if (isVerified) {
        triggerHaptic('success');
      }
      return isVerified;
    } catch (err) {
      throw new Error(formatAuthError(err, 'No fue posible comprobar la verificación.'));
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    const outgoingUid = useBudgetStore.getState().authUser?.uid;
    // Lo pendiente de la cuenta saliente se sube antes de perder la sesión; luego los widgets
    // de este dispositivo se vacían para no seguir mostrando sus cifras.
    // Sin red, setDoc no resuelve: se espera como mucho 2 s (es una caché derivada).
    await Promise.race([
      flushCloudWidgetSnapshotWrite(),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
    cancelCloudWidgetSnapshotWrite();
    await signOutCurrentUser();
    clearWidgetData();
    if (outgoingUid) {
      clearPersistedAccount(outgoingUid);
    }
    const { clearWorkspaceSession, setSyncStatus } = useBudgetStore.getState();
    clearWorkspaceSession();
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setSyncStatus('Sesión cerrada correctamente.', false);
  }, []);

  const handleManualSync = useCallback(() => {
    const currentUser = useBudgetStore.getState().authUser;
    if (!currentUser) return;
    triggerHaptic('light');
    void syncUserCloudAccount(currentUser, { forceFullSync: true });
  }, [syncUserCloudAccount]);

  const handleUpdateProfile = useCallback<NonNullable<AccountTabProps['onUpdateProfile']>>(
    async (updates) => {
      const status = await useBudgetStore.getState().updateAuthUserProfile(updates);
      if (status === 'rejected') {
        // El store ya revirtió el cambio; el formulario muestra el motivo.
        throw new Error('No se pudo guardar tu perfil en la nube. Inténtalo de nuevo.');
      }
      triggerHaptic('success');
      return status === 'queued' ? 'queued' : 'saved';
    },
    []
  );

  const handleAccountSendPasswordReset = useCallback(async () => {
    triggerHaptic('light');
    try {
      await sendPasswordResetLink(requireFirebaseAccountEmail());
    } catch (err) {
      throw new Error(
        formatAuthError(err, 'No fue posible enviar el enlace para restablecer la contraseña.')
      );
    }
  }, []);

  const handleAccountRequestEmailChange = useCallback(
    async (newEmail: string, currentPassword: string) => {
      triggerHaptic('light');
      try {
        requireFirebaseAccountEmail();
        await requestEmailChange(newEmail, currentPassword);
      } catch (err) {
        throw new Error(formatAuthError(err, 'No fue posible pedir el cambio de correo.'));
      }
    },
    []
  );

  const handleAccountSendEmailVerification = useCallback(async () => {
    triggerHaptic('light');
    try {
      requireFirebaseAccountEmail();
      await sendVerificationEmail();
    } catch (err) {
      throw new Error(formatAuthError(err, 'No fue posible enviar el correo de verificación.'));
    }
  }, []);

  const handleResetFullAccount = useCallback(() => {
    triggerHaptic('warning');
    void useBudgetStore.getState().resetFullAccount();
  }, []);

  // The navigation shows the new tab at once; the tab's content mounts as a transition. A
  // heavy tab (Checklist, most visible on Android) used to mount in the same frame as the
  // tap, so the indicator and the press feedback froze until it
  // finished. Meanwhile the previous tab stays on screen instead of a blank frame.
  const contentTab = useDeferredValue(activeTab);

  const isAwaitingInitialHydration =
    Boolean(authUser) && !isAccountHydrated && !needsOnboarding;

  // PUERTA DE VERIFICACIÓN (ADR 0025): la cuenta recién creada no entra al presupuesto hasta
  // abrir el enlace que envía Firebase Auth. La sincronización inicial sigue en segundo plano.
  if (authUser && requiresEmailVerification(authUser)) {
    return (
      <EmailVerificationScreen
        email={authUser.email}
        onResendVerification={handleResendVerificationEmail}
        onCheckVerification={handleCheckEmailVerification}
        onSignOut={handleSignOut}
      />
    );
  }

  // AUTHENTICATION GATE: If no authenticated user session is active (or initial cloud hydration is in flight without local cache), render AuthScreen first
  if (!authUser || isAwaitingInitialHydration) {
    return (
      <AuthGateScreen
        isAwaitingInitialHydration={isAwaitingInitialHydration}
        authStatusMessage={authStatusMessage}
        errorMessage={authErrorMessage}
        onSignInWithEmail={handleSignInWithEmail}
        onRegisterPersonalAccount={handleRegisterPersonalAccount}
        onSendPasswordRecovery={handleSendPasswordRecovery}
      />
    );
  }

  return (
    <WorkspaceShell
      monthLabel={activeMonthLabel}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      showNavigation={!needsOnboarding}
      pendingSyncCount={pendingOfflineWritesCount}
    >
      {needsOnboarding ? (
        <InitialAccountSetupView
          onCompleteSetup={(config) => {
            void completeInitialAccountSetup(config);
            void triggerHaptic('success');
          }}
        />
      ) : (
        // Keyed by tab: the incoming screen fades in and rises once, on the native driver.
        <Entrance key={contentTab} kind="screen" testID="workspace-tab-content">
          {contentTab === 'summary' ? <SummaryTab /> : null}
          {contentTab === 'checklist' ? <ChecklistTab /> : null}
          {contentTab === 'debts' ? <DebtsTab /> : null}
          {contentTab === 'savings' ? <SavingsTab /> : null}
          {contentTab === 'analytics' ? <AnalyticsTab /> : null}
          {contentTab === 'account' ? (
            <AccountTab
              onSignOut={handleSignOut}
              onManualSync={handleManualSync}
              onUpdateProfile={handleUpdateProfile}
              onSendPasswordReset={handleAccountSendPasswordReset}
              onRequestEmailChange={handleAccountRequestEmailChange}
              onSendEmailVerification={handleAccountSendEmailVerification}
              onResetFullAccount={handleResetFullAccount}
            />
          ) : null}
        </Entrance>
      )}
    </WorkspaceShell>
  );
}
