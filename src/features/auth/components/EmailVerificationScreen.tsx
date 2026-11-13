/**
 * src/features/auth/components/EmailVerificationScreen.tsx
 *
 * Puerta de verificación de correo (ADR 0025). Se muestra entre el registro y el presupuesto
 * mientras la cuenta no haya abierto el enlace que envía Firebase Authentication.
 * Al volver a la app comprueba sola el estado, sin que el usuario tenga que pulsar nada.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import {
  AppPressable,
  AppText,
  FormMessage,
  GlassSurface,
  KeyboardAwareScrollView,
  MIN_TOUCH_TARGET_PT,
  ThemeToggleIconButton,
  WebAppHeader,
  useBFlowTheme,
  usePrimaryActionLook,
  useResponsiveLayout,
} from '../../../design-system';
import { getCooldownRemainingMs, startCooldown } from '../../../platform/auth/authRateLimiter';
import { useCountdown } from '../hooks/useCountdown';

const VERIFICATION_CARD_MAX_WIDTH_PT = 460;

export interface EmailVerificationScreenProps {
  email: string | null;
  /** Reenvía el correo de verificación. Rechaza con un mensaje para el usuario si falla. */
  onResendVerification: () => Promise<void>;
  /** Consulta el estado en Firebase. Resuelve `true` cuando el correo ya está verificado. */
  onCheckVerification: () => Promise<boolean>;
  onSignOut: () => void;
}

export function EmailVerificationScreen({
  email,
  onResendVerification,
  onCheckVerification,
  onSignOut,
}: EmailVerificationScreenProps): React.JSX.Element {
  const { colors, spacing, radius, skin } = useBFlowTheme();
  const layout = useResponsiveLayout();
  const primaryAction = usePrimaryActionLook();

  const [busyAction, setBusyAction] = useState<'check' | 'resend' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  // El correo del registro acaba de salir: reenviarlo espera como cualquier otro (ADR 0026).
  const resendCooldown = useCountdown(() => getCooldownRemainingMs('verification_email'));
  const isResendWaiting = resendCooldown.secondsLeft > 0;

  const isMountedRef = useRef(true);
  const isCheckingRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // `announce` distingue el toque del usuario de la comprobación silenciosa al volver a la app.
  const checkVerification = useCallback(
    async (announce: boolean) => {
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;
      if (announce) {
        setBusyAction('check');
        setErrorMessage(null);
        setStatusMessage(null);
      }
      try {
        const isVerified = await onCheckVerification();
        if (!isVerified && announce && isMountedRef.current) {
          setErrorMessage(
            'Tu correo aún no aparece verificado. Abre el enlace que te enviamos y vuelve a intentarlo.'
          );
        }
      } catch (err) {
        if (announce && isMountedRef.current) {
          setErrorMessage(
            err instanceof Error ? err.message : 'No fue posible comprobar la verificación.'
          );
        }
      } finally {
        isCheckingRef.current = false;
        if (announce && isMountedRef.current) {
          setBusyAction(null);
        }
      }
    },
    [onCheckVerification]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        void checkVerification(false);
      }
    });
    return () => subscription.remove();
  }, [checkVerification]);

  const handleResend = async () => {
    setBusyAction('resend');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await onResendVerification();
      startCooldown('verification_email');
      if (isMountedRef.current) {
        resendCooldown.refresh();
        setStatusMessage(`Enviamos un nuevo enlace de verificación a ${email ?? 'tu correo'}.`);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setErrorMessage(
          err instanceof Error ? err.message : 'No fue posible enviar el correo de verificación.'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setBusyAction(null);
      }
    }
  };

  const isBusy = busyAction !== null;

  const card = (
    <GlassSurface elevated testID="email-verification-card">
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.xs }}>
          <AppText variant="title2" accessibilityRole="header">
            Verifica tu correo electrónico
          </AppText>
          <AppText variant="body" color={colors.text.secondary}>
            Enviamos un enlace de verificación a:
          </AppText>
          <AppText variant="headline" testID="email-verification-address">
            {email ?? 'tu correo'}
          </AppText>
          <AppText variant="caption" color={colors.text.secondary}>
            Ábrelo desde tu correo y vuelve aquí para entrar a tu presupuesto. Si no lo ves, revisa
            la carpeta de correo no deseado.
          </AppText>
        </View>

        <FormMessage message={errorMessage} testID="email-verification-error-banner" />
        <FormMessage
          message={statusMessage}
          tone="success"
          testID="email-verification-status-banner"
        />

        <AppPressable
          testID="email-verification-check-button"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => void checkVerification(true)}
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
            {busyAction === 'check' ? 'Comprobando...' : 'Ya verifiqué mi correo'}
          </AppText>
        </AppPressable>

        <AppPressable
          testID="email-verification-resend-button"
          accessibilityRole="button"
          disabled={isBusy || isResendWaiting}
          onPress={handleResend}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.glass.surfaceTint,
            borderWidth: 1,
            borderColor: colors.glass.subtleBorder,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: spacing.sm,
          }}
        >
          <AppText variant="caption" color={colors.text.primary} style={{ fontWeight: '600' }}>
            {busyAction === 'resend'
              ? 'Enviando correo...'
              : isResendWaiting
                ? `Podrás reenviarlo en ${resendCooldown.secondsLeft} s`
                : 'Reenviar correo de verificación'}
          </AppText>
        </AppPressable>

        <AppPressable
          testID="email-verification-sign-out-button"
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión y usar otra cuenta"
          onPress={onSignOut}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: spacing.xs,
          }}
        >
          <AppText variant="caption" color={colors.text.secondary}>
            ¿No es tu correo? Cerrar sesión
          </AppText>
        </AppPressable>
      </View>
    </GlassSurface>
  );

  if (skin === 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
        <WebAppHeader layout={layout} themeToggleTestID="email-verification-theme-toggle-button" />
        <KeyboardAwareScrollView
          testID="email-verification-screen"
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: layout.gutter,
            paddingVertical: spacing.xxl,
          }}
        >
          <View
            style={{ width: '100%', maxWidth: VERIFICATION_CARD_MAX_WIDTH_PT, alignSelf: 'center' }}
          >
            {card}
          </View>
        </KeyboardAwareScrollView>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      testID="email-verification-screen"
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
          maxWidth: VERIFICATION_CARD_MAX_WIDTH_PT,
          alignSelf: 'center',
          gap: spacing.lg,
        }}
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <AppText variant="heroCurrency">BFlow</AppText>
          <ThemeToggleIconButton testID="email-verification-theme-toggle-button" />
        </View>
        {card}
      </View>
    </KeyboardAwareScrollView>
  );
}
