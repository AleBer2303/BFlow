/**
 * src/features/auth/components/AccountProfileForms.tsx
 *
 * The isolated form cards inside the "Actualizar Datos" modal: profile details, sign-in
 * email, and password reset. Each owns its field state and cooldown timer, so typing or
 * ticking timers re-renders only that card and never the account screen behind the window
 * (same pattern as the checklist forms, R-17).
 */

import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  EyeIcon,
  EyeOffIcon,
  FormMessage,
  GlassSurface,
  hapticService,
  StatusBadge,
  useBFlowTheme,
  usePrimaryActionLook,
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
import { pickAndCompressProfilePhoto } from '../../../platform/media/profilePhotoPicker';
import { useCountdown } from '../hooks/useCountdown';

/** Shown while the email change is locked; the button carries the time left. */
const EMAIL_CHANGE_LOCKED_NOTICE = `Demasiados intentos fallidos. Por seguridad, el cambio de correo queda bloqueado ${formatWaitTime(PASSWORD_LOCKOUT_MS)} en este dispositivo. Si olvidaste tu contraseña, restablécela desde la tarjeta Contraseña.`;

export interface ProfileDetailsFormProps {
  authUser: BFlowAuthUser;
  onUpdateProfile?: (updates: {
    displayName?: string;
    financialGoal?: string;
    photoUrl?: string;
  }) => Promise<'saved' | 'queued' | void> | void;
}

