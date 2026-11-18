/**
 * src/design-system/motion/ScrollRevealSection.tsx
 *
 * Bidirectional UI-thread scroll reveal for section cards below the hero (ADR 0031):
 * - Scrolling DOWN: sections entering from the bottom edge glide upward and settle into 1.0 scale.
 * - Scrolling UP: sections returning from the top edge glide gently downward.
 * - Content-first guard: sections initially visible stay at rest; tall sections skip scaling;
 *   bottom-of-page release guarantees the last card settles completely; Web & Reduce Motion render
 *   `{children}` untouched without allocating Reanimated hooks.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useBFlowTheme } from '../theme/ThemeContext';
import { scrollMotionBySkin, type ScrollMotionSpec } from '../tokens';
import {
  useScrollChoreography,
  type ScrollChoreographyContextValue,
} from './ScrollChoreographyContext';

/**
 * UI-thread worklet copy of `computeSectionScrollFrame` (scrollKinematics.ts).
 * Positional arguments only and zero default parameters (ADR 0030 §3 / worklet closure guard).
 */
export function sectionScrollTransformAt(
  scrollY: number,
  viewportHeight: number,
  contentHeight: number,
  sectionTop: number,
  sectionHeight: number,
  topEdgeOffset: number,
  enabled: boolean,
  entryBand: number,
  bottomTravelY: number,
  bottomScale: number,
  bottomMinOpacity: number,
  topBand: number,
  topTravelY: number,
  topScale: number,
  topMinOpacity: number,
  maxScaleHeight: number
): { opacity: number; translateY: number; scale: number } {
  'worklet';
  if (
    !enabled ||
    !Number.isFinite(scrollY) ||
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(contentHeight) ||
    !Number.isFinite(sectionTop) ||
    !Number.isFinite(sectionHeight) ||
    !Number.isFinite(topEdgeOffset) ||
    sectionTop < 0 ||
    sectionHeight <= 0 ||
    viewportHeight <= 0
  ) {
    return { opacity: 1, translateY: 0, scale: 1 };
  }

  if (scrollY <= 4 && sectionTop < viewportHeight * 0.92) {
    return { opacity: 1, translateY: 0, scale: 1 };
  }

  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const remainingBottom = Math.max(0, maxScroll - scrollY);
  const atBottomRelease = remainingBottom < 40 ? 1 - remainingBottom / 40 : 0;
  const rawBottom =
    entryBand > 0
      ? Math.min(1, Math.max(0, (scrollY + viewportHeight - sectionTop) / entryBand))
      : 1;
  const bottomProgress = Math.max(rawBottom, atBottomRelease);

  const atTopRelease = scrollY < 32 ? 1 - Math.max(0, scrollY) / 32 : 0;
  const rawTop =
    topBand > 0
      ? Math.min(
          1,
          Math.max(0, (sectionTop + sectionHeight - (scrollY + topEdgeOffset)) / topBand)
        )
      : 1;
  const topProgress = Math.max(rawTop, atTopRelease);

  const invBottom = 1 - bottomProgress;
  const invTop = 1 - topProgress;
  const easedBottom = 1 - invBottom * invBottom * invBottom;
  const easedTop = 1 - invTop * invTop * invTop;
  const scaleWeight = sectionHeight > maxScaleHeight ? 0 : 1;

  const translateY = (1 - easedBottom) * bottomTravelY - (1 - easedTop) * topTravelY;
  const scale =
    1 -
    scaleWeight *
      ((1 - easedBottom) * (1 - bottomScale) + (1 - easedTop) * (1 - topScale));
  const minOpacity = Math.min(bottomMinOpacity, topMinOpacity);
  const rawOpacity =
    1 - (1 - easedBottom) * (1 - bottomMinOpacity) - (1 - easedTop) * (1 - topMinOpacity);
  const opacity = Math.min(1, Math.max(minOpacity, rawOpacity));

  return { opacity, translateY, scale };
}

export interface ScrollRevealSectionProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface ActiveScrollRevealSectionProps extends ScrollRevealSectionProps {
  choreography: ScrollChoreographyContextValue;
  spec: ScrollMotionSpec;
}

