/**
 * Typed AsyncStorage wrappers for offline caching.
 *
 * Keys used:
 *   offline:flashcard:decks            — cached deck list
 *   offline:flashcard:cards:{deckId}   — cached due cards per deck
 *   offline:flashcard:reviewQueue      — pending reviews to sync
 *   offline:resources:{cacheKey}       — cached resource list metadata (no files)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashcardDeck, Flashcard, Resource } from '../types';

const PFX = 'offline:';

// ── Generic typed helpers ─────────────────────────────────────────────────────

async function get<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PFX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function set<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PFX + key, JSON.stringify(value));
  } catch {
    /* Storage full or unavailable — silent fail */
  }
}

// ── Flashcard Decks ───────────────────────────────────────────────────────────

interface CachedDecks {
  decks: FlashcardDeck[];
  cachedAt: number;
}

export async function cacheDecks(decks: FlashcardDeck[]): Promise<void> {
  await set<CachedDecks>('flashcard:decks', { decks, cachedAt: Date.now() });
}

export async function getCachedDecks(): Promise<CachedDecks | null> {
  return get<CachedDecks>('flashcard:decks');
}

// ── Flashcard Cards per deck ──────────────────────────────────────────────────

interface CachedCards {
  cards: Flashcard[];
  cachedAt: number;
}

export async function cacheDeckCards(deckId: string, cards: Flashcard[]): Promise<void> {
  await set<CachedCards>(`flashcard:cards:${deckId}`, { cards, cachedAt: Date.now() });
}

export async function getCachedDeckCards(deckId: string): Promise<CachedCards | null> {
  return get<CachedCards>(`flashcard:cards:${deckId}`);
}

// ── Pending Review Queue (offline ratings queued for later sync) ──────────────

export interface PendingReview {
  cardId: string;
  quality: number;
  reviewedAt: string; // ISO
}

export async function enqueuePendingReview(review: PendingReview): Promise<void> {
  const queue = (await get<PendingReview[]>('flashcard:reviewQueue')) ?? [];
  queue.push(review);
  await set('flashcard:reviewQueue', queue);
}

export async function getPendingReviews(): Promise<PendingReview[]> {
  return (await get<PendingReview[]>('flashcard:reviewQueue')) ?? [];
}

/** Replace the queue with only the entries that failed to sync. */
export async function setPendingReviews(queue: PendingReview[]): Promise<void> {
  await set('flashcard:reviewQueue', queue);
}

// ── Resources List Cache (metadata only — no files) ───────────────────────────

/** Reviews older than this are considered stale (shown with a warning). */
const MAX_RESOURCES_AGE_MS = 24 * 60 * 60 * 1000; // 24 h

interface ResourcesCache {
  payload: { data: unknown[]; total: number };
  cachedAt: number;
}

export async function cacheResourcesList(
  cacheKey: string,
  payload: { data: unknown[]; total: number },
): Promise<void> {
  await set<ResourcesCache>(`resources:${cacheKey}`, { payload, cachedAt: Date.now() });
}

export interface CachedResourcesResult {
  data: unknown[];
  total: number;
  cachedAt: number;
  isStale: boolean;
}

export async function getCachedResourcesList(
  cacheKey: string,
): Promise<CachedResourcesResult | null> {
  const cached = await get<ResourcesCache>(`resources:${cacheKey}`);
  if (!cached) return null;
  return {
    ...cached.payload,
    cachedAt: cached.cachedAt,
    isStale: Date.now() - cached.cachedAt > MAX_RESOURCES_AGE_MS,
  };
}

// ── Friendly timestamp helper ─────────────────────────────────────────────────

