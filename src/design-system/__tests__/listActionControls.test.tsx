/**
 * CC-03 (plan consolidado, Fase 3): Editar / Eliminar compartidos por Checklist, Deudas y Ahorros.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { ActionModeToggleRow, InlineItemActionPill } from '../components/ListActionControls';
import { BFlowThemeProvider } from '../theme/ThemeContext';

const SKINS = [
  ['ios', 44],
  ['android', 48],
  ['web', 44],
] as const;

function minHeightOf(testID: string): number | undefined {
  const style = StyleSheet.flatten(screen.getByTestId(testID).props.style) as { minHeight?: number };
  return style?.minHeight;
}

describe('ActionModeToggleRow', () => {
  it.each(SKINS)('usa el objetivo táctil de la piel %s (%s pt)', (skin, target) => {
    render(
      <BFlowThemeProvider skin={skin}>
        <ActionModeToggleRow
          compact
          activeMode={null}
          editLabel="Editar"
          deleteLabel="Eliminar"
          editTestID="edit"
          deleteTestID="delete"
          editAccessibilityLabel="Editar gastos"
          deleteAccessibilityLabel="Eliminar gastos"
          onToggleEdit={jest.fn()}
          onToggleDelete={jest.fn()}
        />
      </BFlowThemeProvider>
    );
    expect(minHeightOf('edit')).toBeGreaterThanOrEqual(target);
    expect(minHeightOf('delete')).toBeGreaterThanOrEqual(target);
  });

  it('cambia la etiqueta y la etiqueta accesible del modo activo, y avisa al tocar', () => {
    const onToggleEdit = jest.fn();
    const onToggleDelete = jest.fn();
    render(
      <BFlowThemeProvider>
        <ActionModeToggleRow
          activeMode="delete"
          editLabel="Editar"
          deleteLabel="Eliminar"
          activeDeleteLabel="Listo"
          editTestID="edit"
          deleteTestID="delete"
          editAccessibilityLabel="Editar deudas"
          deleteAccessibilityLabel="Eliminar deudas"
          activeDeleteAccessibilityLabel="Cancelar eliminación de deudas"
          onToggleEdit={onToggleEdit}
          onToggleDelete={onToggleDelete}
        />
      </BFlowThemeProvider>
    );
    expect(screen.getByText('Listo')).toBeTruthy();
    expect(screen.getByText('Editar')).toBeTruthy();
    expect(screen.getByLabelText('Cancelar eliminación de deudas')).toBeTruthy();
    expect(screen.getByTestId('delete')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true })
    );
    fireEvent.press(screen.getByTestId('edit'));
    fireEvent.press(screen.getByTestId('delete'));
    expect(onToggleEdit).toHaveBeenCalledTimes(1);
    expect(onToggleDelete).toHaveBeenCalledTimes(1);
  });

  it('no pinta nada si no hay acciones', () => {
    render(
      <BFlowThemeProvider>
        <ActionModeToggleRow
          activeMode={null}
          showEdit={false}
          showDelete={false}
          editLabel="Editar"
          deleteLabel="Eliminar"
          editTestID="edit"
          deleteTestID="delete"
          editAccessibilityLabel="Editar"
          deleteAccessibilityLabel="Eliminar"
          onToggleEdit={jest.fn()}
          onToggleDelete={jest.fn()}
        />
      </BFlowThemeProvider>
    );
    expect(screen.queryByTestId('edit')).toBeNull();
  });
});

describe('InlineItemActionPill', () => {
  it.each(SKINS)('muestra el botón del modo con el objetivo táctil de la piel %s', (skin, target) => {
    const onDelete = jest.fn();
    render(
      <BFlowThemeProvider skin={skin}>
        <InlineItemActionPill
          mode="delete"
          itemName="deuda Carro"
          editTestID="pill-edit"
          deleteTestID="pill-delete"
          onEdit={jest.fn()}
          onDelete={onDelete}
        />
      </BFlowThemeProvider>
    );
    expect(screen.queryByTestId('pill-edit')).toBeNull();
    expect(screen.getByLabelText('Eliminar deuda Carro')).toBeTruthy();
    expect(minHeightOf('pill-delete')).toBeGreaterThanOrEqual(target);
    fireEvent.press(screen.getByTestId('pill-delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('en filas estrechas solo muestra el icono, con su etiqueta accesible', () => {
    render(
      <BFlowThemeProvider>
        <InlineItemActionPill
          iconOnly
          mode="edit"
          itemName="Arriendo"
          editTestID="pill-edit"
          deleteTestID="pill-delete"
          onEdit={jest.fn()}
        />
      </BFlowThemeProvider>
    );
    expect(screen.getByLabelText('Editar Arriendo')).toBeTruthy();
    expect(screen.queryByText('Editar')).toBeNull();
  });

  it('sin modo o sin acción no pinta nada', () => {
    render(
      <BFlowThemeProvider>
        <InlineItemActionPill
          mode="edit"
          itemName="Arriendo"
          editTestID="pill-edit"
          deleteTestID="pill-delete"
        />
      </BFlowThemeProvider>
    );
    expect(screen.queryByTestId('pill-edit')).toBeNull();
  });
});
