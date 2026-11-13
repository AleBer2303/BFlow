import { Alert, Platform } from 'react-native';
import { confirmDestructive } from '../confirmDestructive';

const request = {
  title: 'Eliminar deuda',
  message: '¿Deseas eliminar permanentemente la obligación "Tarjeta"?',
  confirmLabel: 'Eliminar',
};

describe('confirmDestructive', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it('asks with the system alert on iOS and Android, with a cancel and a destructive button', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onConfirm = jest.fn();

    confirmDestructive({ ...request, onConfirm });

    expect(alert).toHaveBeenCalledWith(request.title, request.message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: onConfirm },
    ]);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  describe('in the browser, where the alert does nothing', () => {
    const globalWithConfirm = globalThis as { confirm?: (message?: string) => boolean };
    const originalConfirm = globalWithConfirm.confirm;

    beforeEach(() => {
      Platform.OS = 'web';
    });

    afterEach(() => {
      globalWithConfirm.confirm = originalConfirm;
    });

    it('runs the action when the person confirms', () => {
      const confirm = jest.fn().mockReturnValue(true);
      globalWithConfirm.confirm = confirm;
      const onConfirm = jest.fn();

      confirmDestructive({ ...request, onConfirm });

      expect(confirm).toHaveBeenCalledWith(`${request.title}\n\n${request.message}`);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the person cancels', () => {
      globalWithConfirm.confirm = jest.fn().mockReturnValue(false);
      const onConfirm = jest.fn();

      confirmDestructive({ ...request, onConfirm });

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
