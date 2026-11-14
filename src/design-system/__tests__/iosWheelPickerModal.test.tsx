import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { IosWheelPickerModal } from '../components/IosWheelPickerModal';
import { BFlowThemeProvider } from '../theme/ThemeContext';

const SAMPLE_OPTIONS = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
] as const;

describe('IosWheelPickerModal', () => {
  it.each(['ios', 'android', 'web'] as const)(
    'centers on initial value, supports drag-free scrolling and tap selection, and confirms on %s skin',
    (skin) => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      render(
        <BFlowThemeProvider initialMode="dark" skin={skin}>
          <IosWheelPickerModal
            visible
            title="Mes de Inicio"
            options={SAMPLE_OPTIONS}
            selectedValue="03"
            onConfirm={onConfirm}
            onCancel={onCancel}
            testID="wheel-test"
          />
        </BFlowThemeProvider>
      );

      const scrollView = screen.getByTestId('wheel-test-scroll-view');
      expect(scrollView.props.contentOffset).toEqual({ x: 0, y: 2 * 44 });

      // Option rows must NOT attach onPressIn so touch-drags never hijack scrolling
      const optionRow = screen.getByTestId('wheel-test-option-01');
      expect(optionRow.props.onPressIn).toBeUndefined();

      // Scrolling directly to index 4 ("Mayo") and pressing Listo commits '05' without requiring a row tap
      fireEvent.scroll(scrollView, {
        nativeEvent: { contentOffset: { y: 4 * 44 } },
      });
      fireEvent.press(screen.getByTestId('wheel-test-confirm'));
      expect(onConfirm).toHaveBeenCalledWith('05');

      // Direct tap on an option updates selection and confirms it
      onConfirm.mockClear();
      fireEvent.press(screen.getByTestId('wheel-test-option-02'));
      fireEvent.press(screen.getByTestId('wheel-test-confirm'));
      expect(onConfirm).toHaveBeenCalledWith('02');

      // Cancel & backdrop invoke onCancel
      fireEvent.press(screen.getByTestId('wheel-test-cancel'));
      fireEvent.press(screen.getByTestId('wheel-test-backdrop'));
      expect(onCancel).toHaveBeenCalledTimes(2);
    }
  );

  it('applies cylindrical 3D wheel transforms on iOS/Android and flat hierarchy on Web', () => {
    const { rerender } = render(
      <BFlowThemeProvider initialMode="dark" skin="ios">
        <IosWheelPickerModal
          visible
          options={SAMPLE_OPTIONS}
          selectedValue="03"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
          testID="wheel-perspective"
        />
      </BFlowThemeProvider>
    );

    const iosOptionAnimated = screen.getByTestId('wheel-perspective-option-01').children[0] as unknown as {
      props: { style: unknown[] };
    };
    const iosFlatStyle = Object.assign({}, ...iosOptionAnimated.props.style);
    const iosTransforms = iosFlatStyle.transform as Array<Record<string, unknown>>;
    expect(iosTransforms.some((t) => 'perspective' in t)).toBe(true);
    expect(iosTransforms.some((t) => 'rotateX' in t)).toBe(true);
    expect(iosTransforms.some((t) => 'scale' in t)).toBe(true);

    rerender(
      <BFlowThemeProvider initialMode="dark" skin="web">
        <IosWheelPickerModal
          visible
          options={SAMPLE_OPTIONS}
          selectedValue="03"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
          testID="wheel-perspective"
        />
      </BFlowThemeProvider>
    );

    const webOptionAnimated = screen.getByTestId('wheel-perspective-option-01').children[0] as unknown as {
      props: { style: unknown[] };
    };
    const webFlatStyle = Object.assign({}, ...webOptionAnimated.props.style);
    const webTransforms = webFlatStyle.transform as Array<Record<string, unknown>>;
    expect(webTransforms.some((t) => 'rotateX' in t)).toBe(false);
    expect(webTransforms.some((t) => 'scale' in t)).toBe(true);
  });

  it('returns null when closed under static test motion', () => {
    render(
      <BFlowThemeProvider initialMode="dark" skin="ios">
        <IosWheelPickerModal
          visible={false}
          options={SAMPLE_OPTIONS}
          selectedValue="01"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
          testID="wheel-closed"
        />
      </BFlowThemeProvider>
    );

    expect(screen.queryByTestId('wheel-closed')).toBeNull();
    expect(screen.queryByTestId('wheel-closed-sheet')).toBeNull();
  });

  it.each(['ios', 'android'] as const)(
    'anchors the picker sheet at the bottom edge (flex-end) on %s skin',
    (skin) => {
      render(
        <BFlowThemeProvider initialMode="dark" skin={skin}>
          <IosWheelPickerModal
            visible
            title="Año de Inicio"
            options={SAMPLE_OPTIONS}
            selectedValue="03"
            onConfirm={jest.fn()}
            onCancel={jest.fn()}
            testID="wheel-sheet-pos"
          />
        </BFlowThemeProvider>
      );

      const container = screen.getByTestId('wheel-sheet-pos-container');
      expect(container.props.style).toEqual(
        expect.objectContaining({
          justifyContent: 'flex-end',
        })
      );
    }
  );
});
