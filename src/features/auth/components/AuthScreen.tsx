/**
 * src/features/auth/components/AuthScreen.tsx
 *
 * Full-screen Authentication & Personal Registration Gate (`01-auth`),
 * crafted following `.claude/skills/frontend-design/SKILL.md` and `DESIGN.md`:
 * - Grounded in BFlow's real subject matter (Colombian peso cash-flow, FUNFAMI debt, CB300F fund)
 * - Supports Sign-In (`email` + `password`), Personal Account Registration (`displayName`, `phone`,
 *   `financialGoal`, `email`, `password`), Google Sign-In (`GoogleAuthProvider`), and Password Recovery
 * - Zero hardcoded hex values; uses semantic tokens from `useBFlowTheme()` and >= 44pt touch targets
 */

import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import {
  AppText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  useBFlowTheme,
} from '../../../design-system';
import type { RegisterPersonalAccountInput } from '../../../platform/auth/authAdapter';

export type AuthFormMode = 'login' | 'register' | 'recover';

export interface AuthScreenProps {
  initialMode?: AuthFormMode;
  isSubmitting: boolean;
  errorMessage: string | null;
  statusMessage: string | null;
  onSignInWithEmail: (email: string, password: string) => Promise<void>;
  onRegisterPersonalAccount: (input: RegisterPersonalAccountInput) => Promise<void>;
  onSignInWithGoogle: () => Promise<void>;
  onSendPasswordRecovery: (email: string) => Promise<void>;
}

