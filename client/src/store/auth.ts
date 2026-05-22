import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiClient, normalizeServerUrl } from '../api/client';
import { ApiError } from '../api/errors';
import { storage } from './storage';

const STORAGE_KEY = 'agent-manager/auth/v1';

export interface AuthSession {
  serverUrl: string;
  token: string;
}

export interface AuthState {
  loading: boolean;
  session: AuthSession | null;
  /** Last Server URL the user used, even if they have since logged out. */
  lastServerUrl: string | null;
  api: ApiClient | null;
  /** Attempt to log in; persists session on success, throws on failure. */
  login: (serverUrl: string, token: string) => Promise<void>;
  /** Clears the persisted session and any in-memory derivations. */
  logout: () => Promise<void>;
  /**
   * Update the Server URL. Per spec, changing the URL must clear the token
   * and force the user to log in again. The new URL is remembered as the
   * preferred Server so the login screen can pre-fill it.
   */
  setServerUrl: (serverUrl: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface PersistedShape {
  serverUrl: string;
  /** Token is omitted when the user has been logged out but we still
   *  remember the preferred Server URL. */
  token?: string;
}

async function readPersisted(): Promise<PersistedShape | null> {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    if (typeof parsed.serverUrl !== 'string' || !parsed.serverUrl) {
      return null;
    }
    const token =
      typeof parsed.token === 'string' && parsed.token ? parsed.token : undefined;
    return { serverUrl: parsed.serverUrl, token };
  } catch {
    return null;
  }
}

async function writePersisted(value: PersistedShape | null): Promise<void> {
  if (value === null) {
    await storage.removeItem(STORAGE_KEY);
    return;
  }
  await storage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function AuthProvider(props: { children: React.ReactNode }): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [lastServerUrl, setLastServerUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const persisted = await readPersisted();
      if (cancelled) return;
      if (persisted) {
        setLastServerUrl(persisted.serverUrl);
        if (persisted.token) {
          setSession({ serverUrl: persisted.serverUrl, token: persisted.token });
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (serverUrl: string, token: string): Promise<void> => {
    const normalized = normalizeServerUrl(serverUrl);
    const trimmedToken = token.trim();
    if (!normalized || !trimmedToken) {
      throw new ApiError('unknown', 'Server URL 和 Token 不能为空');
    }
    const probe = new ApiClient({ serverUrl: normalized, token: trimmedToken });
    await probe.verifyToken();
    await writePersisted({ serverUrl: normalized, token: trimmedToken });
    setLastServerUrl(normalized);
    setSession({ serverUrl: normalized, token: trimmedToken });
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    // Remember the Server URL but drop the token so the login screen can
    // pre-fill the URL the user just authenticated against.
    const previousUrl = lastServerUrl;
    if (previousUrl) {
      await writePersisted({ serverUrl: previousUrl });
    } else {
      await writePersisted(null);
    }
    setSession(null);
  }, [lastServerUrl]);

  const setServerUrl = useCallback(async (serverUrl: string): Promise<void> => {
    const normalized = normalizeServerUrl(serverUrl);
    if (!normalized) {
      await writePersisted(null);
      setLastServerUrl(null);
    } else {
      await writePersisted({ serverUrl: normalized });
      setLastServerUrl(normalized);
    }
    setSession(null);
  }, []);

  const api = useMemo(() => {
    if (!session) return null;
    return new ApiClient({ serverUrl: session.serverUrl, token: session.token });
  }, [session]);

  const value = useMemo<AuthState>(
    () => ({ loading, session, lastServerUrl, api, login, logout, setServerUrl }),
    [loading, session, lastServerUrl, api, login, logout, setServerUrl],
  );

  return React.createElement(AuthContext.Provider, { value }, props.children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

/* Test helpers — exported so unit tests can poke at storage directly. */
export const __authTesting = {
  STORAGE_KEY,
  readPersisted,
  writePersisted,
};
