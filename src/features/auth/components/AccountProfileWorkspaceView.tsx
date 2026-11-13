import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import {
  AppPressable,
  AppText,
  FormMessage,
  AppTextInput,
  EyeIcon,
  EyeOffIcon,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  type PlatformSkinId,
  ResponsiveColumns,
  StatusBadge,
  useBFlowTheme,
} from '../../../design-system';
import {
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  PROFILE_FINANCIAL_GOAL_MAX_LENGTH,
  type BFlowAuthUser,
} from '../../../platform/auth/authAdapter';
import {
  PASSWORD_LOCKOUT_MS,
  formatWaitTime,
  getAuthAttemptStatus,
  getCooldownRemainingMs,
  startCooldown,
} from '../../../platform/auth/authRateLimiter';
import { useSafeInsets } from '../../../platform/insets/useSafeInsets';
import { useCountdown } from '../hooks/useCountdown';

/** Shown while the email change is locked; the button carries the time left. */
const EMAIL_CHANGE_LOCKED_NOTICE = `Demasiados intentos fallidos. Por seguridad, el cambio de correo queda bloqueado ${formatWaitTime(PASSWORD_LOCKOUT_MS)} en este dispositivo. Si olvidaste tu contraseña, restablécela desde la tarjeta Contraseña.`;

/** Edition shown beside the version: the material of the running platform skin. */
const APP_EDITION_LABEL: Record<PlatformSkinId, string> = {
  ios: 'Liquid Glass',
  android: 'Material 3',
  web: 'Web',
};

export interface AccountProfileWorkspaceViewProps {
  authUser: BFlowAuthUser;
  syncStatusMessage: string;
  isSyncing: boolean;
  onSignOut: () => void;
  onManualSync?: () => void;
  /**
   * Guarda el nombre y la meta. Resuelve `queued` si el cambio quedó en el dispositivo a la
   * espera de conexión y rechaza con un mensaje para el usuario si no se pudo guardar.
   */
  onUpdateProfile?: (updates: {
    displayName?: string;
    financialGoal?: string;
  }) => Promise<'saved' | 'queued' | void> | void;
  /** Envía al correo de la cuenta el enlace para definir una nueva contraseña (ADR 0025). */
  onSendPasswordReset?: () => Promise<void> | void;
  /** Pide el cambio de correo: Firebase envía un enlace de confirmación al correo nuevo. */
  onRequestEmailChange?: (newEmail: string, currentPassword: string) => Promise<void> | void;
  /** Envía el correo de verificación a una cuenta que aún no lo ha verificado. */
  onSendEmailVerification?: () => Promise<void> | void;
  onResetFullAccount?: () => void;
  testID?: string;
}

/**
 * Account & Profile workspace screen.
 * Displays user identity, allows editing user name and financial goal, changing the sign-in
 * email, requesting a password reset (both through Firebase Authentication emails, ADR 0025),
 * executing account reset, and signing out.
 * Technical details are removed; only a discrete app version watermark remains at the end.
 */
