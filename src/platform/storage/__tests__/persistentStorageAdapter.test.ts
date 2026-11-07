import { persistentStorage } from '../persistentStorageAdapter';

describe('persistentStorageAdapter', () => {
  beforeEach(() => {
    persistentStorage.clear();
  });

  it('stores and retrieves serialized objects', () => {
    const testData = { userId: 'usr-123', settings: { theme: 'dark', notifications: true } };
    persistentStorage.setItem('test_key', testData);

    const retrieved = persistentStorage.getItem<typeof testData>('test_key');
    expect(retrieved).toEqual(testData);
  });

  it('returns null for nonexistent keys', () => {
    expect(persistentStorage.getItem('nonexistent')).toBeNull();
  });

  it('removes items successfully', () => {
    persistentStorage.setItem('temp', { active: true });
    expect(persistentStorage.getItem('temp')).toEqual({ active: true });

    persistentStorage.removeItem('temp');
    expect(persistentStorage.getItem('temp')).toBeNull();
  });

  it('clears all items successfully', () => {
    persistentStorage.setItem('k1', 'val1');
    persistentStorage.setItem('k2', 'val2');

    persistentStorage.clear();
    expect(persistentStorage.getItem('k1')).toBeNull();
    expect(persistentStorage.getItem('k2')).toBeNull();
  });
});
