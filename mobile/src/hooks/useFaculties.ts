/**
 * useFaculties — shared hook that fetches the active faculty list from the
 * backend DB and falls back to the hardcoded FACULTIES constant if the
 * network is unavailable.
 *
 * Cached for 10 minutes (React Query staleTime) so every screen that calls
 * this hook shares a single request.
 */
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../utils/api';
import { queryKeys } from '../utils/queryKeys';
import { FACULTIES } from '../constants';
import { Faculty } from '../types';

export interface FacultyItem {
  slug: string;
  name_fr: string;
  name_ar: string;
  icon: string;
  sort_order: number;
}

/** Turn the hardcoded constant into the same FacultyItem shape (used as fallback) */
const FALLBACK: FacultyItem[] = (Object.values(Faculty) as Faculty[]).map((k, i) => ({
  slug: k,
  name_fr: FACULTIES[k]?.name   ?? k,
  name_ar: FACULTIES[k]?.nameAr ?? k,
  icon:    FACULTIES[k]?.icon   ?? '🎓',
  sort_order: i + 1,
}));

export function useFaculties(): FacultyItem[] {
  const { data } = useQuery<FacultyItem[]>({
    queryKey: queryKeys.faculties(),
    queryFn:  () => apiRequest<FacultyItem[]>('/faculties'),
    staleTime: 10 * 60 * 1000,
    placeholderData: FALLBACK, // show hardcoded list immediately while loading
  });
  return data ?? FALLBACK;
}
