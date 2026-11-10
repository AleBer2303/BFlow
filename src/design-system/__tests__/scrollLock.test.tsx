import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import {
  KeyboardAwareScrollView,
  useScrollLock,
  type ScrollLockContextValue,
} from '../components/KeyboardAwareScrollView';

function Probe({ onReady }: { onReady: (value: ScrollLockContextValue) => void }): null {
  onReady(useScrollLock());
  return null;
}

describe('useScrollLock', () => {
  it('stops the page while any holder keeps the lock, and tolerates double releases', () => {
    let lock: ScrollLockContextValue = { lockScroll: () => () => undefined };
    render(
      <KeyboardAwareScrollView testID="page">
        <Probe onReady={(value) => (lock = value)} />
      </KeyboardAwareScrollView>
    );
    const scrollEnabled = () => screen.getByTestId('page').props.scrollEnabled;
    expect(scrollEnabled()).toBe(true);

    let releaseFirst = () => undefined as void;
    let releaseSecond = () => undefined as void;
    act(() => {
      releaseFirst = lock.lockScroll();
      releaseSecond = lock.lockScroll();
    });
    expect(scrollEnabled()).toBe(false);

    act(() => {
      releaseFirst();
      releaseFirst();
    });
    expect(scrollEnabled()).toBe(false);

    act(() => releaseSecond());
    expect(scrollEnabled()).toBe(true);
  });

  it('keeps a page that was never scrollable locked after a release', () => {
    let lock: ScrollLockContextValue = { lockScroll: () => () => undefined };
    render(
      <KeyboardAwareScrollView testID="page" scrollEnabled={false}>
        <Probe onReady={(value) => (lock = value)} />
      </KeyboardAwareScrollView>
    );

    act(() => lock.lockScroll()());

    expect(screen.getByTestId('page').props.scrollEnabled).toBe(false);
  });

  it('does nothing outside a scroll view', () => {
    let lock: ScrollLockContextValue | null = null;
    render(<Probe onReady={(value) => (lock = value)} />);

    expect(() => lock?.lockScroll()()).not.toThrow();
  });
});
