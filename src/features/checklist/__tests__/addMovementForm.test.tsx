import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  AmountPrivacyProvider,
  BFlowThemeProvider,
  HIDDEN_AMOUNT_TEXT,
  PLATFORM_SKIN_IDS,
  palettesBySkin,
  type PlatformSkinId,
  type ThemeMode,
} from '../../../design-system';
import type { Concept, Debt, MonthEntry, SavingsBucket } from '../../../domain';
import { ChecklistAddMovementForm } from '../components/ChecklistAddMovementForm';
import { ChecklistEditEntryForm } from '../components/ChecklistEditEntryForm';

const SAMPLE_CONCEPTS: readonly Concept[] = [
  {
    id: 'exp_seguro_tr_sura',
    name: 'Seguro TR SURA',
    type: 'expense',
    group: 'fixed',
    defaultAmount: 130_000,
    recurrence: { kind: 'monthly' },
    allowMultiplePerMonth: false,
    archived: false,
    order: 1,
  },
  {
    id: 'exp_cuota_moto',
    name: 'Cuota Moto CB300F',
    type: 'expense',
    group: 'fixed',
    defaultAmount: 550_000,
    recurrence: { kind: 'monthly' },
    allowMultiplePerMonth: false,
    archived: false,
    order: 2,
    defaultTargetDebtId: 'debt_cb300f_moto',
  },
  {
    id: 'inc_freelance',
    name: 'Diseño Freelance',
    type: 'income',
    group: 'variable',
    defaultAmount: 800_000,
    recurrence: { kind: 'monthly' },
    allowMultiplePerMonth: false,
    archived: false,
    order: 3,
  },
];

const SAMPLE_ENTRIES: readonly MonthEntry[] = [
  {
    id: '2026-10_exp_seguro_tr_sura',
    monthKey: '2026-10',
    conceptId: 'exp_seguro_tr_sura',
    conceptName: 'Seguro TR SURA',
    type: 'expense',
    group: 'fixed',
    plannedAmount: 130_000,
    actualAmount: 0,
    status: 'pending',
  },
  {
    id: '2026-10_exp_cuota_moto',
    monthKey: '2026-10',
    conceptId: 'exp_cuota_moto',
    conceptName: 'Cuota Moto CB300F',
    type: 'expense',
    group: 'fixed',
    plannedAmount: 550_000,
    actualAmount: 0,
    status: 'pending',
  },
  {
    id: '2026-10_inc_freelance',
    monthKey: '2026-10',
    conceptId: 'inc_freelance',
    conceptName: 'Diseño Freelance',
    type: 'income',
    group: 'variable',
    plannedAmount: 800_000,
    actualAmount: 0,
    status: 'pending',
  },
];

const SAMPLE_DEBTS: readonly Debt[] = [
  {
    id: 'debt_cb300f_moto',
    name: 'Moto CB300F',
    lender: 'Banco',
    groupKey: 'MOTO',
    openingBalance: 2_600_000,
    monthKey: '2026-10',
    monthlyInterestRate: 0,
  },
];

const SAMPLE_BUCKETS: readonly SavingsBucket[] = [
  {
    id: 'bucket_emergency',
    name: 'Fondo Emergencia',
    openingBalance: 1_000_000,
    monthKey: '2026-10',
  },
];

function renderAddForm(options?: {
  skin?: PlatformSkinId;
  mode?: ThemeMode;
  amountsHidden?: boolean;
  onAddOrCompleteMovement?: jest.Mock;
  onCreateCustomMovement?: jest.Mock;
  onSubmitted?: jest.Mock;
}) {
  const skin = options?.skin ?? 'ios';
  const mode = options?.mode ?? 'dark';
  const onAddOrCompleteMovement = options?.onAddOrCompleteMovement ?? jest.fn();
  const onCreateCustomMovement = options?.onCreateCustomMovement ?? jest.fn();
  const onSubmitted = options?.onSubmitted ?? jest.fn();

  render(
    <BFlowThemeProvider initialMode={mode} skin={skin}>
      <AmountPrivacyProvider initialHidden={options?.amountsHidden ?? false}>
        <ChecklistAddMovementForm
          monthKey="2026-10"
          monthEntries={SAMPLE_ENTRIES}
          concepts={SAMPLE_CONCEPTS}
          debts={SAMPLE_DEBTS}
          savingsBuckets={SAMPLE_BUCKETS}
          onAddOrCompleteMovement={onAddOrCompleteMovement}
          onCreateCustomMovement={onCreateCustomMovement}
          onSubmitted={onSubmitted}
        />
      </AmountPrivacyProvider>
    </BFlowThemeProvider>
  );

  return { onAddOrCompleteMovement, onCreateCustomMovement, onSubmitted };
}

