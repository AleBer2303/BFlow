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
import { useBudgetStore } from '../useBudgetStore';

describe('Snapshot del widget en la nube', () => {
  const cloudUser: BFlowAuthUser = {
    uid: 'uid_cloud_test_widget',
    email: 'widget@example.com',
    displayName: 'Widget',
    authProvider: 'password',
    provider: 'firebase',
  };

  beforeEach(() => {
    mockScheduleCloudWidgetSnapshotWrite.mockReset();
    useBudgetStore.getState().resetToOctober2026GoldenState();
    useBudgetStore.getState().setAuthUser(cloudUser);
    mockScheduleCloudWidgetSnapshotWrite.mockReset();
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
