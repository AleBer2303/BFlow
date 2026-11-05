/**
 * src/design-system/components/KeyboardAwareScrollView.tsx
 *
 * Universal keyboard-aware scroll container for BFlow.
 *
 * Guarantees that when any input in the app receives focus:
 * 1. Fields in the upper-middle part of the screen (already visible) are NOT moved or shifted.
 * 2. Only fields located in the lower-middle or bottom portion of the screen (obscured by keyboard)
 *    are smoothly adjusted by the exact delta needed to sit comfortably above the keyboard.
 * 3. Keeps a clean, compact clearance (~24pt) above the keyboard, preventing excessive empty space.
 * 4. Animates fluidly and imperceptibly, matching iOS native touch physics.
 * 5. Works universally for any existing or future field (via AppTextInput or native TextInput fallback).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

export interface KeyboardAwareContextValue {
  /**
   * Registers a focused input element to check whether it needs to be scrolled into view.
   * @param node The TextInput host instance or ref
   * @param customOffset Clearance in points above the keyboard
   */
  registerInputFocus: (node: any, customOffset?: number) => void;
  isKeyboardVisible: boolean;
  keyboardHeight: number;
}

const KeyboardAwareContext = createContext<KeyboardAwareContextValue>({
  registerInputFocus: () => {},
  isKeyboardVisible: false,
  keyboardHeight: 0,
});

/**
 * Hook allowing any child input (such as AppTextInput) to request automatic
 * scroll adjustment when focused.
 */
export function useKeyboardAware(): KeyboardAwareContextValue {
  return useContext(KeyboardAwareContext);
}

export type KeyboardAwareScrollViewElement = React.ElementRef<typeof ScrollView>;

export interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  /**
   * Clearance above the keyboard when scrolling to the focused input.
   * Defaults to 24 points for a clean, natural iOS margin without empty voids.
   */
  extraScrollHeight?: number;
}

export const KeyboardAwareScrollView = React.forwardRef<
  KeyboardAwareScrollViewElement,
  KeyboardAwareScrollViewProps
