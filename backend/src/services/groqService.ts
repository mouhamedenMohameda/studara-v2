/**
 * groqService.ts — Whisper Studio backend (Groq edition)
 *
 * Two public functions:
 *   1. transcribeAudio()   — Groq Whisper large-v3 (free, ~real-time)
 *   2. enhanceTranscript() — Groq LLaMA-3.3-70B for summary / rewrite / flashcards
 *
 * Audio pipeline (handles any file size / format):
 *   input ≤ 24 MB                                     → send as-is
 *   input >  24 MB                                    → ffmpeg compress to
 *                                                        48 kbps mp3 16 kHz mono
 *   compressed file still > 24 MB (very long audio)   → ffmpeg segment into
 *                                                        20-min mp3 chunks,
 *                                                        transcribe sequentially,
 *                                                        concatenate transcripts
 *
 * Why this exists: Groq's `/audio/transcriptions` endpoint rejects any file
 * above 25 MB with HTTP 413. Before this pipeline, `groq-whisper` silently
 * failed on every lecture-length upload. The compression below (48 kbps mono
 * mp3) handles ~65 min of speech under 24 MB; the chunker handles the rest.
 *
 * Required env (either of these works, preference order):
 *   WHISPER_GROQ_API_KEY   — dedicated Whisper Studio key
 *   GROQ_API_KEY           — legacy fallback
 *
 * Même ordre pour les routes `ai.ts` (résumé cours, scan-deck, chat fallback) :
 * voir `resolveGroqApiKey()`.
 */

import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

const GROQ_BASE        = 'https://api.groq.com/openai/v1';
// Groq's hard limit is 25 MB; we stay a bit below to account for the multipart
// overhead added by FormData (typically ~1 KB, but ~0.1 MB on big files).
const SAFE_MAX_BYTES   = 24 * 1024 * 1024;
const CHUNK_SECONDS    = 20 * 60;     // 20-min mp3 chunks for lecture-length audio
// libmp3lame 48 kbps @ 16 kHz mono ≈ 6 kB/s → 24 MB fits ~65 min of speech,
// which is enough for most single-class recordings. Quality is more than
// sufficient for Whisper (the model is very robust to compression).
const COMPRESS_BITRATE = '48k';

// ─── Types ───────────────────────────────────────────────────────────────────

export type EnhanceMode = 'summary' | 'rewrite' | 'flashcards';

export interface FlashcardPair { front: string; back: string }

export interface EnhanceResult {
  mode: EnhanceMode;
  text?: string;           // for summary / rewrite
  cards?: FlashcardPair[]; // for flashcards
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Signal partagé avec `ai.ts` pour réponses HTTP 503 sans message technique. */
export const MISSING_GROQ_KEY = 'MISSING_GROQ_KEY';

/**
 * Clé Groq unique pour Whisper Studio et pour `ai.ts` (résumé PDF, vision, etc.).
 * Ordre identique à l’historique Whisper : dédiée voix d’abord, puis clé générale.
 */
export function resolveGroqApiKey(): string {
  const key = process.env.WHISPER_GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (!key) {
    const e = new Error(MISSING_GROQ_KEY);
    e.name = 'MissingGroqKey';
    throw e;
  }
  return key;
}

function getKey(): string {
  return resolveGroqApiKey();
}

/** Convert any input to 48 kbps mono 16 kHz mp3 — Groq-friendly, lossy-for-speech. */
async function compressForGroq(inputPath: string, outputPath: string): Promise<void> {
  await execFileP('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', inputPath,
    '-vn',                         // strip any video track (handles mp4 with video)
    '-ac', '1',                    // mono
    '-ar', '16000',                // 16 kHz (Whisper's native rate)
    '-c:a', 'libmp3lame',
    '-b:a', COMPRESS_BITRATE,      // 48 kbps — good speech quality, tiny footprint
    '-y', outputPath,
  ]);
}

/** Split an mp3 into ~CHUNK_SECONDS-long parts (returns sorted absolute paths). */
async function splitIntoMp3Chunks(mp3Path: string, outDir: string): Promise<string[]> {
  const pattern = path.join(outDir, 'chunk_%04d.mp3');
  await execFileP('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', mp3Path,
    '-f', 'segment',
    '-segment_time', String(CHUNK_SECONDS),
    '-reset_timestamps', '1',
    '-c', 'copy',                  // mp3 frames align on ~26 ms → safe to -c copy
    '-y', pattern,
  ]);
  const all = await fsp.readdir(outDir);
  const files = all
    .filter(f => /^chunk_\d{4}\.mp3$/.test(f))
    .sort()
    .map(f => path.join(outDir, f));
  if (files.length === 0) {
    throw new Error('Échec du découpage audio (0 chunks produits)');
  }
  return files;
}

