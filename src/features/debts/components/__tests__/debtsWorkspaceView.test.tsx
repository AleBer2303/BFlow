/**
 * Tests for DebtsWorkspaceView (separate global Editar and Eliminar buttons under
 * "+ Nueva Deuda", acting directly on the existing obligations list) across all three skins.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert, Dimensions, StyleSheet } from 'react-native';
import { TabVisibilityProvider } from '../../../../design-system/motion/TabVisibilityContext';
import {
  AmountPrivacyProvider,
  HIDDEN_AMOUNT_TEXT,
} from '../../../../design-system/privacy/AmountPrivacyContext';
import { BFlowThemeProvider } from '../../../../design-system/theme/ThemeContext';
import {
  PLATFORM_SKIN_IDS,
  palettesBySkin,
  type PlatformSkinId,
} from '../../../../design-system/tokens';
import type { DebtSummaryResult } from '../../../../domain';
import { DebtsWorkspaceView } from '../DebtsWorkspaceView';

const ORIGINAL_WINDOW = Dimensions.get('window');
const ORIGINAL_SCREEN = Dimensions.get('screen');

/** Counts renders of the cards' status badges: none of the forms with text fields has one. */
const mockStatusBadgeRender = jest.fn();
jest.mock('../../../../design-system/components/StatusBadge', () => {
  const ReactLib = jest.requireActual('react') as typeof import('react');
  const actual = jest.requireActual('../../../../design-system/components/StatusBadge') as typeof import('../../../../design-system/components/StatusBadge');
  return {
    ...actual,
    StatusBadge: (props: React.ComponentProps<typeof actual.StatusBadge>) => {
      mockStatusBadgeRender();
      return ReactLib.createElement(actual.StatusBadge, props);
    },
  };
});

