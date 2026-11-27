import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import {
  AmbientParticles,
  AppPressable,
  AppText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  type PlatformSkinId,
  ResponsiveColumns,
  ScrollDepthHero,
  ScrollRevealSection,
  StatusBadge,
  ThemeToggleIconButton,
  hapticService,
  useBFlowTheme,
  useResponsiveLayout,
} from '../../../design-system';
import type { BFlowAuthUser } from '../../../platform/auth/authAdapter';
import { getCooldownRemainingMs, startCooldown } from '../../../platform/auth/authRateLimiter';
import { useSafeInsets } from '../../../platform/insets/useSafeInsets';
import { formatAppVersionLabel } from '../../../platform/mode/appVersion';
import { useCountdown } from '../hooks/useCountdown';
import { AccountEmailForm, AccountPasswordCard, ProfileDetailsForm } from './AccountProfileForms';

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
    photoUrl?: string;
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

const ManualSyncButton = React.memo(function ManualSyncButton({
  isSyncing,
  onManualSync,
}: {
  isSyncing: boolean;
  onManualSync: () => void;
}): React.JSX.Element {
  const { colors, radius, minTouchTarget } = useBFlowTheme();
  const syncCooldown = useCountdown(() => getCooldownRemainingMs('manual_sync'));
  const isSyncWaiting = syncCooldown.secondsLeft > 0;

  const handleManualSync = () => {
    hapticService.light();
    onManualSync();
    startCooldown('manual_sync');
    syncCooldown.refresh();
  };

  return (
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
        minHeight: minTouchTarget,
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
  );
});

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
  const { colors, mode, radius, spacing, skin, skinSpec, minTouchTarget } = useBFlowTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeInsets();

  // The profile and email forms own their field state (R-17); a new key resets them each
  // time the window opens.
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileFormsKey, setProfileFormsKey] = useState(0);
  const [confirmingAccountReset, setConfirmingAccountReset] = useState(false);
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);

  const hasProfilePhoto =
    Boolean(authUser.photoUrl?.trim()) && failedPhotoUrl !== (authUser.photoUrl ?? null);
  const isPasswordAccount = authUser.authProvider !== 'google.com';

  const userInitials = (authUser.displayName ?? 'BF')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

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
                  overflow: 'hidden',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {hasProfilePhoto && authUser.photoUrl ? (
                  <Image
                    testID="account-profile-avatar-image"
                    source={{ uri: authUser.photoUrl }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                    onError={() => setFailedPhotoUrl(authUser.photoUrl ?? null)}
                  />
                ) : (
                  <AppText variant="headline" color={colors.text.primary}>
                    {userInitials || 'BF'}
                  </AppText>
                )}
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
              <ManualSyncButton isSyncing={isSyncing} onManualSync={onManualSync} />
            ) : null}
          </View>
          </GlassSurface>
        </ScrollDepthHero>

        <View style={{ gap: spacing.md }}>
          {/* 2. Appearance: Light / Dark Theme Toggle (moved from workspace header, ADR 0033) */}
          <ScrollRevealSection>
            <GlassSurface elevated testID="account-appearance-card">
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.md,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <AppText variant="headline">Apariencia</AppText>
                  <AppText variant="caption" color={colors.text.secondary}>
                    {mode === 'dark' ? 'Modo oscuro activo' : 'Modo claro activo'}
                  </AppText>
                </View>
                <ThemeToggleIconButton testID="theme-toggle-button" />
              </View>
            </GlassSurface>
          </ScrollRevealSection>

          {/* 3. Account Configuration: Action Button to Open Dedicated Profile Update Window */}
          <ScrollRevealSection>
            <GlassSurface elevated testID="account-settings-card">
            <View style={{ gap: spacing.xs }}>
              <View style={{ gap: 2 }}>
                <AppText variant="headline">Configuración de Perfil</AppText>
                <AppText variant="caption" color={colors.text.secondary}>
                  Actualiza tu foto de perfil, nombre, meta de ahorro, correo y contraseña.
                </AppText>
              </View>

              <AppPressable
                testID="open-profile-settings-button"
                accessibilityRole="button"
                accessibilityLabel="Actualizar mis datos de perfil"
                onPress={() => {
                  hapticService.light();
                  setProfileFormsKey((key) => key + 1);
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
            // iOS page sheets start below the status bar; Android and Web are edge to edge.
            paddingTop: skinSpec.pageSheetTopInset ?? Math.max(insets.top, spacing.md),
          }}
        >
          {isProfileModalOpen ? <AmbientParticles /> : null}

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: layout.gutter,
                paddingTop: spacing.sm,
                paddingBottom: spacing.xxl,
              }}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={{
                  width: '100%',
                  maxWidth: layout.contentMaxWidth,
                  alignSelf: 'center',
                  gap: spacing.md,
                }}
              >
                {/* Window Navigation Bar */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: spacing.sm,
                    paddingVertical: spacing.xs,
                  }}
                >
                  <AppPressable
                    testID="close-profile-settings-modal"
                    accessibilityRole="button"
                    accessibilityLabel="Volver al menú de cuenta"
                    onPress={() => {
                      hapticService.light();
                      setIsProfileModalOpen(false);
                    }}
                    style={{
                      minHeight: minTouchTarget,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.pill,
                      borderCurve: 'continuous',
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

                  <AppText variant="title2" style={{ flexShrink: 1, textAlign: 'center' }}>
                    Actualizar Datos
                  </AppText>

                  {/* Symmetrical spacer */}
                  <View style={{ width: 72 }} />
                </View>

                {/* Compact Identity Banner */}
                <GlassSurface elevated testID="profile-modal-identity-banner">
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: spacing.md,
                      flexWrap: 'wrap',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                        flex: 1,
                        minWidth: 180,
                      }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: radius.pill,
                          backgroundColor: colors.accent.container,
                          borderWidth: 1.2,
                          borderColor: colors.accent.primary,
                          overflow: 'hidden',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        {hasProfilePhoto && authUser.photoUrl ? (
                          <Image
                            testID="profile-modal-avatar-image"
                            source={{ uri: authUser.photoUrl }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                            onError={() => setFailedPhotoUrl(authUser.photoUrl ?? null)}
                          />
                        ) : (
                          <AppText
                            variant="headline"
                            color={colors.accent.onContainer}
                            style={{ fontWeight: '700' }}
                          >
                            {userInitials || 'BF'}
                          </AppText>
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <AppText variant="headline" numberOfLines={1}>
                          {authUser.displayName ?? 'Usuario BFlow'}
                        </AppText>
                        <AppText variant="caption" color={colors.text.secondary} numberOfLines={1}>
                          {authUser.email ?? 'Sin correo'}
                        </AppText>
                      </View>
                    </View>

                    <View
                      style={{
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 5,
                        borderRadius: radius.pill,
                        borderCurve: 'continuous',
                        backgroundColor: colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                      }}
                    >
                      <AppText
                        variant="caption"
                        color={colors.text.secondary}
                        style={{ fontWeight: '600' }}
                      >
                        {isPasswordAccount ? 'Correo' : 'Google'}
                      </AppText>
                    </View>
                  </View>
                </GlassSurface>

                <ResponsiveColumns testID="profile-modal-columns">
                  <ProfileDetailsForm
                    key={`profile-${profileFormsKey}`}
                    authUser={authUser}
                    onUpdateProfile={onUpdateProfile}
                  />

                  <View style={{ gap: spacing.md }}>
                    <AccountEmailForm
                      key={`email-${profileFormsKey}`}
                      authUser={authUser}
                      onRequestEmailChange={onRequestEmailChange}
                      onSendEmailVerification={onSendEmailVerification}
                    />

                    {isPasswordAccount ? (
                      <AccountPasswordCard
                        key={`password-${profileFormsKey}`}
                        email={authUser.email}
                        onSendPasswordReset={onSendPasswordReset}
                      />
                    ) : null}
                  </View>
                </ResponsiveColumns>
              </View>
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
        {formatAppVersionLabel(APP_EDITION_LABEL[skin])}
      </AppText>
    </View>
  );
}
