import { Faculty, ResourceType } from '../types';

/**
 * Centralised, type-safe query key factory.
 * Importing this everywhere ensures invalidation targets the right keys.
 */
export const queryKeys = {
  // ── Home ──────────────────────────────────────────────────────────────────
  home: () => ['home', 'summary'] as const,

  // ── Resources ─────────────────────────────────────────────────────────────
  resources: {
    all:            ()                                                => ['resources'] as const,
    list:           (q: string, faculty: Faculty | null, type: ResourceType | null) =>
                      ['resources', 'list', { q, faculty, type }]    as const,
    detail:         (id: string)                                      => ['resources', 'detail', id] as const,
    mySubmissions:  ()                                                => ['resources', 'my-submissions'] as const,
  },

  // ── Reminders ────────────────────────────────────────────────────────────
  reminders: {
    personal: () => ['reminders', 'personal'] as const,
    global:   () => ['reminders', 'global']   as const,
  },

  // ── Flashcards ────────────────────────────────────────────────────────────
  flashcards: {
    decks:   ()           => ['flashcards', 'decks']          as const,
    summary: ()           => ['flashcards', 'summary']        as const,
    cards:   (deckId: string) => ['flashcards', 'cards', deckId] as const,
  },

  // ── Jobs ──────────────────────────────────────────────────────────────────
  jobs: (domain: string, search: string) => ['jobs', { domain, search }] as const,

  // ── Gamification ─────────────────────────────────────────────────────────────
  xp:      ()  => ['xp']     as const,
  badges:  ()  => ['badges'] as const,

  // ── Faculties (public — cached across screens) ────────────────────────────
  faculties: () => ['faculties'] as const,

  // ── Exams ──────────────────────────────────────────────────────────────────
  exams:   ()  => ['exams']  as const,

  // ── Billing ────────────────────────────────────────────────────────────────
  billing: ()  => ['billing', 'status'] as const,
} as const;
