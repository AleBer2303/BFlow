---
name: expo-feature-scaffold
description: >-
  Scaffolds new features and screens in BFlow following the strict separation
  between src/domain, src/data, src/platform (Mode A vs Mode B), src/design-system,
  and src/features. Use when creating a new module or screen.
---

# Expo Feature Scaffold (`expo-feature-scaffold`)

## Directory Convention for Every Feature

When creating or extending a feature `<feature-name>` (e.g. `budget`, `checklist`, `debts`, `savings`, `moto-ideal`, `concepts`, `history`):

```text
src/
├── domain/<feature-name>/
│   ├── <feature-name>.types.ts       # Pure TypeScript interfaces & Zod schemas
│   ├── <feature-name>.calculator.ts  # 100% pure functions (no side effects, no UI/Firebase)
│   └── __tests__/
│       └── <feature-name>.calculator.test.ts
├── features/<feature-name>/
│   ├── components/                   # Feature UI components using src/design-system tokens
│   ├── hooks/                        # Zustand selectors & action hooks
│   └── __tests__/                    # React Native Testing Library (RNTL) tests
└── app/(tabs)/<route>.tsx            # Thin route wrapper delegating to src/features/<feature-name>
```

## Verification Steps
1. Verify zero imports from `react-native`, `expo-*`, or `firebase/*` inside `src/domain/`.
2. Ensure all monetary values use `formatCop()` from `src/domain/money/money.ts`.
3. Ensure every interactive element has `accessibilityLabel`, `accessibilityRole`, and `hitSlop` / minimum `44pt` touch target.
4. Run `npm run typecheck && npm test` before marking complete.
