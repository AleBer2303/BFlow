/**
 * OPT-06 (plan consolidado, Fase 2): `ThemeToggleIconButton` memoiza `swapStyle`, así que volver
 * a pintar el botón sin cambiar de modo no crea interpolaciones nuevas ni un estilo nuevo.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Animated } from 'react-native';
import { ThemeToggleIconButton } from '../components/BrandAndThemeIcons';
import { BFlowThemeProvider } from '../theme/ThemeContext';

describe('ThemeToggleIconButton (OPT-06)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('no crea interpolaciones nuevas al volver a pintarse en el mismo modo', () => {
    const interpolate = jest.spyOn(Animated.Value.prototype, 'interpolate');
    const tree = (label: string) => (
      <BFlowThemeProvider initialMode="dark">
        <ThemeToggleIconButton testID={`toggle-${label}`} />
      </BFlowThemeProvider>
    );

    const { rerender } = render(tree('a'));
    const afterMount = interpolate.mock.calls.length;
    for (let i = 0; i < 5; i += 1) {
      rerender(tree('a'));
    }
    const perRerender = (interpolate.mock.calls.length - afterMount) / 5;

    if (process.env.BFLOW_RENDER_REPORT === '1') {
      process.stdout.write(`\nSWAP_REPORT=${JSON.stringify({ afterMount, perRerender })}\n`);
    }
    expect(screen.getByTestId('toggle-a')).toBeTruthy();
    expect(perRerender).toBe(0);
  });
});