describe('ChecklistAddMovementForm & HeroAmountField', () => {
  const initialWindow = Dimensions.get('window');

  afterEach(() => {
    Dimensions.set({ window: initialWindow });
  });

  it.each(PLATFORM_SKIN_IDS)(
    'renders a single semantic hero amount input without duplicate formatted preview (%s skin)',
    (skin) => {
      renderAddForm({ skin, mode: 'dark' });

      const heroCard = screen.getByTestId('add-movement-hero-amount');
      const heroStyle = StyleSheet.flatten(heroCard.props.style);
      const amountInput = screen.getByTestId('movement-amount-input');
      const inputStyle = StyleSheet.flatten(amountInput.props.style);

      // Default is expense: red soft background + red text, single editable value.
      expect(screen.getByText('Monto a pagar')).toBeTruthy();
      expect(heroStyle.backgroundColor).toBe(palettesBySkin[skin].dark.semantic.expenseSoft);
      expect(inputStyle.color).toBe(palettesBySkin[skin].dark.semantic.expense);

      fireEvent.changeText(amountInput, '130000');
      expect(screen.getByTestId('movement-amount-input').props.value).toBe('130.000');
      // Never renders a second formatted "$ 130.000" text node alongside the input.
      expect(screen.queryByText('$ 130.000')).toBeNull();

      // Switching to Ingreso switches the hero card to green while preserving the typed amount.
      fireEvent.press(screen.getByTestId('modal-type-income'));
      expect(screen.getByText('Monto a recibir')).toBeTruthy();
      expect(StyleSheet.flatten(screen.getByTestId('add-movement-hero-amount').props.style).backgroundColor).toBe(
        palettesBySkin[skin].dark.semantic.incomeSoft
      );
      expect(StyleSheet.flatten(screen.getByTestId('movement-amount-input').props.style).color).toBe(
        palettesBySkin[skin].dark.semantic.income
      );
      expect(screen.getByTestId('movement-amount-input').props.value).toBe('130.000');
      expect(screen.queryByText('$ 130.000')).toBeNull();
    }
  );

  it.each([
    { width: 320, mode: 'light' as const },
    { width: 1440, mode: 'dark' as const },
  ])('renders cleanly on width %i (%s mode)', ({ width, mode }) => {
    Dimensions.set({ window: { width, height: 800, scale: 1, fontScale: 1 } });
    renderAddForm({ skin: 'web', mode });

    expect(screen.getByTestId('add-movement-modal-card')).toBeTruthy();
    expect(screen.getByTestId('movement-amount-input')).toBeTruthy();
    expect(screen.getByTestId('submit-movement-button')).toBeTruthy();
  });

  it('shows pending autocomplete only while typing and preserves preconfigured debt linkage on completion', () => {
    const { onAddOrCompleteMovement, onSubmitted } = renderAddForm();

    // Empty name must not render catalog/pending suggestion chips.
    expect(screen.queryByTestId('add-movement-suggestion-2026-10_exp_cuota_moto')).toBeNull();
    expect(screen.queryByTestId('add-movement-pending-match-hint')).toBeNull();

    // Typing >= 2 matching characters offers inline suggestion for pending entry.
    fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Cuota');
    const suggestion = screen.getByTestId('add-movement-suggestion-2026-10_exp_cuota_moto');
    expect(suggestion).toBeTruthy();

    fireEvent.press(suggestion);
    expect(screen.getByTestId('custom-concept-name-input').props.value).toBe('Cuota Moto CB300F');
    expect(screen.getByTestId('movement-amount-input').props.value).toBe('550.000');
    expect(screen.getByTestId('add-movement-pending-match-hint')).toBeTruthy();

    fireEvent.press(screen.getByTestId('submit-movement-button'));
    expect(onAddOrCompleteMovement).toHaveBeenCalledTimes(1);
    const payload = onAddOrCompleteMovement.mock.calls[0][0];
    expect(payload).toMatchObject({
      monthKey: '2026-10',
      conceptId: 'exp_cuota_moto',
      actualAmount: 550_000,
    });
    // Preserves existing concept debt linkage instead of overwriting with null.
    expect(payload.targetDebtId).toBeUndefined();
    expect(payload.savingsBucketId).toBeUndefined();
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it.each(PLATFORM_SKIN_IDS)(
    'keeps optional note, debt, and savings fields collapsed until toggled and selects via AdaptiveSelectField (%s skin)',
    (skin) => {
      const { onCreateCustomMovement, onSubmitted } = renderAddForm({ skin });

      expect(screen.queryByTestId('add-movement-more-options-panel')).toBeNull();
      expect(screen.queryByTestId('movement-note-input')).toBeNull();
      expect(screen.queryByTestId('add-movement-debt-select')).toBeNull();

      fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
      expect(screen.getByTestId('add-movement-more-options-panel')).toBeTruthy();
      expect(screen.getByTestId('movement-note-input')).toBeTruthy();
      expect(screen.getByTestId('add-movement-debt-value')).toHaveTextContent('Sin deuda vinculada');
      expect(screen.getByTestId('add-movement-bucket-value')).toHaveTextContent(
        'Sin fondo vinculado'
      );

      fireEvent.changeText(screen.getByTestId('movement-note-input'), 'Factura 102');

      // Select debt via AdaptiveSelectField (wheel modal on mobile, dropdown on web)
      fireEvent.press(screen.getByTestId('add-movement-debt-select'));
      fireEvent.press(screen.getByTestId('add-movement-debt-picker-option-debt_cb300f_moto'));
      if (skin !== 'web') {
        fireEvent.press(screen.getByTestId('add-movement-debt-picker-confirm'));
      }
      expect(screen.getByTestId('add-movement-debt-value')).toHaveTextContent('Moto CB300F');

      // Select savings bucket via AdaptiveSelectField
      fireEvent.press(screen.getByTestId('add-movement-bucket-select'));
      fireEvent.press(
        screen.getByTestId('add-movement-bucket-picker-option-bucket_emergency')
      );
      if (skin !== 'web') {
        fireEvent.press(screen.getByTestId('add-movement-bucket-picker-confirm'));
      }
      expect(screen.getByTestId('add-movement-bucket-value')).toHaveTextContent('Fondo Emergencia');

      // Collapsing again keeps a concise summary on the toggle row.
      fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
      expect(screen.queryByTestId('add-movement-more-options-panel')).toBeNull();
      expect(screen.getByText('Nota · Moto CB300F · Fondo Emergencia')).toBeTruthy();

      fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Abono Extra');
      fireEvent.changeText(screen.getByTestId('movement-amount-input'), '200000');
      fireEvent.press(screen.getByTestId('custom-group-variable'));
      fireEvent.press(screen.getByTestId('add-movement-persist-once'));
      fireEvent.press(screen.getByTestId('submit-movement-button'));

      expect(onCreateCustomMovement).toHaveBeenCalledWith({
        monthKey: '2026-10',
        name: 'Abono Extra',
        type: 'expense',
        group: 'variable',
        amount: 200_000,
        amountCop: 200_000,
        targetDebtId: 'debt_cb300f_moto',
        savingsBucketId: 'bucket_emergency',
        persistMonthly: false,
        note: 'Factura 102',
      });
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    }
  );

  it('masks suggestion amounts when privacy mode hides amounts', () => {
    renderAddForm({ amountsHidden: true });

    fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Seguro');
    expect(screen.getByTestId('add-movement-suggestion-2026-10_exp_seguro_tr_sura')).toHaveTextContent(
      `Seguro TR SURA · ${HIDDEN_AMOUNT_TEXT}`
    );
  });

  it('validates empty name and invalid amount and clears error when editing', () => {
    const { onAddOrCompleteMovement, onCreateCustomMovement, onSubmitted } = renderAddForm();

    fireEvent.press(screen.getByTestId('submit-movement-button'));
    expect(screen.getByText('Ingresa el nombre del movimiento.')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Almuerzo');
    expect(screen.queryByText('Ingresa el nombre del movimiento.')).toBeNull();

    fireEvent.press(screen.getByTestId('submit-movement-button'));
    expect(screen.getByText('Ingresa un monto entero válido mayor a $ 0.')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('movement-amount-input'), '25000');
    expect(screen.queryByText('Ingresa un monto entero válido mayor a $ 0.')).toBeNull();

    expect(onAddOrCompleteMovement).not.toHaveBeenCalled();
    expect(onCreateCustomMovement).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it.each(PLATFORM_SKIN_IDS)(
    'modernizes ChecklistEditEntryForm with single HeroAmountField, collapsible options, and AdaptiveSelectField (%s skin)',
    (skin) => {
      const entry = SAMPLE_ENTRIES[0] ?? null;
      const onEditEntry = jest.fn();
      const onClose = jest.fn();
      render(
        <BFlowThemeProvider initialMode="light" skin={skin}>
          <ChecklistEditEntryForm
            entry={entry}
            concept={SAMPLE_CONCEPTS[0]}
            debts={SAMPLE_DEBTS}
            savingsBuckets={SAMPLE_BUCKETS}
            onEditEntry={onEditEntry}
            onClose={onClose}
          />
        </BFlowThemeProvider>
      );

      const amountInput = screen.getByTestId('edit-entry-amount-input');
      expect(amountInput.props.value).toBe('130.000');
      expect(screen.queryByText('$ 130.000')).toBeNull();
      expect(StyleSheet.flatten(amountInput.props.style).color).toBe(
        palettesBySkin[skin].light.semantic.expense
      );

      expect(screen.queryByTestId('edit-entry-more-options-panel')).toBeNull();
      fireEvent.press(screen.getByTestId('edit-entry-more-options-toggle'));
      expect(screen.getByTestId('edit-entry-more-options-panel')).toBeTruthy();

      fireEvent.changeText(screen.getByTestId('edit-entry-note-input'), 'Renovación anual');
      fireEvent.press(screen.getByTestId('edit-entry-debt-select'));
      fireEvent.press(screen.getByTestId('edit-entry-debt-picker-option-debt_cb300f_moto'));
      if (skin !== 'web') {
        fireEvent.press(screen.getByTestId('edit-entry-debt-picker-confirm'));
      }
      fireEvent.press(screen.getByTestId('edit-entry-bucket-select'));
      fireEvent.press(
        screen.getByTestId('edit-entry-bucket-picker-option-bucket_emergency')
      );
      if (skin !== 'web') {
        fireEvent.press(screen.getByTestId('edit-entry-bucket-picker-confirm'));
      }

      fireEvent.press(screen.getByTestId('edit-entry-more-options-toggle'));
      expect(screen.getByText('Nota · Moto CB300F · Fondo Emergencia')).toBeTruthy();

      fireEvent.press(screen.getByTestId('edit-entry-persist-once'));
      fireEvent.press(screen.getByTestId('save-edit-entry-button'));

      expect(onEditEntry).toHaveBeenCalledWith('2026-10_exp_seguro_tr_sura', {
        conceptName: 'Seguro TR SURA',
        actualAmount: 130_000,
        plannedAmount: 130_000,
        targetDebtId: 'debt_cb300f_moto',
        savingsBucketId: 'bucket_emergency',
        persistMonthly: false,
        note: 'Renovación anual',
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  );
});
