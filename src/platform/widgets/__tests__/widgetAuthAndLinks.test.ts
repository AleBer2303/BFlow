import { buildWidgetDeepLink, parseWidgetDeepLinkTab } from '../widgetDeepLink';

const mockOnIdTokenChanged = jest.fn();
jest.mock('firebase/auth', () => ({
  onIdTokenChanged: (...args: unknown[]) => mockOnIdTokenChanged(...args),
}));
jest.mock('../../../data/firebase/firebaseConfig', () => ({
  getFirebaseAuth: () => ({ name: 'auth' }),
  getFirebaseApp: () => ({ options: { apiKey: 'api-key', projectId: 'bflow-test' } }),
}));

const mockSyncWidgetAuth = jest.fn();
const mockClearWidgetData = jest.fn();
jest.mock('../widgetAdapter', () => ({
  syncWidgetAuth: (...args: unknown[]) => mockSyncWidgetAuth(...args),
  clearWidgetData: (...args: unknown[]) => mockClearWidgetData(...args),
}));

// eslint-disable-next-line import/first
import { buildWidgetAuth, subscribeWidgetAuthBridge } from '../widgetAuthBridge';

describe('widgetDeepLink', () => {
  it('construye y lee los enlaces de cada pestaña de widget', () => {
    for (const tab of ['summary', 'checklist', 'debts', 'savings'] as const) {
      expect(parseWidgetDeepLinkTab(buildWidgetDeepLink(tab))).toBe(tab);
    }
  });

  it('ignora pestañas desconocidas, URLs sin query y codificaciones rotas', () => {
    expect(parseWidgetDeepLinkTab('bflow://?tab=account')).toBeNull();
    expect(parseWidgetDeepLinkTab('bflow://')).toBeNull();
    expect(parseWidgetDeepLinkTab(null)).toBeNull();
    expect(parseWidgetDeepLinkTab('bflow://?other=1')).toBeNull();
    expect(parseWidgetDeepLinkTab('bflow://?tab=%E0%A4%A')).toBeNull();
    expect(parseWidgetDeepLinkTab('bflow:///?foo=1&tab=debts#x')).toBe('debts');
  });
});

describe('widgetAuthBridge', () => {
  beforeEach(() => {
    mockOnIdTokenChanged.mockReset();
    mockSyncWidgetAuth.mockReset();
    mockClearWidgetData.mockReset();
  });

  it('arma las credenciales solo con todos los datos', () => {
    expect(buildWidgetAuth({ uid: 'u', refreshToken: 'r' }, { apiKey: 'k', projectId: 'p' })).toEqual({
      schemaVersion: 1,
      uid: 'u',
      refreshToken: 'r',
      apiKey: 'k',
      projectId: 'p',
    });
    expect(buildWidgetAuth(null, { apiKey: 'k', projectId: 'p' })).toBeNull();
    expect(buildWidgetAuth({ uid: 'u', refreshToken: '' }, { apiKey: 'k', projectId: 'p' })).toBeNull();
    expect(buildWidgetAuth({ uid: 'u', refreshToken: 'r' }, { projectId: 'p' })).toBeNull();
  });

  it('pasa las credenciales al iniciar sesión y limpia al cerrarla', () => {
    const unsubscribe = jest.fn();
    mockOnIdTokenChanged.mockReturnValue(unsubscribe);

    const stop = subscribeWidgetAuthBridge();
    const listener = mockOnIdTokenChanged.mock.calls[0]?.[1] as (user: unknown) => void;

    listener({ uid: 'uid_1', refreshToken: 'refresh' });
    expect(mockSyncWidgetAuth).toHaveBeenCalledWith({
      schemaVersion: 1,
      uid: 'uid_1',
      refreshToken: 'refresh',
      apiKey: 'api-key',
      projectId: 'bflow-test',
    });

    listener(null);
    expect(mockClearWidgetData).toHaveBeenCalledTimes(1);

    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('no rompe si Firebase no está disponible', () => {
    mockOnIdTokenChanged.mockImplementation(() => {
      throw new Error('no auth');
    });
    const stop = subscribeWidgetAuthBridge();
    expect(() => stop()).not.toThrow();
  });
});
