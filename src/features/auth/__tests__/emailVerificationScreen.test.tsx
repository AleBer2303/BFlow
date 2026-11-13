import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import {
  EmailVerificationScreen,
  type EmailVerificationScreenProps,
} from '../components/EmailVerificationScreen';

type Skin = 'ios' | 'android' | 'web';

function renderScreen(props: Partial<EmailVerificationScreenProps> = {}, skin?: Skin) {
  const handlers = {
    onResendVerification: jest.fn().mockResolvedValue(undefined),
    onCheckVerification: jest.fn().mockResolvedValue(false),
    onSignOut: jest.fn(),
    ...props,
  };
  render(
    <BFlowThemeProvider initialMode="dark" skin={skin}>
      <EmailVerificationScreen email="nueva.cuenta@correo.com" {...handlers} />
    </BFlowThemeProvider>
  );
  return handlers;
}

describe('EmailVerificationScreen (ADR 0025)', () => {
  it.each(['ios', 'android', 'web'] as const)(
    'shows the address and the three actions on the %s skin',
    async (skin) => {
      const handlers = renderScreen({}, skin);

      expect(screen.getByTestId('email-verification-screen')).toBeTruthy();
      expect(screen.getByText('Verifica tu correo electrónico')).toBeTruthy();
      expect(screen.getByTestId('email-verification-address')).toHaveTextContent(
        'nueva.cuenta@correo.com'
      );
      expect(screen.getByTestId('email-verification-theme-toggle-button')).toBeTruthy();

      await act(async () => {
        fireEvent.press(screen.getByTestId('email-verification-check-button'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('email-verification-resend-button'));
      });
      fireEvent.press(screen.getByTestId('email-verification-sign-out-button'));

      expect(handlers.onCheckVerification).toHaveBeenCalledTimes(1);
      expect(handlers.onResendVerification).toHaveBeenCalledTimes(1);
      expect(handlers.onSignOut).toHaveBeenCalledTimes(1);
    }
  );

  it('explains that the email is still unverified when the user checks too early', async () => {
    renderScreen({ onCheckVerification: jest.fn().mockResolvedValue(false) });

    await act(async () => {
      fireEvent.press(screen.getByTestId('email-verification-check-button'));
    });

    expect(screen.getByTestId('email-verification-error-banner')).toHaveTextContent(
      /aún no aparece verificado/i
    );
  });

  it('shows no error when the check reports the email as verified', async () => {
    renderScreen({ onCheckVerification: jest.fn().mockResolvedValue(true) });

    await act(async () => {
      fireEvent.press(screen.getByTestId('email-verification-check-button'));
    });

    expect(screen.queryByTestId('email-verification-error-banner')).toBeNull();
  });

  it('shows the reason when the check or the resend fail', async () => {
    renderScreen({
      onCheckVerification: jest
        .fn()
        .mockRejectedValue(new Error('Error de conexión. Revisa tu internet e intenta nuevamente.')),
      onResendVerification: jest
        .fn()
        .mockRejectedValue(
          new Error('Demasiados intentos fallidos. Por seguridad, espera un momento antes de reintentar.')
        ),
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('email-verification-check-button'));
    });
    expect(screen.getByTestId('email-verification-error-banner')).toHaveTextContent(
      'Error de conexión. Revisa tu internet e intenta nuevamente.'
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('email-verification-resend-button'));
    });
    expect(screen.getByTestId('email-verification-error-banner')).toHaveTextContent(
      /Demasiados intentos fallidos/
    );
    expect(screen.queryByTestId('email-verification-status-banner')).toBeNull();
  });

  it('confirms the resend with the destination address', async () => {
    renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByTestId('email-verification-resend-button'));
    });

    expect(screen.getByTestId('email-verification-status-banner')).toHaveTextContent(
      'Enviamos un nuevo enlace de verificación a nueva.cuenta@correo.com.'
    );
  });

  it('checks again by itself when the app returns to the foreground, without showing errors', async () => {
    let appStateListener: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    const addListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateListener = listener as (state: AppStateStatus) => void;
        return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
      });

    try {
      const handlers = renderScreen({ onCheckVerification: jest.fn().mockResolvedValue(false) });

      await act(async () => {
        appStateListener?.('background');
      });
      expect(handlers.onCheckVerification).not.toHaveBeenCalled();

      await act(async () => {
        appStateListener?.('active');
      });
      expect(handlers.onCheckVerification).toHaveBeenCalledTimes(1);
      // A silent check: the user did not ask, so nothing is announced
      expect(screen.queryByTestId('email-verification-error-banner')).toBeNull();

      screen.unmount();
      expect(remove).toHaveBeenCalledTimes(1);
    } finally {
      addListenerSpy.mockRestore();
    }
  });
});
