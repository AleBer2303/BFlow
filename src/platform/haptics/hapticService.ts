/**
 * src/platform/haptics/hapticService.ts
 *
 * Ultra-low latency, zero-delay Apple Taptic Engine feedback service.
 * Follows Apple HIG standards:
 * 1. Immediate non-blocking execution (fired synchronously on touch-down/onPressIn).
 * 2. Hardware cooldown / anti-buffering throttle (~40ms for selection, ~60ms for impact)
 *    to prevent linear resonant actuator (LRA) queue congestion and delayed vibration bursts.
 * 3. Graceful degradation on Web and unsupported platforms (zero exceptions, zero performance tax).
 * 4. Distinct semantic feedback: selection, light, medium, heavy, success, warning, error.
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export type HapticType =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error';

export class AppleHapticService {
  private lastSelectionTime = 0;
  private lastImpactTime = 0;
  private readonly minSelectionIntervalMs = 40;
  private readonly minImpactIntervalMs = 60;

  /**
   * Ultra-crisp mechanical notch tick.
   * Perfect for dock slider gliding, wheel picker scrolling, segmented switches.
   * Calibrated with 40ms minimum spacing to prevent Taptic Engine buffer overruns.
   */
  selection(): void {
    if (Platform.OS === 'web') return;
    const now = Date.now();
    if (now - this.lastSelectionTime < this.minSelectionIntervalMs) {
      return;
    }
    this.lastSelectionTime = now;
    if (Platform.OS === 'android') {
      // `selectionAsync` on Android drives the vibrator for 50 ms (full strength on motors
      // without amplitude control), far stronger than the iOS tick. The system clock tick is
      // the short, light one, and it follows the user's touch feedback setting.
      void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick).catch(() => {});
      return;
    }
    void Haptics.selectionAsync().catch(() => {});
  }

  /**
   * Subtle, crisp impact feedback.
   * Perfect for immediate button touch-down (onPressIn), tab switches, chips.
   */
  light(): void {
    if (Platform.OS === 'web') return;
    const now = Date.now();
    if (now - this.lastImpactTime < this.minImpactIntervalMs) {
      return;
    }
    this.lastImpactTime = now;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  /**
   * Confirmatory medium impact feedback.
   * Perfect for modal action confirmations, saving, primary buttons.
   */
  medium(): void {
    if (Platform.OS === 'web') return;
    const now = Date.now();
    if (now - this.lastImpactTime < this.minImpactIntervalMs) {
      return;
    }
    this.lastImpactTime = now;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  /**
   * Strong impact feedback.
   * Perfect for major milestone actions.
   */
  heavy(): void {
    if (Platform.OS === 'web') return;
    const now = Date.now();
    if (now - this.lastImpactTime < this.minImpactIntervalMs) {
      return;
    }
    this.lastImpactTime = now;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }

  /**
   * Dual-pulse success notification.
   * Perfect for checklist completion, payment registration, month close.
   */
  success(): void {
    if (Platform.OS === 'web') return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  /**
   * Warning alert pulse.
   * Perfect for caution states, item removal, reopen month.
   */
  warning(): void {
    if (Platform.OS === 'web') return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }

  /**
   * Error triple vibration.
   * Perfect for form validation failure or denied action.
   */
  error(): void {
    if (Platform.OS === 'web') return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }

  /**
   * Generic dispatcher by semantic type.
   */
  trigger(type: HapticType): void {
    switch (type) {
      case 'selection':
        this.selection();
        break;
      case 'light':
        this.light();
        break;
      case 'medium':
        this.medium();
        break;
      case 'heavy':
        this.heavy();
        break;
      case 'success':
        this.success();
        break;
      case 'warning':
        this.warning();
        break;
      case 'error':
        this.error();
        break;
    }
  }

  /**
   * Test helper to reset internal throttle timestamps.
   */
  resetThrottle(): void {
    this.lastSelectionTime = 0;
    this.lastImpactTime = 0;
  }
}

export const hapticService = new AppleHapticService();
