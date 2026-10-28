---
name: ios-widget-liveactivity
description: >-
  Guides development of the unified iOS WidgetKit + ActivityKit (Dynamic Island /
  Live Activity) target in Mode B and the safe no-op/preview adapter in Mode A
  (Expo Go). Use when editing targets/widgets/ or src/platform/widgets/.
---

# iOS Widgets & Live Activity (`ios-widget-liveactivity`)

## 1. Critical Apple Free Account Rule (Max 2 App IDs)
- **ALL** 6 widgets (Small Net Flow, Medium Summary, Large Pending Checklist, Debt Progress, Savings Total, Lock Screen) AND the `ActivityConfiguration` for the Dynamic Island **MUST** live inside a **SINGLE** Xcode extension target (`targets/widgets`).
- Never create separate targets for Live Activity and Widgets, as a free Apple ID allows only 10 App IDs per rolling 7 days.

## 2. Typed Contract (`WidgetSnapshotV1`)
All data transferred from React Native to the iOS extension uses `WidgetSnapshotV1` validated by Zod:
```ts
export interface WidgetSnapshotV1 {
  schemaVersion: 1;
  updatedAtIso: string;
  monthKey: string; // "2026-10"
  netCashFlowCop: number; // 1_080_000
  receivedIncomeCop: number; // 4_000_000
  paidExpensesCop: number; // 2_920_000
  pendingExpensesCop: number; // 450_000
  checklistCompleted: number; // 6
  checklistTotal: number; // 12
  totalDebtCop: number; // 6_200_000
  openingDebtCop: number; // 8_000_000
  motoSavingsCop: number; // 2_300_000
  generalSavingsCop: number; // 2_080_000
  totalSavingsCop: number; // 4_380_000
  topPendingItems: Array<{
    id: string;
    name: string;
    amountCop: number;
    type: 'income' | 'expense';
  }>;
}
```

## 3. Dynamic App Group & Fallback
- Resolve the App Group dynamically from `Bundle.main.bundleIdentifier` (`group.<main_bundle_id>`) so sideloaders (`iloader`) that append team suffixes do not break `UserDefaults(suiteName:)`.
- `ActivityKit` updates (`Activity.request` / `Activity.update`) pass `ContentState` directly in-process and work even if `App Groups` are unavailable on a free profile.