export function AuthScreen({
  initialMode = 'login',
  isSubmitting,
  errorMessage,
  statusMessage,
  onSignInWithEmail,
  onRegisterPersonalAccount,
  onSignInWithGoogle,
  onSendPasswordRecovery,
}: AuthScreenProps): React.JSX.Element {
  const { colors, spacing, radius, mode, toggleTheme } = useBFlowTheme();

  const [formMode, setFormMode] = useState<AuthFormMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [financialGoal, setFinancialGoal] = useState(
    'Saldar deuda FUNFAMI y cubrir provisión CB300F'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localValidationError, setLocalValidationError] = useState<string | null>(null);

  const switchMode = (nextMode: AuthFormMode) => {
    setFormMode(nextMode);
    setLocalValidationError(null);
  };

  const handlePrimarySubmit = async () => {
    setLocalValidationError(null);

    if (formMode === 'recover') {
      if (!email.trim().includes('@')) {
        setLocalValidationError(
          'Escribe el correo electrónico con el que registraste tu cuenta.'
        );
        return;
      }
      await onSendPasswordRecovery(email);
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

  return (
    <ScrollView
      testID="auth-gate-screen"
      style={{ flex: 1, backgroundColor: colors.background.primary }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xxxl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={{
          width: '100%',
          maxWidth: 460,
          alignSelf: 'center',
          gap: spacing.lg,
        }}
      >
        {/* Top Bar: Identity + Theme Switch */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <View style={{ flex: 1, gap: spacing.xs }}>
            <AppText variant="heroCurrency">BFlow</AppText>
            <AppText variant="body" color={colors.text.secondary}>
              Tu flujo mensual en pesos, tus abonos a FUNFAMI y el fondo de tu CB300F sincronizados en todos tus dispositivos.
            </AppText>
          </View>

          <Pressable
            testID="auth-theme-toggle-button"
            accessibilityRole="button"
            accessibilityLabel="Cambiar tema visual"
            onPress={toggleTheme}
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
            <AppText variant="caption">{mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}</AppText>
          </Pressable>
        </View>

        {/* Grounded Ledger Preview Strip */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          <StatusBadge label="Presupuesto en COP enteros" status="completed" />
          <StatusBadge label="Control Deuda FUNFAMI" status="debt" />
          <StatusBadge label="Provisión CB300F" status="moto" />
        </View>

        {/* Main Liquid Glass Authentication Card */}
        <GlassSurface elevated testID="auth-glass-card">
          <View style={{ gap: spacing.md }}>
            {/* Mode Switcher */}
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
                  { id: 'recover', label: 'Recuperar clave' },
                ] as const
              ).map((tab) => {
                const isSelected = formMode === tab.id;
                return (
                  <Pressable
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
                  </Pressable>
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
                    : 'Recupera el acceso a tu cuenta'}
              </AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                {formMode === 'login'
                  ? 'Al iniciar sesión desde cualquier celular o navegador se descargan automáticamente tu presupuesto y tu historial mensual desde Firebase.'
                  : formMode === 'register'
                    ? 'Tu cuenta crea y respalda automáticamente tu presupuesto base de Octubre 2026 en Cloud Firestore.'
                    : 'Te enviaremos un enlace seguro a tu correo para definir una nueva contraseña.'}
              </AppText>
            </View>

            {/* Personal Profile Fields (Registration Only) */}
            {formMode === 'register' ? (
              <View style={{ gap: spacing.sm }}>
                <View style={{ gap: spacing.xxs }}>
                  <AppText variant="caption" color={colors.text.secondary}>
                    Nombre completo
                  </AppText>
                  <TextInput
                    testID="auth-name-input"
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Ej. Alejandro Bernal Garnica"
                    placeholderTextColor={colors.text.muted}
                    autoCapitalize="words"
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
                </View>

                <View style={{ gap: spacing.xxs }}>
                  <AppText variant="caption" color={colors.text.secondary}>
                    Celular (opcional)
                  </AppText>
                  <TextInput
                    testID="auth-phone-input"
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Ej. +57 300 123 4567"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="phone-pad"
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
                </View>

                <View style={{ gap: spacing.xxs }}>
                  <AppText variant="caption" color={colors.text.secondary}>
                    Meta financiera principal (opcional)
                  </AppText>
                  <TextInput
                    testID="auth-goal-input"
                    value={financialGoal}
                    onChangeText={setFinancialGoal}
                    placeholder="Ej. Saldar FUNFAMI y ahorrar para apartamento"
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
                </View>
              </View>
            ) : null}

            {/* Email Field */}
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Correo electrónico
              </AppText>
              <TextInput
                testID="auth-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="tu-correo@ejemplo.com"
                placeholderTextColor={colors.text.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
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
            </View>

            {/* Password Fields */}
            {formMode !== 'recover' ? (
              <View style={{ gap: spacing.sm }}>
                <View style={{ gap: spacing.xxs }}>
                  <AppText variant="caption" color={colors.text.secondary}>
                    Contraseña
                  </AppText>
                  <TextInput
                    testID="auth-password-input"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Mínimo 6 caracteres"
                    placeholderTextColor={colors.text.muted}
                    secureTextEntry
                    autoComplete={formMode === 'register' ? 'new-password' : 'current-password'}
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
                </View>

                {formMode === 'register' ? (
                  <View style={{ gap: spacing.xxs }}>
                    <AppText variant="caption" color={colors.text.secondary}>
                      Confirmar contraseña
                    </AppText>
                    <TextInput
                      testID="auth-confirm-password-input"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Repite tu contraseña"
                      placeholderTextColor={colors.text.muted}
                      secureTextEntry
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
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Error or Status Feedback */}
            {activeError ? (
              <View
                testID="auth-error-banner"
                style={{
                  padding: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.semantic.expenseSoft,
                  borderWidth: 1,
                  borderColor: colors.semantic.expense,
                }}
              >
                <AppText variant="caption" color={colors.semantic.expense}>
                  {activeError}
                </AppText>
              </View>
            ) : null}

            {statusMessage ? (
              <View
                testID="auth-status-banner"
                style={{
                  padding: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.semantic.incomeSoft,
                  borderWidth: 1,
                  borderColor: colors.semantic.income,
                }}
              >
                <AppText variant="caption" color={colors.semantic.income}>
                  {statusMessage}
                </AppText>
              </View>
            ) : null}

            {/* Primary CTA */}
            <Pressable
              testID="auth-primary-submit-button"
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={handlePrimarySubmit}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                borderRadius: radius.md,
                backgroundColor: colors.semantic.incomeSoft,
                borderWidth: 1,
                borderColor: colors.semantic.income,
                justifyContent: 'center',
                alignItems: 'center',
                paddingVertical: spacing.sm,
              }}
            >
              <AppText variant="headline" color={colors.semantic.income}>
                {isSubmitting
                  ? 'Sincronizando tu cuenta...'
                  : formMode === 'login'
                    ? 'Entrar a mi presupuesto'
                    : formMode === 'register'
                      ? 'Crear mi cuenta y sincronizar'
                      : 'Enviar enlace de recuperación'}
              </AppText>
            </Pressable>

            {/* Google Sign-In Option */}
            {formMode !== 'recover' ? (
              <View style={{ gap: spacing.xs }}>
                <View style={{ alignItems: 'center', paddingVertical: spacing.xxs }}>
                  <AppText variant="micro" color={colors.text.muted}>
                    O accede con tu cuenta de Google
                  </AppText>
                </View>

                <Pressable
                  testID="auth-google-button"
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={onSignInWithGoogle}
                  style={{
                    minHeight: MIN_TOUCH_TARGET_PT,
                    borderRadius: radius.md,
                    backgroundColor: colors.glass.surfaceElevatedTint,
                    borderWidth: 1,
                    borderColor: colors.glass.specularBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingVertical: spacing.sm,
                  }}
                >
                  <AppText variant="headline">Continuar con Google</AppText>
                </Pressable>

                {Platform.OS !== 'web' ? (
                  <AppText variant="micro" color={colors.text.muted}>
                    En Expo Go para iOS puedes crear tu cuenta con correo y contraseña y usarla en todos tus dispositivos.
                  </AppText>
                ) : null}
              </View>
            ) : null}
          </View>
        </GlassSurface>
      </View>
    </ScrollView>
  );
}
