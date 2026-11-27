/**
 * Tests for SavingsAndMotoIdealView (Provisions & Target Goals separate global Edit / Delete
 * mode buttons acting directly on the existing items list) across all three platform skins.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
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
import type {
  MonthlySavingsSummary,
  ProvisionPlan,
  ProvisionPlanComparisonSummary,
} from '../../../../domain';
import { calculateProvisionPlanSummary } from '../../../../domain';
import { useBudgetStore } from '../../../budget/store/useBudgetStore';
import { SavingsAndMotoIdealView } from '../SavingsAndMotoIdealView';

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

const BASE_RESERVE_BUCKET = {
  bucketId: 'moto',
  name: 'Fondo de Reserva',
  openingBalance: 1_000_000,
  paidContributionsThisMonth: 100_000,
  pendingContributionsThisMonth: 0,
  currentBalance: 1_100_000,
  projectedBalanceIfAllPaid: 1_100_000,
  contributingEntries: [],
};

const BASE_SAVINGS_SUMMARY: MonthlySavingsSummary = {
  monthKey: '2026-10',
  hasReserveBucket: true,
  hasSavingsBucket: true,
  reserve: BASE_RESERVE_BUCKET,
  savings: {
    bucketId: 'savings',
    name: 'Fondo Ahorros',
    openingBalance: 2_000_000,
    netCashFlowContribution: 300_000,
    currentBalance: 2_300_000,
    projectedAfterPendingExpenses: 2_100_000,
    projectedFullMonthBalance: 2_300_000,
  },
  customBuckets: [
    {
      bucketId: 'bucket_viaje',
      id: 'bucket_viaje',
      name: 'Fondo Viaje',
      openingBalance: 500_000,
      paidContributionsThisMonth: 100_000,
      pendingContributionsThisMonth: 0,
      currentBalance: 600_000,
      projectedBalanceIfAllPaid: 600_000,
      contributingEntries: [],
    },
  ],
  totalCurrentSavings: 4_000_000,
  totalProjectedAfterPendingExpenses: 3_800_000,
};

const BASE_PROVISION_PLAN: ProvisionPlan = {
  recurringMonthlyTotalCop: 50_000,
  totalWithTargetGoalCop: 150_000,
  items: [
    {
      id: 'prov-1',
      displayName: 'Seguro Moto',
      monthlyAmountCop: 50_000,
      cycleCostCop: 600_000,
      periodMonths: 12,
      kind: 'recurring_provision',
      notes: 'Anual',
    },
    {
      id: 'goal-1',
      displayName: 'Casco Nuevo',
      monthlyAmountCop: 100_000,
      cycleCostCop: 400_000,
      periodMonths: 4,
      kind: 'target_goal',
      targetMonthKey: '2027-02',
    },
  ],
};

const BASE_PROVISION_SUMMARY: ProvisionPlanComparisonSummary = {
  monthKey: '2026-10',
  recurringItems: [
    {
      id: 'prov-1',
      displayName: 'Seguro Moto',
      monthlyAmount: 50_000,
      monthlyAmountCop: 50_000,
      strictCeilMonthly: 50_000,
      strictCeilMonthlyCop: 50_000,
      cycleCost: 600_000,
      cycleCostCop: 600_000,
      periodMonths: 12,
      notes: 'Anual',
    },
  ],
  targetGoals: [
    {
      id: 'goal-1',
      displayName: 'Casco Nuevo',
      targetAmountCop: 400_000,
      targetMonthKey: '2027-02',
      monthsUntilTarget: 4,
      suggestedMonthlySavingCop: 100_000,
    },
  ],
  recurringMonthlyTotal: 50_000,
  recurringMonthlyTotalCop: 50_000,
  strictCeilRecurringMonthlyTotal: 50_000,
  strictCeilRecurringMonthlyTotalCop: 50_000,
  totalWithTargetGoals: 150_000,
  totalWithTargetGoalsCop: 150_000,
  actualContribution: 50_000,
  actualContributionCop: 50_000,
  monthlyGapAgainstPlan: 0,
  monthlyGapAgainstPlanCop: 0,
};

function setWindowSize(width: number, height: number): void {
  act(() => {
    const metrics = { width, height, scale: 2, fontScale: 1 };
    Dimensions.set({ window: metrics, screen: metrics });
  });
}

function renderView(
  skin: PlatformSkinId,
  overrides?: Partial<React.ComponentProps<typeof SavingsAndMotoIdealView>>
) {
  const onUpdateOpeningBalance = jest.fn();
  const onCreateSavingsBucket = jest.fn();
  const onDeleteSavingsBucket = jest.fn();
  const onSaveProvisionItem = jest.fn();
  const onDeleteProvisionItem = jest.fn();
  const utils = render(
    <BFlowThemeProvider skin={skin} initialMode="dark">
      <SavingsAndMotoIdealView
        savingsSummary={BASE_SAVINGS_SUMMARY}
        motoIdealSummary={BASE_PROVISION_SUMMARY}
        provisionPlan={BASE_PROVISION_PLAN}
        onUpdateOpeningBalance={onUpdateOpeningBalance}
        onCreateSavingsBucket={onCreateSavingsBucket}
        onDeleteSavingsBucket={onDeleteSavingsBucket}
        onSaveProvisionItem={onSaveProvisionItem}
        onDeleteProvisionItem={onDeleteProvisionItem}
        {...overrides}
      />
    </BFlowThemeProvider>
  );
  return {
    ...utils,
    onUpdateOpeningBalance,
    onCreateSavingsBucket,
    onDeleteSavingsBucket,
    onSaveProvisionItem,
    onDeleteProvisionItem,
  };
}

function collectTestIdOrder(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectTestIdOrder(child, out);
    return out;
  }
  const obj = node as { props?: { testID?: string }; children?: unknown[] };
  if (obj.props?.testID) out.push(obj.props.testID);
  if (obj.children) collectTestIdOrder(obj.children, out);
  return out;
}

beforeEach(() => {
  setWindowSize(390, 844);
});

afterAll(() => {
  act(() => {
    Dimensions.set({ window: ORIGINAL_WINDOW, screen: ORIGINAL_SCREEN });
  });
});

describe.each(PLATFORM_SKIN_IDS)('SavingsAndMotoIdealView on %s skin', (skin) => {
  it('places "+ Nuevo Fondo" below total savings and above funds list with separate Editar Fondo and Eliminar Fondo buttons', () => {
    const { toJSON } = renderView(skin);

    const order = collectTestIdOrder(toJSON());
    const heroIdx = order.indexOf('savings-hero-card');
    const addBtnIdx = order.indexOf('open-add-savings-bucket-button');
    const editBtnIdx = order.indexOf('bucket-action-edit-button');
    const deleteBtnIdx = order.indexOf('bucket-action-delete-button');
    const motoCardIdx = order.indexOf('bucket-moto-card');

    expect(heroIdx).toBeGreaterThan(-1);
    expect(addBtnIdx).toBeGreaterThan(heroIdx);
    expect(editBtnIdx).toBeGreaterThan(addBtnIdx);
    expect(deleteBtnIdx).toBeGreaterThan(editBtnIdx);
    expect(motoCardIdx).toBeGreaterThan(deleteBtnIdx);

    // No per-fund edit or delete buttons are visible by default.
    expect(screen.queryByTestId('edit-savings-bucket-moto')).toBeNull();
    expect(screen.queryByTestId('delete-savings-bucket-moto')).toBeNull();
    expect(screen.queryByTestId('edit-savings-bucket-savings')).toBeNull();
    expect(screen.queryByTestId('delete-savings-bucket-savings')).toBeNull();
    expect(screen.queryByTestId('edit-savings-bucket-bucket_viaje')).toBeNull();
    expect(screen.queryByTestId('delete-savings-bucket-bucket_viaje')).toBeNull();
  });

  it('edits an individual savings fund via global Editar Fondo mode without editing others', () => {
    const { onUpdateOpeningBalance } = renderView(skin);

    fireEvent.press(screen.getByTestId('bucket-action-edit-button'));
    expect(screen.getByText('Cancelar Edición')).toBeTruthy();

    // Only edit buttons appear on each fund card; delete buttons stay hidden.
    expect(screen.getByTestId('edit-savings-bucket-moto')).toBeTruthy();
    expect(screen.getByTestId('edit-savings-bucket-savings')).toBeTruthy();
    expect(screen.getByTestId('edit-savings-bucket-bucket_viaje')).toBeTruthy();
    expect(screen.queryByTestId('delete-savings-bucket-moto')).toBeNull();

    // Select custom bucket to edit individually.
    fireEvent.press(screen.getByTestId('edit-savings-bucket-bucket_viaje'));
    expect(screen.queryByTestId('edit-savings-bucket-moto')).toBeNull();
    expect(screen.getByTestId('edit-savings-bucket-card')).toBeTruthy();
    expect(screen.getByTestId('edit-bucket-name-input').props.value).toBe('Fondo Viaje');
    expect(screen.getByTestId('edit-bucket-name-input').props.autoCapitalize).toBe('sentences');
    expect(screen.getByTestId('edit-bucket-balance-input').props.keyboardType).toBe('number-pad');
    expect(screen.getByTestId('edit-bucket-balance-input').props.value).toBe('500.000');

    // Cancel closes the single-fund form without calling onUpdateOpeningBalance.
    fireEvent.press(screen.getByTestId('cancel-edit-bucket-button'));
    expect(screen.queryByTestId('edit-savings-bucket-card')).toBeNull();
    expect(onUpdateOpeningBalance).not.toHaveBeenCalled();

    // Re-enter edit mode and update only the reserve fund.
    fireEvent.press(screen.getByTestId('bucket-action-edit-button'));
    fireEvent.press(screen.getByTestId('edit-savings-bucket-moto'));
    fireEvent.changeText(screen.getByTestId('edit-bucket-name-input'), 'Fondo Moto Personal');
    fireEvent.changeText(screen.getByTestId('edit-bucket-balance-input'), '1500000');
    fireEvent.press(screen.getByTestId('save-edit-bucket-button'));

    expect(onUpdateOpeningBalance).toHaveBeenCalledTimes(1);
    expect(onUpdateOpeningBalance).toHaveBeenCalledWith('moto', 1_500_000, 'Fondo Moto Personal');
    expect(screen.queryByTestId('edit-savings-bucket-card')).toBeNull();
  });

  it('deletes an individual savings fund via global Eliminar Fondo mode without deleting others', () => {
    const { onDeleteSavingsBucket } = renderView(skin);

    fireEvent.press(screen.getByTestId('bucket-action-delete-button'));
    expect(screen.getByText('Cancelar Eliminación')).toBeTruthy();

    expect(screen.getByTestId('delete-savings-bucket-moto')).toBeTruthy();
    expect(screen.getByTestId('delete-savings-bucket-savings')).toBeTruthy();
    expect(screen.getByTestId('delete-savings-bucket-bucket_viaje')).toBeTruthy();
    expect(screen.queryByTestId('edit-savings-bucket-moto')).toBeNull();

    fireEvent.press(screen.getByTestId('delete-savings-bucket-bucket_viaje'));
    expect(onDeleteSavingsBucket).toHaveBeenCalledTimes(1);
    expect(onDeleteSavingsBucket).toHaveBeenCalledWith('bucket_viaje');

    // Toggling off hides delete actions again.
    fireEvent.press(screen.getByTestId('bucket-action-delete-button'));
    expect(screen.queryByTestId('delete-savings-bucket-moto')).toBeNull();
  });

  it('switches cleanly between "+ Nuevo Fondo", edit mode, and delete mode for savings funds on desktop width', () => {
    setWindowSize(1440, 900);
    const { onCreateSavingsBucket } = renderView(skin);

    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    expect(screen.getByTestId('add-savings-bucket-card')).toBeTruthy();

    // Entering edit mode closes the add form.
    fireEvent.press(screen.getByTestId('bucket-action-edit-button'));
    expect(screen.queryByTestId('add-savings-bucket-card')).toBeNull();
    expect(screen.getByTestId('edit-savings-bucket-moto')).toBeTruthy();

    // Switching directly to delete mode replaces edit pills with delete pills.
    fireEvent.press(screen.getByTestId('bucket-action-delete-button'));
    expect(screen.queryByTestId('edit-savings-bucket-moto')).toBeNull();
    expect(screen.getByTestId('delete-savings-bucket-savings')).toBeTruthy();

    // Opening "+ Nuevo Fondo" clears delete mode and lets the user create a fund.
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    expect(screen.queryByTestId('delete-savings-bucket-savings')).toBeNull();
    expect(screen.getByTestId('add-savings-bucket-card')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('new-bucket-name-input'), 'Emergencias');
    fireEvent.changeText(screen.getByTestId('new-bucket-balance-input'), '300000');
    fireEvent.press(screen.getByTestId('submit-new-bucket-button'));
    expect(onCreateSavingsBucket).toHaveBeenCalledWith('Emergencias', 300_000);
  });

  it('renders separate Editar and Eliminar buttons below add button and hides per-item actions by default', () => {
    renderView(skin);

    expect(screen.getByTestId('moto-ideal-item-prov-1')).toBeTruthy();
    expect(screen.getByTestId('moto-target-goal-goal-1')).toBeTruthy();

    expect(screen.getByTestId('open-add-provision-button')).toBeTruthy();
    expect(screen.getByTestId('provision-action-edit-button')).toBeTruthy();
    expect(screen.getByTestId('provision-action-delete-button')).toBeTruthy();

    // No per-item edit/delete buttons or duplicated list are mounted by default.
    expect(screen.queryByTestId('edit-provision-prov-1')).toBeNull();
    expect(screen.queryByTestId('delete-provision-prov-1')).toBeNull();
    expect(screen.queryByTestId('edit-provision-goal-1')).toBeNull();
    expect(screen.queryByTestId('delete-provision-goal-1')).toBeNull();
  });

  it('activates inline Editar action on existing items without duplicating the list', () => {
    const { onSaveProvisionItem } = renderView(skin);

    fireEvent.press(screen.getByTestId('provision-action-edit-button'));

    // Exactly one row per item (no duplicate list) with only edit actions visible
    expect(screen.getAllByTestId('moto-ideal-item-prov-1')).toHaveLength(1);
    expect(screen.getAllByTestId('moto-target-goal-goal-1')).toHaveLength(1);
    expect(screen.getByTestId('edit-provision-prov-1')).toBeTruthy();
    expect(screen.getByTestId('edit-provision-goal-1')).toBeTruthy();
    expect(screen.queryByTestId('delete-provision-prov-1')).toBeNull();
    expect(screen.queryByTestId('delete-provision-goal-1')).toBeNull();

    // Pressing edit on an item opens the pre-filled form and clears edit mode
    fireEvent.press(screen.getByTestId('edit-provision-prov-1'));
    expect(screen.queryByTestId('edit-provision-prov-1')).toBeNull();
    expect(screen.getByTestId('provision-form-card')).toBeTruthy();
    expect(screen.getByTestId('provision-name-input').props.value).toBe('Seguro Moto');

    fireEvent.changeText(screen.getByTestId('provision-name-input'), 'Seguro Moto 2027');
    fireEvent.press(screen.getByTestId('submit-provision-button'));

    expect(onSaveProvisionItem).toHaveBeenCalledWith({
      id: 'prov-1',
      name: 'Seguro Moto 2027',
      amount: 600_000,
      periodMonths: 12,
      priority: '1. Alta',
      kind: 'recurring',
      notes: 'Anual',
    });
  });

  it('activates inline Eliminar action on existing items without duplicating the list', () => {
    const { onDeleteProvisionItem } = renderView(skin);

    fireEvent.press(screen.getByTestId('provision-action-delete-button'));

    expect(screen.getAllByTestId('moto-ideal-item-prov-1')).toHaveLength(1);
    expect(screen.getAllByTestId('moto-target-goal-goal-1')).toHaveLength(1);
    expect(screen.getByTestId('delete-provision-prov-1')).toBeTruthy();
    expect(screen.getByTestId('delete-provision-goal-1')).toBeTruthy();
    expect(screen.queryByTestId('edit-provision-prov-1')).toBeNull();
    expect(screen.queryByTestId('edit-provision-goal-1')).toBeNull();

    fireEvent.press(screen.getByTestId('delete-provision-goal-1'));
    expect(onDeleteProvisionItem).toHaveBeenCalledWith('goal-1');

    // Toggling off hides delete actions again
    fireEvent.press(screen.getByTestId('provision-action-delete-button'));
    expect(screen.queryByTestId('delete-provision-prov-1')).toBeNull();
  });

  it('switches cleanly between add form, edit mode, and delete mode across phone and desktop widths', () => {
    setWindowSize(1440, 900);
    renderView(skin);

    fireEvent.press(screen.getByTestId('open-add-provision-button'));
    expect(screen.getByTestId('provision-form-card')).toBeTruthy();

    // Turning on edit mode closes add form
    fireEvent.press(screen.getByTestId('provision-action-edit-button'));
    expect(screen.queryByTestId('provision-form-card')).toBeNull();
    expect(screen.getByTestId('edit-provision-prov-1')).toBeTruthy();

    // Switching directly to delete mode replaces edit actions with delete actions
    fireEvent.press(screen.getByTestId('provision-action-delete-button'));
    expect(screen.queryByTestId('edit-provision-prov-1')).toBeNull();
    expect(screen.getByTestId('delete-provision-prov-1')).toBeTruthy();

    // Opening add form clears delete mode
    fireEvent.press(screen.getByTestId('open-add-provision-button'));
    expect(screen.queryByTestId('delete-provision-prov-1')).toBeNull();
    expect(screen.getByTestId('provision-form-card')).toBeTruthy();
  });
});

describe.each(PLATFORM_SKIN_IDS)('SavingsAndMotoIdealView form state on %s skin', (skin) => {
  it('typing in the new fund form does not re-render the funds or the provisions', () => {
    const { onCreateSavingsBucket } = renderView(skin);
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    mockStatusBadgeRender.mockClear();

    fireEvent.changeText(screen.getByTestId('new-bucket-name-input'), 'Fondo Viaje 2');
    fireEvent.changeText(screen.getByTestId('new-bucket-balance-input'), '250.000');
    expect(mockStatusBadgeRender).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('submit-new-bucket-button'));
    expect(onCreateSavingsBucket).toHaveBeenCalledWith('Fondo Viaje 2', 250_000);
    expect(screen.queryByTestId('add-savings-bucket-card')).toBeNull();
  });

  it('typing in the fund editor does not re-render the funds or the provisions', () => {
    const { onUpdateOpeningBalance } = renderView(skin);
    fireEvent.press(screen.getByTestId('bucket-action-edit-button'));
    fireEvent.press(screen.getByTestId('edit-savings-bucket-bucket_viaje'));
    expect(screen.getByTestId('edit-bucket-name-input').props.value).toBe('Fondo Viaje');
    expect(screen.getByTestId('edit-bucket-balance-input').props.value).toBe('500.000');
    mockStatusBadgeRender.mockClear();

    fireEvent.changeText(screen.getByTestId('edit-bucket-name-input'), 'Fondo Vacaciones');
    fireEvent.changeText(screen.getByTestId('edit-bucket-balance-input'), '750.000');
    expect(mockStatusBadgeRender).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('save-edit-bucket-button'));
    expect(onUpdateOpeningBalance).toHaveBeenCalledWith('bucket_viaje', 750_000, 'Fondo Vacaciones');
    expect(screen.queryByTestId('edit-savings-bucket-card')).toBeNull();
  });

  it('typing in the provision form does not re-render the funds or the provisions', () => {
    const { onSaveProvisionItem } = renderView(skin);
    fireEvent.press(screen.getByTestId('open-add-provision-button'));
    mockStatusBadgeRender.mockClear();

    fireEvent.changeText(screen.getByTestId('provision-name-input'), 'SOAT');
    fireEvent.changeText(screen.getByTestId('provision-amount-input'), '690.000');
    fireEvent.changeText(screen.getByTestId('provision-months-input'), '12');
    fireEvent.changeText(screen.getByTestId('provision-notes-input'), 'Vence en marzo');
    fireEvent.press(screen.getByTestId('provision-kind-target_goal'));
    expect(mockStatusBadgeRender).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('submit-provision-button'));
    expect(onSaveProvisionItem).toHaveBeenCalledWith({
      name: 'SOAT',
      amount: 690_000,
      periodMonths: 12,
      priority: '1. Alta',
      kind: 'target_goal',
      notes: 'Vence en marzo',
    });
    expect(screen.queryByTestId('provision-form-card')).toBeNull();
  });

  it('a validation error stays inside its form, and each form reopens with fresh values', () => {
    const { onCreateSavingsBucket } = renderView(skin);
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    mockStatusBadgeRender.mockClear();
    fireEvent.press(screen.getByTestId('submit-new-bucket-button'));
    expect(screen.getByText('Escribe el nombre del nuevo fondo de ahorro.')).toBeTruthy();
    expect(onCreateSavingsBucket).not.toHaveBeenCalled();
    expect(mockStatusBadgeRender).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('new-bucket-name-input'), 'Borrador');
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    expect(screen.getByTestId('new-bucket-name-input').props.value).toBe('');
    expect(screen.queryByText('Escribe el nombre del nuevo fondo de ahorro.')).toBeNull();

    fireEvent.press(screen.getByTestId('provision-action-edit-button'));
    fireEvent.press(screen.getByTestId('edit-provision-prov-1'));
    expect(screen.getByTestId('provision-name-input').props.value).toBe('Seguro Moto');
    expect(screen.getByTestId('provision-amount-input').props.value).toBe('600.000');
    expect(screen.getByTestId('provision-months-input').props.value).toBe('12');
  });

  it('renames the goals trigger to "+ Agregar Metas", uses HeroAmountField without card re-renders, and previews monthly quota', () => {
    renderView(skin);

    expect(screen.getByTestId('open-add-provision-button')).toHaveTextContent('+ Agregar Metas');
    expect(screen.queryByText('Aporte mes')).toBeNull();
    expect(screen.queryByText('Con metas')).toBeNull();
    expect(screen.queryByText('Brecha')).toBeNull();
    mockStatusBadgeRender.mockClear();

    // Opening and closing "+ Nuevo Fondo" does not re-render hero or goal badges
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    expect(mockStatusBadgeRender).not.toHaveBeenCalled();

    const newBucketHeroStyle = StyleSheet.flatten(
      screen.getByTestId('new-bucket-hero-amount').props.style
    );
    const newBucketInput = screen.getByTestId('new-bucket-balance-input');
    expect(newBucketHeroStyle.backgroundColor).toBe(palettesBySkin[skin].dark.semantic.savingsSoft);
    expect(StyleSheet.flatten(newBucketInput.props.style).color).toBe(
      palettesBySkin[skin].dark.semantic.savings
    );

    fireEvent.changeText(newBucketInput, '450000');
    expect(screen.getByTestId('new-bucket-balance-input').props.value).toBe('450.000');
    expect(screen.queryByText('$ 450.000')).toBeNull();
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    expect(mockStatusBadgeRender).not.toHaveBeenCalled();

    // Opening and closing "+ Agregar Metas" does not re-render hero or goal badges
    fireEvent.press(screen.getByTestId('open-add-provision-button'));
    expect(screen.getByTestId('open-add-provision-button')).toHaveTextContent('Cerrar');
    expect(screen.getByTestId('submit-provision-button')).toHaveTextContent('Guardar');
    expect(mockStatusBadgeRender).not.toHaveBeenCalled();

    const provisionHeroStyle = StyleSheet.flatten(
      screen.getByTestId('provision-hero-amount').props.style
    );
    const provisionAmountInput = screen.getByTestId('provision-amount-input');
    expect(provisionHeroStyle.backgroundColor).toBe(
      palettesBySkin[skin].dark.semantic.provisionsSoft
    );
    expect(StyleSheet.flatten(provisionAmountInput.props.style).color).toBe(
      palettesBySkin[skin].dark.semantic.provisions
    );

    // Math.ceil(100000 / 3) = 33.334
    fireEvent.changeText(provisionAmountInput, '100000');
    fireEvent.changeText(screen.getByTestId('provision-months-input'), '3');
    expect(screen.getByTestId('provision-monthly-preview')).toHaveTextContent(
      'Cuota mensual sugerida: $ 33.334/mes'
    );
    expect(screen.queryByText('$ 100.000')).toBeNull();
    expect(mockStatusBadgeRender).not.toHaveBeenCalled();
  });

  it('masks monthly quota preview when privacy mode hides amounts', () => {
    render(
      <BFlowThemeProvider skin={skin} initialMode="dark">
        <AmountPrivacyProvider initialHidden>
          <SavingsAndMotoIdealView
            savingsSummary={BASE_SAVINGS_SUMMARY}
            motoIdealSummary={BASE_PROVISION_SUMMARY}
            provisionPlan={BASE_PROVISION_PLAN}
            onSaveProvisionItem={jest.fn()}
          />
        </AmountPrivacyProvider>
      </BFlowThemeProvider>
    );

    fireEvent.press(screen.getByTestId('open-add-provision-button'));
    fireEvent.changeText(screen.getByTestId('provision-amount-input'), '600000');
    fireEvent.changeText(screen.getByTestId('provision-months-input'), '12');

    expect(screen.getByTestId('provision-monthly-preview')).toHaveTextContent(
      `Cuota mensual sugerida: ${HIDDEN_AMOUNT_TEXT}/mes`
    );
  });

  it('keeps only one form active across funds and provisions and resets on monthKey change or tab leave', () => {
    const { rerender } = render(
      <BFlowThemeProvider skin={skin} initialMode="dark">
        <TabVisibilityProvider isActive>
          <SavingsAndMotoIdealView
            savingsSummary={BASE_SAVINGS_SUMMARY}
            motoIdealSummary={BASE_PROVISION_SUMMARY}
            provisionPlan={BASE_PROVISION_PLAN}
            onSaveProvisionItem={jest.fn()}
            onDeleteProvisionItem={jest.fn()}
          />
        </TabVisibilityProvider>
      </BFlowThemeProvider>
    );

    // Open "+ Nuevo Fondo", then open "+ Agregar Metas" -> fund form closes automatically
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    expect(screen.getByTestId('add-savings-bucket-card')).toBeTruthy();

    fireEvent.press(screen.getByTestId('open-add-provision-button'));
    expect(screen.queryByTestId('add-savings-bucket-card')).toBeNull();
    expect(screen.getByTestId('provision-form-card')).toBeTruthy();

    // Leaving the tab resets open form and action modes
    rerender(
      <BFlowThemeProvider skin={skin} initialMode="dark">
        <TabVisibilityProvider isActive={false}>
          <SavingsAndMotoIdealView
            savingsSummary={BASE_SAVINGS_SUMMARY}
            motoIdealSummary={BASE_PROVISION_SUMMARY}
            provisionPlan={BASE_PROVISION_PLAN}
            onSaveProvisionItem={jest.fn()}
            onDeleteProvisionItem={jest.fn()}
          />
        </TabVisibilityProvider>
      </BFlowThemeProvider>
    );
    expect(screen.queryByTestId('provision-form-card')).toBeNull();

    // Switching monthKey resets open provision form as well
    rerender(
      <BFlowThemeProvider skin={skin} initialMode="dark">
        <TabVisibilityProvider isActive>
          <SavingsAndMotoIdealView
            savingsSummary={BASE_SAVINGS_SUMMARY}
            motoIdealSummary={BASE_PROVISION_SUMMARY}
            provisionPlan={BASE_PROVISION_PLAN}
            onSaveProvisionItem={jest.fn()}
            onDeleteProvisionItem={jest.fn()}
          />
        </TabVisibilityProvider>
      </BFlowThemeProvider>
    );
    fireEvent.press(screen.getByTestId('open-add-provision-button'));
    expect(screen.getByTestId('provision-form-card')).toBeTruthy();

    rerender(
      <BFlowThemeProvider skin={skin} initialMode="dark">
        <TabVisibilityProvider isActive>
          <SavingsAndMotoIdealView
            savingsSummary={{ ...BASE_SAVINGS_SUMMARY, monthKey: '2026-11' }}
            motoIdealSummary={BASE_PROVISION_SUMMARY}
            provisionPlan={BASE_PROVISION_PLAN}
            onSaveProvisionItem={jest.fn()}
            onDeleteProvisionItem={jest.fn()}
          />
        </TabVisibilityProvider>
      </BFlowThemeProvider>
    );
    expect(screen.queryByTestId('provision-form-card')).toBeNull();
  });

  it('persists targetMonthKey and calculates monthly saving when adding a goal in the store', async () => {
    useBudgetStore.getState().resetToOctober2026GoldenState();

    await act(async () => {
      await useBudgetStore.getState().saveProvisionItem({
        name: 'Laptop Trabajo',
        amount: 1_200_000,
        periodMonths: 6,
        priority: '1. Alta',
        kind: 'target_goal',
      });
    });

    const state = useBudgetStore.getState();
    const summary = calculateProvisionPlanSummary(
      state.idealMotoPlan,
      state.entries,
      0,
      state.activeMonthKey
    );
    const createdGoal = summary.targetGoals.find((g) => g.displayName === 'Laptop Trabajo');
    expect(createdGoal).toMatchObject({
      targetAmountCop: 1_200_000,
      targetMonthKey: '2027-04',
      monthsUntilTarget: 6,
      suggestedMonthlySavingCop: 200_000,
    });
  });
});