/** Single Groq Whisper call — expects a file already ≤ SAFE_MAX_BYTES. */
async function transcribeSingleFile(
  filePath: string,
  language: 'ar' | 'fr' | null,
  key: string,
): Promise<string> {
  const stat = fs.statSync(filePath);
  if (stat.size > SAFE_MAX_BYTES) {
    // Should never happen if callers preprocess properly; fail loud.
    throw new Error(
      `transcribeSingleFile: file ${path.basename(filePath)} is ` +
      `${(stat.size / 1024 / 1024).toFixed(1)} MB, over the 24 MB safe limit.`,
    );
  }

  const fileBuffer = fs.readFileSync(filePath);
  const mimeByExt: Record<string, string> = {
    '.mp3':  'audio/mpeg',
    '.m4a':  'audio/mp4',
    '.mp4':  'audio/mp4',
    '.wav':  'audio/wav',
    '.webm': 'audio/webm',
    '.ogg':  'audio/ogg',
  };
  const ext = path.extname(filePath).toLowerCase();
  const mime = mimeByExt[ext] ?? 'application/octet-stream';
  const blob = new Blob([fileBuffer], { type: mime });

  const form = new FormData();
  form.append('file', blob, path.basename(filePath));
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'text');
  if (language) form.append('language', language);
  form.append(
    'prompt',
    'Transcription d\'un cours universitaire. '
    + 'Langue : arabe dialectal/standard ou français académique. '
    + 'Vocabulaire : mathématiques, physique, chimie, biologie, médecine, droit, économie. '
    + 'Corriger les mots mal entendus selon le contexte académique. '
    + 'Éviter les répétitions de mots isolés qui semblent être des erreurs audio.',
  );

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq Whisper erreur ${res.status}: ${err.slice(0, 250)}`);
  }

  const text = await res.text();
  return text.trim();
}

// ─── 1. Transcription audio (Whisper) ────────────────────────────────────────

/**
 * Transcribes any audio/video input with Groq Whisper large-v3.
 *
 * Universal: handles m4a, mp4, mp3, wav, webm, ogg, etc., and any size /
 * duration via ffmpeg compression + (if needed) 20-min chunking.
 *
 * @param filePath  Absolute path to the source file.
 * @param language  'ar' | 'fr' | null (null = auto-detect).
 * @returns         Concatenated transcript.
 */
export async function transcribeAudio(
  filePath: string,
  language: 'ar' | 'fr' | null = null,
): Promise<string> {
  const key = getKey();

  // Fast path: file already fits under Groq's limit → no preprocessing.
  const stat = fs.statSync(filePath);
  if (stat.size <= SAFE_MAX_BYTES) {
    return transcribeSingleFile(filePath, language, key);
  }

  // Slow path: compress (and maybe chunk).
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'groq-'));
  const compressedPath = path.join(tmpDir, 'compressed.mp3');

  try {
    try {
      await compressForGroq(filePath, compressedPath);
    } catch (err: any) {
      throw new Error(
        `ffmpeg n'a pas pu compresser le fichier audio: ${err.message ?? err}`,
      );
    }

    const compressedStat = await fsp.stat(compressedPath);
    console.log(
      `[groq] compressed ${(stat.size / 1024 / 1024).toFixed(1)} MB → ` +
      `${(compressedStat.size / 1024 / 1024).toFixed(1)} MB ` +
      `(@${COMPRESS_BITRATE} mono 16 kHz mp3)`,
    );

    // Single compressed file fits → one API call.
    if (compressedStat.size <= SAFE_MAX_BYTES) {
      return transcribeSingleFile(compressedPath, language, key);
    }

    // Still too big (e.g. >80 min @ 48 kbps): chunk into 20-min segments.
    const chunkPaths = await splitIntoMp3Chunks(compressedPath, tmpDir);
    console.log(`[groq] chunking into ${chunkPaths.length} × ~${CHUNK_SECONDS / 60} min segments`);

    // Sequential to respect Groq's per-project rate limits (parallel requests
    // on the free tier hit 429 quickly). For reference, 9 chunks × ~30 s
    // transcription each ≈ 5 min of total wall-clock — acceptable for
    // background transcription of multi-hour uploads.
    const texts: string[] = [];
    for (let i = 0; i < chunkPaths.length; i++) {
      try {
        const t = await transcribeSingleFile(chunkPaths[i], language, key);
        console.log(`[groq] chunk ${i + 1}/${chunkPaths.length} → ${t.length} chars`);
        texts.push(t);
      } catch (err: any) {
        throw new Error(`Chunk ${i + 1}/${chunkPaths.length}: ${err.message ?? err}`);
      }
    }

    const full = texts.map(t => t.trim()).filter(Boolean).join(' ').trim();
    if (!full) {
      throw new Error(
        'Groq n\'a produit aucune transcription (audio peut-être silencieux ou ' +
        'dans une langue non reconnue).',
      );
    }
    return full;
  } finally {
    // Always clean up the temp directory.
    fsp.rm(tmpDir, { recursive: true, force: true }).catch(err =>
      console.warn(`[groq] tmp cleanup failed for ${tmpDir}:`, err.message ?? err),
    );
  }
}

