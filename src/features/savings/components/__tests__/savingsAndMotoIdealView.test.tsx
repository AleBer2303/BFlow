/**
 * Tests for SavingsAndMotoIdealView (Provisions & Target Goals separate global Edit / Delete
 * mode buttons acting directly on the existing items list) across all three platform skins.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';
import { BFlowThemeProvider } from '../../../../design-system/theme/ThemeContext';
import { PLATFORM_SKIN_IDS, type PlatformSkinId } from '../../../../design-system/tokens';
import type {
  MonthlySavingsSummary,
  ProvisionPlan,
  ProvisionPlanComparisonSummary,
} from '../../../../domain';
import { SavingsAndMotoIdealView } from '../SavingsAndMotoIdealView';

const ORIGINAL_WINDOW = Dimensions.get('window');
const ORIGINAL_SCREEN = Dimensions.get('screen');

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
  hasMotoBucket: true,
  hasSavingsBucket: true,
  reserve: BASE_RESERVE_BUCKET,
  moto: BASE_RESERVE_BUCKET,
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
      excelMonthlyAmountCop: 50_000,
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
  excelRecurringMonthlyTotalCop: 50_000,
  strictCeilRecurringMonthlyTotal: 50_000,
  strictCeilRecurringMonthlyTotalCop: 50_000,
  totalWithTargetGoals: 150_000,
  totalWithTargetGoalsCop: 150_000,
  actualContribution: 50_000,
  actualMotoContributionCop: 50_000,
  monthlyGapAgainstIdeal: 0,
  monthlyGapAgainstIdealCop: 0,
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
    expect(screen.getByTestId('edit-bucket-balance-input').props.value).toBe('500000');

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