>(function KeyboardAwareScrollView(
  {
    children,
    extraScrollHeight = 24,
    keyboardShouldPersistTaps = 'handled',
    keyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'on-drag',
    automaticallyAdjustKeyboardInsets = Platform.OS === 'ios',
    contentInsetAdjustmentBehavior = 'automatic',
    contentContainerStyle,
    onScroll,
    scrollEventThrottle = 16,
    ...rest
  },
  forwardedRef
) {
  const innerScrollRef = useRef<KeyboardAwareScrollViewElement | null>(null);
  const keyboardHeightRef = useRef<number>(0);
  const scrollYRef = useRef<number>(0);
  const focusedNodeRef = useRef<any>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useImperativeHandle(forwardedRef, () => innerScrollRef.current as KeyboardAwareScrollViewElement);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (e?.nativeEvent?.contentOffset?.y !== undefined) {
        scrollYRef.current = e.nativeEvent.contentOffset.y;
      }
      onScroll?.(e);
    },
    [onScroll]
  );

  const checkAndScrollInput = useCallback(
    (inputNode: any, clearance = extraScrollHeight) => {
      if (!inputNode || !innerScrollRef.current) return;

      // Web platform fallback
      if (Platform.OS === 'web') {
        if (typeof inputNode.scrollIntoView === 'function') {
          inputNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        return;
      }

      const windowHeight = Dimensions.get('window').height;
      const currentKbHeight = keyboardHeightRef.current;

      // If keyboard is closed (height <= 0), no adjustment needed
      if (currentKbHeight <= 0) return;

      const keyboardTopY = windowHeight - currentKbHeight;
      const topSafeMargin = 64; // Safe clearance below status bar and dynamic island
      const bottomClearance = clearance; // Compact clearance (24pt)

      const handleScreenY = (screenY: number, height: number) => {
        if (typeof screenY !== 'number' || isNaN(screenY)) return;

        const inputTop = screenY;
        const inputHeight = height > 0 ? height : 44;
        const inputBottom = screenY + inputHeight;

        // RULE 1: If input is already in the upper-middle area of the screen
        // and its bottom has sufficient clearance above the keyboard, DO NOT SCROLL.
        if (
          inputTop >= topSafeMargin &&
          inputBottom <= keyboardTopY - bottomClearance
        ) {
          return;
        }

        // RULE 2: If input is in lower-middle or obscured by keyboard,
        // scroll ONLY the exact delta needed to sit smoothly above the keyboard.
        let delta = 0;
        if (inputBottom > keyboardTopY - bottomClearance) {
          delta = inputBottom - (keyboardTopY - bottomClearance);
        } else if (inputTop < topSafeMargin) {
          delta = inputTop - topSafeMargin;
        }

        if (Math.abs(delta) > 3) {
          const currentScrollY = scrollYRef.current;
          const targetScrollY = Math.max(0, currentScrollY + delta);
          innerScrollRef.current?.scrollTo({ y: targetScrollY, animated: true });
          scrollYRef.current = targetScrollY;
        }
      };

      // 1. Try measureInWindow (returns direct window coordinates)
      if (typeof (inputNode as any).measureInWindow === 'function') {
        try {
          (inputNode as any).measureInWindow((_x: number, y: number, _w: number, h: number) => {
            handleScreenY(y, h);
          });
          return;
        } catch {
          // Fall through
        }
      }

      // 2. Try measure (returns pageX/pageY coordinates)
      if (typeof (inputNode as any).measure === 'function') {
        try {
          (inputNode as any).measure(
            (_x: number, _y: number, _w: number, h: number, _px: number, pageY: number) => {
              handleScreenY(pageY, h);
            }
          );
          return;
        } catch {
          // Fall through
        }
      }

      // 3. Try measureLayout relative to ScrollView inner content
      if (typeof (inputNode as any).measureLayout === 'function') {
        try {
          (inputNode as any).measureLayout(
            innerScrollRef.current,
            (_x: number, contentY: number, _w: number, h: number) => {
              const screenY = contentY - scrollYRef.current;
              handleScreenY(screenY, h);
            },
            () => {}
          );
          return;
        } catch {
          // Fall through
        }
      }
    },
    [extraScrollHeight]
  );

  const registerInputFocus = useCallback(
    (node: any, customOffset = extraScrollHeight) => {
      focusedNodeRef.current = node;

      // If keyboard is already visible (user shifting between fields):
      if (keyboardHeightRef.current > 0) {
        setTimeout(() => {
          checkAndScrollInput(node, customOffset);
        }, 50);
      }
    },
    [extraScrollHeight, checkAndScrollInput]
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const height = e?.endCoordinates ? e.endCoordinates.height : 0;
      keyboardHeightRef.current = height;
      setKeyboardHeight(height);
      setIsKeyboardVisible(true);

      const targetNode =
        focusedNodeRef.current ??
        (TextInput.State as any)?.currentlyFocusedInput?.();

      if (targetNode) {
        // Run check as keyboard begins sliding up
        setTimeout(() => {
          checkAndScrollInput(targetNode, extraScrollHeight);
        }, 70);
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
      focusedNodeRef.current = null;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [extraScrollHeight, checkAndScrollInput]);

  const contextValue: KeyboardAwareContextValue = {
    registerInputFocus,
    isKeyboardVisible,
    keyboardHeight,
  };

  return (
    <KeyboardAwareContext.Provider value={contextValue}>
      <ScrollView
        ref={innerScrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={scrollEventThrottle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
        contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
        contentContainerStyle={[
          contentContainerStyle,
          Platform.OS !== 'ios' && isKeyboardVisible && keyboardHeight > 0
            ? {
                paddingBottom:
                  (typeof contentContainerStyle === 'object' &&
                  contentContainerStyle !== null &&
                  'paddingBottom' in contentContainerStyle
                    ? Number((contentContainerStyle as any).paddingBottom || 0)
                    : 0) +
                  keyboardHeight +
                  24,
              }
            : null,
        ]}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAwareContext.Provider>
  );
});
