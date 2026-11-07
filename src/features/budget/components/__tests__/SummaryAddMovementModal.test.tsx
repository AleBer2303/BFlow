/**
 * src/features/budget/components/__tests__/SummaryAddMovementModal.test.tsx
 *
 * Verifies that SummaryAddMovementModal operates in isolation, correctly handling
 * concept selection, amount validation, custom items, and submission (Point 26).
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { BFlowThemeProvider } from '../../../../design-system/theme/ThemeContext';
import type { Concept, MonthEntry } from '../../../../domain';
import { SummaryAddMovementModal } from '../SummaryAddMovementModal';

describe('SummaryAddMovementModal (Point 26 Isolation)', () => {
  const mockConcepts: Concept[] = [
    {
      id: 'exp_alimentacion',
      name: 'Alimentación',
      type: 'expense',
      group: 'variable',
      defaultAmount: 300_000,
      order: 1,
      archived: false,
      allowMultiplePerMonth: false,
      recurrence: { kind: 'monthly' },
    },
    {
      id: 'inc_salario',
      name: 'Salario',
      type: 'income',
      group: 'fixed',
      defaultAmount: 2_000_000,
      order: 2,
      archived: false,
      allowMultiplePerMonth: false,
      recurrence: { kind: 'monthly' },
    },
  ];

  const mockEntries: MonthEntry[] = [];

  it('renders nothing when isOpen is false', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <SummaryAddMovementModal
          isOpen={false}
          onClose={jest.fn()}
          concepts={mockConcepts}
          entries={mockEntries}
          activeMonthKey="2026-10"
          onSubmitMovement={jest.fn()}
          onSubmitCustomMovement={jest.fn()}
        />
      </BFlowThemeProvider>
    );

    expect(screen.queryByTestId('summary-add-movement-modal-card')).toBeNull();
  });

  it('renders correctly and submits an existing concept movement', async () => {
    const onSubmitMovement = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <SummaryAddMovementModal
          isOpen={true}
          onClose={onClose}
          concepts={mockConcepts}
          entries={mockEntries}
          activeMonthKey="2026-10"
          initialType="expense"
          onSubmitMovement={onSubmitMovement}
          onSubmitCustomMovement={jest.fn()}
        />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('summary-add-movement-modal-card')).toBeTruthy();
    expect(screen.getByTestId('summary-concept-chip-exp_alimentacion')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('summary-submit-movement-button'));
    });

    expect(onSubmitMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        monthKey: '2026-10',
        conceptId: 'exp_alimentacion',
        actualAmount: 300_000,
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('submits a custom concept and movement when custom mode is selected', async () => {
    const onSubmitCustomMovement = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <SummaryAddMovementModal
          isOpen={true}
          onClose={onClose}
          concepts={mockConcepts}
          entries={mockEntries}
          activeMonthKey="2026-10"
          initialType="expense"
          onSubmitMovement={jest.fn()}
          onSubmitCustomMovement={onSubmitCustomMovement}
        />
      </BFlowThemeProvider>
    );

    fireEvent.press(screen.getByText('+ Crear nuevo ítem'));
    fireEvent.changeText(screen.getByPlaceholderText('Nombre del nuevo ítem'), 'Café Especial');
    fireEvent.changeText(screen.getByPlaceholderText('Monto en COP enteros'), '15000');

    await act(async () => {
      fireEvent.press(screen.getByTestId('summary-submit-movement-button'));
    });

    expect(onSubmitCustomMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        monthKey: '2026-10',
        name: 'Café Especial',
        amountCop: 15_000,
        type: 'expense',
      })
    );
    expect(onClose).toHaveBeenCalled();
  });
});
