import { __authTesting } from '../src/store/auth';

describe('auth persistence', () => {
  beforeEach(async () => {
    await __authTesting.writePersisted(null);
  });

  it('writes and reads a session back', async () => {
    await __authTesting.writePersisted({ serverUrl: 'https://x', token: 'tok' });
    const result = await __authTesting.readPersisted();
    expect(result).toEqual({ serverUrl: 'https://x', token: 'tok' });
  });

  it('returns null when the stored payload is malformed', async () => {
    const { STORAGE_KEY } = __authTesting;
    // Use the same in-memory storage shim used in tests.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { storage } = require('../src/store/storage');
    await storage.setItem(STORAGE_KEY, '{"bad":true}');
    expect(await __authTesting.readPersisted()).toBeNull();
  });

  it('clears the persisted entry when null is written', async () => {
    await __authTesting.writePersisted({ serverUrl: 'https://x', token: 'tok' });
    await __authTesting.writePersisted(null);
    expect(await __authTesting.readPersisted()).toBeNull();
  });
});
