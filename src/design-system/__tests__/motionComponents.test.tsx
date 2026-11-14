/**
 * Motion primitives and the feedback they carry, on the three skins. Under Jest motion is
 * static, so these tests cover what must hold with or without animation: the content is
 * there, errors are announced and felt, and the browser learns the state of a control.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Animated, Platform, Text } from 'react-native';
import { hapticService } from '../../platform/haptics/hapticService';
import { RevealDown } from '../components/RevealDown';
import { StatusBadge } from '../components/StatusBadge';
import { CheckIndicator } from '../motion/CheckIndicator';
import { deferTaskAfterTransition, scheduleAfterTabTransition } from '../motion/motionRuntime';
import { ProgressFill } from '../motion/ProgressFill';
import { useReplayOnChange } from '../motion/useReplayOnChange';
import { AppPressable, shouldSinkOnPress, toWebAriaState } from '../components/AppPressable';
import { FormMessage } from '../components/FormMessage';
import { Entrance } from '../motion/Entrance';
import { BFlowThemeProvider } from '../theme/ThemeContext';
import { motionDuration, PLATFORM_SKIN_IDS } from '../tokens';

describe.each(PLATFORM_SKIN_IDS)('Entrance on the %s skin', (skin) => {
  it('shows its content at once and keeps the layout style it was given', () => {
    render(
      <BFlowThemeProvider skin={skin}>
        <Entrance kind="screen" testID="entrance" style={{ gap: 12 }}>
          <Text>Resumen</Text>
        </Entrance>
      </BFlowThemeProvider>
    );

    expect(screen.getByText('Resumen')).toBeTruthy();
    expect(screen.getByTestId('entrance')).toHaveStyle({ gap: 12, opacity: 1 });
  });
});

describe.each(PLATFORM_SKIN_IDS)('FormMessage on the %s skin', (skin) => {
  const renderMessage = (props: React.ComponentProps<typeof FormMessage>) =>
    render(
      <BFlowThemeProvider skin={skin}>
        <FormMessage {...props} />
      </BFlowThemeProvider>
    );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing without a message', () => {
    renderMessage({ message: null, testID: 'form-message' });

    expect(screen.queryByTestId('form-message')).toBeNull();
  });

  it('announces an error as an alert and fires the error haptic once', () => {
    const errorHaptic = jest.spyOn(hapticService, 'error').mockImplementation(() => undefined);
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);

    const view = renderMessage({ message: 'Ingresa un monto mayor a 0.', testID: 'form-message' });

    const banner = screen.getByTestId('form-message');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(banner.props.accessibilityLiveRegion).toBe('assertive');
    expect(screen.getByText('Ingresa un monto mayor a 0.')).toBeTruthy();
    expect(errorHaptic).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Ingresa un monto mayor a 0.');

    view.rerender(
      <BFlowThemeProvider skin={skin}>
        <FormMessage message="Ingresa un monto mayor a 0." testID="form-message" />
      </BFlowThemeProvider>
    );
    expect(errorHaptic).toHaveBeenCalledTimes(1);
  });

  it('announces a success politely and without the error haptic', () => {
    const errorHaptic = jest.spyOn(hapticService, 'error').mockImplementation(() => undefined);

    renderMessage({ message: 'Perfil actualizado.', tone: 'success', testID: 'form-message' });

    expect(screen.getByTestId('form-message').props.accessibilityLiveRegion).toBe('polite');
    expect(errorHaptic).not.toHaveBeenCalled();
  });

  it('closes when the message is cleared', () => {
    const view = renderMessage({ message: 'No hay conexión.', testID: 'form-message' });

    view.rerender(
      <BFlowThemeProvider skin={skin}>
        <FormMessage message={null} testID="form-message" />
      </BFlowThemeProvider>
    );

    expect(screen.queryByTestId('form-message')).toBeNull();
  });
});

describe('AppPressable press (iOS and Android)', () => {
  it('moves real controls only: never an overlay, a disabled control or an opt-out', () => {
    expect(shouldSinkOnPress({ minHeight: 44 }, 'auto', false)).toBe(true);
    expect(shouldSinkOnPress(undefined, 'auto', false)).toBe(true);
    expect(shouldSinkOnPress({ position: 'absolute' }, 'auto', false)).toBe(false);
    expect(shouldSinkOnPress({ minHeight: 44 }, 'none', false)).toBe(false);
    expect(shouldSinkOnPress({ minHeight: 44 }, 'auto', true)).toBe(false);
  });

  it.each(PLATFORM_SKIN_IDS)('still presses and forwards press-in and press-out on %s', (skin) => {
    const onPress = jest.fn();
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    render(
      <BFlowThemeProvider skin={skin}>
        <AppPressable
          testID="control"
          accessibilityRole="button"
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          <Text>Guardar</Text>
        </AppPressable>
      </BFlowThemeProvider>
    );

    const control = screen.getByTestId('control');
    fireEvent(control, 'pressIn');
    fireEvent(control, 'pressOut');
    fireEvent.press(control);

    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe.each(PLATFORM_SKIN_IDS)('feedback pieces on the %s skin', (skin) => {
  const inSkin = (node: React.ReactElement) => (
    <BFlowThemeProvider skin={skin}>{node}</BFlowThemeProvider>
  );

  it('draws the check indicator pending and done, hidden from screen readers', () => {
    const view = render(inSkin(<CheckIndicator checked={false} testID="check" />));
    const indicator = screen.getByTestId('check', { includeHiddenElements: true });

    expect(indicator.props.accessibilityElementsHidden).toBe(true);
    expect(indicator).toHaveStyle({ width: 22, height: 22 });

    view.rerender(inSkin(<CheckIndicator checked testID="check" size={28} />));

    expect(screen.getByTestId('check', { includeHiddenElements: true })).toHaveStyle({
      width: 28,
      height: 28,
    });
  });

  it('fills a progress track by its share, never past its ends', () => {
    const view = render(inSkin(<ProgressFill fraction={0.225} color="#127551" testID="fill" />));
    expect(screen.getByTestId('fill')).toHaveStyle({ width: '22.5%', backgroundColor: '#127551' });

    view.rerender(inSkin(<ProgressFill fraction={2} color="#127551" testID="fill" />));
    expect(screen.getByTestId('fill')).toHaveStyle({ width: '100%' });

    view.rerender(inSkin(<ProgressFill fraction={-1} color="#127551" testID="fill" />));
    expect(screen.getByTestId('fill')).toHaveStyle({ width: '0%' });
  });

  it('keeps a counter badge readable when its label changes', () => {
    const view = render(
      inSkin(<StatusBadge label="6/12 completados" status="pending" pulseOnChange testID="badge" />)
    );

    view.rerender(
      inSkin(<StatusBadge label="7/12 completados" status="pending" pulseOnChange testID="badge" />)
    );

    expect(screen.getByText('7/12 completados')).toBeTruthy();
    expect(screen.getByTestId('badge').props.accessibilityLabel).toBe('7/12 completados');
  });

  it('opens a panel with content that is only rendered while it is open', () => {
    const view = render(
      inSkin(
        <RevealDown visible={false} testID="panel">
          {null}
        </RevealDown>
      )
    );
    expect(screen.queryByTestId('panel')).toBeNull();

    view.rerender(
      inSkin(
        <RevealDown visible testID="panel">
          <Text>Editar movimiento</Text>
        </RevealDown>
      )
    );
    expect(screen.getByText('Editar movimiento')).toBeTruthy();

    view.rerender(
      inSkin(
        <RevealDown visible={false} testID="panel">
          {null}
        </RevealDown>
      )
    );
    expect(screen.queryByText('Editar movimiento')).toBeNull();
  });
});

describe('useReplayOnChange', () => {
  function Probe({ value }: { value: string }): React.JSX.Element {
    const progress = useReplayOnChange(value, 250);
    return <Animated.View testID="probe" style={{ opacity: progress }} />;
  }

  it('rests at 1 on the first render and after a change (motion is static under Jest)', () => {
    const view = render(<Probe value="dark" />);
    expect(screen.getByTestId('probe')).toHaveStyle({ opacity: 1 });

    view.rerender(<Probe value="light" />);
    expect(screen.getByTestId('probe')).toHaveStyle({ opacity: 1 });
  });
});

describe('toWebAriaState', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('adds nothing on iOS and Android, where accessibilityState already works', () => {
    expect(toWebAriaState({ selected: true })).toBeNull();
  });

  it('carries the state as aria attributes in the browser', () => {
    Platform.OS = 'web';

    expect(toWebAriaState({ selected: true, checked: false })).toEqual({
      'aria-selected': true,
      'aria-checked': false,
    });
    expect(toWebAriaState({ expanded: true, busy: true })).toEqual({
      'aria-expanded': true,
      'aria-busy': true,
    });
    expect(toWebAriaState(undefined)).toBeNull();
  });
});

describe('tab transition deferral helpers', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('defers tasks by the transition duration and cancels cleanly when superseded', () => {
    jest.useFakeTimers();

    const deferred = jest.fn();
    const cancelled = jest.fn();
    deferTaskAfterTransition(deferred);
    const handle = deferTaskAfterTransition(cancelled);
    handle.cancel();

    expect(deferred).not.toHaveBeenCalled();
    jest.advanceTimersByTime(motionDuration.fast - 1);
    expect(deferred).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(deferred).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('executes scheduleAfterTabTransition synchronously under Jest static runtime', () => {
    const immediate = jest.fn();
    const handle = scheduleAfterTabTransition(immediate);
    expect(immediate).toHaveBeenCalledTimes(1);
    expect(() => handle.cancel()).not.toThrow();
  });
});