const BASE_DEBT_SUMMARY: DebtSummaryResult = {
  monthKey: '2026-10',
  openingTotalDebt: 6_200_000,
  appliedInstallmentThisMonth: 500_000,
  totalRemainingDebt: 5_700_000,
  isInstallmentPaid: true,
  debts: [
    {
      debtId: 'debt_auto_loan',
      name: 'Carro vehículo',
      lender: 'Banco',
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
      debtId: 'debt_education_loan',
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
  overrides?: Partial<React.ComponentProps<typeof DebtsWorkspaceView>>
) {
  const onCreateDebt = jest.fn();
  const onUpdateDebt = jest.fn();
  const onDeleteDebt = jest.fn();
  const utils = render(
    <BFlowThemeProvider skin={skin} initialMode="dark">
      <DebtsWorkspaceView
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

describe.each(PLATFORM_SKIN_IDS)('DebtsWorkspaceView on %s skin', (skin) => {
  it('renders separate Editar and Eliminar buttons under + Nueva Deuda without Obligaciones Activas heading and hides per-card actions by default', () => {
    renderView(skin);

    expect(screen.queryByText('Obligaciones Activas')).toBeNull();
    expect(screen.getByTestId('debts-add-new-debt-button')).toBeTruthy();
    expect(screen.getByTestId('debt-action-edit-button')).toBeTruthy();
    expect(screen.getByTestId('debt-action-delete-button')).toBeTruthy();

    expect(screen.getByTestId('debt-card-debt_auto_loan')).toBeTruthy();
    expect(screen.getByTestId('debt-card-debt_education_loan')).toBeTruthy();

    // Per-card edit/delete buttons are hidden by default.
    expect(screen.queryByTestId('debt-edit-debt_auto_loan')).toBeNull();
    expect(screen.queryByTestId('debt-delete-debt_auto_loan')).toBeNull();
    expect(screen.queryByTestId('debt-edit-debt_education_loan')).toBeNull();
    expect(screen.queryByTestId('debt-delete-debt_education_loan')).toBeNull();
  });

  it('activates inline Editar action on existing debt cards without duplicating them', () => {
    const { onUpdateDebt } = renderView(skin);

    fireEvent.press(screen.getByTestId('debt-action-edit-button'));

    expect(screen.getAllByTestId('debt-card-debt_auto_loan')).toHaveLength(1);
    expect(screen.getAllByTestId('debt-card-debt_education_loan')).toHaveLength(1);
    expect(screen.getByTestId('debt-edit-debt_auto_loan')).toBeTruthy();
    expect(screen.getByTestId('debt-edit-debt_education_loan')).toBeTruthy();
    expect(screen.queryByTestId('debt-delete-debt_auto_loan')).toBeNull();

    // Pressing edit on a card opens the pre-filled form and clears edit mode
    fireEvent.press(screen.getByTestId('debt-edit-debt_auto_loan'));
    expect(screen.queryByTestId('debt-edit-debt_auto_loan')).toBeNull();
    expect(screen.getByTestId('debt-form-modal')).toBeTruthy();
    expect(screen.getByTestId('debt-form-name-input').props.value).toBe('Carro vehículo');
    expect(screen.getByTestId('debt-form-name-input').props.autoCapitalize).toBe('sentences');
    expect(screen.getByTestId('debt-form-amount-input').props.keyboardType).toBe('number-pad');
    expect(screen.getByTestId('debt-form-amount-input').props.value).toBe('2.600.000');
    expect(screen.getByTestId('debt-form-installment-input').props.keyboardType).toBe('number-pad');
    expect(screen.getByTestId('debt-form-installment-input').props.value).toBe('500.000');
    expect(screen.getByTestId('debt-form-interest-rate-input').props.keyboardType).toBe('decimal-pad');

    fireEvent.changeText(screen.getByTestId('debt-form-name-input'), 'Carro vehículo 2027');
    fireEvent.press(screen.getByTestId('debt-form-submit-button'));

    expect(onUpdateDebt).toHaveBeenCalledWith(
      'debt_auto_loan',
      expect.objectContaining({
        name: 'Carro vehículo 2027',
        lender: 'Banco',
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

    expect(screen.getAllByTestId('debt-card-debt_auto_loan')).toHaveLength(1);
    expect(screen.getByTestId('debt-delete-debt_auto_loan')).toBeTruthy();
    expect(screen.getByTestId('debt-delete-debt_education_loan')).toBeTruthy();
    expect(screen.queryByTestId('debt-edit-debt_auto_loan')).toBeNull();

    fireEvent.press(screen.getByTestId('debt-delete-debt_education_loan'));
    expect(alertSpy).toHaveBeenCalled();
    expect(onDeleteDebt).toHaveBeenCalledWith('debt_education_loan');

    // Toggling off hides delete actions again
    fireEvent.press(screen.getByTestId('debt-action-delete-button'));
    expect(screen.queryByTestId('debt-delete-debt_education_loan')).toBeNull();
  });

  it('switches cleanly between + Nueva Deuda form, Editar mode, and Eliminar mode across phone and desktop widths', () => {
    setWindowSize(1440, 900);
    renderView(skin);

    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    expect(screen.getByTestId('debt-form-modal')).toBeTruthy();

    fireEvent.press(screen.getByTestId('debt-action-edit-button'));
    expect(screen.queryByTestId('debt-form-modal')).toBeNull();
    expect(screen.getByTestId('debt-edit-debt_auto_loan')).toBeTruthy();

    fireEvent.press(screen.getByTestId('debt-action-delete-button'));
    expect(screen.queryByTestId('debt-edit-debt_auto_loan')).toBeNull();
    expect(screen.getByTestId('debt-delete-debt_auto_loan')).toBeTruthy();

    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    expect(screen.queryByTestId('debt-delete-debt_auto_loan')).toBeNull();
    expect(screen.getByTestId('debt-form-modal')).toBeTruthy();
  });
});

describe.each(PLATFORM_SKIN_IDS)('DebtsWorkspaceView form state on %s skin', (skin) => {
  it('typing in the debt form does not re-render the debt cards', () => {
    const { onCreateDebt } = renderView(skin);
    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    mockStatusBadgeRender.mockClear();

    fireEvent.changeText(screen.getByTestId('debt-form-name-input'), 'Tarjeta');
    fireEvent.changeText(screen.getByTestId('debt-form-lender-input'), 'Banco');
    fireEvent.changeText(screen.getByTestId('debt-form-amount-input'), '1.200.000');
    fireEvent.changeText(screen.getByTestId('debt-form-interest-rate-input'), '1.5');
    fireEvent.press(screen.getByTestId('debt-form-rate-type-annual'));
    fireEvent.changeText(screen.getByTestId('debt-form-installment-input'), '100.000');

    expect(mockStatusBadgeRender).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('debt-form-submit-button'));
    expect(onCreateDebt).toHaveBeenCalledWith({
      name: 'Tarjeta',
      lender: 'Banco',
      openingBalance: 1_200_000,
      monthlyInterestRate: 0.125,
      annualInterestRate: 1.5,
      interestRateType: 'annual',
      monthlyInstallment: 100_000,
    });
    expect(screen.queryByTestId('debt-form-modal')).toBeNull();
  });

  it('a validation error stays inside the form and keeps what was typed', () => {
    const { onCreateDebt } = renderView(skin);
    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    fireEvent.changeText(screen.getByTestId('debt-form-name-input'), 'Tarjeta');
    mockStatusBadgeRender.mockClear();

    fireEvent.press(screen.getByTestId('debt-form-submit-button'));

    expect(screen.getByText('Escribe la entidad o persona acreedora.')).toBeTruthy();
    expect(screen.getByTestId('debt-form-name-input').props.value).toBe('Tarjeta');
    expect(onCreateDebt).not.toHaveBeenCalled();
    expect(mockStatusBadgeRender).not.toHaveBeenCalled();
  });

  it('reopening the form starts empty, and editing loads the chosen debt each time', () => {
    const { onUpdateDebt } = renderView(skin);
    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    fireEvent.changeText(screen.getByTestId('debt-form-name-input'), 'Borrador');
    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    expect(screen.getByTestId('debt-form-name-input').props.value).toBe('');

    fireEvent.press(screen.getByTestId('debt-action-edit-button'));
    fireEvent.press(screen.getByTestId('debt-edit-debt_auto_loan'));
    expect(screen.getByTestId('debt-form-name-input').props.value).toBe('Carro vehículo');
    expect(screen.getByTestId('debt-form-amount-input').props.value).toBe('2.600.000');

    fireEvent.press(screen.getByTestId('debt-action-edit-button'));
    fireEvent.press(screen.getByTestId('debt-edit-debt_education_loan'));
    expect(screen.getByTestId('debt-form-name-input').props.value).toBe('Especialización IA');

    fireEvent.changeText(screen.getByTestId('debt-form-name-input'), 'Posgrado');
    fireEvent.press(screen.getByTestId('debt-form-submit-button'));
    expect(onUpdateDebt).toHaveBeenCalledWith(
      'debt_education_loan',
      expect.objectContaining({ name: 'Posgrado', openingBalance: 3_600_000 })
    );
  });

  it('uses single HeroAmountField in semantic debt tone, previews interest, and avoids card re-renders on form toggle', () => {
    renderView(skin);
    mockStatusBadgeRender.mockClear();

    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    // Opening the form must NOT re-render DebtHeroCard or DebtObligationCard.
    expect(mockStatusBadgeRender).not.toHaveBeenCalled();

    const heroStyle = StyleSheet.flatten(screen.getByTestId('debt-form-hero-amount').props.style);
    const amountInput = screen.getByTestId('debt-form-amount-input');
    const inputStyle = StyleSheet.flatten(amountInput.props.style);
    expect(heroStyle.backgroundColor).toBe(palettesBySkin[skin].dark.semantic.debtSoft);
    expect(inputStyle.color).toBe(palettesBySkin[skin].dark.semantic.debt);

    fireEvent.changeText(amountInput, '1000000');
    expect(screen.getByTestId('debt-form-amount-input').props.value).toBe('1.000.000');
    expect(screen.queryByText('$ 1.000.000')).toBeNull();

    fireEvent.changeText(screen.getByTestId('debt-form-interest-rate-input'), '2');
    expect(screen.getByTestId('debt-form-interest-preview')).toHaveTextContent(
      'Interés mensual aprox.: ~ $ 20.000'
    );

    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    expect(mockStatusBadgeRender).not.toHaveBeenCalled();
  });

  it('masks debt interest preview when privacy mode hides amounts', () => {
    render(
      <BFlowThemeProvider skin={skin} initialMode="dark">
        <AmountPrivacyProvider initialHidden>
          <DebtsWorkspaceView debtSummary={BASE_DEBT_SUMMARY} />
        </AmountPrivacyProvider>
      </BFlowThemeProvider>
    );

    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    fireEvent.changeText(screen.getByTestId('debt-form-amount-input'), '1000000');
    fireEvent.changeText(screen.getByTestId('debt-form-interest-rate-input'), '2');

    expect(screen.getByTestId('debt-form-interest-preview')).toHaveTextContent(
      `Interés mensual aprox.: ~ ${HIDDEN_AMOUNT_TEXT}`
    );
  });

  it('resets open form and action mode when monthKey changes or tab becomes inactive', () => {
    const { rerender } = render(
      <BFlowThemeProvider skin={skin} initialMode="dark">
        <TabVisibilityProvider isActive>
          <DebtsWorkspaceView debtSummary={BASE_DEBT_SUMMARY} />
        </TabVisibilityProvider>
      </BFlowThemeProvider>
    );

    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    expect(screen.getByTestId('debt-form-modal')).toBeTruthy();

    rerender(
      <BFlowThemeProvider skin={skin} initialMode="dark">
        <TabVisibilityProvider isActive={false}>
          <DebtsWorkspaceView debtSummary={BASE_DEBT_SUMMARY} />
        </TabVisibilityProvider>
      </BFlowThemeProvider>
    );
    expect(screen.queryByTestId('debt-form-modal')).toBeNull();

    rerender(
      <BFlowThemeProvider skin={skin} initialMode="dark">
        <TabVisibilityProvider isActive>
          <DebtsWorkspaceView debtSummary={BASE_DEBT_SUMMARY} />
        </TabVisibilityProvider>
      </BFlowThemeProvider>
    );
    fireEvent.press(screen.getByTestId('debt-action-edit-button'));
    expect(screen.getByTestId('debt-edit-debt_auto_loan')).toBeTruthy();

    rerender(
      <BFlowThemeProvider skin={skin} initialMode="dark">
        <TabVisibilityProvider isActive>
          <DebtsWorkspaceView debtSummary={{ ...BASE_DEBT_SUMMARY, monthKey: '2026-11' }} />
        </TabVisibilityProvider>
      </BFlowThemeProvider>
    );
    expect(screen.queryByTestId('debt-edit-debt_auto_loan')).toBeNull();
  });
});

describe('DebtsWorkspaceView paid-off banner (CC-05)', () => {
  const paidOff = (debtId: string, openingBalance: number) => ({
    ...BASE_DEBT_SUMMARY,
    debts: BASE_DEBT_SUMMARY.debts.map((d) =>
      d.debtId === debtId ? { ...d, openingBalance, remainingBalance: 0 } : d
    ),
  });

  it('celebrates whichever debt reached 0 this month, not a fixed sample debt', () => {
    renderView('ios', { debtSummary: paidOff('debt_education_loan', 3_600_000) });
    expect(screen.getByTestId('debt-paid-off-banner')).toBeTruthy();
    expect(screen.getByText('¡Deuda "Especialización IA" liquidada al 100%!')).toBeTruthy();

    fireEvent.press(screen.getByTestId('debt-paid-off-banner-dismiss-button'));
    expect(screen.queryByTestId('debt-paid-off-banner')).toBeNull();
  });

  it('shows no banner when no debt was paid off this month', () => {
    renderView('ios');
    expect(screen.queryByTestId('debt-paid-off-banner')).toBeNull();

    renderView('android', { debtSummary: paidOff('debt_auto_loan', 0) });
    expect(screen.queryByTestId('debt-paid-off-banner')).toBeNull();
  });
});
