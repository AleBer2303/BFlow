import { formatAppVersionLabel, getAppVersion } from '../appVersion';

describe('versión de la app (CC-04)', () => {
  it('lee la versión de la configuración de Expo (app.json)', () => {
    expect(getAppVersion({ version: ' 2.3.4 ' })).toBe('2.3.4');
    expect(formatAppVersionLabel('Material 3', '2.3.4')).toBe('BFlow v2.3.4 (Material 3)');
  });

  it.each([undefined, null, {}, { version: '' }, { version: '  ' }, { version: 3 }])(
    'sin una versión válida (%p) no inventa un número',
    (config) => {
      expect(getAppVersion(config)).toBeNull();
      expect(formatAppVersionLabel('Web', getAppVersion(config))).toBe('BFlow (Web)');
    }
  );

  it('en Jest la configuración de Expo llega vacía y la etiqueta queda sin número', () => {
    expect(getAppVersion()).toBeNull();
    expect(formatAppVersionLabel('Liquid Glass')).toBe('BFlow (Liquid Glass)');
  });
});
