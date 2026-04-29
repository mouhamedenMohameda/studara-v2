import { nanoid } from 'nanoid';
import type { ExerciseCorrection, ExerciseDocument } from './types.js';

// Minimal in-memory store (dev-friendly).
// Replace with Postgres tables in production (see docs/ai-exercise-correction-architecture.md).

export const documents = new Map<string, ExerciseDocument>();
export const corrections = new Map<string, ExerciseCorrection>();

export function newId(prefix: string) {
  return `${prefix}_${nanoid(14)}`;
}

