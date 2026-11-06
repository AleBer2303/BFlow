import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppleHapticService } from '../hapticService';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

describe('AppleHapticService (Zero-Delay Fluid Tactile Feedback)', () => {
  let service: AppleHapticService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppleHapticService();
    Platform.OS = 'ios';
  });

  it('triggers selection feedback without throwing or delay', () => {
    service.selection();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('throttles rapid selection calls under 40ms to avoid Taptic Engine queue lag', () => {
    service.selection();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);

    // Call immediately again within 40ms
    service.selection();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);

    // Advance clock past 40ms
    const originalDateNow = Date.now;
    try {
      Date.now = jest.fn(() => originalDateNow() + 50);
      service.selection();
      expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('triggers light impact feedback on button touch contact', () => {
    service.light();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
  });

  it('throttles rapid impact calls under 60ms', () => {
    service.light();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);

    service.light();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it('triggers medium and heavy impacts properly', () => {
    service.medium();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');

    service.resetThrottle();
    service.heavy();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy');
  });

  it('triggers notifications: success, warning, error', () => {
    service.success();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');

    service.warning();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');

    service.error();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
  });

  it('delegates trigger(type) properly across all semantic types', () => {
    service.trigger('selection');
    expect(Haptics.selectionAsync).toHaveBeenCalled();

    service.trigger('success');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');

    service.trigger('warning');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');

    service.trigger('error');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
  });

  it('is completely safe and silent on Web without invoking native modules', () => {
    Platform.OS = 'web';
    service.selection();
    service.light();
    service.success();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('suppresses any native errors gracefully without crashing the application', async () => {
    (Haptics.selectionAsync as jest.Mock).mockRejectedValueOnce(
      new Error('Hardware Taptic Engine unavailable')
    );
    expect(() => service.selection()).not.toThrow();
  });
});
