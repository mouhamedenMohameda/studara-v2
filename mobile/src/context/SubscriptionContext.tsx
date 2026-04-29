/**
 * SubscriptionContext
 *
 * Fetches the user's subscription status from the API and makes it available
 * everywhere in the app via useSubscription().
 *
 * The context is only active when the user is authenticated (handled in
 * AppNavigator by nesting under the auth check).
 */

import React, {
  createContext, useContext, useCallback,
  ReactNode,
  useEffect,
  useRef,
} from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../utils/queryKeys';
import { apiRequest } from '../utils/api';
import { SubscriptionStatus } from '../types';
import { useAuth } from './AuthContext';

interface CatalogSubscriptionSnap {
  status: string;
  planCode: string | null;
  planNameFr: string | null;
  currentPeriodEndAt?: string | null;
  isStaffBypass?: boolean;
}

interface BillingBundle {
  billing: SubscriptionStatus;
  catalog: CatalogSubscriptionSnap | null;
}

function isCatalogSubscriptionActive(c: CatalogSubscriptionSnap | null): boolean {
  if (!c) return false;
  if (c.isStaffBypass) return true;
  return c.status === 'active' || c.status === 'grace';
}

interface SubscriptionContextValue {
  subscription: SubscriptionStatus | null;
  /** Abonnement `user_subscriptions` (catalogue Studara+), si présent. */
  catalogPlanCode: string | null;
  catalogPlanNameFr: string | null;
  isLoading: boolean;
  hasAccess: boolean;
  daysLeft: number;
  status: SubscriptionStatus['status'] | null;
  refetch: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  subscription: null,
  catalogPlanCode: null,
  catalogPlanNameFr: null,
  isLoading: true,
  hasAccess: true,   // optimistic default — avoids flash of paywall
  daysLeft: 7,
  status: null,
  refetch: () => {},
});

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { token, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();
  const lastInvalidateAtRef = useRef<number>(0);

  const { data, isLoading } = useQuery<BillingBundle>({
    queryKey: queryKeys.billing(),
    queryFn: async () => {
      const billing = await apiRequest<SubscriptionStatus>('/billing/status', { token });
      let catalog: CatalogSubscriptionSnap | null = null;
      try {
        catalog = await apiRequest<CatalogSubscriptionSnap>('/me/subscription', { token });
      } catch {
        catalog = null;
      }
      return { billing, catalog };
    },
    enabled: !isAuthLoading && isAuthenticated && !!token,  // attendre la fin du refresh au boot
    staleTime: 60_000,          // refresh at most every 60 s
    retry: 1,
    refetchOnMount: true,
    refetchOnReconnect: true,
    // Tant que l'abonnement catalogue n'est pas actif, on poll doucement pour capter une validation admin
    // sans exiger un redémarrage (stop automatique dès que c'est "active/grace").
    refetchInterval: (query) => {
      const d = query.state.data as BillingBundle | undefined;
      if (!d) return 15_000;
      if ((d.billing?.hasAccess ?? false) || isCatalogSubscriptionActive(d.catalog)) return false;
      return 15_000;
    },
    refetchIntervalInBackground: false,
  });

  const refetch = useCallback(() => {
    // Force immediate refresh for active observers
    queryClient.refetchQueries({ queryKey: queryKeys.billing(), type: 'active' });
  }, [queryClient]);

  // When the app comes back to foreground, refetch billing/subscription automatically.
  // This fixes the common case where admin validates a subscription while the app is open.
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !token) return;

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      // Debounce invalidations (some devices fire multiple "active" events).
      if (now - lastInvalidateAtRef.current < 2_000) return;
      lastInvalidateAtRef.current = now;
      queryClient.refetchQueries({ queryKey: queryKeys.billing(), type: 'active' });
    });

    return () => sub.remove();
  }, [isAuthLoading, isAuthenticated, token, queryClient]);

  const billing = data?.billing ?? null;
  const catalog = data?.catalog ?? null;

  const value: SubscriptionContextValue = {
    subscription: billing,
    catalogPlanCode: catalog?.planCode ?? null,
    catalogPlanNameFr: catalog?.planNameFr ?? null,
    isLoading,
    hasAccess: data
      ? ((billing?.hasAccess ?? false) || isCatalogSubscriptionActive(catalog))
      : true,
    daysLeft:  billing?.daysLeft ?? 7,
    status:    billing?.status ?? null,
    refetch,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);
