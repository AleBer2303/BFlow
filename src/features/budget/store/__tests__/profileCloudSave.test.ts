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
  DEMO_USER,
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
    email: 'demo@bflow.example',
    displayName: 'Usuario de ejemplo',
    financialGoal: 'Meta anterior',
    authProvider: 'password',
    emailVerified: true,
    provider: 'firebase',
  };

  let syncNameSpy: jest.SpyInstance;

  beforeEach(() => {
    clearOfflineWriteQueue(cloudUser.uid);
    useBudgetStore.getState().resetToSampleWorkspace();
    useBudgetStore.setState({ authUser: cloudUser });
    syncNameSpy = jest.spyOn(authAdapter, 'syncAuthDisplayName').mockResolvedValue(undefined);
  });

  afterEach(() => {
    clearOfflineWriteQueue(cloudUser.uid);
    jest.restoreAllMocks();
    useBudgetStore.setState({ authUser: DEMO_USER, needsOnboarding: false });
    useBudgetStore.getState().resetToSampleWorkspace();
  });

  it('writes the name and the goal to users/{uid} and keeps them in the session', async () => {
    const saveSpy = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockResolvedValue(undefined);

    const status = await useBudgetStore.getState().updateAuthUserProfile({
      displayName: '  Usuario de ejemplo G.  ',
      financialGoal: '  Viaje a Japón  ',
    });

    expect(status).toBe('synced');
    expect(saveSpy).toHaveBeenCalledWith(cloudUser.uid, {
      displayName: 'Usuario de ejemplo G.',
      financialGoal: 'Viaje a Japón',
    });
    expect(useBudgetStore.getState().authUser).toMatchObject({
      displayName: 'Usuario de ejemplo G.',
      financialGoal: 'Viaje a Japón',
      email: 'demo@bflow.example',
      emailVerified: true,
    });
    expect(loadPersistedSession()).toMatchObject({
      displayName: 'Usuario de ejemplo G.',
      financialGoal: 'Viaje a Japón',
    });
    expect(syncNameSpy).toHaveBeenCalledWith('Usuario de ejemplo G.');
    expect(loadOfflineWriteQueue(cloudUser.uid)).toHaveLength(0);
  });

  it('stores an empty goal as cleared and keeps the current name when the new one is blank', async () => {
    const saveSpy = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockResolvedValue(undefined);

    await useBudgetStore.getState().updateAuthUserProfile({ displayName: '   ', financialGoal: '' });

    expect(saveSpy).toHaveBeenCalledWith(cloudUser.uid, {
      displayName: 'Usuario de ejemplo',
      financialGoal: '',
    });
    expect(useBudgetStore.getState().authUser?.financialGoal).toBe('');
  });

  it('sends the untouched field with its current value when only one is edited', async () => {
    const saveSpy = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockResolvedValue(undefined);

    await useBudgetStore.getState().updateAuthUserProfile({ displayName: 'Ana María' });

    expect(saveSpy).toHaveBeenCalledWith(cloudUser.uid, {
      displayName: 'Ana María',
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
      displayName: 'Usuario de ejemplo',
      financialGoal: 'Meta anterior',
    });
    expect(loadPersistedSession()).toMatchObject({
      displayName: 'Usuario de ejemplo',
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
    expect(result).toEqual({ processed: 1, remaining: 0, discarded: 0 });
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
    useBudgetStore.getState().setAuthUser(DEMO_USER);
    rejectWrite(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    await expect(pending).resolves.toBe('rejected');
    expect(useBudgetStore.getState().authUser?.uid).toBe(DEMO_USER.uid);
    expect(useBudgetStore.getState().authUser?.displayName).toBe(DEMO_USER.displayName);
  });

  it('updates a local session without touching Firestore', async () => {
    const saveSpy = jest.spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile');
    useBudgetStore.getState().setAuthUser(DEMO_USER);

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

  it('saves, clears, rolls back, and replays photoUrl in Firestore and session (ADR 0033)', async () => {
    const samplePhoto = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const saveSpy = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveUserProfile')
      .mockResolvedValue(undefined);

    const savedStatus = await useBudgetStore.getState().updateAuthUserProfile({
      photoUrl: samplePhoto,
    });
    expect(savedStatus).toBe('synced');
    expect(saveSpy).toHaveBeenCalledWith(cloudUser.uid, {
      displayName: 'Usuario de ejemplo',
      financialGoal: 'Meta anterior',
      photoUrl: samplePhoto,
    });
    expect(useBudgetStore.getState().authUser?.photoUrl).toBe(samplePhoto);
    expect(loadPersistedSession()?.photoUrl).toBe(samplePhoto);

    // Rejects invalid / unsafe URIs before touching Firestore.
    saveSpy.mockClear();
    const invalidStatus = await useBudgetStore.getState().updateAuthUserProfile({
      photoUrl: 'data:image/svg+xml;base64,PHN2Zz4=',
    });
    expect(invalidStatus).toBe('rejected');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(useBudgetStore.getState().authUser?.photoUrl).toBe(samplePhoto);

    // Clearing the photo writes empty string to Firestore and removes photoUrl locally.
    const clearedStatus = await useBudgetStore.getState().updateAuthUserProfile({
      photoUrl: '',
    });
    expect(clearedStatus).toBe('synced');
    expect(saveSpy).toHaveBeenCalledWith(cloudUser.uid, {
      displayName: 'Usuario de ejemplo',
      financialGoal: 'Meta anterior',
      photoUrl: '',
    });
    expect(useBudgetStore.getState().authUser?.photoUrl).toBeUndefined();

    // Offline photo update queues and replays photoUrl when connection returns.
    saveSpy.mockRejectedValueOnce(new Error('Firestore write timeout'));
    const queuedStatus = await useBudgetStore.getState().updateAuthUserProfile({
      photoUrl: samplePhoto,
    });
    expect(queuedStatus).toBe('queued');
    const replaySave = jest.fn().mockResolvedValue(undefined);
    await drainOfflineWriteQueue(cloudUser.uid, {
      saveUserProfile: replaySave,
    } as unknown as FirestoreBudgetRepository);
    expect(replaySave).toHaveBeenCalledWith(cloudUser.uid, {
      displayName: 'Usuario de ejemplo',
      financialGoal: 'Meta anterior',
      photoUrl: samplePhoto,
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