/** Returns a human-readable "il y a X min / h / jours" string in Arabic. */
export function timeAgoAr(cachedAt: number): string {
  const diffMs = Date.now() - cachedAt;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

// ── Study Streak ──────────────────────────────────────────────────────────────

interface StreakData {
  count: number;
  lastStudyDate: string; // ISO date string YYYY-MM-DD
}

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Streak Freeze ─────────────────────────────────────────────────────────────

interface FreezeData {
  count: number;           // 0 or 1
  lastWeekAwarded: string; // "YYYY-Www"
}

function isoWeek(): string {
  const d = new Date();
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((d.getTime() - startOfYear.getTime()) / 86_400_000 + startOfYear.getDay() + 1) / 7,
  );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Award 1 freeze at the start of each new calendar week (max 1 stored). */
async function ensureWeeklyFreezeAwarded(): Promise<void> {
  const data = (await get<FreezeData>('streakFreeze')) ?? { count: 0, lastWeekAwarded: '' };
  const thisWeek = isoWeek();
  if (data.lastWeekAwarded !== thisWeek) {
    await set<FreezeData>('streakFreeze', {
      count: Math.min(data.count + 1, 1), // cap at 1
      lastWeekAwarded: thisWeek,
    });
  }
}

/** Returns number of available streak freezes (0 or 1). Awards weekly freeze if needed. */
export async function getStreakFreezeCount(): Promise<number> {
  await ensureWeeklyFreezeAwarded();
  const data = (await get<FreezeData>('streakFreeze')) ?? { count: 0, lastWeekAwarded: '' };
  return data.count;
}

/** Consume one freeze. Returns true if a freeze was available and consumed. */
async function consumeStreakFreeze(): Promise<boolean> {
  const data = (await get<FreezeData>('streakFreeze')) ?? { count: 0, lastWeekAwarded: '' };
  if (data.count <= 0) return false;
  await set<FreezeData>('streakFreeze', { ...data, count: 0 });
  return true;
}

// ── Streak Society ────────────────────────────────────────────────────────────

export type StreakTier = 'none' | 'bronze' | 'silver' | 'gold' | 'diamond';

export const STREAK_TIERS: {
  tier: StreakTier;
  min: number;
  emoji: string;
  labelAr: string;
}[] = [
  { tier: 'diamond', min: 365, emoji: '💎', labelAr: 'الماس' },
  { tier: 'gold',    min: 100, emoji: '🥇', labelAr: 'ذهبي' },
  { tier: 'silver',  min: 30,  emoji: '🥈', labelAr: 'فضي' },
  { tier: 'bronze',  min: 7,   emoji: '🥉', labelAr: 'برونزي' },
];

export function getStreakTier(streak: number): StreakTier {
  for (const t of STREAK_TIERS) if (streak >= t.min) return t.tier;
  return 'none';
}

/** Returns the next tier to unlock, or null if already Diamond. */
export function getNextTierTarget(
  streak: number,
): { tier: StreakTier; target: number; emoji: string; labelAr: string } | null {
  const milestones = [7, 30, 100, 365] as const;
  const info = [
    { tier: 'bronze'  as StreakTier, emoji: '🥉', labelAr: 'برونزي' },
    { tier: 'silver'  as StreakTier, emoji: '🥈', labelAr: 'فضي'    },
    { tier: 'gold'    as StreakTier, emoji: '🥇', labelAr: 'ذهبي'   },
    { tier: 'diamond' as StreakTier, emoji: '💎', labelAr: 'الماس'  },
  ];
  for (let i = 0; i < milestones.length; i++) {
    if (streak < milestones[i]) return { ...info[i], target: milestones[i] };
  }
  return null;
}

// ── Streak read / write ───────────────────────────────────────────────────────

/**
 * Returns the current streak count (0 if broken).
 * If user missed exactly 1 day AND has a freeze available → streak is shown as
 * protected (the freeze is consumed only when they actually study via updateStudyStreak).
 */
export async function getStudyStreak(): Promise<number> {
  const data = await get<StreakData>('streak');
  if (!data) return 0;
  const today      = todayISO();
  const yesterday  = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);

  if (data.lastStudyDate === today || data.lastStudyDate === yesterday) return data.count;

  // Missed exactly 1 day: freeze protects the display count
  if (data.lastStudyDate === twoDaysAgo) {
    const freezeCount = await getStreakFreezeCount();
    if (freezeCount > 0) return data.count;
  }
  return 0; // streak broken
}

export interface StreakUpdateResult {
  count: number;
  usedFreeze: boolean;
  isNewTier: boolean;
  tier: StreakTier;
}

/**
 * Call after completing a study session.
 * Auto-consumes a freeze if exactly 1 day was missed.
 * Returns detailed result including tier milestone info.
 */