export const ProfileDetailsForm = React.memo(function ProfileDetailsForm({
  authUser,
  onUpdateProfile,
}: ProfileDetailsFormProps): React.JSX.Element {
  const { colors, radius, spacing, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const [displayName, setDisplayName] = useState(authUser.displayName ?? '');
  const [financialGoal, setFinancialGoal] = useState(authUser.financialGoal ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(authUser.photoUrl);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    setPhotoUrl(authUser.photoUrl);
    setPhotoLoadFailed(false);
  }, [authUser.photoUrl]);

  const initials = (displayName || authUser.displayName || 'BF')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  const handlePickProfilePhoto = async () => {
    if (!onUpdateProfile || isUpdatingPhoto) return;
    hapticService.light();
    setProfileErrorMsg(null);
    setProfileSuccessMsg(null);
    setIsUpdatingPhoto(true);
    try {
      const picked = await pickAndCompressProfilePhoto();
      if (picked.status === 'cancelled') {
        return;
      }
      if (picked.status === 'error') {
        setProfileErrorMsg(picked.message);
        return;
      }
      setPhotoUrl(picked.dataUri);
      setPhotoLoadFailed(false);
      const outcome = await onUpdateProfile({ photoUrl: picked.dataUri });
      hapticService.trigger('success');
      setProfileSuccessMsg(
        outcome === 'queued'
          ? 'Foto guardada en este dispositivo. Se sincronizará al conectar.'
          : 'Foto de perfil actualizada correctamente'
      );
      setTimeout(() => setProfileSuccessMsg(null), 3000);
    } catch (err) {
      setPhotoUrl(authUser.photoUrl);
      setPhotoLoadFailed(false);
      setProfileErrorMsg(
        err instanceof Error ? err.message : 'No se pudo guardar tu foto de perfil.'
      );
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const handleRemoveProfilePhoto = async () => {
    if (!onUpdateProfile || isUpdatingPhoto || !photoUrl) return;
    hapticService.light();
    setProfileErrorMsg(null);
    setProfileSuccessMsg(null);
    setIsUpdatingPhoto(true);
    const previousPhoto = photoUrl;
    try {
      setPhotoUrl(undefined);
      const outcome = await onUpdateProfile({ photoUrl: '' });
      hapticService.trigger('success');
      setProfileSuccessMsg(
        outcome === 'queued'
          ? 'Cambio guardado en este dispositivo. Se sincronizará al conectar.'
          : 'Foto de perfil eliminada'
      );
      setTimeout(() => setProfileSuccessMsg(null), 3000);
    } catch (err) {
      setPhotoUrl(previousPhoto);
      setProfileErrorMsg(
        err instanceof Error ? err.message : 'No se pudo eliminar tu foto de perfil.'
      );
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!onUpdateProfile) return;
    hapticService.light();
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
      hapticService.trigger('success');
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
      <View style={{ gap: spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.xs,
          }}
        >
          <AppText variant="headline">Datos de tu Perfil</AppText>
          <View
            style={{
              paddingHorizontal: spacing.xs,
              paddingVertical: 2,
              borderRadius: radius.pill,
              backgroundColor: colors.accent.container,
            }}
          >
            <AppText variant="micro" color={colors.accent.onContainer}>
              Identidad
            </AppText>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.sm,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.glass.surfaceTint,
            borderWidth: 1,
            borderColor: colors.glass.subtleBorder,
            flexWrap: 'wrap',
          }}
        >
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: radius.pill,
              backgroundColor: colors.accent.container,
              borderWidth: 1.5,
              borderColor: colors.accent.primary,
              overflow: 'hidden',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {photoUrl && !photoLoadFailed ? (
              <Image
                testID="profile-photo-preview"
                source={{ uri: photoUrl }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
                onError={() => setPhotoLoadFailed(true)}
              />
            ) : (
              <AppText variant="headline" color={colors.accent.onContainer}>
                {initials || 'BF'}
              </AppText>
            )}
          </View>

          <View style={{ flex: 1, minWidth: 160, gap: spacing.xs }}>
            <View style={{ gap: 2 }}>
              <AppText variant="callout" color={colors.text.primary}>
                Foto de perfil
              </AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                Reemplaza el icono de cuenta en la cabecera.
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <AppPressable
                testID="pick-profile-photo-button"
                accessibilityRole="button"
                accessibilityLabel={photoUrl ? 'Cambiar foto de perfil' : 'Agregar foto de perfil'}
                disabled={isUpdatingPhoto || !onUpdateProfile}
                onPress={handlePickProfilePhoto}
                style={{
                  minHeight: minTouchTarget,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  borderCurve: 'continuous',
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1,
                  borderColor: colors.glass.specularBorder,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="caption" color={colors.text.primary} style={{ fontWeight: '600' }}>
                  {isUpdatingPhoto
                    ? 'Procesando...'
                    : photoUrl
                      ? 'Cambiar foto'
                      : 'Agregar foto'}
                </AppText>
              </AppPressable>

              {photoUrl ? (
                <AppPressable
                  testID="remove-profile-photo-button"
                  accessibilityRole="button"
                  accessibilityLabel="Quitar foto de perfil"
                  disabled={isUpdatingPhoto || !onUpdateProfile}
                  onPress={handleRemoveProfilePhoto}
                  style={{
                    minHeight: minTouchTarget,
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
                  <AppText
                    variant="caption"
                    color={colors.semantic.expense}
                    style={{ fontWeight: '600' }}
                  >
                    Quitar
                  </AppText>
                </AppPressable>
              ) : null}
            </View>
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <View style={{ gap: spacing.xxs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Nombre
            </AppText>
            <AppTextInput
              testID="profile-input-name"
              placeholder="Tu nombre completo"
              value={displayName}
              onChangeText={(text) => {
                setDisplayName(text);
                if (profileErrorMsg) setProfileErrorMsg(null);
              }}
              autoCapitalize="words"
              maxLength={PROFILE_DISPLAY_NAME_MAX_LENGTH}
            />
          </View>

          <View style={{ gap: spacing.xxs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Meta financiera
            </AppText>
            <AppTextInput
              testID="profile-input-goal"
              placeholder="Ej. Ahorro para un proyecto personal"
              value={financialGoal}
              onChangeText={(text) => {
                setFinancialGoal(text);
                if (profileErrorMsg) setProfileErrorMsg(null);
              }}
              maxLength={PROFILE_FINANCIAL_GOAL_MAX_LENGTH}
            />
          </View>
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
            width: '100%',
            minHeight: minTouchTarget,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            ...primaryAction.container,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText
            variant="headline"
            color={primaryAction.labelColor ?? colors.text.primary}
          >
            {isSavingProfile ? 'Guardando...' : 'Guardar Cambios de Perfil'}
          </AppText>
        </AppPressable>
      </View>
    </GlassSurface>
  );
});

const EmailCardHeader = React.memo(function EmailCardHeader({
  email,
  emailVerified,
}: {
  email?: string | null;
  emailVerified?: boolean;
}): React.JSX.Element {
  const { colors, radius, spacing } = useBFlowTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: spacing.xs,
        }}
      >
        <AppText variant="headline">Correo electrónico</AppText>
        {emailVerified !== undefined ? (
          <StatusBadge
            testID="account-email-status-badge"
            label={emailVerified ? 'Verificado' : 'Sin verificar'}
            status={emailVerified ? 'completed' : 'pending'}
          />
        ) : null}
      </View>

      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: colors.glass.surfaceTint,
          borderWidth: 1,
          borderColor: colors.glass.subtleBorder,
          gap: 2,
        }}
      >
        <AppText variant="micro" color={colors.text.muted}>
          Correo actual
        </AppText>
        <AppText
          variant="callout"
          color={colors.text.primary}
          numberOfLines={1}
          testID="account-email-current"
        >
          {email ?? 'Sin correo'}
        </AppText>
      </View>
    </View>
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
  const { colors, radius, spacing, minTouchTarget } = useBFlowTheme();
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
    width: '100%',
    minHeight: minTouchTarget,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.glass.surfaceTint,
    borderWidth: 1,
    borderColor: colors.glass.specularBorder,
    justifyContent: 'center',
    alignItems: 'center',
  } as const;

  const handleSendEmailVerification = async () => {
    if (!onSendEmailVerification) return;
    hapticService.light();
    setEmailError(null);
    setEmailSuccess(null);
    setIsEmailBusy(true);
    try {
      await onSendEmailVerification();
      startCooldown('verification_email');
      verificationCooldown.refresh();
      hapticService.trigger('success');
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
    hapticService.light();
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
      hapticService.trigger('success');
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
      <View style={{ gap: spacing.md }}>
        <EmailCardHeader email={authUser.email} emailVerified={authUser.emailVerified} />

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
            <AppText variant="callout" color={colors.text.primary}>
              {isVerificationWaiting
                ? `Podrás reenviarlo en ${verificationCooldown.secondsLeft} s`
                : 'Enviar correo de verificación'}
            </AppText>
          </AppPressable>
        ) : null}

        {isPasswordAccount ? (
          <View
            style={{
              gap: spacing.sm,
              paddingTop: spacing.sm,
              borderTopWidth: 1,
              borderTopColor: colors.glass.subtleBorder,
            }}
          >
            <View style={{ gap: 2 }}>
              <AppText variant="callout" color={colors.text.primary}>
                Cambiar correo
              </AppText>
              <AppText variant="micro" color={colors.text.muted}>
                Te enviaremos un enlace de confirmación al correo nuevo.
              </AppText>
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Nuevo correo
              </AppText>
              <AppTextInput
                testID="change-email-input"
                placeholder="nuevo.correo@ejemplo.com"
                value={newEmail}
                onChangeText={(text) => {
                  setNewEmail(text);
                  if (emailError) setEmailError(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
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
                  onChangeText={(text) => {
                    setCurrentPassword(text);
                    if (emailError) setEmailError(null);
                  }}
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
                  onPress={() => {
                    hapticService.selection();
                    setShowCurrentPassword((previous) => !previous);
                  }}
                  style={{
                    minHeight: minTouchTarget,
                    minWidth: minTouchTarget,
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
            </View>

            <AppPressable
              testID="request-email-change-button"
              accessibilityRole="button"
              disabled={isEmailBusy || isEmailChangeLocked}
              onPress={handleRequestEmailChange}
              style={secondaryButtonStyle}
            >
              <AppText variant="callout" color={colors.text.primary}>
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

export interface AccountPasswordCardProps {
  email?: string | null;
  onSendPasswordReset?: () => Promise<void> | void;
}

export const AccountPasswordCard = React.memo(function AccountPasswordCard({
  email,
  onSendPasswordReset,
}: AccountPasswordCardProps): React.JSX.Element {
  const { colors, radius, spacing, minTouchTarget } = useBFlowTheme();
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isPasswordBusy, setIsPasswordBusy] = useState(false);
  const passwordResetCooldown = useCountdown(() => getCooldownRemainingMs('password_reset_email'));
  const isPasswordResetWaiting = passwordResetCooldown.secondsLeft > 0;

  const handleSendPasswordReset = async () => {
    if (!onSendPasswordReset) return;
    hapticService.light();
    setPasswordError(null);
    setPasswordSuccess(null);
    setIsPasswordBusy(true);
    try {
      await onSendPasswordReset();
      startCooldown('password_reset_email');
      passwordResetCooldown.refresh();
      hapticService.trigger('success');
      setPasswordSuccess(
        `Enviamos a ${email ?? 'tu correo'} un enlace para definir una nueva contraseña. Revisa también el correo no deseado.`
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
    <GlassSurface elevated testID="account-password-card">
      <View style={{ gap: spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.xs,
          }}
        >
          <AppText variant="headline">Contraseña</AppText>
          <View
            style={{
              paddingHorizontal: spacing.xs,
              paddingVertical: 2,
              borderRadius: radius.pill,
              backgroundColor: colors.glass.surfaceTint,
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
            }}
          >
            <AppText variant="micro" color={colors.text.secondary}>
              Seguridad
            </AppText>
          </View>
        </View>

        <AppText variant="caption" color={colors.text.secondary}>
          {`Recibirás un enlace en ${email ?? 'tu correo'} para definir una nueva contraseña.`}
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
          style={{
            width: '100%',
            minHeight: minTouchTarget,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.glass.surfaceTint,
            borderWidth: 1,
            borderColor: colors.glass.specularBorder,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText variant="callout" color={colors.text.primary}>
            {isPasswordBusy
              ? 'Enviando enlace...'
              : isPasswordResetWaiting
                ? `Podrás pedir otro enlace en ${passwordResetCooldown.secondsLeft} s`
                : 'Restablecer contraseña'}
          </AppText>
        </AppPressable>
      </View>
    </GlassSurface>
  );
});
