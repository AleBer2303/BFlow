/**
 * src/platform/mail/resendService.ts
 *
 * Resend Email Integration for BFlow.
 * Dispatches 6-digit verification codes directly inside the email body
 * using Resend's REST API.
 */

export interface ResendEmailPayload {
  to: string;
  code: string;
  subject?: string;
}

export interface ResendOptions {
  apiKey?: string;
  fromEmail?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface ResendSendResult {
  success: boolean;
  id?: string;
  simulated?: boolean;
  unverifiedDomain?: boolean;
  message: string;
}

export const DEFAULT_RESEND_TIMEOUT_MS = 10_000;
const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'BFlow <onboarding@resend.dev>';

/**
 * Builds the branded HTML email body containing the 6-digit verification code.
 */
export function buildVerificationEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Código de verificación BFlow</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b101b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b101b; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; padding: 32px 24px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);">
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <span style="font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">BFlow</span>
              <div style="font-size: 13px; font-weight: 600; color: #38bdf8; margin-top: 4px; letter-spacing: 0.5px;">FINANZAS PERSONALES</div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 16px;">
              <h1 style="margin: 0 0 12px; font-size: 20px; font-weight: 700; color: #ffffff; text-align: center;">Código de verificación</h1>
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #94a3b8; text-align: center;">
                Ingresa el siguiente código de 6 dígitos en la aplicación BFlow para actualizar tu contraseña de forma segura:
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 24px 0;">
              <div style="display: inline-block; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 14px; padding: 18px 32px; text-align: center;">
                <span style="font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #38bdf8; font-family: 'Courier New', Courier, monospace;">${code}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
              <p style="margin: 0 0 8px; font-size: 12px; line-height: 1.5; color: #64748b; text-align: center;">
                Este código expira en <strong>15 minutos</strong>. Si tú no solicitaste este cambio, puedes ignorar este correo; tu cuenta permanece protegida.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends a 6-digit verification code directly inside the email body using Resend.
 *
 * If Resend rejects the recipient due to sandbox unverified domain restrictions (status 403),
 * returns `{ success: false, unverifiedDomain: true }` so caller can seamlessly fallback.
 */
export async function sendVerificationCodeViaResend(
  payload: ResendEmailPayload,
  options?: ResendOptions
): Promise<ResendSendResult> {
  const apiKey = (options?.apiKey ?? process.env.EXPO_PUBLIC_RESEND_API_KEY)?.trim();
  const fromEmail = (options?.fromEmail ?? process.env.EXPO_PUBLIC_RESEND_FROM_EMAIL)?.trim() || DEFAULT_FROM;
  const fetchFn = options?.fetchFn || (typeof fetch !== 'undefined' ? fetch : globalThis.fetch);
  const { to, code } = payload;
  const subject = payload.subject || `Tu código de verificación BFlow: ${code}`;

  const html = buildVerificationEmailHtml(code);

  // If no Resend API key is configured (e.g. initial setup, offline, or tests)
  if (!apiKey || apiKey === 'YOUR_RESEND_API_KEY') {
    if (__DEV__ || process.env.NODE_ENV === 'test') {
      // eslint-disable-next-line no-console
      console.info(
        `[Resend Simulado] Para: ${to} | Código: ${code} (Agrega EXPO_PUBLIC_RESEND_API_KEY en .env para entrega real)`
      );
    }
    return {
      success: true,
      simulated: true,
      message: `Código de verificación generado (${code}) para ${to}. Para recibirlo por correo en tu bandeja real, agrega EXPO_PUBLIC_RESEND_API_KEY en tu archivo .env.`,
    };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_RESEND_TIMEOUT_MS;
  let signal: AbortSignal | undefined;
  let timerId: ReturnType<typeof setTimeout> | undefined;

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    signal = AbortSignal.timeout(timeoutMs);
  } else if (typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    timerId = setTimeout(() => controller.abort(), timeoutMs);
    signal = controller.signal;
  }

  try {
    const response = await fetchFn(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
      ...(signal ? { signal } : {}),
    });

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      statusCode?: number;
      name?: string;
    };

    if (!response.ok) {
      const errorMsg = data?.message || `Error HTTP ${response.status} de Resend`;
      const isUnverifiedDomain =
        response.status === 403 ||
        errorMsg.includes('only send testing emails') ||
        errorMsg.includes('resend.com/domains');

      if (isUnverifiedDomain) {
        if (__DEV__ || process.env.NODE_ENV === 'test') {
          // eslint-disable-next-line no-console
          console.warn(
            `[Resend Dominio no verificado] Para: ${to}. Resend en modo sandbox sólo entrega a tu correo registrado. Agrega tu dominio en resend.com/domains para enviar a cualquier usuario.`
          );
        }
        return {
          success: false,
          unverifiedDomain: true,
          message:
            'Resend en modo sandbox requiere verificar un dominio propio (resend.com/domains) para enviar a correos distintos al del creador.',
        };
      }

      throw new Error(errorMsg);
    }

    return {
      success: true,
      id: data?.id,
      simulated: false,
      message: `Hemos enviado el código de verificación de 6 dígitos a ${to} vía correo electrónico.`,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' ||
        error.name === 'AbortError' ||
        error.message.toLowerCase().includes('timeout') ||
        error.message.toLowerCase().includes('aborted'))
    ) {
      throw new Error(
        `El servicio de correo tardó demasiado en responder (${Math.round(timeoutMs / 1000)}s). Por favor reintenta.`
      );
    }
    const errorMsg =
      error instanceof Error ? error.message : 'Error desconocido al contactar Resend';
    throw new Error(`No se pudo enviar el correo de verificación: ${errorMsg}`);
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
  }
}