// ─── 2. Amélioration du transcript (LLaMA) ───────────────────────────────────

const ENHANCE_PROMPTS: Record<EnhanceMode, (t: string, s: string) => string> = {

  // ── Résumé : 5 points max, pas d'intro ni conclusion ────────────────────
  summary: (transcript, subject) =>
    `Tu es un assistant pédagogique. Voici la transcription d'un cours sur "${subject}".\n\n`
    + `TRANSCRIPTION :\n"""\n${transcript}\n"""\n\n`
    + `Écris un résumé EN ARABE avec EXACTEMENT ce format :\n`
    + `- 5 points clés maximum (chacun ≤ 2 lignes)\n`
    + `- Commence chaque point par •\n`
    + `- Pas d'introduction, pas de conclusion, pas de titre\n`
    + `- Si un mot semble mal transcrit, utilise le contexte pour le corriger\n`
    + `IMPORTANT : Réponse courte et directe, maximum 200 mots.`,

  // ── Réécriture : corrige les erreurs + structure courte ─────────────────
  rewrite: (transcript, subject) =>
    `Tu es un assistant pédagogique. Voici la transcription BRUTE (avec possibles erreurs) d'un cours sur "${subject}".\n\n`
    + `TRANSCRIPTION BRUTE :\n"""\n${transcript}\n"""\n\n`
    + `Réécris en notes propres et COURTES :\n`
    + `1. CORRIGE tous les mots mal transcrits (erreurs audio, mots hors contexte)\n`
    + `2. Supprime les répétitions, hésitations, et remplissages ("euh", "bon", etc.)\n`
    + `3. Structure en 2-4 sections maximum avec un titre court chacune\n`
    + `4. Garde les formules, définitions et chiffres exacts\n`
    + `5. Langue : arabe si le cours est en arabe, français sinon\n`
    + `IMPORTANT : Maximum 350 mots. Pas de répétitions. Chaque phrase apporte une info nouvelle.`,

  // ── Flashcards : JSON strict ─────────────────────────────────────────────
  flashcards: (transcript, subject) =>
    `Tu es un assistant pédagogique. Transcription d'un cours sur "${subject}" :\n\n`
    + `"""\n${transcript}\n"""\n\n`
    + `Génère 8 à 12 flashcards question/réponse en JSON strict UNIQUEMENT (aucun texte avant/après).\n`
    + `Règles :\n`
    + `- Question : courte (≤ 10 mots), en arabe ou français\n`
    + `- Réponse : concise (≤ 20 mots), factuelle\n`
    + `- Ignore les mots mal transcrits sauf si le contexte les clarifie\n`
    + `Format :\n`
    + `[{"front": "?", "back": "réponse courte"}, ...]`,
};

/**
 * Enhance a transcript with Groq LLaMA-3.3-70B.
 *
 * @param transcript  Text of the transcription.
 * @param mode        'summary' | 'rewrite' | 'flashcards'.
 * @param subject     Subject of the lecture (contextualises the prompt).
 */
export async function enhanceTranscript(
  transcript: string,
  mode: EnhanceMode,
  subject: string = 'cours',
): Promise<EnhanceResult> {
  const key = getKey();

  // LLaMA-3.3-70B has ~128k tokens of context (~100k chars). Stay safely below.
  const safeTranscript = transcript.length > 60_000
    ? transcript.slice(0, 60_000) + '\n\n[...transcription tronquée pour traitement]'
    : transcript;

  const prompt = ENHANCE_PROMPTS[mode](safeTranscript, subject);

  const MAX_TOKENS: Record<EnhanceMode, number> = {
    summary:    900,
    rewrite:   1400,
    flashcards: 2000,
  };

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:       'llama-3.3-70b-versatile',
      messages:    [{ role: 'user', content: prompt }],
      temperature: mode === 'flashcards' ? 0.3 : 0.1,
      max_tokens:  MAX_TOKENS[mode],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq LLaMA erreur ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices[0]?.message?.content?.trim() ?? '';

  if (mode === 'flashcards') {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Réponse LLaMA invalide pour les flashcards (JSON attendu)');
    }
    const cards: FlashcardPair[] = JSON.parse(jsonMatch[0]);
    return { mode, cards };
  }

  return { mode, text: content };
}
