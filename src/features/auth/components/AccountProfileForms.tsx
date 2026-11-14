/**
 * src/features/auth/components/AccountProfileForms.tsx
 *
 * The two forms of the profile window that have text fields: profile details and sign-in
 * email. Each owns its field state, so typing re-renders only that form and never the
 * account screen behind the window (same pattern as the checklist forms, R-17). The parent
 * mounts them with a new `key` each time the window opens, which resets them.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  EyeIcon,
  EyeOffIcon,
  FormMessage,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
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
import { useCountdown } from '../hooks/useCountdown';

/** Shown while the email change is locked; the button carries the time left. */
const EMAIL_CHANGE_LOCKED_NOTICE = `Demasiados intentos fallidos. Por seguridad, el cambio de correo queda bloqueado ${formatWaitTime(PASSWORD_LOCKOUT_MS)} en este dispositivo. Si olvidaste tu contraseña, restablécela desde la tarjeta Contraseña.`;

export interface ProfileDetailsFormProps {
  authUser: BFlowAuthUser;
  onUpdateProfile?: (updates: {
    displayName?: string;
    financialGoal?: string;
  }) => Promise<'saved' | 'queued' | void> | void;
}

export const ProfileDetailsForm = React.memo(function ProfileDetailsForm({
  authUser,
  onUpdateProfile,
}: ProfileDetailsFormProps): React.JSX.Element {
  const { colors, radius, spacing } = useBFlowTheme();
  const [displayName, setDisplayName] = useState(authUser.displayName ?? '');
  const [financialGoal, setFinancialGoal] = useState(authUser.financialGoal ?? '');
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

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

  return (
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
  );
});

export interface AccountEmailFormProps {
  authUser: BFlowAuthUser;
  /** Pide el cambio de correo: Firebase envía un enlace de confirmación al correo nuevo. */
  onRequestEmailChange?: (newEmail: string, currentPassword: string) => Promise<void> | void;
  /** Envía el correo de verificación a una cuenta que aún no lo ha verificado. */
  onSendEmailVerification?: () => Promise<void> | void;
}

export const AccountEmailForm = React.memo(function AccountEmailForm({
  authUser,
  onRequestEmailChange,
  onSendEmailVerification,
}: AccountEmailFormProps): React.JSX.Element {
  const { colors, radius, spacing } = useBFlowTheme();
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [isEmailBusy, setIsEmailBusy] = useState(false);

  // Límites de uso (ADR 0026): espera entre correos y bloqueo tras cinco contraseñas
  // equivocadas al cambiar el correo.
  const verificationCooldown = useCountdown(() => getCooldownRemainingMs('verification_email'));
  const emailChangeLockout = useCountdown(
    () => getAuthAttemptStatus('reauth_email_change').retryAfterMs
  );
  const isVerificationWaiting = verificationCooldown.secondsLeft > 0;
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

  return (
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
  );
});
