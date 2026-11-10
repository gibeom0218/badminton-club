import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api, setAuthTokenProvider } from '@/lib/api';
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '@/lib/auth-storage';
import type { AuthUser } from '@/types/api';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAuthTokenProvider(() => token);
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const saved = await getAuthToken();
        if (!saved) return;
        if (cancelled) return;
        setToken(saved);
        setAuthTokenProvider(() => saved);
        const me = await api.getMe();
        if (cancelled) return;
        setUser({
          id: me.id,
          username: me.username,
          role: me.role,
        });
      } catch {
        await clearAuthToken();
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password);
    await setAuthToken(result.token);
    setAuthTokenProvider(() => result.token);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    await clearAuthToken();
    setAuthTokenProvider(() => null);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAdmin: user?.role === 'admin',
      login,
      logout,
    }),
    [user, token, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
