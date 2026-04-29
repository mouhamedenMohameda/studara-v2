import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on 4xx — those are app-level errors, not transient
      retry: (failureCount, error: any) => {
        if (error?.status >= 400 && error?.status < 500) return false;
        return failureCount < 2;
      },
      // Data is fresh for 60 s; stale data stays in cache for 5 min
      staleTime:  60_000,
      gcTime: 5 * 60_000,
    },
    mutations: {
      retry: false,
    },
  },
});

export default queryClient;
