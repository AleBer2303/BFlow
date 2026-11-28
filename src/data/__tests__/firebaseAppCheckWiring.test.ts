/**
 * `getFirebaseApp` instala App Check una sola vez, justo después de `initializeApp` (ADR 0038).
 */

const mockInitializeApp = jest.fn((options: object) => ({ name: '[DEFAULT]', options }));
const mockInstallAppCheck = jest.fn((..._args: unknown[]) => ({
  state: 'disabled' as const,
  reason: 'no-firebase-project' as const,
}));

jest.mock('firebase/app', () => ({
  getApps: () => [],
  getApp: jest.fn(),
  initializeApp: (options: object) => mockInitializeApp(options),
}));

jest.mock('../../platform/appCheck/installAppCheck', () => ({
  installAppCheck: (...args: unknown[]) => mockInstallAppCheck(...args),
}));

describe('getFirebaseApp + App Check', () => {
  beforeEach(() => {
    jest.resetModules();
    mockInitializeApp.mockClear();
    mockInstallAppCheck.mockClear();
  });

  it('instala App Check con el origen de la configuración y guarda su estado', () => {
    jest.isolateModules(() => {
      const { getAppCheckStatus, getFirebaseApp } =
        require('../firebase/firebaseConfig') as typeof import('../firebase/firebaseConfig');

      const app = getFirebaseApp();
      getFirebaseApp();

      expect(mockInitializeApp).toHaveBeenCalledTimes(1);
      expect(mockInstallAppCheck).toHaveBeenCalledTimes(1);
      // En Jest no hay variables de Firebase: proyecto ficticio, App Check apagado.
      expect(mockInstallAppCheck).toHaveBeenCalledWith(app, 'offline-mock');
      expect(getAppCheckStatus()).toEqual({ state: 'disabled', reason: 'no-firebase-project' });
    });
  });
});
