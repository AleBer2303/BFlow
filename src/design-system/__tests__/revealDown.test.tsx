import React from 'react';
import { Animated, LayoutAnimation, Platform, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { RevealDown } from '../components/RevealDown';
import * as motionRuntime from '../motion/motionRuntime';
import { BFlowThemeProvider } from '../theme/ThemeContext';

describe('RevealDown', () => {
  it('renders its children immediately when motion is skipped (test env)', () => {
    render(
      <RevealDown testID="reveal-wrapper">
        <Text>Contenido</Text>
      </RevealDown>
    );
    expect(screen.getByTestId('reveal-wrapper')).toBeTruthy();
    expect(screen.getByText('Contenido')).toBeTruthy();
  });

  it('renders nothing while not visible and shows/hides when `visible` toggles', () => {
    const { rerender } = render(
      <RevealDown visible={false} testID="reveal-wrapper">
        <Text>Contenido</Text>
      </RevealDown>
    );
    expect(screen.queryByText('Contenido')).toBeNull();

    rerender(
      <RevealDown visible testID="reveal-wrapper">
        <Text>Contenido</Text>
      </RevealDown>
    );
    expect(screen.getByText('Contenido')).toBeTruthy();

    rerender(
      <RevealDown visible={false} testID="reveal-wrapper">
        <Text>Contenido</Text>
      </RevealDown>
    );
    expect(screen.queryByText('Contenido')).toBeNull();
  });

  it('opens on the native driver and closes immediately with animateNextLayout without delayed timers', () => {
    const originalStatic = motionRuntime.IS_MOTION_STATIC;
    const originalOS = Platform.OS;
    Object.defineProperty(motionRuntime, 'IS_MOTION_STATIC', { value: false, configurable: true });
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });

    const layoutSpy = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    const springSpy = jest.spyOn(Animated, 'spring');
    const interpolateSpy = jest.spyOn(Animated.Value.prototype, 'interpolate');

    try {
      const renderPanel = (visible: boolean) => (
        <BFlowThemeProvider skin="ios" initialMode="dark">
          <RevealDown visible={visible} testID="reveal-active">
            <Text>Formulario</Text>
          </RevealDown>
        </BFlowThemeProvider>
      );

      const view = render(renderPanel(false));
      expect(layoutSpy).not.toHaveBeenCalled();
      expect(screen.queryByText('Formulario')).toBeNull();

      // Open: triggers native LayoutAnimation + native-driver spring without scaling BlurViews.
      view.rerender(renderPanel(true));
      expect(layoutSpy).toHaveBeenCalledTimes(1);
      expect(springSpy).toHaveBeenCalledTimes(1);
      expect(springSpy.mock.calls[0]?.[1]).toMatchObject({ useNativeDriver: true });
      expect(screen.getByText('Formulario')).toBeTruthy();

      // Re-rendering while open does not recreate interpolate nodes.
      const initialInterpolations = interpolateSpy.mock.calls.length;
      view.rerender(renderPanel(true));
      expect(interpolateSpy.mock.calls.length).toBe(initialInterpolations);

      // Close: collapses immediately in the same commit with native LayoutAnimation.
      layoutSpy.mockClear();
      view.rerender(renderPanel(false));
      expect(layoutSpy).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Formulario')).toBeNull();
    } finally {
      Object.defineProperty(motionRuntime, 'IS_MOTION_STATIC', {
        value: originalStatic,
        configurable: true,
      });
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
      layoutSpy.mockRestore();
      springSpy.mockRestore();
      interpolateSpy.mockRestore();
    }
  });
});
