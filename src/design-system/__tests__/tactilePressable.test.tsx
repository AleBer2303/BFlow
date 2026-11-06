import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { hapticService } from '../../platform/haptics/hapticService';
import { MIN_TOUCH_TARGET_PT } from '../tokens';
import { TactilePressable } from '../components/TactilePressable';

jest.mock('../../platform/haptics/hapticService', () => ({
  hapticService: {
    selection: jest.fn(),
    light: jest.fn(),
    medium: jest.fn(),
    heavy: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    trigger: jest.fn(),
    resetThrottle: jest.fn(),
  },
}));

describe('TactilePressable (Apple Physical Press Spring & Instant Haptics)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders children and executes instantaneous haptic on pressIn (touch contact)', () => {
    const onPress = jest.fn();
    const onPressIn = jest.fn();

    render(
      <TactilePressable
        testID="test-tactile-btn"
        haptic="light"
        onPress={onPress}
        onPressIn={onPressIn}
      >
        <Text>Acción Instantánea</Text>
      </TactilePressable>
    );

    const btn = screen.getByTestId('test-tactile-btn');
    expect(btn).toBeTruthy();
    expect(screen.getByText('Acción Instantánea')).toBeTruthy();

    // Touch down / pressIn must trigger haptic immediately
    fireEvent(btn, 'pressIn');
    expect(hapticService.trigger).toHaveBeenCalledWith('light');
    expect(onPressIn).toHaveBeenCalled();

    // Release must fire onPress
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalled();
  });

  it('supports custom semantic haptic types (medium, success, warning)', () => {
    render(
      <TactilePressable testID="test-warning-btn" haptic="warning">
        <Text>Eliminar</Text>
      </TactilePressable>
    );

    fireEvent(screen.getByTestId('test-warning-btn'), 'pressIn');
    expect(hapticService.trigger).toHaveBeenCalledWith('warning');
  });

  it('does not trigger haptic feedback when haptic="none" or disabled', () => {
    const { rerender } = render(
      <TactilePressable testID="test-silent-btn" haptic="none">
        <Text>Silente</Text>
      </TactilePressable>
    );

    fireEvent(screen.getByTestId('test-silent-btn'), 'pressIn');
    expect(hapticService.trigger).not.toHaveBeenCalled();

    rerender(
      <TactilePressable testID="test-disabled-btn" haptic="light" disabled>
        <Text>Desactivado</Text>
      </TactilePressable>
    );

    fireEvent(screen.getByTestId('test-disabled-btn'), 'pressIn');
    expect(hapticService.trigger).not.toHaveBeenCalled();
  });

  it('guarantees Apple HIG minimum touch target of 44pt', () => {
    render(
      <TactilePressable testID="test-hig-btn">
        <Text>Apple HIG</Text>
      </TactilePressable>
    );

    const btn = screen.getByTestId('test-hig-btn');
    const flattenedStyle = Array.isArray(btn.props.style)
      ? Object.assign({}, ...btn.props.style)
      : btn.props.style;

    expect(flattenedStyle.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PT);
    expect(flattenedStyle.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PT);
  });
});
