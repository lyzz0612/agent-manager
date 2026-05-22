/**
 * Storage abstraction.
 *
 * Uses `@react-native-async-storage/async-storage` when available (RN and web).
 * Falls back to an in-memory map so tests and SSR don't blow up.
 */

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function makeMemoryStore(): AsyncStorageLike {
  const memory = new Map<string, string>();
  return {
    async getItem(key) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    async setItem(key, value) {
      memory.set(key, value);
    },
    async removeItem(key) {
      memory.delete(key);
    },
  };
}

function resolveBacking(): AsyncStorageLike {
  // The Node-only test environment lacks both `window` and a working RN
  // native module bridge. Fall back to an in-memory shim so unit tests can
  // exercise the persistence layer without `jsdom`.
  const isNodeOnly =
    typeof window === 'undefined' &&
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null &&
    process.env.JEST_WORKER_ID !== undefined;
  if (isNodeOnly) return makeMemoryStore();

  try {
    // Lazy require keeps `react-native` out of test-time module graphs.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-async-storage/async-storage');
    return (mod.default ?? mod) as AsyncStorageLike;
  } catch {
    return makeMemoryStore();
  }
}

export const storage: AsyncStorageLike = resolveBacking();
