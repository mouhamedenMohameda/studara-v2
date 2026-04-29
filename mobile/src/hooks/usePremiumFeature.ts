/**
 * usePremiumFeature — hook to check if the current user has access
 * to a specific premium feature.
 *
 * PAYG model: each feature has an independent MRU wallet.
 * Access = balance_mru > 0.
 *
 * Usage:
 *   const { hasAccess, loading, balanceMru } = usePremiumFeature('whisper_studio');
 *
 *   if (!hasAccess) → show lock / redirect to PremiumRequest screen
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../utils/api';
import { AppState } from 'react-native';

export interface PremiumFeatureState {
  hasAccess:        boolean;
  /** Accès via abonnement catalogue (réponse API `includedInCatalogPlan`). */
  includedInCatalogPlan: boolean;
  loading:          boolean;
  balanceMru:       number;
  totalSpentMru:    number;
  totalToppedUpMru: number;
  refetch:          () => void;
  lastUpdated:      Date | null;
}

export function usePremiumFeature(featureKey: string, autoRefreshInterval?: number): PremiumFeatureState {
  const { token, user } = useAuth();
  const [hasAccess,        setHasAccess]        = useState(false);
  const [includedInCatalogPlan, setIncludedInCatalogPlan] = useState(false);
  const [loading,          setLoading]          = useState(true);
  const [balanceMru,       setBalanceMru]       = useState(0);
  const [totalSpentMru,    setTotalSpentMru]    = useState(0);
  const [totalToppedUpMru, setTotalToppedUpMru] = useState(0);
  const [lastUpdated,      setLastUpdated]      = useState<Date | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Admins/moderators always have access — no need to call API
  const isAdmin = user?.role === 'admin' || user?.role === 'moderator';

  const check = useCallback(async (silent = false) => {
    if (!token || !featureKey) return;

    if (isAdmin) {
      setHasAccess(true);
      setIncludedInCatalogPlan(false);
      setLoading(false);
      setBalanceMru(999999);
      setLastUpdated(new Date());
      return;
    }

    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/billing/features/${featureKey}/access`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as {
        hasAccess: boolean;
        balanceMru: number;
        totalSpentMru: number;
        totalToppedUpMru: number;
        includedInCatalogPlan?: boolean;
      };

      setHasAccess(data.hasAccess ?? false);
      setIncludedInCatalogPlan(Boolean(data.includedInCatalogPlan));
      setBalanceMru(data.balanceMru ?? 0);
      setTotalSpentMru(data.totalSpentMru ?? 0);
      setTotalToppedUpMru(data.totalToppedUpMru ?? 0);
      setLastUpdated(new Date());
    } catch {
      setHasAccess(false);
      setIncludedInCatalogPlan(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, featureKey, isAdmin]);

  // Configuration de l'auto-refresh
  useEffect(() => {
    if (autoRefreshInterval && autoRefreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        check(true); // silent refresh
      }, autoRefreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [check, autoRefreshInterval]);

  // Écouter les changements d'état de l'app (retour au premier plan)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        // Rafraîchir les données quand l'app revient au premier plan
        check(true);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [check]);

  useEffect(() => { check(); }, [check]);

  return {
    hasAccess,
    includedInCatalogPlan,
    loading,
    balanceMru,
    totalSpentMru,
    totalToppedUpMru,
    refetch: check,
    lastUpdated,
  };
}
