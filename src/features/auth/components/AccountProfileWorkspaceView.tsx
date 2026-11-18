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
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  type PlatformSkinId,
  ResponsiveColumns,
  ScrollDepthHero,
  ScrollRevealSection,
  StatusBadge,
  useBFlowTheme,
} from '../../../design-system';
import type { BFlowAuthUser } from '../../../platform/auth/authAdapter';
import { getCooldownRemainingMs, startCooldown } from '../../../platform/auth/authRateLimiter';
import { useSafeInsets } from '../../../platform/insets/useSafeInsets';
import { useCountdown } from '../hooks/useCountdown';
import { AccountEmailForm, ProfileDetailsForm } from './AccountProfileForms';

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

  // The profile and email forms own their field state (R-17); a new key resets them each
  // time the window opens.
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileFormsKey, setProfileFormsKey] = useState(0);
  const [confirmingAccountReset, setConfirmingAccountReset] = useState(false);

  // Contraseña
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isPasswordBusy, setIsPasswordBusy] = useState(false);

  // Límites de uso (ADR 0026): espera entre sincronizaciones y entre enlaces de contraseña.
  const syncCooldown = useCountdown(() => getCooldownRemainingMs('manual_sync'));
  const passwordResetCooldown = useCountdown(() => getCooldownRemainingMs('password_reset_email'));
  const isSyncWaiting = syncCooldown.secondsLeft > 0;
  const isPasswordResetWaiting = passwordResetCooldown.secondsLeft > 0;

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
        <ScrollDepthHero>
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
        </ScrollDepthHero>

        <View style={{ gap: spacing.md }}>
          {/* 2. Account Configuration: Action Button to Open Dedicated Profile Update Window */}
          <ScrollRevealSection>
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
                  setProfileFormsKey((key) => key + 1);
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
          </ScrollRevealSection>

          {/* 4. Danger Zone: Reset Entire Account (Transferred from Cierre) */}
          <ScrollRevealSection>
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
          </ScrollRevealSection>
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

              <ProfileDetailsForm
                key={`profile-${profileFormsKey}`}
                authUser={authUser}
                onUpdateProfile={onUpdateProfile}
              />

              {/* Correo de acceso: verificación y cambio, con los correos de Firebase Auth */}
              <AccountEmailForm
                key={`email-${profileFormsKey}`}
                authUser={authUser}
                onRequestEmailChange={onRequestEmailChange}
                onSendEmailVerification={onSendEmailVerification}
              />

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
