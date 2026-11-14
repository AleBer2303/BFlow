import { LayoutAnimation, Platform, UIManager } from 'react-native';

describe('layoutTransition', () => {
  const originalOS = Platform.OS;
  const originalSetExperimental = UIManager.setLayoutAnimationEnabledExperimental;
  const originalFabric = (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    Object.defineProperty(UIManager, 'setLayoutAnimationEnabledExperimental', {
      value: originalSetExperimental,
      configurable: true,
      writable: true,
    });
    if (originalFabric === undefined) {
      delete (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager;
    } else {
      (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager = originalFabric;
    }
  });

  it('skips setLayoutAnimationEnabledExperimental when New Architecture (Fabric) is active on Android', () => {
    const spy = jest.fn();
    jest.isolateModules(() => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      Object.defineProperty(UIManager, 'setLayoutAnimationEnabledExperimental', {
        value: spy,
        configurable: true,
        writable: true,
      });
      (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager = {};

      require('../motion/layoutTransition');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('enables setLayoutAnimationEnabledExperimental on Android legacy architecture', () => {
    const spy = jest.fn();
    jest.isolateModules(() => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      Object.defineProperty(UIManager, 'setLayoutAnimationEnabledExperimental', {
        value: spy,
        configurable: true,
        writable: true,
      });
      delete (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager;

      require('../motion/layoutTransition');
      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  it('configures create and update without delete animation so outgoing triggers vanish immediately', () => {
    const configureSpy = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });

    const { animateNextLayout } = require('../motion/layoutTransition') as typeof import('../motion/layoutTransition');
    animateNextLayout();

    expect(configureSpy).toHaveBeenCalledTimes(1);
    const config = configureSpy.mock.calls[0]?.[0];
    expect(config).toBeDefined();
    expect(config?.create).toBeDefined();
    expect(config?.update).toBeDefined();
    expect(config?.delete).toBeUndefined();
    configureSpy.mockRestore();
  });

  it('skips LayoutAnimation.configureNext on Web', () => {
    const configureSpy = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });

    const { animateNextLayout } = require('../motion/layoutTransition') as typeof import('../motion/layoutTransition');
    animateNextLayout();

    expect(configureSpy).not.toHaveBeenCalled();
    configureSpy.mockRestore();
  });
});
