/**
 * Tests for DebtsFunfamiView (separate global Editar and Eliminar buttons under
 * "+ Nueva Deuda", acting directly on the existing obligations list) across all three skins.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert, Dimensions } from 'react-native';
import { BFlowThemeProvider } from '../../../../design-system/theme/ThemeContext';
import { PLATFORM_SKIN_IDS, type PlatformSkinId } from '../../../../design-system/tokens';
import type { DebtSummaryResult } from '../../../../domain';
import { DebtsFunfamiView } from '../DebtsFunfamiView';

const ORIGINAL_WINDOW = Dimensions.get('window');
const ORIGINAL_SCREEN = Dimensions.get('screen');

const BASE_DEBT_SUMMARY: DebtSummaryResult = {
  monthKey: '2026-10',
  openingTotalDebt: 6_200_000,
  appliedInstallmentThisMonth: 500_000,
  totalRemainingDebt: 5_700_000,
  isInstallmentPaid: true,
  debts: [
    {
      debtId: 'debt_cb300f_moto',
      name: 'Moto CB300F',
      lender: 'FUNFAMI',
      openingBalance: 2_600_000,
      monthlyInterestRate: 0.9,
      annualInterestRate: 10.8,
      interestRateType: 'monthly',
      monthlyInstallment: 500_000,
      accruedInterestThisMonth: 23_400,
      appliedPrincipalThisMonth: 500_000,
      remainingBalance: 2_100_000,
      reductionRatio: 0.19,
    },
    {
      debtId: 'debt_esp_ia',
      name: 'Especialización IA',
      lender: 'Banco',
      openingBalance: 3_600_000,
      monthlyInterestRate: 0,
      annualInterestRate: 0,
      interestRateType: 'monthly',
      monthlyInstallment: 0,
      accruedInterestThisMonth: 0,
      appliedPrincipalThisMonth: 0,
      remainingBalance: 3_600_000,
      reductionRatio: 0,
    },
  ],
  projection: {
    remainingMonths: 12,
    estimatedPayoffMonthKey: '2027-10',
  },
};

function setWindowSize(width: number, height: number): void {
  act(() => {
    const metrics = { width, height, scale: 2, fontScale: 1 };
    Dimensions.set({ window: metrics, screen: metrics });
  });
}

function renderView(
  skin: PlatformSkinId,
  overrides?: Partial<React.ComponentProps<typeof DebtsFunfamiView>>
) {
  const onCreateDebt = jest.fn();
  const onUpdateDebt = jest.fn();
  const onDeleteDebt = jest.fn();
  const utils = render(
    <BFlowThemeProvider skin={skin} initialMode="dark">
      <DebtsFunfamiView
        debtSummary={BASE_DEBT_SUMMARY}
        onCreateDebt={onCreateDebt}
        onUpdateDebt={onUpdateDebt}
        onDeleteDebt={onDeleteDebt}
        {...overrides}
      />
    </BFlowThemeProvider>
  );
  return { ...utils, onCreateDebt, onUpdateDebt, onDeleteDebt };
}

beforeEach(() => {
  setWindowSize(390, 844);
  jest.restoreAllMocks();
});

afterAll(() => {
  act(() => {
    Dimensions.set({ window: ORIGINAL_WINDOW, screen: ORIGINAL_SCREEN });
  });
});

describe.each(PLATFORM_SKIN_IDS)('DebtsFunfamiView on %s skin', (skin) => {
  it('renders separate Editar and Eliminar buttons under + Nueva Deuda without Obligaciones Activas heading and hides per-card actions by default', () => {
    renderView(skin);

    expect(screen.queryByText('Obligaciones Activas')).toBeNull();
    expect(screen.getByTestId('debts-add-new-debt-button')).toBeTruthy();
    expect(screen.getByTestId('debt-action-edit-button')).toBeTruthy();
    expect(screen.getByTestId('debt-action-delete-button')).toBeTruthy();

    expect(screen.getByTestId('debt-card-debt_cb300f_moto')).toBeTruthy();
    expect(screen.getByTestId('debt-card-debt_esp_ia')).toBeTruthy();

    // Per-card edit/delete buttons are hidden by default.
    expect(screen.queryByTestId('debt-edit-debt_cb300f_moto')).toBeNull();
    expect(screen.queryByTestId('debt-delete-debt_cb300f_moto')).toBeNull();
    expect(screen.queryByTestId('debt-edit-debt_esp_ia')).toBeNull();
    expect(screen.queryByTestId('debt-delete-debt_esp_ia')).toBeNull();
  });

  it('activates inline Editar action on existing debt cards without duplicating them', () => {
    const { onUpdateDebt } = renderView(skin);

    fireEvent.press(screen.getByTestId('debt-action-edit-button'));

    expect(screen.getAllByTestId('debt-card-debt_cb300f_moto')).toHaveLength(1);
    expect(screen.getAllByTestId('debt-card-debt_esp_ia')).toHaveLength(1);
    expect(screen.getByTestId('debt-edit-debt_cb300f_moto')).toBeTruthy();
    expect(screen.getByTestId('debt-edit-debt_esp_ia')).toBeTruthy();
    expect(screen.queryByTestId('debt-delete-debt_cb300f_moto')).toBeNull();

    // Pressing edit on a card opens the pre-filled form and clears edit mode
    fireEvent.press(screen.getByTestId('debt-edit-debt_cb300f_moto'));
    expect(screen.queryByTestId('debt-edit-debt_cb300f_moto')).toBeNull();
    expect(screen.getByTestId('debt-form-modal')).toBeTruthy();
    expect(screen.getByTestId('debt-form-name-input').props.value).toBe('Moto CB300F');

    fireEvent.changeText(screen.getByTestId('debt-form-name-input'), 'Moto CB300F 2027');
    fireEvent.press(screen.getByTestId('debt-form-submit-button'));

    expect(onUpdateDebt).toHaveBeenCalledWith(
      'debt_cb300f_moto',
      expect.objectContaining({
        name: 'Moto CB300F 2027',
        lender: 'FUNFAMI',
        openingBalance: 2_600_000,
      })
    );
  });

  it('activates inline Eliminar action on existing debt cards and confirms deletion', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const destructive = buttons?.find((b) => b.style === 'destructive');
      destructive?.onPress?.();
    });

    const { onDeleteDebt } = renderView(skin);

    fireEvent.press(screen.getByTestId('debt-action-delete-button'));

    expect(screen.getAllByTestId('debt-card-debt_cb300f_moto')).toHaveLength(1);
    expect(screen.getByTestId('debt-delete-debt_cb300f_moto')).toBeTruthy();
    expect(screen.getByTestId('debt-delete-debt_esp_ia')).toBeTruthy();
    expect(screen.queryByTestId('debt-edit-debt_cb300f_moto')).toBeNull();

    fireEvent.press(screen.getByTestId('debt-delete-debt_esp_ia'));
    expect(alertSpy).toHaveBeenCalled();
    expect(onDeleteDebt).toHaveBeenCalledWith('debt_esp_ia');

    // Toggling off hides delete actions again
    fireEvent.press(screen.getByTestId('debt-action-delete-button'));
    expect(screen.queryByTestId('debt-delete-debt_esp_ia')).toBeNull();
  });

  it('switches cleanly between + Nueva Deuda form, Editar mode, and Eliminar mode across phone and desktop widths', () => {
    setWindowSize(1440, 900);
    renderView(skin);

    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    expect(screen.getByTestId('debt-form-modal')).toBeTruthy();

    fireEvent.press(screen.getByTestId('debt-action-edit-button'));
    expect(screen.queryByTestId('debt-form-modal')).toBeNull();
    expect(screen.getByTestId('debt-edit-debt_cb300f_moto')).toBeTruthy();

    fireEvent.press(screen.getByTestId('debt-action-delete-button'));
    expect(screen.queryByTestId('debt-edit-debt_cb300f_moto')).toBeNull();
    expect(screen.getByTestId('debt-delete-debt_cb300f_moto')).toBeTruthy();

    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    expect(screen.queryByTestId('debt-delete-debt_cb300f_moto')).toBeNull();
    expect(screen.getByTestId('debt-form-modal')).toBeTruthy();
  });
});
