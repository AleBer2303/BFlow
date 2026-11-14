jest.mock('../../../design-system/motion/motionRuntime', () => {
  const actual = jest.requireActual<typeof import('../../../design-system/motion/motionRuntime')>(
    '../../../design-system/motion/motionRuntime'
  );
  return {
    ...actual,
    IS_MOTION_STATIC: false,
  };
});

import React from 'react';
import { Animated, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { BFlowThemeProvider } from '../../../design-system';
import { ActionRevealSlot } from '../components/ChecklistWorkspaceView';

describe('ActionRevealSlot (active motion runtime)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not start Animated.timing when mounted closed (visible=false) and animates only on true->false', () => {
    jest.useFakeTimers();
    const timingSpy = jest.spyOn(Animated, 'timing');

    try {
      const renderSlot = (visible: boolean) => (
        <BFlowThemeProvider skin="android">
          <ActionRevealSlot visible={visible} gap={6}>
            <Text testID="slot-child">Editar</Text>
          </ActionRevealSlot>
        </BFlowThemeProvider>
      );

      // 1. Mounting closed must remain inert (0 Animated.timing calls).
      const view = render(renderSlot(false));
      expect(timingSpy).not.toHaveBeenCalled();
      expect(screen.queryByTestId('slot-child')).toBeNull();

      // 2. Opening transitions to visible=true and starts the opening animation.
      view.rerender(renderSlot(true));
      expect(timingSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('slot-child')).toBeTruthy();

      // 3. Closing after having been visible starts the closing animation and unmounts.
      view.rerender(renderSlot(false));
      expect(timingSpy).toHaveBeenCalledTimes(2);
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.queryByTestId('slot-child')).toBeNull();
    } finally {
      timingSpy.mockRestore();
    }
  });
});