function ActiveScrollRevealSection({
  children,
  style,
  testID,
  choreography,
  spec,
}: ActiveScrollRevealSectionProps): React.JSX.Element {
  const {
    scrollY,
    viewportHeight,
    contentHeight,
    topEdgeOffset,
    getContentContainerNode,
    subscribeLayoutChange,
  } = choreography;
  const {
    enabled,
    sectionEntryBand,
    sectionBottomTravelY,
    sectionBottomScale,
    sectionBottomMinOpacity,
    sectionTopBand,
    sectionTopTravelY,
    sectionTopScale,
    sectionTopMinOpacity,
    sectionMaxScaleHeight,
  } = spec;

  const viewRef = useRef<React.ElementRef<typeof Reanimated.View>>(null);
  const sectionTopSV = useSharedValue(-1);
  const sectionHeightSV = useSharedValue(0);

  const measureSection = useCallback(
    (fallbackLayout?: { y: number; height: number }) => {
      if (
        fallbackLayout &&
        Number.isFinite(fallbackLayout.y) &&
        Number.isFinite(fallbackLayout.height) &&
        sectionTopSV.value < 0
      ) {
        sectionTopSV.value = fallbackLayout.y;
        sectionHeightSV.value = fallbackLayout.height;
      }

      const rawNode = viewRef.current as unknown as {
        getNode?: () => unknown;
        measureLayout?: (
          relativeToNativeNode: unknown,
          onSuccess: (x: number, y: number, w: number, h: number) => void,
          onFail: () => void
        ) => void;
      } | null;
      const hostNode = (typeof rawNode?.getNode === 'function' ? rawNode.getNode() : rawNode) as {
        measureLayout?: (
          relativeToNativeNode: unknown,
          onSuccess: (x: number, y: number, w: number, h: number) => void,
          onFail: () => void
        ) => void;
      } | null;

      const contentNode = getContentContainerNode();
      if (hostNode && contentNode && typeof hostNode.measureLayout === 'function') {
        try {
          hostNode.measureLayout(
            contentNode,
            (_x, y, _w, h) => {
              if (Number.isFinite(y) && Number.isFinite(h)) {
                sectionTopSV.value = y;
                sectionHeightSV.value = h;
              }
            },
            () => {
              if (
                fallbackLayout &&
                Number.isFinite(fallbackLayout.y) &&
                Number.isFinite(fallbackLayout.height)
              ) {
                sectionTopSV.value = fallbackLayout.y;
                sectionHeightSV.value = fallbackLayout.height;
              }
            }
          );
          return;
        } catch {
          // Fall back to direct layout measurements when measureLayout is unavailable.
        }
      }

      if (
        fallbackLayout &&
        Number.isFinite(fallbackLayout.y) &&
        Number.isFinite(fallbackLayout.height)
      ) {
        sectionTopSV.value = fallbackLayout.y;
        sectionHeightSV.value = fallbackLayout.height;
      }
    },
    [getContentContainerNode, sectionHeightSV, sectionTopSV]
  );

  useEffect(() => {
    const rafId = requestAnimationFrame(() => measureSection());
    const unsubscribe = subscribeLayoutChange(() => measureSection());
    return () => {
      cancelAnimationFrame(rafId);
      unsubscribe();
    };
  }, [measureSection, subscribeLayoutChange]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      measureSection({ y, height });
    },
    [measureSection]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const frame = sectionScrollTransformAt(
      scrollY.value,
      viewportHeight.value,
      contentHeight.value,
      sectionTopSV.value,
      sectionHeightSV.value,
      topEdgeOffset,
      enabled,
      sectionEntryBand,
      sectionBottomTravelY,
      sectionBottomScale,
      sectionBottomMinOpacity,
      sectionTopBand,
      sectionTopTravelY,
      sectionTopScale,
      sectionTopMinOpacity,
      sectionMaxScaleHeight
    );
    return {
      opacity: frame.opacity,
      transform: [{ translateY: frame.translateY }, { scale: frame.scale }],
    };
  }, [
    contentHeight,
    enabled,
    scrollY,
    sectionBottomMinOpacity,
    sectionBottomScale,
    sectionBottomTravelY,
    sectionEntryBand,
    sectionHeightSV,
    sectionMaxScaleHeight,
    sectionTopBand,
    sectionTopMinOpacity,
    sectionTopSV,
    sectionTopScale,
    sectionTopTravelY,
    topEdgeOffset,
    viewportHeight,
  ]);

  return (
    <Reanimated.View ref={viewRef} testID={testID} onLayout={handleLayout} style={[style, animatedStyle]}>
      {children}
    </Reanimated.View>
  );
}

export function ScrollRevealSection({
  children,
  style,
  testID,
}: ScrollRevealSectionProps): React.JSX.Element {
  const { skin } = useBFlowTheme();
  const choreography = useScrollChoreography();
  const spec = scrollMotionBySkin[skin];

  if (!choreography?.active || !spec.enabled) {
    return style ? <View style={style}>{children}</View> : <>{children}</>;
  }

  return (
    <ActiveScrollRevealSection
      choreography={choreography}
      spec={spec}
      style={style}
      testID={testID}
    >
      {children}
    </ActiveScrollRevealSection>
  );
}
