/**
 * CC-04 (plan consolidado, Fase 3) y DESIGN.md §6.3: una háptica por acción, en `onPress`.
 * Apoyar el dedo (por ejemplo, al empezar a desplazar sobre el botón) no vibra.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import {
  AccountHeaderAvatarButton,
  AmountVisibilityIconButton,
  ThemeToggleIconButton,
} from '../components/BrandAndThemeIcons';
import { AmountPrivacyProvider } from '../privacy/AmountPrivacyContext';
import { hapticService } from '../../platform/haptics/hapticService';
import { BFlowThemeProvider } from '../theme/ThemeContext';

describe.each(['ios', 'android', 'web'] as const)('háptica al soltar (piel %s)', (skin) => {
  let light: jest.SpyInstance;
  let selection: jest.SpyInstance;

  beforeEach(() => {
    light = jest.spyOn(hapticService, 'light').mockImplementation(() => undefined);
    selection = jest.spyOn(hapticService, 'selection').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['tema', 'theme-toggle-button', 'light'],
    ['ocultar montos', 'amount-visibility-button', 'light'],
    ['cuenta', 'workspace-tab-account', 'selection'],
  ] as const)('el botón de %s vibra en onPress, no en onPressIn', (_label, testID, kind) => {
    const onAccountPress = jest.fn();
    render(
      <BFlowThemeProvider skin={skin}>
        <AmountPrivacyProvider>
          <ThemeToggleIconButton />
          <AmountVisibilityIconButton testID="amount-visibility-button" />
          <AccountHeaderAvatarButton onPress={onAccountPress} />
        </AmountPrivacyProvider>
      </BFlowThemeProvider>
    );
    const spy = kind === 'light' ? light : selection;

    fireEvent(screen.getByTestId(testID), 'pressIn');
    expect(spy).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId(testID));
    expect(spy).toHaveBeenCalledTimes(1);
    if (testID === 'workspace-tab-account') {
      expect(onAccountPress).toHaveBeenCalledTimes(1);
    }
  });
});