export function AccountProfileWorkspaceView({
  authUser,
  syncStatusMessage,
  isSyncing,
  onSignOut,
  onManualSync,
  onUpdateProfile,
  onSendPasswordReset,
  onRequestEmailChange,
  onSendEmailVerification,
  onResetFullAccount,
  testID = 'account-profile-workspace-view',
}: AccountProfileWorkspaceViewProps): React.JSX.Element {
  const { colors, radius, spacing, skin } = useBFlowTheme();
  const insets = useSafeInsets();

  // Profile form state
  const [displayName, setDisplayName] = useState(authUser.displayName ?? '');
  const [financialGoal, setFinancialGoal] = useState(authUser.financialGoal ?? '');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [confirmingAccountReset, setConfirmingAccountReset] = useState(false);

  // Correo de acceso
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [isEmailBusy, setIsEmailBusy] = useState(false);

  // Contraseña
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isPasswordBusy, setIsPasswordBusy] = useState(false);

  // Límites de uso (ADR 0026): espera entre correos y entre sincronizaciones, y bloqueo
  // tras cinco contraseñas equivocadas al cambiar el correo.
  const syncCooldown = useCountdown(() => getCooldownRemainingMs('manual_sync'));
  const verificationCooldown = useCountdown(() => getCooldownRemainingMs('verification_email'));
  const passwordResetCooldown = useCountdown(() => getCooldownRemainingMs('password_reset_email'));
  const emailChangeLockout = useCountdown(
    () => getAuthAttemptStatus('reauth_email_change').retryAfterMs
  );
  const isSyncWaiting = syncCooldown.secondsLeft > 0;
  const isVerificationWaiting = verificationCooldown.secondsLeft > 0;
  const isPasswordResetWaiting = passwordResetCooldown.secondsLeft > 0;
  const isEmailChangeLocked = emailChangeLockout.secondsLeft > 0;

  const isPasswordAccount = authUser.authProvider !== 'google.com';

  const secondaryButtonStyle = {
    minHeight: MIN_TOUCH_TARGET_PT,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.glass.surfaceTint,
    borderWidth: 1,
    borderColor: colors.glass.subtleBorder,
    justifyContent: 'center',
    alignItems: 'center',
  } as const;

  const userInitials = (authUser.displayName ?? 'BF')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  const handleSaveProfile = async () => {
    if (!onUpdateProfile) return;
    setProfileSuccessMsg(null);
    if (!displayName.trim()) {
      setProfileErrorMsg('Escribe tu nombre.');
      return;
    }

    setProfileErrorMsg(null);
    setIsSavingProfile(true);
    try {
      const outcome = await onUpdateProfile({
        displayName: displayName.trim(),
        financialGoal: financialGoal.trim(),
      });
      setProfileSuccessMsg(
        outcome === 'queued'
          ? 'Perfil guardado en este dispositivo. Se sincronizará al conectar.'
          : 'Perfil actualizado correctamente'
      );
      setTimeout(() => setProfileSuccessMsg(null), 3000);
    } catch (err) {
      // El cambio se revirtió: el formulario vuelve a mostrar lo que quedó guardado.
      setDisplayName(authUser.displayName ?? '');
      setFinancialGoal(authUser.financialGoal ?? '');
      setProfileErrorMsg(
        err instanceof Error ? err.message : 'No se pudo guardar tu perfil. Inténtalo de nuevo.'
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSendEmailVerification = async () => {
    if (!onSendEmailVerification) return;
    setEmailError(null);
    setEmailSuccess(null);
    setIsEmailBusy(true);
    try {
      await onSendEmailVerification();
      startCooldown('verification_email');
      verificationCooldown.refresh();
      setEmailSuccess(
        `Enviamos un enlace de verificación a ${authUser.email ?? 'tu correo'}. Ábrelo para verificarlo.`
      );
    } catch (err) {
      setEmailError(
        err instanceof Error ? err.message : 'No fue posible enviar el correo de verificación.'
      );
    } finally {
      setIsEmailBusy(false);
    }
  };

  const handleRequestEmailChange = async () => {
    if (!onRequestEmailChange) return;
    const targetEmail = newEmail.trim().toLowerCase();
    setEmailSuccess(null);

    if (!targetEmail.includes('@')) {
      setEmailError('Escribe el nuevo correo electrónico.');
      return;
    }
    if (targetEmail === (authUser.email ?? '').trim().toLowerCase()) {
      setEmailError('Ese ya es el correo de tu cuenta.');
      return;
    }
    if (!currentPassword) {
      setEmailError('Escribe tu contraseña actual para confirmar el cambio.');
      return;
    }

    setEmailError(null);
    setIsEmailBusy(true);
    try {
      await onRequestEmailChange(targetEmail, currentPassword);
      setEmailSuccess(
        `Enviamos un enlace de confirmación a ${targetEmail}. Ábrelo para completar el cambio y después inicia sesión con ese correo.`
      );
      setNewEmail('');
      setCurrentPassword('');
    } catch (err) {
      // Si este fallo bloqueó la acción, el aviso de bloqueo sustituye al mensaje.
      setEmailError(
        getAuthAttemptStatus('reauth_email_change').isLocked
          ? null
          : err instanceof Error
            ? err.message
            : 'No fue posible pedir el cambio de correo.'
      );
    } finally {
      emailChangeLockout.refresh();
      setIsEmailBusy(false);
    }
  };

  const handleManualSync = () => {
    if (!onManualSync) return;
    onManualSync();
    startCooldown('manual_sync');
    syncCooldown.refresh();
  };

  const handleSendPasswordReset = async () => {
    if (!onSendPasswordReset) return;
    setPasswordError(null);
    setPasswordSuccess(null);
    setIsPasswordBusy(true);
    try {
      await onSendPasswordReset();
      startCooldown('password_reset_email');
      passwordResetCooldown.refresh();
      setPasswordSuccess(
        `Enviamos a ${authUser.email ?? 'tu correo'} un enlace para definir una nueva contraseña. Revisa también el correo no deseado.`
      );
    } catch (err) {
      setPasswordError(
        err instanceof Error
          ? err.message
          : 'No fue posible enviar el enlace para restablecer la contraseña.'
      );
    } finally {
      setIsPasswordBusy(false);
    }
  };

  return (
    <View testID={testID} style={{ gap: spacing.md }}>
      {/* Wide windows: profile on the left, settings and the danger zone on the right. */}
      <ResponsiveColumns testID="account-panels">
        {/* 1. Primary Account & Cloud Profile Card */}
        <GlassSurface elevated testID="authenticated-user-profile-card">
          <View style={{ gap: spacing.md }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
              }}
            >
              {/* Elegant User Avatar / Monogram */}
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: radius.pill,
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1.2,
                  borderColor: colors.glass.specularBorder,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="headline" color={colors.text.primary}>
                  {userInitials || 'BF'}
                </AppText>
              </View>

              <View style={{ flex: 1, gap: spacing.xxs }}>
                <AppText variant="headline" testID="authenticated-user-name">
                  {`Hola, ${authUser.displayName ?? 'Usuario BFlow'}`}
                </AppText>
                <AppText variant="caption" color={colors.text.secondary}>
                  {authUser.email ?? authUser.uid}
                </AppText>
                {authUser.financialGoal ? (
                  <AppText variant="micro" color={colors.semantic.reserve}>
                    {`Meta: ${authUser.financialGoal}`}
                  </AppText>
                ) : null}
              </View>
            </View>

            {/* Cloud Synchronization Status */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: spacing.xs,
                borderTopWidth: 1,
                borderTopColor: colors.glass.subtleBorder,
              }}
            >
              <View style={{ gap: 2 }}>
                <AppText variant="caption" color={colors.text.secondary}>
                  Sincronización en la nube
                </AppText>
                <AppText variant="micro" color={colors.text.muted}>
                  {syncStatusMessage || (isSyncing ? 'Sincronizando...' : 'Conectado a Firestore')}
                </AppText>
              </View>
              <StatusBadge
                label={isSyncing ? 'Sincronizando' : 'En línea'}
                status={isSyncing ? 'pending' : 'completed'}
              />
            </View>

            {onManualSync ? (
              <AppPressable
                testID="manual-sync-button"
                accessibilityRole="button"
                accessibilityLabel={
                  isSyncWaiting
                    ? `Podrás sincronizar de nuevo en ${syncCooldown.secondsLeft} segundos`
                    : 'Sincronizar ahora'
                }
                onPress={handleManualSync}
                disabled={isSyncing || isSyncWaiting}
                style={{
                  minHeight: 40,
                  borderRadius: radius.pill,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.specularBorder,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="caption" color={colors.text.primary}>
                  {isSyncing
                    ? 'Sincronizando datos...'
                    : isSyncWaiting
                      ? `Podrás sincronizar de nuevo en ${syncCooldown.secondsLeft} s`
                      : 'Sincronizar datos ahora'}
                </AppText>
              </AppPressable>
            ) : null}
          </View>
        </GlassSurface>

        <View style={{ gap: spacing.md }}>
          {/* 2. Account Configuration: Action Button to Open Dedicated Profile Update Window */}
          <GlassSurface elevated testID="account-settings-card">
            <View style={{ gap: spacing.xs }}>
              <View style={{ gap: 2 }}>
                <AppText variant="headline">Configuración de Perfil</AppText>
                <AppText variant="caption" color={colors.text.secondary}>
                  Actualiza tu nombre, tu meta de ahorro, tu correo de acceso y tu contraseña.
                </AppText>
              </View>

              <AppPressable
                testID="open-profile-settings-button"
                accessibilityRole="button"
                accessibilityLabel="Actualizar mis datos de perfil"
                onPress={() => {
                  setDisplayName(authUser.displayName ?? '');
                  setFinancialGoal(authUser.financialGoal ?? '');
                  setProfileSuccessMsg(null);
                  setProfileErrorMsg(null);
                  setNewEmail('');
                  setCurrentPassword('');
                  setEmailError(null);
                  setEmailSuccess(null);
                  setPasswordError(null);
                  setPasswordSuccess(null);
                  setIsProfileModalOpen(true);
                }}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  marginTop: spacing.xs,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  borderCurve: 'continuous',
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1,
                  borderColor: colors.glass.specularBorder,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <AppText variant="caption" color={colors.text.primary} style={{ fontWeight: '600' }}>
                  Actualizar mis datos
                </AppText>
                <AppText variant="body" color={colors.text.secondary} style={{ fontWeight: '700' }}>
                  →
                </AppText>
              </AppPressable>
            </View>
          </GlassSurface>

          {/* 4. Danger Zone: Reset Entire Account (Transferred from Cierre) */}
          <GlassSurface elevated testID="reset-account-card">
            <View style={{ gap: spacing.sm }}>
              <View>
                <AppText variant="headline" color={colors.semantic.expense}>
                  Reiniciar Cuenta
                </AppText>
                <AppText variant="caption" color={colors.text.secondary}>
                  Si deseas comenzar desde cero, puedes reiniciar toda la cuenta.
                </AppText>
              </View>

              {!confirmingAccountReset ? (
                <AppPressable
                  testID="reset-full-account-button"
                  accessibilityRole="button"
                  onPress={() => setConfirmingAccountReset(true)}
                  style={{
                    width: '100%',
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.pill,
                    borderCurve: 'continuous',
                    backgroundColor: colors.semantic.expenseSoft,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="caption" color={colors.semantic.expense}>
                    Reiniciar Cuenta
                  </AppText>
                </AppPressable>
              ) : (
                <View
                  style={{
                    padding: spacing.sm,
                    borderRadius: radius.md,
                    borderCurve: 'continuous',
                    backgroundColor: colors.semantic.expenseSoft,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                    gap: spacing.xs,
                  }}
                >
                  <AppText variant="caption" color={colors.semantic.expense}>
                    ¿Estás seguro? Esta acción borrará tus meses actuales y abrirá el asistente de configuración inicial desde cero.
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    <AppPressable
                      testID="cancel-reset-full-account-button"
                      accessibilityRole="button"
                      onPress={() => setConfirmingAccountReset(false)}
                      style={{
                        flex: 1,
                        minHeight: MIN_TOUCH_TARGET_PT,
                        borderRadius: radius.pill,
                        backgroundColor: colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption">Cancelar</AppText>
                    </AppPressable>
                    <AppPressable
                      testID="confirm-reset-full-account-button"
                      accessibilityRole="button"
                      onPress={() => {
                        setConfirmingAccountReset(false);
                        onResetFullAccount?.();
                      }}
                      style={{
                        flex: 1,
                        minHeight: MIN_TOUCH_TARGET_PT,
                        borderRadius: radius.pill,
                        backgroundColor: colors.semantic.expense,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.text.primary} style={{ fontWeight: '600' }}>
                        Sí, reiniciar cuenta
                      </AppText>
                    </AppPressable>
                  </View>
                </View>
              )}
            </View>
          </GlassSurface>
        </View>
      </ResponsiveColumns>

      {/* Dedicated Profile Update Window (Modal) */}
      <Modal
        visible={isProfileModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsProfileModalOpen(false)}
        testID="profile-settings-modal"
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background.primary,
            // iOS page sheets start below the status bar; Android is edge to edge.
            paddingTop: Platform.OS === 'ios' ? 44 : Math.max(insets.top, spacing.md),
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{
                padding: spacing.md,
                gap: spacing.md,
                paddingBottom: spacing.xxl,
              }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Window Navigation Bar */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: spacing.xs,
                }}
              >
                <AppPressable
                  testID="close-profile-settings-modal"
                  accessibilityRole="button"
                  accessibilityLabel="Volver al menú de cuenta"
                  onPress={() => setIsProfileModalOpen(false)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.pill,
                    backgroundColor: colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="caption" color={colors.text.primary} style={{ fontWeight: '600' }}>
                    ← Volver
                  </AppText>
                </AppPressable>

                <AppText variant="title2">Actualizar Datos</AppText>

                {/* Symmetrical placeholder */}
                <View style={{ width: 70 }} />
              </View>

              {/* Form Card */}
              <GlassSurface elevated testID="account-profile-form-card">
                <View style={{ gap: spacing.sm }}>
                  <AppText variant="headline">Datos de tu Perfil</AppText>
                  <AppText variant="caption" color={colors.text.secondary}>
                    Actualiza la información con la que te identificas y tu meta personal.
                  </AppText>

                  <View style={{ gap: spacing.xs, marginTop: spacing.xxs }}>
                    <AppText variant="micro" color={colors.text.muted}>
                      Nombre de usuario / Mostrar como
                    </AppText>
                    <AppTextInput
                      testID="profile-input-name"
                      placeholder="Tu nombre completo"
                      value={displayName}
                      onChangeText={setDisplayName}
                      autoCapitalize="words"
                      maxLength={PROFILE_DISPLAY_NAME_MAX_LENGTH}
                    />

                    <AppText variant="micro" color={colors.text.muted}>
                      Meta financiera personal
                    </AppText>
                    <AppTextInput
                      testID="profile-input-goal"
                      placeholder="Ej. Ahorro para un proyecto personal"
                      value={financialGoal}
                      onChangeText={setFinancialGoal}
                      maxLength={PROFILE_FINANCIAL_GOAL_MAX_LENGTH}
                    />
                  </View>

                  <FormMessage
                    message={profileSuccessMsg}
                    tone="success"
                    testID="profile-success-banner"
                  />
                  <FormMessage message={profileErrorMsg} testID="profile-error-banner" />

                  <AppPressable
                    testID="save-profile-settings-button"
                    accessibilityRole="button"
                    accessibilityLabel="Guardar cambios de perfil"
                    disabled={isSavingProfile}
                    onPress={handleSaveProfile}
                    style={{
                      minHeight: MIN_TOUCH_TARGET_PT,
                      borderRadius: radius.pill,
                      borderCurve: 'continuous',
                      backgroundColor: colors.glass.surfaceElevatedTint,
                      borderWidth: 1,
                      borderColor: colors.glass.specularBorder,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginTop: spacing.xs,
                    }}
                  >
                    <AppText variant="caption" color={colors.text.primary} style={{ fontWeight: '600' }}>
                      {isSavingProfile ? 'Guardando...' : 'Guardar Cambios de Perfil'}
                    </AppText>
                  </AppPressable>
                </View>
              </GlassSurface>

              {/* Correo de acceso: verificación y cambio, con los correos de Firebase Auth */}
              <GlassSurface elevated testID="account-email-card">
                <View style={{ gap: spacing.sm }}>
                  <AppText variant="headline">Correo electrónico</AppText>

                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: spacing.xs,
                    }}
                  >
                    <View style={{ flexShrink: 1, gap: 2 }}>
                      <AppText variant="micro" color={colors.text.muted}>
                        Correo de acceso actual
                      </AppText>
                      <AppText
                        variant="caption"
                        color={colors.text.primary}
                        style={{ fontWeight: '600' }}
                        testID="account-email-current"
                      >
                        {authUser.email ?? 'Sin correo'}
                      </AppText>
                    </View>
                    {authUser.emailVerified !== undefined ? (
                      <StatusBadge
                        testID="account-email-status-badge"
                        label={authUser.emailVerified ? 'Verificado' : 'Sin verificar'}
                        status={authUser.emailVerified ? 'completed' : 'pending'}
                      />
                    ) : null}
                  </View>

                  <FormMessage message={emailSuccess} tone="success" testID="email-success-banner" />
                  <FormMessage
                    message={isEmailChangeLocked ? EMAIL_CHANGE_LOCKED_NOTICE : emailError}
                    testID="email-error-banner"
                  />

                  {authUser.emailVerified === false ? (
                    <AppPressable
                      testID="send-email-verification-button"
                      accessibilityRole="button"
                      disabled={isEmailBusy || isVerificationWaiting}
                      onPress={handleSendEmailVerification}
                      style={secondaryButtonStyle}
                    >
                      <AppText variant="caption" color={colors.text.primary} style={{ fontWeight: '600' }}>
                        {isVerificationWaiting
                          ? `Podrás reenviarlo en ${verificationCooldown.secondsLeft} s`
                          : 'Enviar correo de verificación'}
                      </AppText>
                    </AppPressable>
                  ) : null}

                  {isPasswordAccount ? (
                    <View style={{ gap: spacing.xs }}>
                      <AppText variant="caption" color={colors.text.secondary}>
                        Para cambiarlo, abre el enlace de confirmación que enviaremos al correo nuevo.
                        Después tendrás que iniciar sesión con el
                        correo nuevo.
                      </AppText>

                      <AppText variant="micro" color={colors.text.muted}>
                        Nuevo correo electrónico
                      </AppText>
                      <AppTextInput
                        testID="change-email-input"
                        placeholder="nuevo.correo@ejemplo.com"
                        value={newEmail}
                        onChangeText={setNewEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />

                      <AppText variant="micro" color={colors.text.muted}>
                        Contraseña actual
                      </AppText>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          borderRadius: radius.md,
                          borderCurve: 'continuous',
                          backgroundColor: colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor: colors.glass.subtleBorder,
                        }}
                      >
                        <AppTextInput
                          testID="change-email-password-input"
                          placeholder="Confirma que eres tú"
                          value={currentPassword}
                          onChangeText={setCurrentPassword}
                          secureTextEntry={!showCurrentPassword}
                          autoCapitalize="none"
                          autoComplete="current-password"
                          style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 0 }}
                        />
                        <AppPressable
                          testID="change-email-password-toggle"
                          accessibilityRole="button"
                          accessibilityLabel={
                            showCurrentPassword ? 'Ocultar contraseña actual' : 'Ver contraseña actual'
                          }
                          onPress={() => setShowCurrentPassword((previous) => !previous)}
                          style={{
                            minHeight: MIN_TOUCH_TARGET_PT,
                            minWidth: MIN_TOUCH_TARGET_PT,
                            justifyContent: 'center',
                            alignItems: 'center',
                            paddingHorizontal: spacing.sm,
                          }}
                        >
                          {showCurrentPassword ? (
                            <EyeIcon size={20} color={colors.text.secondary} />
                          ) : (
                            <EyeOffIcon size={20} color={colors.text.secondary} />
                          )}
                        </AppPressable>
                      </View>

                      <AppPressable
                        testID="request-email-change-button"
                        accessibilityRole="button"
                        disabled={isEmailBusy || isEmailChangeLocked}
                        onPress={handleRequestEmailChange}
                        style={{ ...secondaryButtonStyle, marginTop: spacing.xxs }}
                      >
                        <AppText variant="caption" color={colors.text.primary} style={{ fontWeight: '600' }}>
                          {isEmailBusy
                            ? 'Enviando enlace...'
                            : isEmailChangeLocked
                              ? `Podrás intentarlo en ${formatWaitTime(emailChangeLockout.secondsLeft * 1000)}`
                              : 'Enviar enlace de confirmación'}
                        </AppText>
                      </AppPressable>
                    </View>
                  ) : (
                    <AppText variant="caption" color={colors.text.secondary}>
                      Tu cuenta entra con Google: el correo y la contraseña se gestionan allí.
                    </AppText>
                  )}
                </View>
              </GlassSurface>

              {/* Contraseña: enlace de restablecimiento de Firebase Auth */}
              {isPasswordAccount ? (
                <GlassSurface elevated testID="account-password-card">
                  <View style={{ gap: spacing.sm }}>
                    <AppText variant="headline">Contraseña</AppText>
                    <AppText variant="caption" color={colors.text.secondary}>
                      {`Enviaremos a ${authUser.email ?? 'tu correo'} un enlace para definir una nueva contraseña. Después tendrás que iniciar sesión nuevamente.`}
                    </AppText>

                    <FormMessage
                      message={passwordSuccess}
                      tone="success"
                      testID="security-success-banner"
                    />
                    <FormMessage message={passwordError} testID="security-error-banner" />

                    <AppPressable
                      testID="send-password-reset-button"
                      accessibilityRole="button"
                      disabled={isPasswordBusy || isPasswordResetWaiting}
                      onPress={handleSendPasswordReset}
                      style={secondaryButtonStyle}
                    >
                      <AppText variant="caption" color={colors.text.primary} style={{ fontWeight: '600' }}>
                        {isPasswordBusy
                          ? 'Enviando enlace...'
                          : isPasswordResetWaiting
                            ? `Podrás pedir otro enlace en ${passwordResetCooldown.secondsLeft} s`
                            : 'Restablecer contraseña'}
                      </AppText>
                    </AppPressable>
                  </View>
                </GlassSurface>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 5. Safe Sign Out Button */}
      <AppPressable
        testID="sign-out-button"
        accessibilityRole="button"
        accessibilityLabel="Cerrar sesión"
        onPress={onSignOut}
        style={{
          minHeight: MIN_TOUCH_TARGET_PT,
          borderRadius: radius.pill,
          borderCurve: 'continuous',
          backgroundColor: colors.glass.surfaceTint,
          borderWidth: 1,
          borderColor: colors.glass.specularBorder,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <AppText variant="body" color={colors.semantic.expense}>
          Cerrar Sesión
        </AppText>
      </AppPressable>

      {/* 6. Discrete app version indicator at the very end */}
      <AppText
        variant="micro"
        color={colors.text.muted}
        style={{
          textAlign: 'center',
          opacity: 0.6,
          marginTop: spacing.xs,
          marginBottom: spacing.lg,
        }}
      >
        {`BFlow v1.0.0 (${APP_EDITION_LABEL[skin]})`}
      </AppText>
    </View>
  );
}
