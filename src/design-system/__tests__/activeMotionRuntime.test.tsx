jest.mock('../motion/motionRuntime', () => {
  const actual = jest.requireActual<typeof import('../motion/motionRuntime')>(
    '../motion/motionRuntime'
  );
  return {
    ...actual,
    IS_MOTION_STATIC: false,
  };
});

import React from 'react';
import { Animated, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { AppPressable } from '../components/AppPressable';
import { BFlowThemeProvider } from '../theme/ThemeContext';

describe('AppPressable memoization (active motion runtime)', () => {
  it('memoizes sink interpolation nodes across re-renders', () => {
    const interpolateSpy = jest.spyOn(Animated.Value.prototype, 'interpolate');

    try {
      const renderButton = (label: string) => (
        <BFlowThemeProvider skin="android">
          <AppPressable testID="memo-btn" accessibilityRole="button" onPress={jest.fn()}>
            <Text>{label}</Text>
          </AppPressable>
        </BFlowThemeProvider>
      );

      const view = render(renderButton('Primero'));
      expect(screen.getByText('Primero')).toBeTruthy();
      expect(interpolateSpy).toHaveBeenCalledTimes(2);

      interpolateSpy.mockClear();
      view.rerender(renderButton('Segundo'));
      view.rerender(renderButton('Tercero'));
      expect(interpolateSpy).not.toHaveBeenCalled();
    } finally {
      interpolateSpy.mockRestore();
    }
  });
});
