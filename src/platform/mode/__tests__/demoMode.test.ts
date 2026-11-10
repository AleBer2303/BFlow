import { isDemoModeEnabled, readDemoQueryParam } from '../demoMode';

describe('platform/mode/demoMode (local showcase)', () => {
  it('is off unless the flag is explicitly "1" or "true"', () => {
    expect(isDemoModeEnabled(undefined)).toBe(false);
    expect(isDemoModeEnabled('')).toBe(false);
    expect(isDemoModeEnabled('0')).toBe(false);
    expect(isDemoModeEnabled('yes')).toBe(false);
    expect(isDemoModeEnabled('1')).toBe(true);
    expect(isDemoModeEnabled(' TRUE ')).toBe(true);
  });

  it('is off by default in the test environment', () => {
    expect(isDemoModeEnabled()).toBe(false);
  });

  it('reads query parameters only while the demo mode is on', () => {
    expect(readDemoQueryParam('skin', '?skin=android&theme=light', true)).toBe('android');
    expect(readDemoQueryParam('theme', '?skin=android&theme=light', true)).toBe('light');
    expect(readDemoQueryParam('skin', '?skin=android', false)).toBeNull();
  });

  it('normalizes values and tolerates malformed input', () => {
    expect(readDemoQueryParam('skin', 'skin=%20IOS%20', true)).toBe('ios');
    expect(readDemoQueryParam('skin', '?skin=', true)).toBeNull();
    expect(readDemoQueryParam('skin', '?skin', true)).toBeNull();
    expect(readDemoQueryParam('skin', '?other=1', true)).toBeNull();
    expect(readDemoQueryParam('skin', '', true)).toBeNull();
    expect(readDemoQueryParam('skin', '?skin=%E0%A4%A', true)).toBeNull();
  });

  it('returns null where there is no location (native, tests)', () => {
    expect(readDemoQueryParam('skin')).toBeNull();
  });
});
