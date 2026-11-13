/**
 * src/features/auth/components/AuthScreen.tsx
 *
 * Full-screen Authentication & Personal Registration Gate (`01-auth`), following `DESIGN.md`.
 * iOS and Android show the centered card; the web skin shows a header and a split hero
 * (copy beside the form) built to `.agents/skills/design-taste-frontend`:
 * - Supports Sign-In (`email` + `password`), Personal Account Registration (`displayName`, `phone`,
 *   `financialGoal`, `email`, `password`), and Password Recovery with Firebase
 * - Includes password visibility toggle while typing
 * - Zero hardcoded hex values; uses semantic tokens from `useBFlowTheme()` and >= 44pt touch targets
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  FormMessage,
  AppTextInput,
  EyeIcon,
  EyeOffIcon,
  GlassSurface,
  KeyboardAwareScrollView,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  ThemeToggleIconButton,
  WebAppHeader,
  useBFlowTheme,
  usePrimaryActionLook,
  useResponsiveLayout,
} from '../../../design-system';
import type { RegisterPersonalAccountInput } from '../../../platform/auth/authAdapter';
import {
  confirmPasswordResetWithCode as defaultConfirmPasswordReset,
  requestPasswordResetCode as defaultRequestPasswordResetCode,
} from '../../../platform/auth/verificationCodeService';

export type AuthFormMode = 'login' | 'register' | 'recover';

const AUTH_CARD_MAX_WIDTH_PT = 460;
const WEB_HERO_FLEX = 7;
const WEB_FORM_FLEX = 5;
const WEB_HERO_MEASURE_PT = 560;

/** First-screen copy of the web skin: the category and who it is for, how it works, one fact. */
export const WEB_HERO_COPY = {
  headline: 'Presupuesto mensual para tus finanzas personales',
  subline:
    'Registra ingresos y gastos, marca cada pago del mes y sigue tus deudas y ahorros en un solo lugar, sincronizado entre tu teléfono y el navegador.',
  fact: 'Una cuenta, tres plataformas: iOS, Android y Web.',
} as const;

export interface AuthScreenProps {
  initialMode?: AuthFormMode;
  isSubmitting: boolean;
  errorMessage: string | null;
  statusMessage: string | null;
  onSignInWithEmail: (email: string, password: string) => Promise<void>;
  onRegisterPersonalAccount: (input: RegisterPersonalAccountInput) => Promise<void>;
  onSendPasswordRecovery: (email: string) => Promise<void>;
  onRequestPasswordResetCode?: (email: string) => Promise<void>;
  onConfirmPasswordResetWithCode?: (
    email: string,
    code: string,
    newPassword: string
  ) => Promise<void>;
}

