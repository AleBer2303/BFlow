/**
 * src/platform/mode/runtimeMode.ts
 *
 * Detects whether BFlow is running in:
 * - Mode A ('expo-go' | 'web'): Development inside Expo Go on iPhone or Web on Windows 11.
 * - Mode B ('native-ipa'): Standalone / prebuild native iOS .ipa signed with iloader.
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export type BFlowRuntimeMode = 'mode-a-expo-go' | 'mode-a-web' | 'mode-b-native-ipa';

export interface RuntimeCapabilities {
  mode: BFlowRuntimeMode;
  label: string;
  supportsNativeWidgets: boolean;
  supportsLiveActivities: boolean;
  supportsNativeLiquidGlass: boolean;
  supportsNativeGoogleSignIn: boolean;
}

export function resolveRuntimeCapabilities(
  os: string = Platform.OS,
  executionEnvironment: ExecutionEnvironment | string | null | undefined = Constants.executionEnvironment
): RuntimeCapabilities {
  if (os === 'web') {
    return {
      mode: 'mode-a-web',
      label: 'Modo A · Web Preview (Windows 11)',
      supportsNativeWidgets: false,
      supportsLiveActivities: false,
      supportsNativeLiquidGlass: false,
      supportsNativeGoogleSignIn: false,
    };
  }

  const isExpoGo = executionEnvironment === ExecutionEnvironment.StoreClient || executionEnvironment === 'storeClient';

  if (isExpoGo) {
    return {
      mode: 'mode-a-expo-go',
      label: 'Modo A · Expo Go (SDK 58)',
      supportsNativeWidgets: false,
      supportsLiveActivities: false,
      supportsNativeLiquidGlass: false,
      supportsNativeGoogleSignIn: false,
    };
  }

  return {
    mode: 'mode-b-native-ipa',
    label: 'Modo B · Build Nativo iOS 26 (.ipa)',
    supportsNativeWidgets: os === 'ios',
    supportsLiveActivities: os === 'ios',
    supportsNativeLiquidGlass: os === 'ios',
    supportsNativeGoogleSignIn: true,
  };
}
