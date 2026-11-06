import {
  clearVerificationCodesForTesting,
  confirmPasswordResetWithCode,
  extractVerificationOrOobCode,
  generate6DigitVerificationCode,
  injectVerificationCodeForTesting,
  peekVerificationCode,
  requestPasswordResetCode,
  verifyPasswordResetCode,
} from '../verificationCodeService';
import { getFirebaseAuth } from '../../../data/firebase/firebaseConfig';
import { updatePassword } from 'firebase/auth';

jest.mock('../../../data/firebase/firebaseConfig', () => {
  const original = jest.requireActual('../../../data/firebase/firebaseConfig');
  return {
    ...original,
    getFirebaseAuth: jest.fn(() => ({
      currentUser: null,
    })),
  };
});

jest.mock('firebase/auth', () => {
  const original = jest.requireActual('firebase/auth');
  return {
    ...original,
    updatePassword: jest.fn().mockResolvedValue(undefined),
    confirmPasswordReset: jest.fn().mockResolvedValue(undefined),
  };
});

describe('verificationCodeService - 6-Digit Email Verification & In-App Password Reset with Resend', () => {
  beforeEach(() => {
    clearVerificationCodesForTesting();
    jest.clearAllMocks();
    (getFirebaseAuth as jest.Mock).mockReturnValue({
      currentUser: null,
    });
  });

  it('generates a 6-digit numeric code string between 100000 and 999999', () => {
    for (let i = 0; i < 20; i++) {
      const code = generate6DigitVerificationCode();
      expect(code).toMatch(/^\d{6}$/);
      const num = parseInt(code, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThanOrEqual(999999);
    }
  });

  it('throws an error when requesting a code with an invalid email', async () => {
    await expect(requestPasswordResetCode('invalid-email')).rejects.toThrow(
      'Escribe un correo electrónico válido para enviarte el código de verificación.'
    );
  });

  it('generates and stores code for valid email, allowing peek and verification', async () => {
    const res = await requestPasswordResetCode('abernal@bflow.app');
    expect(res.success).toBe(true);
    expect(res.message).toContain('abernal@bflow.app');

    const code = peekVerificationCode('abernal@bflow.app');
    expect(code).toBeTruthy();
    expect(code).toMatch(/^\d{6}$/);

    const verification = verifyPasswordResetCode('abernal@bflow.app', code!);
    expect(verification.valid).toBe(true);
  });

  it('rejects incorrect 6-digit codes and tracks attempts', () => {
    injectVerificationCodeForTesting('test@bflow.app', '654321');

    const failure = verifyPasswordResetCode('test@bflow.app', '000000');
    expect(failure.valid).toBe(false);
    expect(failure.error).toContain('código de verificación de 6 dígitos es incorrecto');

    // After 5 attempts, code is invalidated
    for (let i = 0; i < 4; i++) {
      verifyPasswordResetCode('test@bflow.app', '000000');
    }
    const maxAttemptFailure = verifyPasswordResetCode('test@bflow.app', '654321');
    expect(maxAttemptFailure.valid).toBe(false);
    expect(maxAttemptFailure.error).toContain('superado el número de intentos permitidos');
  });

  it('rejects expired verification codes', () => {
    injectVerificationCodeForTesting('expired@bflow.app', '123456', -1);

    const check = verifyPasswordResetCode('expired@bflow.app', '123456');
    expect(check.valid).toBe(false);
    expect(check.error).toContain('código de verificación ha expirado');
  });

  it('successfully confirms password reset and consumes code', async () => {
    injectVerificationCodeForTesting('user@bflow.app', '789123');

    // Rejects if password is too short
    await expect(
      confirmPasswordResetWithCode('user@bflow.app', '789123', '123')
    ).rejects.toThrow('La nueva contraseña debe tener al menos 6 caracteres.');

    // Accepts valid code and password
    const result = await confirmPasswordResetWithCode('user@bflow.app', '789123', 'nuevaClaveSegura');
    expect(result.success).toBe(true);
    expect(result.message).toContain('actualizada exitosamente');

    // Code must be consumed (not reusable)
    expect(peekVerificationCode('user@bflow.app')).toBeNull();
  });

  it('synchronizes directly with Firebase Auth when user has active session', async () => {
    const mockUser = {
      uid: 'user-active-123',
      email: 'active@bflow.app',
    };
    (getFirebaseAuth as jest.Mock).mockReturnValue({
      currentUser: mockUser,
    });

    injectVerificationCodeForTesting('active@bflow.app', '445566');

    const result = await confirmPasswordResetWithCode(
      'active@bflow.app',
      '445566',
      'miNuevaPassword2026'
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('sincronizada y actualizada exitosamente en Firebase');
    expect(updatePassword).toHaveBeenCalledWith(mockUser, 'miNuevaPassword2026');
    expect(peekVerificationCode('active@bflow.app')).toBeNull();
  });

  it('extracts oobCode correctly from full email reset link, partial query, or plain code', () => {
    const fullUrl =
      'https://bflow-deaeb.firebaseapp.com/__/auth/action?mode=resetPassword&apiKey=AIzaSyAWzxVFw0B9PDibx494JzZXMpfrxXvKD04&oobCode=firebase_oob_test_code_123&lang=es';
    expect(extractVerificationOrOobCode(fullUrl)).toBe('firebase_oob_test_code_123');

    const partialQuery = 'mode=resetPassword&oobCode=oob_code_abc%20123&apiKey=test';
    expect(extractVerificationOrOobCode(partialQuery)).toBe('oob_code_abc 123');

    expect(extractVerificationOrOobCode('  654321  ')).toBe('654321');
  });

  it('allows resetting password using a full email reset URL via code extractor', async () => {
    injectVerificationCodeForTesting('user@bflow.app', '654321');

    const result = await confirmPasswordResetWithCode(
      'user@bflow.app',
      ' 654321 ',
      'nuevaClaveDesdeLink123'
    );
    expect(result.success).toBe(true);
  });
});