export function AuthScreen({
  initialMode = 'login',
  isSubmitting,
  errorMessage,
  statusMessage,
  onSignInWithEmail,
  onRegisterPersonalAccount,
  onSendPasswordRecovery,
  onRequestPasswordResetCode,
  onConfirmPasswordResetWithCode,
}: AuthScreenProps): React.JSX.Element {
  const { colors, spacing, radius, skin } = useBFlowTheme();
  const layout = useResponsiveLayout();
  const primaryAction = usePrimaryActionLook();

  const [formMode, setFormMode] = useState<AuthFormMode>(initialMode);
  const [recoverStep, setRecoverStep] = useState<'request' | 'verify'>('request');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [financialGoal, setFinancialGoal] = useState(
    'Saldar deudas y hacer crecer mis ahorros'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localValidationError, setLocalValidationError] = useState<string | null>(null);
  const [internalRecoverySuccess, setInternalRecoverySuccess] = useState<string | null>(null);

  const switchMode = (nextMode: AuthFormMode) => {
    setFormMode(nextMode);
    setRecoverStep('request');
    setRecoveryCode('');
    setLocalValidationError(null);
    setInternalRecoverySuccess(null);
  };

  const handleResendRecoveryCode = async () => {
    if (!email.trim().includes('@')) return;
    setLocalValidationError(null);
    try {
      if (onRequestPasswordResetCode) {
        await onRequestPasswordResetCode(email.trim());
      } else {
        await defaultRequestPasswordResetCode(email.trim());
      }
      setInternalRecoverySuccess(
        `Código de 6 dígitos reenviado exitosamente a ${email.trim()}.`
      );
    } catch (err) {
      setLocalValidationError(
        err instanceof Error ? err.message : 'Error al reenviar el código de verificación.'
      );
    }
  };

  const handlePrimarySubmit = async () => {
    setLocalValidationError(null);

    if (formMode === 'recover') {
      if (recoverStep === 'request') {
        if (!email.trim().includes('@')) {
          setLocalValidationError(
            'Escribe el correo electrónico con el que registraste tu cuenta.'
          );
          return;
        }

        try {
          if (onRequestPasswordResetCode) {
            await onRequestPasswordResetCode(email.trim());
          } else {
            try {
              await defaultRequestPasswordResetCode(email.trim());
            } catch {
              await onSendPasswordRecovery(email.trim());
            }
          }
          setRecoverStep('verify');
          setInternalRecoverySuccess(
            `Hemos enviado el código de 6 dígitos a ${email.trim()}. Ingrésalo a continuación junto con tu nueva contraseña.`
          );
        } catch (err) {
          setLocalValidationError(
            err instanceof Error ? err.message : 'Error al solicitar el código de verificación.'
          );
        }
        return;
      }

      // recoverStep === 'verify'
      if (recoveryCode.trim().length < 6) {
        setLocalValidationError('Escribe o pega el código o enlace recibido en tu correo.');
        return;
      }
      if (password.length < 6) {
        setLocalValidationError('Usa una contraseña de al menos 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalValidationError('Las dos contraseñas no coinciden. Verifícalas e intenta de nuevo.');
        return;
      }

      try {
        if (onConfirmPasswordResetWithCode) {
          await onConfirmPasswordResetWithCode(email.trim(), recoveryCode.trim(), password);
        } else {
          await defaultConfirmPasswordReset(email.trim(), recoveryCode.trim(), password);
        }

        setInternalRecoverySuccess(
          '✓ Contraseña actualizada exitosamente. Ya puedes entrar con tu nueva clave.'
        );
        setFormMode('login');
        setRecoverStep('request');
        setPassword('');
        setConfirmPassword('');
        setRecoveryCode('');
      } catch (err) {
        setLocalValidationError(
          err instanceof Error ? err.message : 'Error al actualizar la contraseña.'
        );
      }
      return;
    }

    if (formMode === 'register') {
      if (displayName.trim().length < 2) {
        setLocalValidationError('Escribe tu nombre y apellido para identificar tu presupuesto.');
        return;
      }
      if (!email.trim().includes('@')) {
        setLocalValidationError('Escribe un correo electrónico válido.');
        return;
      }
      if (password.length < 6) {
        setLocalValidationError('Usa una contraseña de al menos 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalValidationError('Las dos contraseñas no coinciden. Verifícalas e intenta de nuevo.');
        return;
      }

      await onRegisterPersonalAccount({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(financialGoal.trim() ? { financialGoal: financialGoal.trim() } : {}),
      });
      return;
    }

    // formMode === 'login'
    if (!email.trim().includes('@') || !password) {
      setLocalValidationError('Escribe tu correo electrónico y tu contraseña para entrar.');
      return;
    }
    await onSignInWithEmail(email.trim(), password);
  };

  const activeError = localValidationError ?? errorMessage;
  const activeStatusMessage = internalRecoverySuccess ?? statusMessage;

  const authCard = (
    <GlassSurface elevated testID="auth-glass-card">
      <View style={{ gap: spacing.md }}>
        {/* Mode Switcher: Iniciar sesión / Crear cuenta */}
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.xs,
            padding: spacing.xxs,
            borderRadius: radius.md,
            backgroundColor: colors.glass.surfaceTint,
            borderWidth: 1,
            borderColor: colors.glass.subtleBorder,
          }}
        >
          {(
            [
              { id: 'login', label: 'Iniciar sesión' },
              { id: 'register', label: 'Crear cuenta' },
            ] as const
          ).map((tab) => {
            const isSelected = formMode === tab.id;
            return (
              <AppPressable
                key={tab.id}
                testID={`auth-mode-${tab.id}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                onPress={() => switchMode(tab.id)}
                style={{
                  flex: 1,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  borderRadius: radius.sm,
                  backgroundColor: isSelected
                    ? colors.glass.surfaceElevatedTint
                    : 'transparent',
                  borderWidth: isSelected ? 1 : 0,
                  borderColor: isSelected ? colors.glass.specularBorder : 'transparent',
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
              </AppPressable>
            );
          })}
        </View>

        {/* Form Title & Context */}
        <View style={{ gap: spacing.xxs }}>
          <AppText variant="title2">
            {formMode === 'login'
              ? 'Entra a tu cuenta personal'
              : formMode === 'register'
                ? 'Registra tus datos personales'
                : recoverStep === 'request'
                  ? 'Recupera el acceso a tu cuenta'
                  : 'Restablecer contraseña'}
          </AppText>
          {formMode === 'recover' ? (
            <AppText variant="caption" color={colors.text.secondary}>
              {recoverStep === 'request'
                ? 'Escribe tu correo electrónico para enviarte un código de verificación de 6 dígitos.'
                : 'Ingresa el código de 6 dígitos enviado a tu correo y define tu nueva contraseña para cambiarla en la app.'}
            </AppText>
          ) : null}
        </View>

        {/* Personal Profile Fields (Registration Only) */}
        {formMode === 'register' ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Nombre completo
              </AppText>
              <AppTextInput
                testID="auth-name-input"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Ej. Alejandro Bernal Garnica"
                autoCapitalize="words"
              />
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Celular (opcional)
              </AppText>
              <AppTextInput
                testID="auth-phone-input"
                value={phone}
                onChangeText={setPhone}
                placeholder="Ej. +57 300 123 4567"
                keyboardType="phone-pad"
              />
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Meta financiera principal (opcional)
              </AppText>
              <AppTextInput
                testID="auth-goal-input"
                value={financialGoal}
                onChangeText={setFinancialGoal}
                placeholder="Ej. Ahorro para un proyecto personal"
              />
            </View>
          </View>
        ) : null}

        {/* Email Field */}
        <View style={{ gap: spacing.xxs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Correo electrónico
          </AppText>
          <AppTextInput
            testID="auth-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="tu-correo@ejemplo.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
        </View>

        {/* Verification Code or Email Link Field (Recovery Step: Verify) */}
        {formMode === 'recover' && recoverStep === 'verify' ? (
          <View style={{ gap: spacing.xxs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Código de verificación o enlace del correo
            </AppText>
            <AppTextInput
              testID="auth-recovery-code-input"
              value={recoveryCode}
              onChangeText={setRecoveryCode}
              placeholder="Ej: 123456 o pega el código/enlace"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <AppText variant="micro" color={colors.text.muted}>
              Ingresa el código de 6 dígitos enviado por correo para actualizar tu contraseña inmediatamente en Firebase.
            </AppText>
          </View>
        ) : null}

        {/* Password Fields with Visibility Toggle */}
        {formMode !== 'recover' || recoverStep === 'verify' ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                {formMode === 'recover' ? 'Nueva contraseña' : 'Contraseña'}
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
                  testID="auth-password-input"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mínimo 6 caracteres"
                  secureTextEntry={!showPassword}
                  autoComplete={
                    formMode === 'register' || formMode === 'recover'
                      ? 'new-password'
                      : 'current-password'
                  }
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                  }}
                />
                <AppPressable
                  testID="auth-password-visibility-toggle"
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? 'Ocultar contraseña' : 'Ver contraseña'
                  }
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET_PT,
                    minWidth: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.sm,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? (
                    <EyeIcon size={20} color={colors.text.secondary} testID="icon-eye-open" />
                  ) : (
                    <EyeOffIcon size={20} color={colors.text.secondary} testID="icon-eye-closed" />
                  )}
                </AppPressable>
              </View>
            </View>

            {formMode === 'register' || (formMode === 'recover' && recoverStep === 'verify') ? (
              <View style={{ gap: spacing.xxs }}>
                <AppText variant="caption" color={colors.text.secondary}>
                  {formMode === 'recover'
                    ? 'Confirmar nueva contraseña'
                    : 'Confirmar contraseña'}
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
                    testID="auth-confirm-password-input"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder={
                      formMode === 'recover'
                        ? 'Repite tu nueva contraseña'
                        : 'Repite tu contraseña'
                    }
                    secureTextEntry={!showConfirmPassword}
                    style={{
                      flex: 1,
                      backgroundColor: 'transparent',
                      borderWidth: 0,
                    }}
                  />
                  <AppPressable
                    testID="auth-confirm-password-visibility-toggle"
                    accessibilityRole="button"
                    accessibilityLabel={
                      showConfirmPassword
                        ? 'Ocultar confirmación de contraseña'
                        : 'Ver confirmación de contraseña'
                    }
                    onPress={() => setShowConfirmPassword((prev) => !prev)}
                    style={{
                      minHeight: MIN_TOUCH_TARGET_PT,
                      minWidth: MIN_TOUCH_TARGET_PT,
                      paddingHorizontal: spacing.sm,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    {showConfirmPassword ? (
                      <EyeIcon size={20} color={colors.text.secondary} testID="icon-confirm-eye-open" />
                    ) : (
                      <EyeOffIcon size={20} color={colors.text.secondary} testID="icon-confirm-eye-closed" />
                    )}
                  </AppPressable>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Error or Status Feedback */}
        <FormMessage message={activeError} testID="auth-error-banner" />

        <FormMessage message={activeStatusMessage} tone="success" testID="auth-status-banner" />

        {/* Primary CTA */}
        <AppPressable
          testID="auth-primary-submit-button"
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={handlePrimarySubmit}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            ...primaryAction.container,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: spacing.sm,
          }}
        >
          <AppText variant="headline" color={primaryAction.labelColor ?? colors.text.primary}>
            {isSubmitting
              ? 'Sincronizando tu cuenta...'
              : formMode === 'login'
                ? 'Entrar a mi presupuesto'
                : formMode === 'register'
                  ? 'Crear mi cuenta y sincronizar'
                  : recoverStep === 'request'
                    ? 'Enviar código de verificación'
                    : 'Restablecer y cambiar contraseña'}
          </AppText>
        </AppPressable>

        {/* Password Recovery Link or Back To Login */}
        {formMode !== 'recover' ? (
          <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
            <AppPressable
              testID="auth-mode-recover"
              accessibilityRole="button"
              accessibilityLabel="Recuperar clave"
              onPress={() => switchMode('recover')}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                justifyContent: 'center',
                alignItems: 'center',
                paddingVertical: spacing.xs,
              }}
            >
              <AppText variant="caption" color={colors.text.secondary}>
                ¿Olvidaste tu contraseña? Recuperar clave
              </AppText>
            </AppPressable>
          </View>
        ) : (
          <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
            {recoverStep === 'verify' ? (
              <AppPressable
                testID="auth-recovery-resend-button"
                accessibilityRole="button"
                accessibilityLabel="Reenviar código de verificación"
                onPress={handleResendRecoveryCode}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingVertical: spacing.xs,
                }}
              >
                <AppText variant="caption" color={colors.text.secondary}>
                  Reenviar código de verificación
                </AppText>
              </AppPressable>
            ) : null}

            <AppPressable
              testID="auth-back-to-login-button"
              accessibilityRole="button"
              accessibilityLabel="Volver a iniciar sesión"
              onPress={() => switchMode('login')}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                justifyContent: 'center',
                alignItems: 'center',
                paddingVertical: spacing.xs,
              }}
            >
              <AppText variant="caption" color={colors.text.secondary}>
                ← Volver a iniciar sesión
              </AppText>
            </AppPressable>
          </View>
        )}
      </View>
    </GlassSurface>
  );

  // Web: the product's first screen. A fixed, opaque header and a hero that says what BFlow is
  // beside the sign-in form (design-taste-frontend: category in the h1, one hard fact, one
  // filled action). The form stacks under the copy below 1024px.
  if (skin === 'web') {
    const isSplit = layout.isWide;

    return (
      <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
        <WebAppHeader layout={layout} themeToggleTestID="auth-theme-toggle-button" />
        <KeyboardAwareScrollView
          testID="auth-gate-screen"
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: layout.gutter,
            paddingVertical: isSplit ? spacing.huge : spacing.xxl,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: layout.contentMaxWidth,
              alignSelf: 'center',
              flexDirection: isSplit ? 'row' : 'column',
              alignItems: isSplit ? 'center' : 'stretch',
              gap: isSplit ? spacing.huge : spacing.xxl,
            }}
          >
            <View
              testID="auth-web-hero"
              style={{ flex: isSplit ? WEB_HERO_FLEX : undefined, minWidth: 0, gap: spacing.lg }}
            >
              <AppText variant={isSplit ? 'display' : 'heroCurrency'} accessibilityRole="header">
                {WEB_HERO_COPY.headline}
              </AppText>
              <AppText
                variant="headline"
                color={colors.text.secondary}
                style={{ maxWidth: WEB_HERO_MEASURE_PT, fontWeight: '400' }}
              >
                {WEB_HERO_COPY.subline}
              </AppText>
              <AppText variant="caption" color={colors.text.muted}>
                {WEB_HERO_COPY.fact}
              </AppText>
            </View>

            <View
              style={{
                flex: isSplit ? WEB_FORM_FLEX : undefined,
                width: '100%',
                maxWidth: isSplit ? undefined : AUTH_CARD_MAX_WIDTH_PT,
                alignSelf: isSplit ? undefined : 'center',
                minWidth: 0,
              }}
            >
              {authCard}
            </View>
          </View>
        </KeyboardAwareScrollView>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      testID="auth-gate-screen"
      style={{ flex: 1, backgroundColor: colors.background.primary }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: layout.gutter,
        paddingVertical: spacing.xxxl,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: AUTH_CARD_MAX_WIDTH_PT,
          alignSelf: 'center',
          gap: spacing.lg,
        }}
      >
        {/* Top Bar: Identity + Theme Switch */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <AppText variant="heroCurrency">BFlow</AppText>
          <ThemeToggleIconButton testID="auth-theme-toggle-button" />
        </View>

        {/* Grounded Ledger Preview Strip */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          <StatusBadge label="Presupuesto" status="completed" />
          <StatusBadge label="Deudas" status="debt" />
          <StatusBadge label="Metas Financieras" status="reserve" />
        </View>

        {authCard}
      </View>
    </KeyboardAwareScrollView>
  );
}
