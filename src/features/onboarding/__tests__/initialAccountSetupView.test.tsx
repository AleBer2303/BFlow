import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import { PLATFORM_SKIN_IDS, type PlatformSkinId } from '../../../design-system/tokens';
import { formatMonthKeyLabelEs, toAppMonthKey } from '../../../domain';
import type { InitialOnboardingConfigInput } from '../../budget/store/useBudgetStore';
import { InitialAccountSetupView } from '../components/InitialAccountSetupView';

function renderSetup(
  props: Omit<React.ComponentProps<typeof InitialAccountSetupView>, 'onCompleteSetup'> = {},
  skin: PlatformSkinId = 'ios',
  mode: 'dark' | 'light' = 'dark'
) {
  const onCompleteSetup = jest.fn<void, [InitialOnboardingConfigInput]>();
  const utils = render(
    <BFlowThemeProvider initialMode={mode} skin={skin}>
      <InitialAccountSetupView {...props} onCompleteSetup={onCompleteSetup} />
    </BFlowThemeProvider>
  );
  return { ...utils, onCompleteSetup };
}

describe('InitialAccountSetupView (Onboarding / Account Reset Wizard)', () => {
  it('renders initial account setup view with default state and native iOS wheel picker modal', () => {
    renderSetup({ defaultMonthKey: '2026-03' });

    expect(screen.getByTestId('initial-account-setup-view')).toBeTruthy();
    expect(screen.getByText('Personaliza tu BFlow')).toBeTruthy();
    expect(screen.getByTestId('onboarding-year-dropdown-trigger')).toBeTruthy();
    expect(screen.getByTestId('onboarding-year-input')).toHaveTextContent('2026');
    expect(screen.getByTestId('onboarding-month-dropdown-trigger')).toBeTruthy();

    // Year Wheel Picker: open, check bounds [currentYear - 50, currentYear], select 2025, and confirm
    fireEvent.press(screen.getByTestId('onboarding-year-dropdown-trigger'));
    expect(screen.getByTestId('onboarding-year-picker')).toBeTruthy();
    expect(screen.getByTestId('onboarding-year-picker-option-1976')).toBeTruthy();
    expect(screen.getByTestId('onboarding-year-picker-option-2026')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-year-picker-option-2027')).toBeNull();

    fireEvent.press(screen.getByTestId('onboarding-year-picker-option-2025'));
    fireEvent.press(screen.getByTestId('onboarding-year-picker-confirm'));
    expect(screen.getByTestId('onboarding-year-input')).toHaveTextContent('2025');

    // Month Wheel Picker: open, scroll, select "Octubre" (10), and confirm
    expect(screen.queryByTestId('onboarding-month-picker')).toBeNull();
    fireEvent.press(screen.getByTestId('onboarding-month-dropdown-trigger'));
    expect(screen.getByTestId('onboarding-month-picker')).toBeTruthy();
    expect(screen.getByTestId('onboarding-month-picker-carousel-area')).toBeTruthy();
    expect(screen.getByTestId('onboarding-month-picker-lens')).toBeTruthy();

    fireEvent.scroll(screen.getByTestId('onboarding-month-picker-scroll-view'), {
      nativeEvent: { contentOffset: { y: 9 * 44 } },
    });
    fireEvent.press(screen.getByTestId('onboarding-month-picker-option-10'));
    fireEvent.press(screen.getByTestId('onboarding-month-picker-confirm'));

    expect(screen.getByText('Octubre')).toBeTruthy();
  });

  it('cancels wheel picker selection without committing when touching Cancelar or backdrop', () => {
    renderSetup({ defaultMonthKey: '2026-03' });

    fireEvent.press(screen.getByTestId('onboarding-month-dropdown-trigger'));
    expect(screen.getByTestId('onboarding-month-picker')).toBeTruthy();

    fireEvent.press(screen.getByTestId('onboarding-month-picker-cancel'));
    expect(screen.queryByTestId('onboarding-month-picker-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('onboarding-month-dropdown-trigger'));
    fireEvent.press(screen.getByTestId('onboarding-month-picker-backdrop'));
    expect(screen.queryByTestId('onboarding-month-picker-sheet')).toBeNull();
  });

  it('keeps empty state banners and collapses modernized forms inside RevealDown by default', () => {
    renderSetup({ defaultMonthKey: '2026-10' });

    expect(screen.getByText(/Sin fondos registrados/)).toBeTruthy();
    expect(screen.getByText(/Sin deudas registradas/)).toBeTruthy();
    expect(screen.getByText(/Sin movimientos registrados/)).toBeTruthy();
    expect(screen.getByText(/Sin provisiones registradas/)).toBeTruthy();

    expect(screen.queryByTestId('add-savings-bucket-card')).toBeNull();
    expect(screen.queryByTestId('debt-form-modal')).toBeNull();
    expect(screen.queryByTestId('add-movement-modal-card')).toBeNull();
    expect(screen.queryByTestId('provision-form-card')).toBeNull();

    // Opening one form and switching to another keeps only one form open at a time
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-bucket'));
    expect(screen.getByTestId('add-savings-bucket-card')).toBeTruthy();
    expect(screen.getByTestId('onboarding-toggle-add-bucket')).toHaveTextContent('Cerrar');

    fireEvent.press(screen.getByTestId('onboarding-toggle-add-debt'));
    expect(screen.queryByTestId('add-savings-bucket-card')).toBeNull();
    expect(screen.getByTestId('debt-form-modal')).toBeTruthy();

    fireEvent.press(screen.getByTestId('onboarding-toggle-add-debt'));
    expect(screen.queryByTestId('debt-form-modal')).toBeNull();
    expect(screen.getByTestId('onboarding-toggle-add-debt')).toHaveTextContent('+ Nueva Deuda');
  });

  it('adds funds, debts, incomes, linked expenses, and provisions using the shared modernized forms', () => {
    const { onCompleteSetup } = renderSetup({ defaultMonthKey: '2026-10' });

    // 1. Add savings bucket via NewSavingsBucketForm
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-bucket'));
    fireEvent.changeText(screen.getByTestId('new-bucket-balance-input'), '500000');
    fireEvent.changeText(screen.getByTestId('new-bucket-name-input'), 'Emergencias');
    fireEvent.press(screen.getByTestId('submit-new-bucket-button'));
    expect(screen.getByText('Emergencias')).toBeTruthy();
    expect(screen.queryByTestId('add-savings-bucket-card')).toBeNull();

    // 2. Add debt via DebtForm
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-debt'));
    expect(screen.getByTestId('debt-form-name-input').props.autoCapitalize).toBe('sentences');
    expect(screen.getByTestId('debt-form-amount-input').props.keyboardType).toBe('number-pad');
    fireEvent.changeText(screen.getByTestId('debt-form-amount-input'), '2000000');
    expect(screen.getByTestId('debt-form-amount-input').props.value).toBe('2.000.000');
    fireEvent.changeText(screen.getByTestId('debt-form-name-input'), 'Crédito Moto');
    fireEvent.changeText(screen.getByTestId('debt-form-lender-input'), 'Bancolombia');
    fireEvent.changeText(screen.getByTestId('debt-form-installment-input'), '200000');
    fireEvent.press(screen.getByTestId('debt-form-submit-button'));
    expect(screen.getByText('Crédito Moto (Bancolombia)')).toBeTruthy();
    expect(screen.queryByTestId('debt-form-modal')).toBeNull();

    // 3. Add income via ChecklistAddMovementForm
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-movement'));
    fireEvent.press(screen.getByTestId('modal-type-income'));
    fireEvent.changeText(screen.getByTestId('movement-amount-input'), '3500000');
    fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Salario Principal');
    fireEvent.press(screen.getByTestId('custom-group-fixed'));
    fireEvent.press(screen.getByTestId('submit-movement-button'));
    expect(screen.getByText('Salario Principal')).toBeTruthy();
    expect(screen.queryByTestId('add-movement-modal-card')).toBeNull();

    // 4. Add expense linked to debt via ChecklistAddMovementForm ("Más opciones" -> AdaptiveSelectField)
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-movement'));
    fireEvent.changeText(screen.getByTestId('movement-amount-input'), '200000');
    fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Cuota Préstamo Moto');
    fireEvent.press(screen.getByTestId('custom-group-fixed'));
    fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
    fireEvent.press(screen.getByTestId('add-movement-debt-select'));
    fireEvent.press(screen.getByText('Crédito Moto'));
    fireEvent.press(screen.getByTestId('add-movement-debt-picker-confirm'));
    fireEvent.press(screen.getByTestId('submit-movement-button'));
    expect(screen.getByText('Cuota Préstamo Moto')).toBeTruthy();
    expect(screen.getByText(/Abona a: Crédito Moto/)).toBeTruthy();
    expect(screen.queryByTestId('add-movement-modal-card')).toBeNull();

    // 5. Add provision via ProvisionItemForm
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-provision'));
    fireEvent.changeText(screen.getByTestId('provision-amount-input'), '650000');
    fireEvent.changeText(screen.getByTestId('provision-name-input'), 'SOAT 2027');
    fireEvent.changeText(screen.getByTestId('provision-months-input'), '12');
    fireEvent.press(screen.getByTestId('submit-provision-button'));
    expect(screen.getByText('SOAT 2027')).toBeTruthy();
    expect(screen.queryByTestId('provision-form-card')).toBeNull();

    // Summary strip reflects all configured counts
    const summaryStrip = screen.getByTestId('onboarding-summary-strip');
    expect(summaryStrip).toHaveTextContent(/Fondos \(1\)/);
    expect(summaryStrip).toHaveTextContent(/Deudas \(1\)/);
    expect(summaryStrip).toHaveTextContent(/Movimientos \(2\)/);
    expect(summaryStrip).toHaveTextContent(/Metas \(1\)/);

    // 6. Complete setup
    fireEvent.press(screen.getByTestId('complete-initial-setup-button'));
    expect(onCompleteSetup).toHaveBeenCalledTimes(1);

    const config = onCompleteSetup.mock.calls[0]?.[0];
    expect(config).toBeDefined();
    expect(config?.monthKey).toBe('2026-10');
    expect(config?.savingsBuckets).toHaveLength(1);
    expect(config?.savingsBuckets[0]?.name).toBe('Emergencias');
    expect(config?.savingsBuckets[0]?.openingBalanceCop).toBe(500000);

    expect(config?.debts).toHaveLength(1);
    expect(config?.debts[0]?.name).toBe('Crédito Moto');
    expect(config?.debts[0]?.openingBalanceCop).toBe(2000000);
    expect(config?.debts[0]?.monthlyInstallmentCop).toBe(200000);

    expect(config?.incomes).toHaveLength(1);
    expect(config?.incomes[0]?.name).toBe('Salario Principal');
    expect(config?.incomes[0]?.amountCop).toBe(3500000);
    expect(config?.incomes[0]?.group).toBe('fixed');

    expect(config?.expenses).toHaveLength(1);
    expect(config?.expenses[0]?.name).toBe('Cuota Préstamo Moto');
    expect(config?.expenses[0]?.amountCop).toBe(200000);
    expect(config?.expenses[0]?.targetDebtKey).toContain('debt_');

    expect(config?.provisions).toHaveLength(1);
    expect(config?.provisions?.[0]?.name).toBe('SOAT 2027');
    expect(config?.provisions?.[0]?.amountCop).toBe(650000);
    expect(config?.provisions?.[0]?.periodMonths).toBe(12);
  });

  it('clears linked fund references from expenses when a savings bucket is removed', () => {
    const { onCompleteSetup } = renderSetup({ defaultMonthKey: '2026-10' }, 'web', 'light');

    // Add a savings fund
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-bucket'));
    fireEvent.changeText(screen.getByTestId('new-bucket-name-input'), 'Viaje');
    fireEvent.changeText(screen.getByTestId('new-bucket-balance-input'), '100000');
    fireEvent.press(screen.getByTestId('submit-new-bucket-button'));

    // Add an expense linked to that fund (web uses anchored menu without confirm button)
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-movement'));
    fireEvent.changeText(screen.getByTestId('movement-amount-input'), '50000');
    fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Ahorro Viaje');
    fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
    fireEvent.press(screen.getByTestId('add-movement-bucket-select'));
    fireEvent.press(screen.getByTestId('add-movement-bucket-picker-option-bucket_viaje'));
    fireEvent.press(screen.getByTestId('submit-movement-button'));
    expect(screen.getByText(/Aporta a: Viaje/)).toBeTruthy();

    // Remove the fund and verify the expense no longer links to it
    fireEvent.press(screen.getByTestId('onboarding-remove-bucket-bucket_viaje'));
    expect(screen.queryByText(/Aporta a: Viaje/)).toBeNull();

    fireEvent.press(screen.getByTestId('complete-initial-setup-button'));
    const config = onCompleteSetup.mock.calls[0]?.[0];
    expect(config?.savingsBuckets).toHaveLength(0);
    expect(config?.expenses[0]?.savingsBucketKey).toBeNull();
  });

  it.each(PLATFORM_SKIN_IDS)(
    'opens and closes all four modernized forms cleanly on the %s skin',
    (skin) => {
      renderSetup({ defaultMonthKey: '2026-10' }, skin);

      const forms = [
        { toggleId: 'onboarding-toggle-add-bucket', cardId: 'add-savings-bucket-card' },
        { toggleId: 'onboarding-toggle-add-debt', cardId: 'debt-form-modal' },
        { toggleId: 'onboarding-toggle-add-movement', cardId: 'add-movement-modal-card' },
        { toggleId: 'onboarding-toggle-add-provision', cardId: 'provision-form-card' },
      ] as const;

      for (const form of forms) {
        fireEvent.press(screen.getByTestId(form.toggleId));
        expect(screen.getByTestId(form.cardId)).toBeTruthy();
        expect(screen.getByTestId(form.toggleId)).toHaveTextContent('Cerrar');

        fireEvent.press(screen.getByTestId(form.toggleId));
        expect(screen.queryByTestId(form.cardId)).toBeNull();
      }
    }
  );

  it.each([390, 1440])('renders responsive onboarding panels at %ipx width', (width) => {
    const original = Dimensions.get('window');
    Dimensions.set({ window: { ...original, width } });
    let unmount: (() => void) | undefined;
    try {
      ({ unmount } = renderSetup({ defaultMonthKey: '2026-10' }, width >= 1024 ? 'web' : 'ios'));
      expect(screen.getByTestId('onboarding-panels')).toBeTruthy();
      expect(screen.getByTestId('complete-initial-setup-button')).toBeTruthy();
    } finally {
      unmount?.();
      Dimensions.set({ window: original });
    }
  });

  it('defaults year and month to the current month in America/Bogota when defaultMonthKey is omitted', () => {
    const currentMk = toAppMonthKey();
    const expectedLabel = formatMonthKeyLabelEs(currentMk);
    const { onCompleteSetup } = renderSetup();

    expect(screen.getByTestId('onboarding-year-input')).toHaveTextContent(currentMk.slice(0, 4));
    expect(screen.getByTestId('complete-initial-setup-button')).toHaveTextContent(
      `Guardar e Iniciar ${expectedLabel}`
    );

    fireEvent.press(screen.getByTestId('complete-initial-setup-button'));
    expect(onCompleteSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        monthKey: currentMk,
      })
    );
  });

  it.each(['ios', 'android'] as const)(
    'updates year and month via bottom-anchored wheel modal on %s skin',
    (skin) => {
      renderSetup({ defaultMonthKey: '2026-03' }, skin);

      fireEvent.press(screen.getByTestId('onboarding-month-dropdown-trigger'));
      expect(screen.getByTestId('onboarding-month-picker-container').props.style).toEqual(
        expect.objectContaining({ justifyContent: 'flex-end' })
      );
      expect(screen.getByTestId('onboarding-month-picker-carousel-area')).toBeTruthy();
      fireEvent.press(screen.getByTestId('onboarding-month-picker-option-11'));
      fireEvent.press(screen.getByTestId('onboarding-month-picker-confirm'));

      expect(screen.getByTestId('complete-initial-setup-button')).toHaveTextContent(
        'Guardar e Iniciar Noviembre 2026'
      );
    }
  );

  it('notifies parent via onMonthKeyChange initially and whenever year or month changes', () => {
    const onMonthKeyChange = jest.fn();
    renderSetup({ defaultMonthKey: '2026-03', onMonthKeyChange }, 'web', 'light');

    expect(onMonthKeyChange).toHaveBeenCalledWith('2026-03');

    fireEvent.press(screen.getByTestId('onboarding-month-dropdown-trigger'));
    fireEvent.press(screen.getByTestId('onboarding-month-picker-option-08'));
    expect(onMonthKeyChange).toHaveBeenLastCalledWith('2026-08');
  });

  it('updates year and month via anchored dropdown menu without wheel modal on web skin', () => {
    const currentYear = String(new Date().getFullYear());
    const previousYear = String(Number(currentYear) - 1);

    renderSetup({ defaultMonthKey: `${currentYear}-03` }, 'web', 'light');

    fireEvent.press(screen.getByTestId('onboarding-year-dropdown-trigger'));
    expect(screen.queryByTestId('onboarding-year-picker-carousel-area')).toBeNull();
    expect(screen.queryByTestId('onboarding-year-picker-confirm')).toBeNull();
    fireEvent.press(screen.getByTestId(`onboarding-year-picker-option-${previousYear}`));
    expect(screen.getByTestId('onboarding-year-input')).toHaveTextContent(previousYear);

    fireEvent.press(screen.getByTestId('onboarding-month-dropdown-trigger'));
    expect(screen.queryByTestId('onboarding-month-picker-carousel-area')).toBeNull();
    fireEvent.press(screen.getByTestId('onboarding-month-picker-option-10'));
    expect(screen.getByTestId('complete-initial-setup-button')).toHaveTextContent(
      `Guardar e Iniciar Octubre ${previousYear}`
    );
  });
});
