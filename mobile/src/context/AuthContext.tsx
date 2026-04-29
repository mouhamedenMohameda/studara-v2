import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, UserRole, Faculty, University, Language } from '../types';
import { API_BASE, apiRequest } from '../utils/api';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const STORAGE_USER_KEY         = '@studara/user';
const STORAGE_TOKEN_KEY        = '@studara/token';
const STORAGE_REFRESH_TOKEN_KEY = '@studara/refresh_token';
const STORAGE_ONBOARDED_KEY    = '@studara/onboarded';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<{ pending: boolean }>;
  logout: () => Promise<void>;
  updateUser: (partial: Partial<User>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
  refreshUserFromServer: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  university: University;
  faculty: Faculty;
  filiere?: string;
  year: number;
  referralCode?: string;
}

// ─── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser]         = useState<User | null>(null);
  const [token, setToken]       = useState<string | null>(null);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [isLoading, setIsLoading]     = useState(true);

  // Bootstrap: restore session from AsyncStorage, auto-refresh if token expired
  useEffect(() => {
    (async () => {
      try {
        const [[, userStr], [, tok], [, refreshTok], [, onboarded]] = await AsyncStorage.multiGet([
          STORAGE_USER_KEY, STORAGE_TOKEN_KEY, STORAGE_REFRESH_TOKEN_KEY, STORAGE_ONBOARDED_KEY,
        ]);
        setIsOnboarded(onboarded === 'true');

        if (userStr && tok) {
          setUser(JSON.parse(userStr));
          setToken(tok);

          // Silently try to refresh access token on startup (handles expiry)
          if (refreshTok) {
            try {
              const res = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: refreshTok }),
              });
              if (res.ok) {
                const data = await res.json();
                await AsyncStorage.multiSet([
                  [STORAGE_TOKEN_KEY, data.access],
                  ...(data.refresh ? [[STORAGE_REFRESH_TOKEN_KEY, data.refresh] as [string, string]] : []),
                ]);
                setToken(data.access);
              } else if (res.status === 401) {
                // Refresh token lui-même expiré ou révoqué → forcer re-login
                await AsyncStorage.multiRemove([
                  STORAGE_USER_KEY, STORAGE_TOKEN_KEY, STORAGE_REFRESH_TOKEN_KEY,
                ]);
                setUser(null);
                setToken(null);
              }
              // Autres erreurs serveur (5xx) → garder l'ancien token, réessayer plus tard
            } catch (_) { /* réseau indisponible — garder l'ancien token */ }
          }
        } else {
          // Inconsistent storage state — wipe everything to force re-login
          await AsyncStorage.multiRemove([
            STORAGE_USER_KEY, STORAGE_TOKEN_KEY, STORAGE_REFRESH_TOKEN_KEY,
          ]);
        }
      } catch (e) {
        console.error('Auth bootstrap error:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ email, password }),
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('انتهت مهلة الطلب — تحقق من الإنترنت وحاول مجدداً');
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json();
    if (!res.ok) {
      const msg = typeof data.error === 'string'
        ? data.error
        : data.error?.fieldErrors
          ? Object.values(data.error.fieldErrors).flat().join(' — ')
          : 'بيانات غير صحيحة';
      throw new Error(msg);
    }

    const u: User = {
      id:             data.user.id,
      email:          data.user.email,
      fullName:       data.user.full_name || data.user.fullName,
      university:     (data.user.university || 'una') as University,
      faculty:        (data.user.faculty    || 'sciences') as Faculty,
      year:           data.user.year || 1,
      role:           data.user.role as UserRole,
      language:       Language.Arabic,
      isVerified:     data.user.is_verified ?? false,
      totalUploads:   data.user.total_uploads   || 0,
      totalDownloads: data.user.total_downloads || 0,
      createdAt:      data.user.created_at || new Date().toISOString(),
      xp:             data.user.xp          || 0,
      level:          data.user.level        || 1,
      streakDays:     data.user.streak_days  || 0,
    };
    await AsyncStorage.multiSet([
      [STORAGE_USER_KEY,          JSON.stringify(u)],
      [STORAGE_TOKEN_KEY,         data.access],
      [STORAGE_REFRESH_TOKEN_KEY, data.refresh || ''],
    ]);
    setUser(u);
    setToken(data.access);

    // Best-effort: register Expo push token for "trusted device" approvals.
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (perm.status !== 'granted') {
        // do not prompt here; AppNavigator already requests permissions post-auth
        return;
      }
      const expoPushToken = (await Notifications.getExpoPushTokenAsync()).data;
      if (expoPushToken) {
        await apiRequest('/auth/devices/register', {
          method: 'POST',
          token: data.access,
          body: {
            expoPushToken,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
          },
        });
      }
    } catch {
      // Non-blocking
    }
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          email:        data.email,
          password:     data.password,
          fullName:     data.fullName,
          university:   data.university,
          faculty:      data.faculty,
          filiere:      data.filiere,
          year:         data.year,
          ...(data.referralCode ? { referralCode: data.referralCode } : {}),
        }),
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('انتهت مهلة الطلب — تحقق من الإنترنت وحاول مجدداً');
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const json = await res.json();
    if (!res.ok) {
      const msg = typeof json.error === 'string'
        ? json.error
        : json.error?.fieldErrors
          ? Object.values(json.error.fieldErrors).flat().join(' — ')
          : 'خطأ في التسجيل';
      throw new Error(msg);
    }
    // Account created — pending admin approval, do NOT auto-login
    return { pending: json.pending === true };
  }, []);

  const logout = useCallback(async () => {
    // Best-effort: tell the server to invalidate the refresh token
    try {
      const refreshTok = await AsyncStorage.getItem(STORAGE_REFRESH_TOKEN_KEY);
      if (refreshTok) {
        fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refreshTok }),
        }).catch(() => {});
      }
    } catch { /* non-blocking */ }
    await AsyncStorage.multiRemove([STORAGE_USER_KEY, STORAGE_TOKEN_KEY, STORAGE_REFRESH_TOKEN_KEY]);
    setUser(null);
    setToken(null);
  }, []);

  // Call this when any API returns 401 — silently gets a new access token
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    try {
      const refreshTok = await AsyncStorage.getItem(STORAGE_REFRESH_TOKEN_KEY);
      if (!refreshTok) return false;
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshTok }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      await AsyncStorage.setItem(STORAGE_TOKEN_KEY, data.access);
      setToken(data.access);
      return true;
    } catch { return false; }
  }, []);

  const refreshUserFromServer = useCallback(async () => {
    try {
      const tok = await AsyncStorage.getItem(STORAGE_TOKEN_KEY);
      if (!tok) return;
      const data: any = await apiRequest('/auth/me', { token: tok });
      const updated: User = {
        id:             data.id,
        email:          data.email,
        fullName:       data.full_name || data.fullName,
        university:     (data.university || 'una') as University,
        faculty:        (data.faculty    || 'sciences') as Faculty,
        year:           data.year || 1,
        role:           data.role as UserRole,
        language:       Language.Arabic,
        isVerified:     data.is_verified ?? false,
        totalUploads:   data.total_uploads   || 0,
        totalDownloads: data.total_downloads || 0,
        createdAt:      data.created_at || new Date().toISOString(),
        xp:             data.xp          || 0,
        level:          data.level        || 1,
        streakDays:     data.streak_days  || 0,
      };
      await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updated));
      setUser(updated);
    } catch { /* silently ignore */ }
  }, []);

  const updateUser = useCallback(async (partial: Partial<User>) => {
    if (!user || !token) return;
    // Persist to API
    const body: Record<string, unknown> = {};
    if (partial.fullName)   body.fullName   = partial.fullName;
    if (partial.university) body.university = partial.university;
    if (partial.faculty)    body.faculty    = partial.faculty;
    if (partial.year)       body.year       = partial.year;

    if (Object.keys(body).length > 0) {
      await apiRequest('/auth/me', { method: 'PUT', token, body });
    }
    const updated = { ...user, ...partial };
    await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updated));
    setUser(updated);
  }, [user, token]);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(STORAGE_ONBOARDED_KEY, 'true');
    setIsOnboarded(true);
  }, []);

  const contextValue = useMemo<AuthContextValue>(() => ({
    user, token,
    isAuthenticated: !!user,
    isOnboarded,
    isLoading,
    login, register, logout, updateUser, completeOnboarding, refreshAccessToken, refreshUserFromServer,
  }), [user, token, isOnboarded, isLoading, login, register, logout, updateUser, completeOnboarding, refreshAccessToken, refreshUserFromServer]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