export async function updateStudyStreak(): Promise<StreakUpdateResult> {
  const data       = await get<StreakData>('streak');
  const today      = todayISO();
  const yesterday  = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);

  const prevTier = getStreakTier(data?.count ?? 0);
  let newCount   = 1;
  let usedFreeze = false;

  if (data) {
    if (data.lastStudyDate === today) {
      return {
        count: data.count,
        usedFreeze: false,
        isNewTier: false,
        tier: getStreakTier(data.count),
      };
    } else if (data.lastStudyDate === yesterday) {
      newCount = data.count + 1;
    } else if (data.lastStudyDate === twoDaysAgo) {
      // Missed exactly 1 day — try to use a freeze
      usedFreeze = await consumeStreakFreeze();
      newCount   = usedFreeze ? data.count + 1 : 1;
    }
    // else: streak broken, reset to 1
  }

  await set<StreakData>('streak', { count: newCount, lastStudyDate: today });

  const newTier   = getStreakTier(newCount);
  const isNewTier = newTier !== prevTier && newTier !== 'none';
  return { count: newCount, usedFreeze, isNewTier, tier: newTier };
}

// ── Session Counter (for Store Review trigger) ────────────────────────────────

export async function trackSessionCompleted(): Promise<number> {
  const count = (await get<number>('sessionsCompleted')) ?? 0;
  const newCount = count + 1;
  await set('sessionsCompleted', newCount);
  return newCount;
}

export async function getSessionsCompleted(): Promise<number> {
  return (await get<number>('sessionsCompleted')) ?? 0;
}

// ── Job Application Tracker ───────────────────────────────────────────────────

export type JobApplicationStatus = 'applied' | 'interview' | 'rejected' | 'offer';

export interface JobApplication {
  jobId: string;
  company: string;
  title: string;
  status: JobApplicationStatus;
  appliedAt: string; // ISO
}

export async function saveJobApplication(app: JobApplication): Promise<void> {
  const all = await getAllJobApplications();
  const idx = all.findIndex(a => a.jobId === app.jobId);
  if (idx >= 0) all[idx] = app;
  else all.push(app);
  await set('jobApplications', all);
}

export async function getJobApplication(jobId: string): Promise<JobApplication | null> {
  const all = await getAllJobApplications();
  return all.find(a => a.jobId === jobId) ?? null;
}

export async function getAllJobApplications(): Promise<JobApplication[]> {
  return (await get<JobApplication[]>('jobApplications')) ?? [];
}

export async function removeJobApplication(jobId: string): Promise<void> {
  const all = await getAllJobApplications();
  await set('jobApplications', all.filter(a => a.jobId !== jobId));
}

// ── Resource Local Ratings ───────────────────────────────────────────────────

export async function saveResourceRating(resourceId: string, rating: number): Promise<void> {
  const all = (await get<Record<string, number>>('resourceRatings')) ?? {};
  all[resourceId] = rating;
  await set('resourceRatings', all);
}

export async function getResourceRating(resourceId: string): Promise<number> {
  const all = (await get<Record<string, number>>('resourceRatings')) ?? {};
  return all[resourceId] ?? 0;
}

// ── Last Jobs Visit (for new-jobs alert) ─────────────────────────────────────

export async function getLastJobsVisit(): Promise<number> {
  return (await get<number>('lastJobsVisit')) ?? 0;
}

export async function setLastJobsVisit(timestamp?: number): Promise<void> {
  await set('lastJobsVisit', timestamp ?? Date.now());
}

// ── Font Scale Preference ────────────────────────────────────────────────────

export type FontScale = 'small' | 'normal' | 'large';

export async function getFontScalePreference(): Promise<FontScale> {
  return (await get<FontScale>('fontScale')) ?? 'normal';
}

export async function setFontScalePreference(scale: FontScale): Promise<void> {
  await set('fontScale', scale);
}

// ── Favourite Faculty / Subject (personalised onboarding) ────────────────────

export async function getFavoriteFaculty(): Promise<string | null> {
  return get<string>('favoriteFaculty');
}

export async function setFavoriteFaculty(faculty: string): Promise<void> {
  await set('favoriteFaculty', faculty);
}

