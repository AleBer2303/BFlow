/**
 * The month curve must not sit inside ScrollRevealSection: that wrapper animates opacity and
 * scale with the scroll, and on iOS those reach the 3D GLView and composite the scene flat.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';
import PhaseOneHomeScreen from '../../../app/index';
import { ScrollRevealSection } from '../../../design-system/motion/ScrollRevealSection';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import { useBudgetStore } from '../../budget/store/useBudgetStore';

describe('month curve stage wrapper', () => {
  beforeEach(() => {
    useBudgetStore.getState().resetToOctober2026GoldenState();
  });

  it('keeps the curve out of the scroll reveal wrapper', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );
    let node = screen.getByTestId('monthly-curve-stage-frame', { includeHiddenElements: true })
      .parent;
    while (node) {
      expect(node.type).not.toBe(ScrollRevealSection);
      node = node.parent;
    }
  });
});
