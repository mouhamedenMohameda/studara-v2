/**
 * Bornes dynamiques pour le nombre de flashcards Whisper Studio selon la longueur réelle du transcript.
 * Déterministe — aucun appel modèle avant la sélection utilisateur.
 */

/** Plancher/logique commune avec le slicing côté API */
export const WHISPER_FLASHCARD_HARD_MAX = 60;

/** Environ une carte pour ~22 mots de transcript (majorant raisonnable) */
const WORDS_PER_CARD_UPPER = 22;
/** Une carte « représente » au moins ~90 mots de matière (= minimum plausible par carte pour un long cours) */
const WORDS_PER_CARD_LOWER = 90;

export function countTranscriptWords(transcript: string): number {
  const t = transcript.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function clampIntLocal(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export interface FlashcardBoundsPayload {
  min: number;
  max: number;
  word_count: number;
  default_count: number;
}

export function flashcardBoundsFromTranscript(transcript: string): FlashcardBoundsPayload {
  const word_count = countTranscriptWords(transcript);
  if (word_count === 0) {
    const v = { min: 1, max: 1, word_count: 0, default_count: 1 };
    return v;
  }

  const max = clampIntLocal(
    Math.ceil(word_count / WORDS_PER_CARD_UPPER),
    1,
    WHISPER_FLASHCARD_HARD_MAX,
  );

  const minLoose = Math.max(1, Math.floor(word_count / WORDS_PER_CARD_LOWER));
  const min = Math.min(max, minLoose);

  const mid = clampIntLocal(Math.round((min + max) / 2), min, max);
  const default_count = mid;

  return { min, max, word_count, default_count };
}

/** À fusionner avec une ligne renvoyée par la DB lorsque transcript + statut prêts pour l’amélioration IA */
export function attachFlashcardBoundsToVoiceNote(note: Record<string, unknown>): Record<string, unknown> {
  const t = note.transcript != null ? String(note.transcript) : '';
  if (!t.trim() || note.status !== 'done') return note;
  return { ...note, flashcard_bounds: flashcardBoundsFromTranscript(t) };
}
