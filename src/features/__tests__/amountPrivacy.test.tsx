/**
 * Privacy mode: the eye next to the net flow (Summary) hides every amount of the workspace,
 * on every tab and in accessibility labels, and the device remembers the choice.
 */

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import PhaseOneHomeScreen from '../../app/index';
import {
  AMOUNTS_HIDDEN_STORAGE_KEY,
  HIDDEN_AMOUNT_TEXT,
} from '../../design-system/privacy/AmountPrivacyContext';
import { BFlowThemeProvider } from '../../design-system/theme/ThemeContext';
import { persistentStorage } from '../../platform/storage/persistentStorageAdapter';
import { useBudgetStore } from '../budget/store/useBudgetStore';

/** Any figure written by `formatCurrency` ("$ 1.080.000", "-$ 5.000", "+ $ 1.000"). */
const VISIBLE_AMOUNT = /\$\s?\d/;

function renderWorkspace() {
  return render(
    <BFlowThemeProvider initialMode="dark">
      <PhaseOneHomeScreen />
    </BFlowThemeProvider>
  );
}

function visibleAmountTexts(): string[] {
  const texts = screen
    .queryAllByText(VISIBLE_AMOUNT)
    .map((node) => String(node.props.children));
  const labels = screen
    .UNSAFE_root.findAll((node) => typeof node.props?.accessibilityLabel === 'string')
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label) => VISIBLE_AMOUNT.test(label));
  return [...texts, ...labels];
}

describe('privacy mode for amounts', () => {
  beforeEach(() => {
    persistentStorage.removeItem(AMOUNTS_HIDDEN_STORAGE_KEY);
    useBudgetStore.getState().resetToOctober2026GoldenState();
  });

  afterAll(() => {
    persistentStorage.removeItem(AMOUNTS_HIDDEN_STORAGE_KEY);
  });

  it('puts the eye next to the net flow and hides every amount on every tab', () => {
    renderWorkspace();

    const heroCard = screen.getByTestId('net-flow-hero-card');
    const eye = within(heroCard).getByTestId('amount-visibility-toggle');
    expect(eye.props.accessibilityLabel).toBe('Ocultar montos');
    expect(screen.getByTestId('golden-net-flow')).toHaveTextContent('$ 1.080.000');
    expect(visibleAmountTexts().length).toBeGreaterThan(0);

    fireEvent.press(eye);

    expect(screen.getByTestId('amount-visibility-toggle').props.accessibilityLabel).toBe(
      'Mostrar montos'
    );
    expect(screen.getByTestId('golden-net-flow')).toHaveTextContent(HIDDEN_AMOUNT_TEXT);
    expect(visibleAmountTexts()).toEqual([]);

    for (const tab of ['checklist', 'debts', 'savings', 'analytics', 'account'] as const) {
      fireEvent.press(screen.getByTestId(`workspace-tab-${tab}`));
      expect({ tab, amounts: visibleAmountTexts() }).toEqual({ tab, amounts: [] });
    }

    // Back in Summary, the eye shows them again.
    fireEvent.press(screen.getByTestId('workspace-tab-summary'));
    fireEvent.press(screen.getByTestId('amount-visibility-toggle'));
    expect(screen.getByTestId('golden-net-flow')).toHaveTextContent('$ 1.080.000');
    fireEvent.press(screen.getByTestId('workspace-tab-checklist'));
    expect(visibleAmountTexts().length).toBeGreaterThan(0);
  });

  it('draws the slash as a plain view over a still eye, never an animated SVG', () => {
    renderWorkspace();
    expect(screen.getByTestId('amount-visibility-icon-visible').props.style).toBeUndefined();
    const slash = () =>
      StyleSheet.flatten(
        screen.getByTestId('amount-visibility-slash', { includeHiddenElements: true }).props.style
      ) as { opacity: number; transform: Array<Record<string, unknown>> };
    expect(slash().opacity).toBe(0);
    expect(slash().transform).toContainEqual({ scaleX: 0 });

    fireEvent.press(screen.getByTestId('amount-visibility-toggle'));

    expect(screen.getByTestId('amount-visibility-icon-hidden').props.style).toBeUndefined();
    expect(slash().opacity).toBe(1);
    expect(slash().transform).toContainEqual({ rotate: '45deg' });
    expect(slash().transform).toContainEqual({ scaleX: 1 });
  });

  it('remembers the choice on this device', () => {
    const first = renderWorkspace();
    fireEvent.press(screen.getByTestId('amount-visibility-toggle'));
    first.unmount();

    renderWorkspace();
    expect(screen.getByTestId('golden-net-flow')).toHaveTextContent(HIDDEN_AMOUNT_TEXT);
    expect(screen.getByTestId('amount-visibility-toggle').props.accessibilityLabel).toBe(
      'Mostrar montos'
    );
  });
});
