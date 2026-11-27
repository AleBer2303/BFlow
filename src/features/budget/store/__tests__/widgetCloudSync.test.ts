/**
 * El store sube el snapshot del widget a `users/{uid}/widgetSnapshots/current` (ADR 0021),
 * salvo mientras carga la nube: entonces el estado puede venir de una caché vieja.
 */

import type { BFlowAuthUser } from '../../../../platform/auth/authAdapter';

const mockScheduleCloudWidgetSnapshotWrite = jest.fn();
jest.mock('../../../../data/repositories/widgetSnapshotRepository', () => ({
  scheduleCloudWidgetSnapshotWrite: (...args: unknown[]) =>
    mockScheduleCloudWidgetSnapshotWrite(...args),
}));

// eslint-disable-next-line import/first
import { cancelPendingWidgetSync, triggerWidgetSync, useBudgetStore } from '../useBudgetStore';

describe('Snapshot del widget en la nube', () => {
  const cloudUser: BFlowAuthUser = {
    uid: 'uid_cloud_test_widget',
    email: 'widget@example.com',
    displayName: 'Widget',
    authProvider: 'password',
    provider: 'firebase',
  };

  beforeEach(async () => {
    mockScheduleCloudWidgetSnapshotWrite.mockReset();
    useBudgetStore.getState().resetToSampleWorkspace();
    useBudgetStore.setState({ authUser: cloudUser });
    // El refresco del widget se agrupa al final del tick: se deja correr el de la preparación.
    await Promise.resolve();
    mockScheduleCloudWidgetSnapshotWrite.mockReset();
  });

  it('agrupa las peticiones del mismo tick y calcula el snapshot una sola vez, con el último estado', async () => {
    useBudgetStore.setState({ isSyncing: false });
    const first = triggerWidgetSync(useBudgetStore.getState());
    const second = triggerWidgetSync(useBudgetStore.getState());
    useBudgetStore.setState({ isSyncing: true });
    const third = triggerWidgetSync(useBudgetStore.getState());

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect((await first).synced).toBe(true);
    // Tres peticiones, un cálculo; el último estado (cargando la nube) no sube nada.
    expect(mockScheduleCloudWidgetSnapshotWrite).not.toHaveBeenCalled();

    useBudgetStore.setState({ isSyncing: false });
    await triggerWidgetSync(useBudgetStore.getState());
    expect(mockScheduleCloudWidgetSnapshotWrite).toHaveBeenCalledTimes(1);
  });

  it('una petición cancelada (cierre de sesión) no calcula ni sube nada', async () => {
    useBudgetStore.setState({ isSyncing: false });
    const pending = triggerWidgetSync(useBudgetStore.getState());
    cancelPendingWidgetSync();

    expect((await pending).synced).toBe(false);
    expect(mockScheduleCloudWidgetSnapshotWrite).not.toHaveBeenCalled();
  });

  it('lo programa para un usuario real cuando no hay sincronización en curso', async () => {
    useBudgetStore.setState({ isSyncing: false });
    await useBudgetStore.getState().syncActiveWidget();

    expect(mockScheduleCloudWidgetSnapshotWrite).toHaveBeenCalledTimes(1);
    const [uid, snapshot] = mockScheduleCloudWidgetSnapshotWrite.mock.calls[0] ?? [];
    expect(uid).toBe(cloudUser.uid);
    expect(snapshot).toMatchObject({ schemaVersion: 2 });
  });

  it('no lo sube mientras se carga la nube', async () => {
    useBudgetStore.setState({ isSyncing: true });
    await useBudgetStore.getState().syncActiveWidget();

    expect(mockScheduleCloudWidgetSnapshotWrite).not.toHaveBeenCalled();
  });
});
