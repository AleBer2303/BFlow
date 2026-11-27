/**
 * Jest setup shared by every suite.
 *
 * - Gesture Handler: mocks its native module (official jestSetup).
 * - Sample month: pins the month of the example budget.
 * - Worklets: in Jest the web build is used (see `resolver` in jest.config.js) and it has no UI
 *   runtime, but Gesture Handler 3 asks for one on load. An empty holder keeps it quiet.
 */
require('react-native-gesture-handler/jestSetup.js');

// The example budget (src/data/sample/sampleWorkspace.ts) starts in the current month; tests pin
// it so their figures do not depend on the day they run.
process.env.BFLOW_SAMPLE_MONTH_KEY = '2026-10';

jest.mock('react-native-worklets', () => ({
  ...jest.requireActual('react-native-worklets'),
  getUIRuntimeHolder: () => ({}),
}));

// Native Liquid Glass (iOS 26 UIGlassEffect) does not exist in Jest: the dock renders its blur
// fallback unless a suite mocks availability (see floatingLiquidGlassDock.test.tsx).
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return {
    GlassView: View,
    GlassContainer: View,
    isLiquidGlassAvailable: jest.fn(() => false),
    isGlassEffectAPIAvailable: jest.fn(() => false),
  };
});
