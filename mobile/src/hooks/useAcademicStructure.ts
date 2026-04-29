/**
 * useAcademicStructure
 * Fetches the full university → faculty → filière hierarchy from the API.
 * Falls back to AsyncStorage cache for offline use.
 * Falls back to the static hardcoded data if both fail.
 */

import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACADEMIC_STRUCTURE, UniversityNode, FacultyOrInstitut, Filiere } from '../constants/academicStructure';
import { API_BASE } from '../utils/api';

const CACHE_KEY = 'academic_structure_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

async function fetchAndCache(): Promise<UniversityNode[]> {
  const res = await fetch(`${API_BASE}/academic-structure`, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const data: UniversityNode[] = json.data;
  // Persist with timestamp
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })).catch(() => {});
  return data;
}

async function loadFromCache(): Promise<UniversityNode[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null; // stale
    return data as UniversityNode[];
  } catch {
    return null;
  }
}

async function queryFn(): Promise<UniversityNode[]> {
  try {
    return await fetchAndCache();
  } catch {
    // Network failed → try cache (even stale)
    const cached = await AsyncStorage.getItem(CACHE_KEY).then(r => r ? JSON.parse(r).data : null).catch(() => null);
    if (cached) return cached as UniversityNode[];
    // Last resort: return the hardcoded static data
    return ACADEMIC_STRUCTURE;
  }
}

export function useAcademicStructure() {
  const query = useQuery<UniversityNode[]>({
    queryKey: ['academic-structure'],
    queryFn,
    staleTime: CACHE_TTL,
    gcTime: CACHE_TTL * 2,
    // Seed from AsyncStorage while the network request is in-flight
    placeholderData: () => {
      // This runs synchronously; we can't await here, so we start with static data
      return ACADEMIC_STRUCTURE;
    },
  });

  const structure = query.data ?? ACADEMIC_STRUCTURE;

  /** Find a university by slug */
  const getUniversity = (uSlug: string): UniversityNode | undefined =>
    structure.find(u => u.slug === uSlug);

  /** Find a faculty/institut by university slug + faculty slug */
  const getFacultyOrInstitut = (uSlug: string, fSlug: string): FacultyOrInstitut | undefined =>
    getUniversity(uSlug)?.faculties.find(f => f.slug === fSlug);

  /** Find a filière by all three slugs */
  const getFiliere = (uSlug: string, fSlug: string, filSlug: string): Filiere | undefined =>
    getFacultyOrInstitut(uSlug, fSlug)?.filieres.find(fi => fi.slug === filSlug);

  return {
    structure,
    isLoading: query.isLoading,
    getUniversity,
    getFacultyOrInstitut,
    getFiliere,
  };
}
