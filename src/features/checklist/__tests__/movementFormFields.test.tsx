/**
 * CC-03 (plan consolidado, Fase 3): piezas compartidas por los formularios de añadir y editar
 * un movimiento del checklist.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React, { useState } from 'react';
import { hapticService } from '../../../design-system';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import type { Debt, SavingsBucket } from '../../../domain';
import {
  MovementAmountField,
  MovementFrequencyField,
  MovementOptionalFields,
} from '../components/MovementFormFields';

const DEBTS = [
  { id: 'debt_moto', groupKey: 'MOTO', name: 'Crédito Moto', lender: 'Banco', openingBalance: 1, monthKey: '2026-10' },
] as Debt[];
const BUCKETS = [{ id: 'savings', name: 'Fondo Ahorros', openingBalance: 0 }] as SavingsBucket[];

function OptionalFieldsHarness({ movementType = 'expense' as const }) {
  const [note, setNote] = useState('');
  const [debtId, setDebtId] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState<string | null>(null);
  return (
    <MovementOptionalFields
      testIDPrefix="add-movement"
      noteTestID="movement-note-input"
      movementType={movementType}
      note={note}
      onChangeNote={setNote}
      notePlaceholder="Nota"
      financialAccounts={[]}
      accountId={null}
      accountRole="purchase"
      onChangeAccount={jest.fn()}
      onChangeRole={jest.fn()}
      debts={DEBTS}
      targetDebtId={debtId}
      onChangeTargetDebt={setDebtId}
      savingsBuckets={BUCKETS}
      savingsBucketId={bucketId}
      onChangeSavingsBucket={setBucketId}
    />
  );
}

describe.each(['ios', 'android', 'web'] as const)('MovementFormFields (piel %s)', (skin) => {
  afterEach(() => jest.restoreAllMocks());

  it('el monto usa el tono y la etiqueta del tipo de movimiento', () => {
    const { rerender } = render(
      <BFlowThemeProvider skin={skin}>
        <MovementAmountField
          movementType="income"
          value=""
          onChangeText={jest.fn()}
          containerTestID="hero"
          inputTestID="amount"
        />
      </BFlowThemeProvider>
    );
    expect(screen.getByText('Monto a recibir')).toBeTruthy();
    rerender(
      <BFlowThemeProvider skin={skin}>
        <MovementAmountField
          movementType="expense"
          value=""
          onChangeText={jest.fn()}
          containerTestID="hero"
          inputTestID="amount"
        />
      </BFlowThemeProvider>
    );
    expect(screen.getByText('Monto a pagar')).toBeTruthy();
  });

  it('la frecuencia marca la opción elegida y vibra al cambiarla', () => {
    const selection = jest.spyOn(hapticService, 'selection').mockImplementation(() => undefined);
    const onChange = jest.fn();
    render(
      <BFlowThemeProvider skin={skin}>
        <MovementFrequencyField persistMonthly onChange={onChange} testIDPrefix="edit-entry" />
      </BFlowThemeProvider>
    );
    expect(screen.getByTestId('edit-entry-persist-monthly')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true })
    );
    fireEvent.press(screen.getByTestId('edit-entry-persist-once'));
    expect(onChange).toHaveBeenCalledWith(false);
    expect(selection).toHaveBeenCalled();
  });

  it('«Más opciones» se abre y resume nota, deuda y fondo', () => {
    render(
      <BFlowThemeProvider skin={skin}>
        <OptionalFieldsHarness />
      </BFlowThemeProvider>
    );
    expect(screen.queryByTestId('add-movement-more-options-panel')).toBeNull();
    expect(screen.getByText('Nota, vincular a deuda o fondo de ahorro')).toBeTruthy();

    fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
    expect(screen.getByTestId('add-movement-more-options-panel')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('movement-note-input'), 'Factura 45');
    expect(screen.getByText('Nota')).toBeTruthy();
    expect(screen.getByTestId('add-movement-debt-select')).toBeTruthy();
    expect(screen.getByTestId('add-movement-bucket-select')).toBeTruthy();
  });

  it('en un ingreso no ofrece deuda ni fondo', () => {
    render(
      <BFlowThemeProvider skin={skin}>
        <OptionalFieldsHarness movementType={'income' as never} />
      </BFlowThemeProvider>
    );
    fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
    expect(screen.queryByTestId('add-movement-debt-select')).toBeNull();
    expect(screen.queryByTestId('add-movement-bucket-select')).toBeNull();
  });
});
