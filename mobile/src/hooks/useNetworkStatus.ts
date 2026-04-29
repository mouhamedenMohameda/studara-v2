/**
 * useNetworkStatus — detects connectivity by pinging the API health endpoint.
 *
 * - Checks immediately on mount.
 * - Re-checks every CHECK_INTERVAL_MS (20 s) in the background.
 * - Re-checks immediately when the app comes back to the foreground.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { API_BASE } from '../utils/api';

// Strip /api/v1 suffix to get the base server URL
const HEALTH_URL = API_BASE.replace(/\/api\/v\d+$/, '/health');
const CHECK_INTERVAL_MS = 20_000; // 20 s
const TIMEOUT_MS = 5_000;        // 5 s

async function pingServer(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(HEALTH_URL, { method: 'HEAD', signal: controller.signal });
    clearTimeout(tid);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    const online = await pingServer();
    setIsOnline(online);
  }, []);

  useEffect(() => {
    check();

    intervalRef.current = setInterval(check, CHECK_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') check();
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [check]);

  return { isOnline, recheck: check };
}
