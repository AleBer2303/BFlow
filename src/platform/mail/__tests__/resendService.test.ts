/**
 * src/platform/mail/__tests__/resendService.test.ts
 *
 * Unit tests for Resend Email Integration.
 */

import {
  buildVerificationEmailHtml,
  sendVerificationCodeViaResend,
} from '../resendService';

describe('resendService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('buildVerificationEmailHtml includes 6-digit code and BFlow branding', () => {
    const html = buildVerificationEmailHtml('948201');
    expect(html).toContain('948201');
    expect(html).toContain('BFlow');
    expect(html).toContain('Código de verificación');
    expect(html).toContain('15 minutos');
  });

  it('simulates dispatch cleanly when EXPO_PUBLIC_RESEND_API_KEY is missing', async () => {
    delete process.env.EXPO_PUBLIC_RESEND_API_KEY;

    const result = await sendVerificationCodeViaResend({
      to: 'test@bflow.app',
      code: '123456',
    });

    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.message).toContain('123456');
  });

  it('dispatches to Resend API when API key is provided via options or env', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_resend_abc123' }),
    });

    const result = await sendVerificationCodeViaResend(
      {
        to: 'alejandro@bflow.app',
        code: '654321',
      },
      {
        apiKey: 're_test_key_123456',
        fromEmail: 'BFlow <seguridad@bflow.app>',
        fetchFn: mockFetch as unknown as typeof fetch,
      }
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key_123456',
          'Content-Type': 'application/json',
        }),
      })
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.to).toEqual(['alejandro@bflow.app']);
    expect(callBody.from).toBe('BFlow <seguridad@bflow.app>');
    expect(callBody.html).toContain('654321');
    expect(result.success).toBe(true);
    expect(result.id).toBe('email_resend_abc123');
    expect(result.simulated).toBe(false);
  });

  it('detects unverified domain restrictions (403) and returns unverifiedDomain: true', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        message:
          'You can only send testing emails to your own email address (abernalg2303@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains.',
        statusCode: 403,
      }),
    });

    const result = await sendVerificationCodeViaResend(
      {
        to: 'otheruser@gmail.com',
        code: '123456',
      },
      {
        apiKey: 're_valid_key',
        fetchFn: mockFetch as unknown as typeof fetch,
      }
    );

    expect(result.success).toBe(false);
    expect(result.unverifiedDomain).toBe(true);
    expect(result.message).toContain('resend.com/domains');
  });

  it('throws a descriptive error when Resend API returns an unhandled error response', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'API key is invalid' }),
    });

    await expect(
      sendVerificationCodeViaResend(
        {
          to: 'fail@bflow.app',
          code: '112233',
        },
        {
          apiKey: 're_invalid_key',
          fetchFn: mockFetch as unknown as typeof fetch,
        }
      )
    ).rejects.toThrow('API key is invalid');
  });

  it('aborts with a friendly retry message when the external API times out (Point 12)', async () => {
    const timeoutError = new Error('The operation was aborted');
    timeoutError.name = 'AbortError';

    const mockFetch = jest.fn().mockRejectedValue(timeoutError);

    await expect(
      sendVerificationCodeViaResend(
        {
          to: 'slow@bflow.app',
          code: '998877',
        },
        {
          apiKey: 're_test_key',
          fetchFn: mockFetch as unknown as typeof fetch,
          timeoutMs: 5000,
        }
      )
    ).rejects.toThrow(/El servicio de correo tardó demasiado en responder \(5s\)\. Por favor reintenta\./);
  });
});