// ── Theme Preference (dark / light / system) ──────────────────────────────────

export type ThemePreference = 'light' | 'dark' | 'system';

export async function getThemePreference(): Promise<ThemePreference> {
  return (await get<ThemePreference>('themePref')) ?? 'system';
}

export async function setThemePreference(pref: ThemePreference): Promise<void> {
  await set('themePref', pref);
}

// ── Daily Study Goal ──────────────────────────────────────────────────────────

export async function getDailyStudyGoal(): Promise<number> {
  return (await get<number>('dailyGoal')) ?? 20;
}

export async function setDailyStudyGoal(goal: number): Promise<void> {
  await set('dailyGoal', goal);
}

const todayDateKey = () => `studiedToday:${todayISO()}`;

export async function getTodayStudiedCount(): Promise<number> {
  return (await get<number>(todayDateKey())) ?? 0;
}

/** Call once per card reviewed. Returns the new total for today. */
export async function incrementTodayStudiedCount(): Promise<number> {
  const key = todayDateKey();
  const count = (await get<number>(key)) ?? 0;
  const next = count + 1;
  await set(key, next);
  return next;
}

/**
 * Returns which of the last 7 days had any study activity.
 * Index 0 = 6 days ago · Index 6 = today.
 */
export async function getLast7DaysActivity(): Promise<boolean[]> {
  const result: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const count = (await get<number>(`studiedToday:${d}`)) ?? 0;
    result.push(count > 0);
  }
  return result;
}

// ── Recently Viewed Resources ─────────────────────────────────────────────────

export type ViewedResource = Resource & { viewedAt: number };

export async function trackResourceView(resource: Resource): Promise<void> {
  const list = (await get<ViewedResource[]>('recentResources')) ?? [];
  const filtered = list.filter(r => r.id !== resource.id);
  filtered.unshift({ ...resource, viewedAt: Date.now() });
  await set('recentResources', filtered.slice(0, 5));
}

export async function getRecentlyViewedResources(): Promise<ViewedResource[]> {
  return (await get<ViewedResource[]>('recentResources')) ?? [];
}

// ── Pomodoro Focus Minutes ─────────────────────────────────────────────────────

/** Add `minutes` to today's focus tally (call after each completed Pomodoro). */
export async function logFocusMinutes(minutes: number): Promise<void> {
  const key = `focusMinutes:${todayISO()}`;
  const current = (await get<number>(key)) ?? 0;
  await set(key, current + minutes);
}

export async function getTodayFocusMinutes(): Promise<number> {
  return (await get<number>(`focusMinutes:${todayISO()}`)) ?? 0;
}

// ── N-day Activity Heatmap ────────────────────────────────────────────────────

/**
 * Returns the last `n` days (oldest first) with cards studied + focus minutes.
 * Combines both data sources so the heatmap shows total study intensity.
 */
export async function getLastNDaysActivity(
  n: number,
): Promise<{ date: string; cards: number; focus: number }[]> {
  const result: { date: string; cards: number; focus: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const cards = (await get<number>(`studiedToday:${date}`)) ?? 0;
    const focus = (await get<number>(`focusMinutes:${date}`)) ?? 0;
    result.push({ date, cards, focus });
  }
  return result;
}

// ── Ghost Mode — best past session per deck ───────────────────────────────────

export interface GhostSession {
  correct: number;
  total:   number;
  pct:     number;   // 0-100
}

/**
 * Save the result of a completed study session if it's the personal best for that deck.
 * Only updates when the new score strictly beats the previous record.
 */
export async function saveBestSession(
  deckId: string,
  correct: number,
  total: number,
): Promise<void> {
  if (total === 0) return;
  const key = `ghost:${deckId}`;
  const prev = await get<GhostSession>(key);
  const newPct = Math.round((correct / total) * 100);
  if (!prev || newPct > prev.pct) {
    await set<GhostSession>(key, { correct, total, pct: newPct });
  }
}

/** Returns the best past session for a deck, or null if none recorded. */
export async function getBestSession(deckId: string): Promise<GhostSession | null> {
  return get<GhostSession>(`ghost:${deckId}`);
}
