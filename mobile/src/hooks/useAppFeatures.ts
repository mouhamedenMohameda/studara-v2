import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../utils/api';
import { queryKeys } from '../utils/queryKeys';
import { useAuth } from '../context/AuthContext';

type AppFeatureRow = { key: string; is_active: boolean };

export function useAppFeatures() {
  const { token } = useAuth();

  const q = useQuery({
    queryKey: queryKeys.billingAppFeatures(),
    queryFn: () => apiRequest<AppFeatureRow[]>('/billing/app-features', { token: token! }),
    enabled: !!token,
    staleTime: 0,
    placeholderData: (prev) => prev,
    // Ensure toggles done in the admin panel show up quickly on mobile.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const activeByKey = useMemo<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const r of Array.isArray(q.data) ? q.data : []) {
      map[String((r as any).key)] = !!(r as any).is_active;
    }
    return map;
  }, [q.data]);

  const isEnabled = (key: string, defaultValue: boolean) =>
    (activeByKey[key] ?? defaultValue) === true;

  return {
    ...q,
    activeByKey,
    isEnabled,
  };
}

