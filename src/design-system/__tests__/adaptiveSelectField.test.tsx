import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { AdaptiveSelectField } from '../components/AdaptiveSelectField';
import { BFlowThemeProvider } from '../theme/ThemeContext';

const TEST_OPTIONS = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '10', label: 'Octubre' },
] as const;

describe('AdaptiveSelectField', () => {
  it.each(['ios', 'android'] as const)(
    'opens bottom-anchored IosWheelPickerModal and commits selection on %s skin',
    (skin) => {
      const onSelect = jest.fn();

      render(
        <BFlowThemeProvider initialMode="dark" skin={skin}>
          <AdaptiveSelectField
            label="Mes de inicio"
            title="Mes de Inicio"
            options={TEST_OPTIONS}
            selectedValue="03"
            onSelect={onSelect}
            triggerTestID="select-trigger"
            valueTestID="select-value"
            pickerTestID="select-picker"
            accessibilityLabel="Mes actual: Marzo"
          />
        </BFlowThemeProvider>
      );

      expect(screen.getByTestId('select-value')).toHaveTextContent('Marzo');
      expect(screen.queryByTestId('select-picker')).toBeNull();

      fireEvent.press(screen.getByTestId('select-trigger'));

      expect(screen.getByTestId('select-picker-container').props.style).toEqual(
        expect.objectContaining({ justifyContent: 'flex-end' })
      );
      expect(screen.getByTestId('select-picker-carousel-area')).toBeTruthy();

      fireEvent.press(screen.getByTestId('select-picker-option-10'));
      fireEvent.press(screen.getByTestId('select-picker-confirm'));

      expect(onSelect).toHaveBeenCalledWith('10');
      expect(screen.queryByTestId('select-picker')).toBeNull();
    }
  );

  it('opens an anchored Web dropdown (no wheel modal) and selects/closes immediately on web skin', () => {
    const onSelect = jest.fn();

    render(
      <BFlowThemeProvider initialMode="light" skin="web">
        <AdaptiveSelectField
          label="Mes de inicio"
          title="Mes de Inicio"
          options={TEST_OPTIONS}
          selectedValue="03"
          onSelect={onSelect}
          triggerTestID="web-select-trigger"
          valueTestID="web-select-value"
          pickerTestID="web-select-picker"
          accessibilityLabel="Mes actual: Marzo"
        />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('web-select-value')).toHaveTextContent('Marzo');
    expect(screen.queryByTestId('web-select-picker')).toBeNull();

    fireEvent.press(screen.getByTestId('web-select-trigger'));

    // Web dropdown must NOT render the mobile wheel carousel or mobile confirm/cancel header
    expect(screen.queryByTestId('web-select-picker-carousel-area')).toBeNull();
    expect(screen.queryByTestId('web-select-picker-confirm')).toBeNull();

    const menuSheet = screen.getByTestId('web-select-picker-sheet');
    expect(StyleSheet.flatten(menuSheet.props.style)).toEqual(
      expect.objectContaining({
        position: 'absolute',
        transformOrigin: 'top center',
      })
    );

    const selectedRow = screen.getByTestId('web-select-picker-option-03');
    expect(selectedRow.props.accessibilityState).toEqual({ selected: true });

    // Clicking an option selects immediately and closes the dropdown
    fireEvent.press(screen.getByTestId('web-select-picker-option-10'));
    expect(onSelect).toHaveBeenCalledWith('10');
    expect(screen.queryByTestId('web-select-picker-sheet')).toBeNull();

    // Opening again and pressing backdrop dismisses cleanly
    fireEvent.press(screen.getByTestId('web-select-trigger'));
    expect(screen.getByTestId('web-select-picker-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('web-select-picker-backdrop'));
    expect(screen.queryByTestId('web-select-picker-sheet')).toBeNull();
  });
});
