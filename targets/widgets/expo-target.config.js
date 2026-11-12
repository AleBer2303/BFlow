/**
 * Target único de WidgetKit (ADR 0021). Todos los widgets viven aquí por el límite de App IDs.
 *
 * Los colores replican la piel iOS de `src/design-system/tokens.ts` (`palettes.light` /
 * `palettes.dark`) y se generan como colorsets en `Assets.xcassets`; en Swift se leen con
 * `Color("BFlow…")` desde `WidgetTheme.swift`. Si cambia un token de la piel iOS, cámbialo aquí.
 *
 * @type {import('@bacons/apple-targets').Config}
 */
module.exports = {
  type: 'widget',
  name: 'BFlowWidgets',
  displayName: 'BFlow',
  bundleIdentifier: '.widgets',
  deploymentTarget: '18.0',
  // El tipo `widget` ya añade WidgetKit, SwiftUI, ActivityKit y AppIntents.
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents', 'Charts'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.bflow.app'],
  },
  colors: {
    // background.primary
    BFlowBackground: { light: '#E7E6E0', dark: '#0D0F12' },
    // text.primary / text.secondary
    BFlowTextPrimary: { light: '#12151B', dark: '#F4F5F7' },
    BFlowTextSecondary: { light: '#4E5562', dark: '#9BA3AF' },
    // accent.primary
    BFlowAccent: { light: '#245F9F', dark: '#388AF6' },
    // semantic.*
    BFlowIncome: { light: '#127551', dark: '#2EBD85' },
    BFlowExpense: { light: '#A83232', dark: '#E06A6A' },
    BFlowPending: { light: '#8F5206', dark: '#E5A84B' },
    BFlowDebt: { light: '#92440F', dark: '#D9824C' },
    BFlowSavings: { light: '#5F3DA6', dark: '#9D7FE6' },
    BFlowReserve: { light: '#245F9F', dark: '#4F8FEA' },
    BFlowCompleted: { light: '#127551', dark: '#2EBD85' },
  },
};
