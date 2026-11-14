/**
 * src/features/budget/store/__tests__/profileCloudSave.test.ts
 *
 * El nombre y la meta del perfil se guardan en `users/{uid}` al instante, con la misma
 * escritura optimista del resto del store: cola persistente sin red y reversión si el
 * servidor rechaza el cambio (AGENTS.md §6.2).
 */

import { FirestoreBudgetRepository } from '../../../../data/repositories/budgetRepository';
import * as authAdapter from '../../../../platform/auth/authAdapter';
import {
  DEMO_OWNER_USER,
  loadPersistedSession,
  type BFlowAuthUser,
} from '../../../../platform/auth/authAdapter';
import {
  clearOfflineWriteQueue,
  drainOfflineWriteQueue,
  loadOfflineWriteQueue,
} from '../../../../platform/storage/offlineWriteQueue';
import { useBudgetStore } from '../useBudgetStore';

describe('updateAuthUserProfile: el perfil se guarda en Firestore', () => {
  const cloudUser: BFlowAuthUser = {
    uid: 'uid_cloud_test_profile',
    email: 'demo.owner@bflow.example',
    displayName: 'Alejandro Bernal',
    financialGoal: 'Meta anterior',
    authProvider: 'password',
    emailVerified: true,
    provider: 'firebase',
  };

  let syncNameSpy: jest.SpyInstance;

  beforeEach(() => {
    clearOfflineWriteQueue(cloudUser.uid);
    useBudgetStore.getState().resetToOctober2026GoldenState();
    useBudgetStore.getState().setAuthUser(cloudUser);
    syncNameSpy = jest.spyOn(authAdapter, 'syncAuthDisplayName').mockResolvedValue(undefined);
  });

  afterEach(() => {
    clearOfflineWriteQueue(cloudUser.uid);
    jest.restoreAllMocks();
    useBudgetStore.setState({ authUser: DEMO_OWNER_USER, needsOnboarding: false });
    useBudgetStore.getState().resetToOctober2026GoldenState();
  });

  it('writes the name and the goal to users/{uid} and keeps them in the session', async () => {
    const saveSpy = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockResolvedValue(undefined);

    const status = await useBudgetStore.getState().updateAuthUserProfile({
      displayName: '  Alejandro Bernal G.  ',
      financialGoal: '  Viaje a Japón  ',
    });

    expect(status).toBe('synced');
    expect(saveSpy).toHaveBeenCalledWith(cloudUser.uid, {
      displayName: 'Alejandro Bernal G.',
      financialGoal: 'Viaje a Japón',
    });
    expect(useBudgetStore.getState().authUser).toMatchObject({
      displayName: 'Alejandro Bernal G.',
      financialGoal: 'Viaje a Japón',
      email: 'demo.owner@bflow.example',
      emailVerified: true,
    });
    expect(loadPersistedSession()).toMatchObject({
      displayName: 'Alejandro Bernal G.',
      financialGoal: 'Viaje a Japón',
    });
    expect(syncNameSpy).toHaveBeenCalledWith('Alejandro Bernal G.');
    expect(loadOfflineWriteQueue(cloudUser.uid)).toHaveLength(0);
  });

  it('stores an empty goal as cleared and keeps the current name when the new one is blank', async () => {
    const saveSpy = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockResolvedValue(undefined);

    await useBudgetStore.getState().updateAuthUserProfile({ displayName: '   ', financialGoal: '' });

    expect(saveSpy).toHaveBeenCalledWith(cloudUser.uid, {
      displayName: 'Alejandro Bernal',
      financialGoal: '',
    });
    expect(useBudgetStore.getState().authUser?.financialGoal).toBe('');
  });

  it('sends the untouched field with its current value when only one is edited', async () => {
    const saveSpy = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockResolvedValue(undefined);

    await useBudgetStore.getState().updateAuthUserProfile({ displayName: 'Alejo' });

    expect(saveSpy).toHaveBeenCalledWith(cloudUser.uid, {
      displayName: 'Alejo',
      financialGoal: 'Meta anterior',
    });
  });

  it('never sends more characters than firestore.rules accepts', async () => {
    const saveSpy = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockResolvedValue(undefined);

    await useBudgetStore.getState().updateAuthUserProfile({
      displayName: 'N'.repeat(300),
      financialGoal: 'M'.repeat(300),
    });

    const sent = saveSpy.mock.calls[0]?.[1];
    expect(sent?.displayName).toHaveLength(120);
    expect(sent?.financialGoal).toHaveLength(240);
  });

  it('reverts the profile and explains it when Firestore rejects the write', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockRejectedValue(permissionError);

    const status = await useBudgetStore.getState().updateAuthUserProfile({
      displayName: 'Nombre Rechazado',
      financialGoal: 'Meta rechazada',
    });

    expect(status).toBe('rejected');
    expect(useBudgetStore.getState().authUser).toMatchObject({
      displayName: 'Alejandro Bernal',
      financialGoal: 'Meta anterior',
    });
    expect(loadPersistedSession()).toMatchObject({
      displayName: 'Alejandro Bernal',
      financialGoal: 'Meta anterior',
    });
    expect(useBudgetStore.getState().syncMessage).toBe('No se pudo guardar tu perfil en la nube.');
    expect(loadOfflineWriteQueue(cloudUser.uid)).toHaveLength(0);
    expect(syncNameSpy).not.toHaveBeenCalled();
  });

  it('keeps the change and queues it when there is no connection, one entry per profile', async () => {
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockRejectedValue(new Error('Firestore write timeout'));

    const first = await useBudgetStore.getState().updateAuthUserProfile({ displayName: 'Primer Nombre' });
    const second = await useBudgetStore.getState().updateAuthUserProfile({
      displayName: 'Segundo Nombre',
      financialGoal: 'Meta sin red',
    });

    expect(first).toBe('queued');
    expect(second).toBe('queued');
    expect(useBudgetStore.getState().authUser?.displayName).toBe('Segundo Nombre');

    const queue = loadOfflineWriteQueue(cloudUser.uid);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      type: 'save_user_profile',
      payload: { displayName: 'Segundo Nombre', financialGoal: 'Meta sin red' },
    });
    expect(useBudgetStore.getState().pendingOfflineWritesCount).toBe(1);
  });

  it('replays the queued profile against Firestore when the connection returns', async () => {
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockRejectedValue(new Error('Firestore write timeout'));
    await useBudgetStore.getState().updateAuthUserProfile({
      displayName: 'Nombre En Cola',
      financialGoal: 'Meta en cola',
    });

    const saveUserProfile = jest.fn().mockResolvedValue(undefined);
    const result = await drainOfflineWriteQueue(cloudUser.uid, {
      saveUserProfile,
    } as unknown as FirestoreBudgetRepository);

    expect(saveUserProfile).toHaveBeenCalledWith(cloudUser.uid, {
      displayName: 'Nombre En Cola',
      financialGoal: 'Meta en cola',
    });
    expect(result).toEqual({ processed: 1, remaining: 0 });
  });

  it('does not let a late rollback overwrite a session that changed account', async () => {
    let rejectWrite: (reason: unknown) => void = () => {};
    jest.spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile').mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectWrite = reject;
        })
    );

    const pending = useBudgetStore.getState().updateAuthUserProfile({ displayName: 'Nombre Tardío' });
    useBudgetStore.getState().setAuthUser(DEMO_OWNER_USER);
    rejectWrite(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    await expect(pending).resolves.toBe('rejected');
    expect(useBudgetStore.getState().authUser?.uid).toBe(DEMO_OWNER_USER.uid);
    expect(useBudgetStore.getState().authUser?.displayName).toBe(DEMO_OWNER_USER.displayName);
  });

  it('updates a local session without touching Firestore', async () => {
    const saveSpy = jest.spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile');
    useBudgetStore.getState().setAuthUser(DEMO_OWNER_USER);

    const status = await useBudgetStore.getState().updateAuthUserProfile({
      displayName: 'Nombre Local',
      financialGoal: 'Meta local',
    });

    expect(status).toBe('local');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(useBudgetStore.getState().authUser).toMatchObject({
      displayName: 'Nombre Local',
      financialGoal: 'Meta local',
    });
  });

  it('does nothing without a session', async () => {
    const saveSpy = jest.spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile');
    useBudgetStore.getState().requireAuthenticationGate();

    await expect(
      useBudgetStore.getState().updateAuthUserProfile({ displayName: 'Nadie' })
    ).resolves.toBe('local');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(useBudgetStore.getState().authUser).toBeNull();
  });
});
