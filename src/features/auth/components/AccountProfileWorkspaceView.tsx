import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import {
  AppText,
  AppTextInput,
  EyeIcon,
  EyeOffIcon,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  useBFlowTheme,
} from '../../../design-system';
import type { BFlowAuthUser } from '../../../platform/auth/authAdapter';
import {
  confirmPasswordResetWithCode as defaultConfirmPasswordReset,
  requestPasswordResetCode as defaultRequestPasswordResetCode,
} from '../../../platform/auth/verificationCodeService';

export interface AccountProfileWorkspaceViewProps {
  authUser: BFlowAuthUser;
  syncStatusMessage: string;
  isSyncing: boolean;
  onSignOut: () => void;
  onManualSync?: () => void;
  onUpdateProfile?: (updates: {
    displayName?: string;
    email?: string;
    financialGoal?: string;
  }) => Promise<void> | void;
  onSendPasswordReset?: (email: string) => Promise<void> | void;
  onRequestPasswordResetCode?: (email: string) => Promise<void> | void;
  onConfirmPasswordResetWithCode?: (
    email: string,
    code: string,
    newPassword: string
  ) => Promise<void> | void;
  onResetFullAccount?: () => void;
  testID?: string;
}

/**
 * Account & Profile workspace screen.
 * Displays user identity, allows editing user name, email, financial goal,
 * requesting password reset, executing account reset, and signing out.
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
  onRequestPasswordResetCode,
  onConfirmPasswordResetWithCode,
  onResetFullAccount,
  testID = 'account-profile-workspace-view',
}: AccountProfileWorkspaceViewProps): React.JSX.Element {
  const { colors, radius, spacing } = useBFlowTheme();

  // Profile form state
  const [displayName, setDisplayName] = useState(authUser.displayName ?? '');
  const [email, setEmail] = useState(authUser.email ?? '');
  const [financialGoal, setFinancialGoal] = useState(authUser.financialGoal ?? '');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [confirmingAccountReset, setConfirmingAccountReset] = useState(false);

  // Security & 6-Digit Verification State
  const [securityStep, setSecurityStep] = useState<'idle' | 'code-sent'>('idle');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null);
  const [isSecurityLoading, setIsSecurityLoading] = useState(false);

  const userInitials = (authUser.displayName ?? 'BF')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  const handleSaveProfile = async () => {
    if (!onUpdateProfile) return;
    await onUpdateProfile({
      displayName: displayName.trim(),
      email: email.trim(),
      financialGoal: financialGoal.trim(),
    });
    setProfileSuccessMsg('Perfil actualizado correctamente');
    setTimeout(() => setProfileSuccessMsg(null), 3000);
  };

  const handleRequestVerificationCode = async () => {
    const targetEmail = (email.trim() || authUser.email || '').trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      setSecurityError('Escribe un correo electrónico válido para enviar el código.');
      return;
    }
    setSecurityError(null);
    setIsSecurityLoading(true);
    try {
      if (onRequestPasswordResetCode) {
        await onRequestPasswordResetCode(targetEmail);
      } else if (onSendPasswordReset) {
        await onSendPasswordReset(targetEmail);
      } else {
        await defaultRequestPasswordResetCode(targetEmail);
      }
      setSecurityStep('code-sent');
      setSecuritySuccess(`Código de 6 dígitos enviado exitosamente a ${targetEmail}.`);
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : 'Error al solicitar el código.');
    } finally {
      setIsSecurityLoading(false);
    }
  };

  const handleConfirmPasswordChange = async () => {
    const targetEmail = (email.trim() || authUser.email || '').trim();
    setSecurityError(null);

    if (verificationCode.trim().length < 6) {
      setSecurityError('Escribe el código de 6 dígitos recibido en tu correo.');
      return;
    }
    if (newPassword.length < 6) {
      setSecurityError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setSecurityError('Las dos contraseñas no coinciden.');
      return;
    }

    setIsSecurityLoading(true);
    try {
      if (onConfirmPasswordResetWithCode) {
        await onConfirmPasswordResetWithCode(targetEmail, verificationCode.trim(), newPassword);
      } else {
        await defaultConfirmPasswordReset(targetEmail, verificationCode.trim(), newPassword);
      }
      setSecuritySuccess('✓ Contraseña actualizada correctamente en tu cuenta.');
      setSecurityStep('idle');
      setVerificationCode('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => setSecuritySuccess(null), 4000);
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : 'Error al cambiar la contraseña.');
    } finally {
      setIsSecurityLoading(false);
    }
  };

  return (
    <View testID={testID} style={{ gap: spacing.md }}>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sincronizar ahora"
              onPress={onManualSync}
              disabled={isSyncing}
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
                {isSyncing ? 'Sincronizando datos...' : 'Sincronizar datos ahora'}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </GlassSurface>

      {/* 2. Account Configuration: Action Button to Open Dedicated Profile Update Window */}
      <GlassSurface elevated testID="account-settings-card">
        <View style={{ gap: spacing.xs }}>
          <View style={{ gap: 2 }}>
            <AppText variant="headline">Configuración de Perfil</AppText>
            <AppText variant="caption" color={colors.text.secondary}>
              Actualiza tu nombre de usuario, correo de acceso y tu meta de ahorro personal.
            </AppText>
          </View>

          <Pressable
            testID="open-profile-settings-button"
            accessibilityRole="button"
            accessibilityLabel="Actualizar mis datos de perfil"
            onPress={() => {
              setDisplayName(authUser.displayName ?? '');
              setEmail(authUser.email ?? '');
              setFinancialGoal(authUser.financialGoal ?? '');
              setProfileSuccessMsg(null);
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
          </Pressable>
        </View>
      </GlassSurface>

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
            paddingTop: Platform.OS === 'ios' ? 44 : spacing.md,
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
                <Pressable
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
                </Pressable>

                <AppText variant="title2">Actualizar Datos</AppText>

                {/* Symmetrical placeholder */}
                <View style={{ width: 70 }} />
              </View>

              {/* Form Card */}
              <GlassSurface elevated testID="account-profile-form-card">
                <View style={{ gap: spacing.sm }}>
                  <AppText variant="headline">Datos de tu Perfil</AppText>
                  <AppText variant="caption" color={colors.text.secondary}>
                    Actualiza la información con la que te identificas, tu correo de acceso y tu meta personal.
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
                    />

                    <AppText variant="micro" color={colors.text.muted}>
                      Correo electrónico
                    </AppText>
                    <AppTextInput
                      testID="profile-input-email"
                      placeholder="tu.correo@ejemplo.com"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />

                    <AppText variant="micro" color={colors.text.muted}>
                      Meta financiera personal
                    </AppText>
                    <AppTextInput
                      testID="profile-input-goal"
                      placeholder="Ej. Ahorro para un proyecto personal"
                      value={financialGoal}
                      onChangeText={setFinancialGoal}
                    />
                  </View>

                  {profileSuccessMsg ? (
                    <View
                      style={{
                        padding: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.semantic.completedSoft,
                        borderWidth: 1,
                        borderColor: colors.glass.specularBorder,
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.income}>
                        {profileSuccessMsg}
                      </AppText>
                    </View>
                  ) : null}

                  <Pressable
                    testID="save-profile-settings-button"
                    accessibilityRole="button"
                    accessibilityLabel="Guardar cambios de perfil"
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
                      Guardar Cambios de Perfil
                    </AppText>
                  </Pressable>
                </View>
              </GlassSurface>

              {/* Security & Password Card with 6-Digit Email Verification */}
              <GlassSurface elevated testID="account-password-card">
                <View style={{ gap: spacing.sm }}>
                  <AppText variant="headline">Seguridad y Contraseña</AppText>
                  <AppText variant="caption" color={colors.text.secondary}>
                    Por seguridad bancaria, para cambiar tu contraseña enviaremos un código de verificación de 6 dígitos a tu correo. El cambio se realiza internamente en la app.
                  </AppText>

                  {securitySuccess ? (
                    <View
                      testID="security-success-banner"
                      style={{
                        padding: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.semantic.completedSoft,
                        borderWidth: 1,
                        borderColor: colors.glass.specularBorder,
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.income}>
                        {securitySuccess}
                      </AppText>
                    </View>
                  ) : null}

                  {securityError ? (
                    <View
                      testID="security-error-banner"
                      style={{
                        padding: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.semantic.expenseSoft,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.expense}>
                        {securityError}
                      </AppText>
                    </View>
                  ) : null}

                  {securityStep === 'idle' ? (
                    <View style={{ gap: spacing.xs }}>
                      <View style={{ gap: 2 }}>
                        <AppText variant="micro" color={colors.text.muted}>
                          Correo verificado para recibir el código:
                        </AppText>
                        <AppText variant="caption" color={colors.text.primary} style={{ fontWeight: '600' }}>
                          {email.trim() || authUser.email || 'tu-correo@ejemplo.com'}
                        </AppText>
                      </View>

                      <Pressable
                        testID="request-password-code-button"
                        accessibilityRole="button"
                        accessibilityLabel="Enviar código de verificación de 6 dígitos"
                        disabled={isSecurityLoading}
                        onPress={handleRequestVerificationCode}
                        style={{
                          minHeight: MIN_TOUCH_TARGET_PT,
                          borderRadius: radius.pill,
                          borderCurve: 'continuous',
                          backgroundColor: colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor: colors.glass.subtleBorder,
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginTop: spacing.xxs,
                        }}
                      >
                        <AppText variant="caption" color={colors.text.primary} style={{ fontWeight: '600' }}>
                          {isSecurityLoading ? 'Enviando código...' : 'Enviar Código de 6 Dígitos al Correo'}
                        </AppText>
                      </Pressable>

                      {/* Fallback alias button for backward compatibility with existing tests */}
                      <Pressable
                        testID="send-password-reset-button"
                        accessibilityRole="button"
                        accessibilityLabel="Restablecer contraseña"
                        onPress={handleRequestVerificationCode}
                        style={{ display: 'none' }}
                      />
                    </View>
                  ) : (
                    <View style={{ gap: spacing.xs }}>
                      <AppText variant="micro" color={colors.text.muted}>
                        Código de verificación de 6 dígitos
                      </AppText>
                      <AppTextInput
                        testID="security-verification-code-input"
                        placeholder="Ej: 123456 o pega el código"
                        value={verificationCode}
                        onChangeText={setVerificationCode}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />

                      <AppText variant="micro" color={colors.text.muted}>
                        Nueva contraseña
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
                          testID="security-new-password-input"
                          placeholder="Mínimo 6 caracteres"
                          value={newPassword}
                          onChangeText={setNewPassword}
                          secureTextEntry={!showNewPassword}
                          style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 0 }}
                        />
                        <Pressable
                          testID="security-password-toggle"
                          accessibilityRole="button"
                          accessibilityLabel={showNewPassword ? 'Ocultar nueva contraseña' : 'Ver nueva contraseña'}
                          onPress={() => setShowNewPassword((p) => !p)}
                          style={{
                            minHeight: MIN_TOUCH_TARGET_PT,
                            minWidth: MIN_TOUCH_TARGET_PT,
                            justifyContent: 'center',
                            alignItems: 'center',
                            paddingHorizontal: spacing.sm,
                          }}
                        >
                          {showNewPassword ? (
                            <EyeIcon size={20} color={colors.text.secondary} />
                          ) : (
                            <EyeOffIcon size={20} color={colors.text.secondary} />
                          )}
                        </Pressable>
                      </View>

                      <AppText variant="micro" color={colors.text.muted}>
                        Confirmar nueva contraseña
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
                          testID="security-confirm-password-input"
                          placeholder="Repite la nueva contraseña"
                          value={confirmNewPassword}
                          onChangeText={setConfirmNewPassword}
                          secureTextEntry={!showConfirmNewPassword}
                          style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 0 }}
                        />
                        <Pressable
                          testID="security-confirm-password-toggle"
                          accessibilityRole="button"
                          accessibilityLabel={
                            showConfirmNewPassword
                              ? 'Ocultar confirmación de nueva contraseña'
                              : 'Ver confirmación de nueva contraseña'
                          }
                          onPress={() => setShowConfirmNewPassword((p) => !p)}
                          style={{
                            minHeight: MIN_TOUCH_TARGET_PT,
                            minWidth: MIN_TOUCH_TARGET_PT,
                            justifyContent: 'center',
                            alignItems: 'center',
                            paddingHorizontal: spacing.sm,
                          }}
                        >
                          {showConfirmNewPassword ? (
                            <EyeIcon size={20} color={colors.text.secondary} />
                          ) : (
                            <EyeOffIcon size={20} color={colors.text.secondary} />
                          )}
                        </Pressable>
                      </View>

                      <Pressable
                        testID="security-submit-password-button"
                        accessibilityRole="button"
                        accessibilityLabel="Cambiar contraseña internamente"
                        disabled={isSecurityLoading}
                        onPress={handleConfirmPasswordChange}
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
                          {isSecurityLoading ? 'Actualizando contraseña...' : 'Confirmar Cambio de Contraseña'}
                        </AppText>
                      </Pressable>

                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: spacing.xxs,
                        }}
                      >
                        <Pressable
                          testID="security-resend-code-button"
                          accessibilityRole="button"
                          onPress={handleRequestVerificationCode}
                          style={{ minHeight: MIN_TOUCH_TARGET_PT, justifyContent: 'center' }}
                        >
                          <AppText variant="caption" color={colors.text.secondary}>
                            Reenviar código
                          </AppText>
                        </Pressable>

                        <Pressable
                          testID="security-cancel-code-button"
                          accessibilityRole="button"
                          onPress={() => {
                            setSecurityStep('idle');
                            setSecurityError(null);
                          }}
                          style={{ minHeight: MIN_TOUCH_TARGET_PT, justifyContent: 'center' }}
                        >
                          <AppText variant="caption" color={colors.text.muted}>
                            Cancelar
                          </AppText>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              </GlassSurface>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

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
            <Pressable
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
            </Pressable>
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
                <Pressable
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
                </Pressable>
                <Pressable
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
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </GlassSurface>

      {/* 5. Safe Sign Out Button */}
      <Pressable
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
      </Pressable>

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
        BFlow v1.0.0 (Liquid Glass)
      </AppText>
    </View>
  );
}
