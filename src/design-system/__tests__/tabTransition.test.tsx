/**
 * TabTransition with the motion runtime active (`IS_MOTION_STATIC` mocked to `false`): the
 * incoming tab animates on every visit, from its side of the dock on iOS, as a fade-through on
 * Android, and the frame that shows it again starts from the beginning of the motion.
 */

jest.mock('../motion/motionRuntime', () => {
  const actual = jest.requireActual<typeof import('../motion/motionRuntime')>(
    '../motion/motionRuntime'
  );
  return {
    ...actual,
    IS_MOTION_STATIC: false,
    // The JS driver, so the test can read the frames (the native one never reports them to JS).
    USE_NATIVE_DRIVER: false,
  };
});

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { TabTransition } from '../motion/TabTransition';
import { TabVisibilityProvider } from '../motion/TabVisibilityContext';
import type { TabSwitchDirection } from '../motion/motionSpec';
import { BFlowThemeProvider } from '../theme/ThemeContext';
import { motionDistance, motionDuration, motionScale, type PlatformSkinId } from '../tokens';

function tab(skin: PlatformSkinId, isActive: boolean, direction: TabSwitchDirection) {
  return (
    <BFlowThemeProvider skin={skin} initialMode="dark">
      <TabVisibilityProvider isActive={isActive}>
        <TabTransition testID="tab-transition" direction={direction}>
          <Text>Contenido</Text>
        </TabTransition>
      </TabVisibilityProvider>
    </BFlowThemeProvider>
  );
}

function frame() {
  const style = StyleSheet.flatten(
    screen.getByTestId('tab-transition', { includeHiddenElements: true }).props.style
  ) as { opacity: number; transform: Array<Record<string, number>> };
  return { opacity: style.opacity, ...Object.assign({}, ...style.transform) } as Record<
    string,
    number
  >;
}

function settle(): void {
  act(() => {
    jest.advanceTimersByTime(motionDuration.fast + 100);
  });
}

describe('TabTransition (active motion runtime)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('slides the incoming tab in from its side of the dock on iOS, on every visit', () => {
    const view = render(tab('ios', true, 1));
    expect(frame().opacity).toBe(0);
    expect(frame().translateX).toBe(motionDistance.screenAxis);

    settle();
    expect(frame().opacity).toBe(1);
    expect(frame().translateX).toBe(0);

    // Hidden: it rewinds, so the next visit does not flash the settled tab first.
    view.rerender(tab('ios', false, 0));
    settle();
    expect(frame().opacity).toBe(0);

    // Visited again from a tab further right in the dock: it enters from the left.
    view.rerender(tab('ios', true, -1));
    expect(frame().opacity).toBe(0);
    expect(frame().translateX).toBe(-motionDistance.screenAxis);
    settle();
    expect(frame()).toEqual(expect.objectContaining({ opacity: 1, translateX: 0 }));
  });

  it('fades the incoming tab through on Android, growing into place without travel', () => {
    render(tab('android', true, 1));
    expect(frame()).toEqual(
      expect.objectContaining({ opacity: 0, translateY: 0, scale: motionScale.screen })
    );
    expect(frame().translateX).toBeUndefined();

    settle();
    expect(frame()).toEqual(expect.objectContaining({ opacity: 1, translateY: 0, scale: 1 }));
  });

  it('rises the incoming tab on Web without sliding sideways', () => {
    render(tab('web', true, 1));
    expect(frame()).toEqual(
      expect.objectContaining({ opacity: 0, translateY: motionDistance.base, scale: 1 })
    );
    settle();
    expect(frame()).toEqual(expect.objectContaining({ opacity: 1, translateY: 0 }));
  });
});
