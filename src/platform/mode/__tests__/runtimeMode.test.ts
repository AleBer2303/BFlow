import { ExecutionEnvironment } from 'expo-constants';
import { resolveRuntimeCapabilities } from '../runtimeMode';

describe('platform/mode/runtimeMode — Mode A vs Mode B isolation', () => {
  it('returns Mode A Web capabilities when running on web', () => {
    const caps = resolveRuntimeCapabilities('web', ExecutionEnvironment.Bare);
    expect(caps.mode).toBe('mode-a-web');
    expect(caps.supportsNativeWidgets).toBe(false);
    expect(caps.supportsLiveActivities).toBe(false);
    expect(caps.supportsNativeLiquidGlass).toBe(false);
  });

  it('returns Mode A Expo Go capabilities when running inside Expo Go storeClient', () => {
    const caps = resolveRuntimeCapabilities('ios', ExecutionEnvironment.StoreClient);
    expect(caps.mode).toBe('mode-a-expo-go');
    expect(caps.supportsNativeWidgets).toBe(false);
    expect(caps.supportsLiveActivities).toBe(false);
    expect(caps.supportsNativeLiquidGlass).toBe(false);
  });

  it('returns Mode B Native .ipa capabilities when running standalone/bare on iOS', () => {
    const caps = resolveRuntimeCapabilities('ios', ExecutionEnvironment.Standalone);
    expect(caps.mode).toBe('mode-b-native-ipa');
    expect(caps.supportsNativeWidgets).toBe(true);
    expect(caps.supportsLiveActivities).toBe(true);
    expect(caps.supportsNativeLiquidGlass).toBe(true);
    expect(caps.supportsNativeGoogleSignIn).toBe(true);
  });
});
