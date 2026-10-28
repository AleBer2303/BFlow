---
name: liquid-glass-ui
description: >-
  Enforces Apple iOS 26 Liquid Glass design standards, SF Pro typography hierarchy,
  semantic color tokens, 60/120fps Reanimated spring physics, haptics, and
  automatic BlurView fallback for Expo Go/web. Activate whenever creating or
  modifying UI components or screens.
---

# Liquid Glass UI & Apple Design System (`liquid-glass-ui`)

## 1. Core Principles
- **Zero Hardcoded Values:** Never hardcode hex colors, font sizes, border radii, or spacing in feature components. Import all tokens from `src/design-system/tokens.ts` (documented in `DESIGN.md`).
- **Dual-Mode `<GlassSurface />`:**
  - In **Mode B (Native `.ipa` on iOS 26)**: Renders native `expo-glass-effect` (`UIGlassEffect` / `UIVisualEffectView`) with specular rim border.
  - In **Mode A (Expo Go / Web)**: Automatically falls back to `expo-blur` (`BlurView`) + translucent surface tint + subtle `1px` specular border (`rgba(255,255,255,0.22)` in dark mode, `rgba(255,255,255,0.65)` in light mode).

## 2. Micro-Interactions & Accessibility
- **One-Tap Checklist Completion:** Tapping a checkbox triggers `Haptics.notificationAsync(NotificationFeedbackType.Success)`, a `withSpring` scale bounce (`damping: 14, stiffness: 220`), and animated number transitions on summary cards.
- **Accessibility:**
  - Minimum `44x44 pt` hit target on all interactive controls.
  - Respect `useReducedMotion()` from `react-native-reanimated`.
  - Support Dynamic Type (`allowFontScaling`) and WCAG AA contrast ratios.
