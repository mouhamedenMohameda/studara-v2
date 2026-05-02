/**
 * whisperService.ts — Whisper Studio backend (OpenAI edition)
 *
 * Transcription provider: OpenAI Audio API
 *   gpt-4o-transcribe         — default, highest quality
 *   gpt-4o-transcribe-diarize — speaker-separated transcription
 *   gpt-4o-mini-transcribe    — lower-cost fallback
 *
 * Enhancement provider: OpenAI Chat Completions
 *   gpt-4o      — default structured-JSON cleanup / summary / course generation
 *   gpt-4o-mini — lower-cost fallback
 *
 * Required env variable:
 *   OPENAI_API_KEY
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { buildWhisperStudioFlashcardPrompt } from './whisperStudioFlashcardPrompt';
import { WHISPER_FLASHCARD_HARD_MAX } from './whisperStudioFlashcardBounds';

// ─── Model constants ──────────────────────────────────────────────────────────

export const TRANSCRIPTION_MODEL_DEFAULT    = 'gpt-4o-transcribe';
export const TRANSCRIPTION_MODEL_DIARIZE    = 'gpt-4o-transcribe'; // same model — diarization enabled via API params
export const TRANSCRIPTION_MODEL_CHEAP      = 'gpt-4o-mini-transcribe';
export const TRANSCRIPTION_MODEL_TIMESTAMPS = 'whisper-1'; // only whisper-1 supports verbose_json + timestamp_granularities

export const ENHANCEMENT_MODEL_DEFAULT    = 'gpt-4o';
export const ENHANCEMENT_MODEL_CHEAP      = 'gpt-4o-mini';

const OPENAI_BASE = 'https://api.openai.com/v1';

// ─── Profit-protection limits (keeps PAYG margin predictable) ────────────────
// Goal: cap worst-case provider spend per “action” (summary/rewrite/flashcards/course)
// by limiting input size + output tokens. Mobile UI should reflect these as “fair use”.
const ENHANCE_INPUT_CHARS_MAX_BY_MODEL: Record<string, number> = {
  [ENHANCEMENT_MODEL_DEFAULT]: 20_000,
  [ENHANCEMENT_MODEL_CHEAP]:   25_000,
};
const ENHANCE_OUTPUT_TOKENS_MAX_BY_MODEL: Record<string, number> = {
  [ENHANCEMENT_MODEL_DEFAULT]: 1600,
  [ENHANCEMENT_MODEL_CHEAP]:   1800,
};

const FLASHCARDS_INPUT_CHARS_MAX_BY_MODEL: Record<string, number> = {
  [ENHANCEMENT_MODEL_DEFAULT]: 15_000,
  [ENHANCEMENT_MODEL_CHEAP]:   18_000,
};
const FLASHCARDS_OUTPUT_TOKENS_MAX_BY_MODEL: Record<string, number> = {
  [ENHANCEMENT_MODEL_DEFAULT]: 1400,
  [ENHANCEMENT_MODEL_CHEAP]:   1600,
};

const COURSE_INPUT_CHARS_MAX = 18_000;
const COURSE_WIKI_CHARS_MAX  = 2_500;
const COURSE_OUTPUT_TOKENS_MAX_BY_MODEL: Record<string, number> = {
  [ENHANCEMENT_MODEL_DEFAULT]: 2600,
  [ENHANCEMENT_MODEL_CHEAP]:   2300,
};

function clampInput(text: string, maxChars: number, suffix: string): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + suffix;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type EnhanceMode = 'summary' | 'rewrite' | 'flashcards';

export interface FlashcardPair {
  front: string;
  back: string;
}

/** Structured output from the enhancement model */
export interface EnhancedTranscript {
  clean_transcript:  string;
  summary:           string;
  action_items:      string[];
  key_topics:        string[];
  unclear_segments:  string[];
}

export interface EnhanceResult {
  mode: EnhanceMode;
  /** Raw enhancement JSON (summary / rewrite modes) */
  enhanced?: EnhancedTranscript;
  /** Only for flashcards mode */
  cards?: FlashcardPair[];
}

export interface TranscribeOptions {
  language?:       'ar' | 'fr' | null;
  diarize?:        boolean;
  cheap?:          boolean;
  skipPreprocess?: boolean;  // skip ffmpeg; send raw file directly (for short finalized M4A chunks)
  subject?:        string;   // matière (ex: "Thermodynamique", "Droit civil") — enrichit le prompt
  timestamps?:     boolean;  // annotate transcript by minute: "01: ...", "02: ..."
}

// Internal type for verbose_json response from OpenAI
interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}
interface WhisperVerboseResponse {
  text: string;
  segments: WhisperSegment[];
}

export interface EnhanceOptions {
  cheap?:   boolean;
  subject?: string;
  limits?: {
    /** Max transcript characters sent to the model */
    inputCharsMax?: number;
    /** Max output tokens requested from the model */
    outputTokensMax?: number;
    /** For course generation: max Wikipedia/context chars appended */
    wikiCharsMax?: number;
    /** Whisper Studio flashcards — nombre demandé par l’utilisateur (validé route) */
    flashcardCount?: number;
    /** Langue exclusive des recto/verso (alignée sur la note) */
    deckLanguage?: 'ar' | 'fr';
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getKey(): string {
  // Prefer WHISPER_OPENAI_API_KEY (dedicated to voice transcription/enhancement).
  // Fallback to OPENAI_API_KEY so existing deployments keep working unchanged.
  const key = process.env.WHISPER_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('WHISPER_OPENAI_API_KEY (or OPENAI_API_KEY) is not configured in environment variables');
  return key;
}

function pickTranscriptionModel(opts: TranscribeOptions): string {
  if (opts.cheap)   return TRANSCRIPTION_MODEL_CHEAP;
  if (opts.diarize) return TRANSCRIPTION_MODEL_DIARIZE;
  return TRANSCRIPTION_MODEL_DEFAULT;
}

function pickEnhancementModel(opts: EnhanceOptions): string {
  return opts.cheap ? ENHANCEMENT_MODEL_CHEAP : ENHANCEMENT_MODEL_DEFAULT;
}

// ─── Enhancement system prompt ────────────────────────────────────────────────

const ENHANCEMENT_SYSTEM_PROMPT = `You are a conservative multilingual ASR cleanup engine.

Your job is to improve a raw transcript WITHOUT inventing missing content.

Rules:
- Preserve meaning exactly.
- Correct only highly likely ASR mistakes.
- Preserve the original language of each passage exactly as spoken.
- Preserve code-switching exactly (Arabic/French/English/Hassaniya may alternate).
- Do NOT translate.
- Do NOT paraphrase.
- Do NOT add explanations.
- Do NOT complete unfinished sentences.
- Preserve names, acronyms, formulas, dates, numbers, units, brands, and domain-specific terms exactly unless the correction is obvious.
- If a segment is uncertain, keep the safest readable version in clean_transcript and also include the doubtful fragment in unclear_segments.
- If there are no explicit action items, return an empty array for action_items.
- key_topics must be short grounded phrases taken from the transcript content.
- summary must stay concise and only reflect content clearly present in the transcript.

Return JSON only with exactly these keys:
{
  "clean_transcript": string,
  "summary": string,
  "action_items": string[],
  "key_topics": string[],
  "unclear_segments": string[]
}`;

// ─── 1. Transcription ─────────────────────────────────────────────────────────

/**
 * Known Whisper hallucination phrases generated on silence / low-audio segments.
 * These are regex patterns (case-insensitive). Any sentence fully matching one is dropped.
 */
const HALLUCINATION_PATTERNS: RegExp[] = [
  // Generic subtitle credits
  /sous-titres?\s+(réalisés?|faits?|traduits?)\s+(par|pour)/i,
  /subtitles?\s+(by|made\s+by|created\s+by)/i,
  /transcri(bed|pt)\s+by/i,
  /amara\.org/i,
  /dotsub\.com/i,
  /sous-titrage\s+bénévole/i,
  // Music / sound tokens
  /^[♪♫🎵🎶\s]+$/u,
  /\[music\]/i,
  /\[musique\]/i,
  /\[applaudissements?\]/i,
  /\[applause\]/i,
  /\[silence\]/i,
  /\[bruit\]/i,
  /\[noise\]/i,
  /\[inaudible\]/i,
  // Common silence hallucinations in Arabic/French
  /^merci\s+(d['']avoir|de\s+votre)\s+(regardé|regarder|écouté|attention)\.?$/i,
  /^شكراً?\s+لكم[\s.]*$/,
  /^شكراً?\s+على\s+المشاهدة[\s.]*$/i,
  /^بسم\s+الله\s+الرحمن\s+الرحيم[\s.]*$/,                   // only when standalone (no real content follows)
  /^الحمد\s+لله[\s.]*$/,
  /^اللهم\s+صل\s+على[\s.]*$/,
  /^صلى\s+الله\s+عليه\s+وسلم[\s.]*$/,
  /^سبحان\s+الله[\s.]*$/,
  // "Thank you for watching" variants
  /^(merci|thank\s+you|gracias|شكرا)\b.*\b(watch|regard|مشاهد)/i,
  // Dots / ellipsis only
  /^[.\s…]+$/,
  // Single word or very short noise
  /^.{1,3}$/,
  // Former prompt example phrases that Whisper reproduces verbatim
  /rappelons que la propri[eé]t[eé] fondamentale/i,
  /comme on l['']a vu pr[eé]c[eé]demment/i,
  /par cons[eé]quent\.?$/i,
  /professeur.*est-ce que vous pouvez/i,
  /quelle est la diff[eé]rence entre les deux notions/i,
  /كما رأينا في الدرس السابق/,
  /لنطبّق هذه القاعدة على مثال/,
  /الخلاصة أن/,
  /هل يمكنك توضيح هذه النقطة/,
  /ما الفرق بين المفهومين/,
];

/**
 * Filter out known Whisper hallucination phrases (generated on silence).
 * Splits text into sentences, removes any that match a known pattern.
 */
function filterWhisperHallucinations(text: string): string {
  // Split on sentence boundaries, preserving the delimiter
  const sentences = text.split(/(?<=[.!?؟\n])\s*/);
  const cleaned = sentences.filter(sentence => {
    const s = sentence.trim();
    if (!s) return false;
    for (const pat of HALLUCINATION_PATTERNS) {
      if (pat.test(s)) {
        console.log(`[whisper/hallucination-filter] Removed: "${s.substring(0, 80)}"`);
        return false;
      }
    }
    return true;
  });
  return cleaned.join(' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Remove excessive repetitions from transcript (fixes Whisper hallucination bug).
 * Only removes if same sentence repeats 3+ times in a row (definitely hallucination).
 * Normal repetitions (prof explaining) are preserved.
 */
function removeExcessiveRepetitions(text: string): string {
  const sentences = text.split(/(?<=[.!?؟])\s+/);
  const result: string[] = [];
  const recentSentences: string[] = [];

  for (const sentence of sentences) {
    // Normalize for comparison
    const normalized = sentence
      .toLowerCase()
      .replace(/[.,!?؟;:\s]+/g, ' ')
      .trim();
    
    if (!normalized) continue;

    // Track last 3 sentences
    recentSentences.push(normalized);
    if (recentSentences.length > 3) recentSentences.shift();

    // If last 3 sentences are identical = hallucination, skip this one
    if (recentSentences.length === 3 && 
        recentSentences[0] === recentSentences[1] && 
        recentSentences[1] === recentSentences[2]) {
      console.log(`[whisper/dedup] Hallucination detected: ${sentence.substring(0, 60)}...`);
      continue;
    }
    
    result.push(sentence);
  }

  return result.join(' ');
}

/**
 * Group Whisper segments (with timestamps) by minute and format as:
 *   "01: texte de la première minute"
 *   "02: texte de la deuxième minute"
 *   ...
 * offsetSeconds: for chunked files, seconds already elapsed before this chunk.
 */
function formatByMinute(segments: WhisperSegment[], offsetSeconds = 0): string {
  const byMinute: Map<number, string[]> = new Map();

  for (const seg of segments) {
    const absoluteStart = seg.start + offsetSeconds;
    const minute = Math.floor(absoluteStart / 60) + 1; // 1-based
    if (!byMinute.has(minute)) byMinute.set(minute, []);
    byMinute.get(minute)!.push(seg.text.trim());
  }

  const lines: string[] = [];
  // Sort by minute number
  const sortedMinutes = [...byMinute.keys()].sort((a, b) => a - b);
  for (const minute of sortedMinutes) {
    const label = String(minute).padStart(2, '0');
    const text  = byMinute.get(minute)!.join(' ').replace(/\s+/g, ' ').trim();
    if (text) lines.push(`${label}: ${text}`);
  }

  return lines.join('\n');
}

/**
 * Pre-process audio with ffmpeg → always outputs a valid mp3 that OpenAI accepts.
 *
 * Pipeline (3 levels of fallback):
 *
 * Level 1 — Full enhancement (captures very faint sounds):
 *   highpass=f=80          → supprime grondements basses fréquences (bruit de pièce)
 *   afftdn=nf=-30:nt=w     → réduction de bruit spectral aggressive (plancher -30dB, bruit blanc)
 *   acompressor            → compresseur dynamique : remonte les sons faibles, seuil bas (-55dB),
 *                            ratio 6:1, makeup +15dB → voix murmurée devient audible
 *   loudnorm=I=-16:TP=-1.5 → normalisation EBU R128 (standard broadcast) → niveau cible -16 LUFS
 *
 * Level 2 — Basic loudness fix (si le denoiser échoue) :
 *   acompressor + loudnorm uniquement
 *
 * Level 3 — Conversion mp3 brute (si ffmpeg partiel défaillant)
 *
 * Level 4 — Fichier original (si ffmpeg absent)
 */
function preprocessAudio(inputPath: string): string {
  const outPath = path.join(os.tmpdir(), `pre_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

  // ── Level 1 : débruitage + amplification sons faibles + normalisation ─────────
  try {
    execSync(
      `ffmpeg -i "${inputPath}" `
      // 1) Supprime grondements < 80 Hz (bruit de table, ventilation)
      + `-af "highpass=f=80,`
      // 2) Réduction de bruit spectrale : plancher -30 dB, adapté au bruit blanc de pièce
      + `afftdn=nf=-30:nt=w,`
      // 3) Compresseur : remonte les murmures et sons très faibles
      //    threshold=-55dB → s'active même sur voix très faible
      //    ratio=6         → compression forte pour homogénéiser
      //    attack=50ms     → réaction rapide sur consonnes
      //    release=400ms   → relâchement naturel
      //    makeup=15dB     → gain de compensation (x5.6) — c'est le clé pour sons faibles
      + `acompressor=threshold=-55dB:ratio=6:attack=50:release=400:makeup=15dB,`
      // 4) Normalisation EBU R128 : cible -16 LUFS, true peak -1.5 dBTP
      + `loudnorm=I=-16:TP=-1.5:LRA=11" `
      + `-ar 16000 -ac 1 -c:a libmp3lame -q:a 2 "${outPath}" -y`,
      { timeout: 300_000, stdio: 'pipe' },
    );
    const outSize = fs.statSync(outPath).size;
    if (outSize < 1024) throw new Error(`output too small: ${outSize} bytes`);
    console.log(`[whisper/preprocess] full pipeline → ${(outSize / 1024).toFixed(0)} KB`);
    return outPath;
  } catch (e1: any) {
    console.warn('[whisper/preprocess] full pipeline failed, trying loudness-only:', e1.message?.slice(0, 80));
  }

  // ── Level 2 : amplification + normalisation sans débruitage ──────────────────
  try {
    execSync(
      `ffmpeg -i "${inputPath}" `
      + `-af "acompressor=threshold=-55dB:ratio=6:attack=50:release=400:makeup=15dB,`
      + `loudnorm=I=-16:TP=-1.5:LRA=11" `
      + `-ar 16000 -ac 1 -c:a libmp3lame -q:a 2 "${outPath}" -y`,
      { timeout: 300_000, stdio: 'pipe' },
    );
    const outSize = fs.statSync(outPath).size;
    if (outSize < 1024) throw new Error(`loudness-only too small: ${outSize} bytes`);
    console.log(`[whisper/preprocess] loudness-only → ${(outSize / 1024).toFixed(0)} KB`);
    return outPath;
  } catch (e2: any) {
    console.warn('[whisper/preprocess] loudness-only failed, trying basic mp3:', e2.message?.slice(0, 80));
  }

  // ── Level 3 : conversion mp3 brute (format valide pour OpenAI, sans filtres) ──
  try {
    execSync(
      `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a libmp3lame -q:a 2 "${outPath}" -y`,
      { timeout: 300_000, stdio: 'pipe' },
    );
    const outSize = fs.statSync(outPath).size;
    if (outSize < 1024) throw new Error(`basic convert too small: ${outSize} bytes`);
    console.log(`[whisper/preprocess] basic mp3 → ${(outSize / 1024).toFixed(0)} KB`);
    return outPath;
  } catch (e3: any) {
    console.warn('[whisper/preprocess] all ffmpeg levels failed — sending original:', e3.message?.slice(0, 80));
    try { fs.unlinkSync(outPath); } catch {}
    return inputPath;
  }
}

/**
 * Transcribes an audio file using OpenAI's gpt-4o-transcribe family.
 * Automatically preprocesses audio (normalize + denoise) and splits large files.
 *
 * @param filePath  Absolute path to audio file (m4a, mp4, mp3, wav, webm)
 * @param opts      TranscribeOptions — language, diarize, cheap
 * @returns         Raw transcript text
 */
export async function transcribeAudio(
  filePath: string,
  opts: TranscribeOptions = {},
): Promise<string> {
  const key   = getKey();
  const model = pickTranscriptionModel(opts);

  const stat   = fs.statSync(filePath);
  const sizeMB = stat.size / (1024 * 1024);
  console.log(`[whisper/openai] transcribe — model=${model} diarize=${!!opts.diarize} size=${sizeMB.toFixed(2)}MB`);

  // ── Preprocess: normalize loudness + denoise ────────────────────────────────
  // Always preprocess uploaded files to handle poor quality audio (noise, low volume, etc.)
  // Skip ONLY for real-time recording chunks (already optimized by iOS)
  const processedPath = opts.skipPreprocess ? filePath : preprocessAudio(filePath);
  const isTemp = processedPath !== filePath;

  try {
    // Check ORIGINAL file size to decide on chunking (preprocessing can reduce size)
    const shouldChunk = sizeMB > 20; // Lower threshold: 20MB instead of 24MB for safety

    let rawTranscript: string;

    if (shouldChunk) {
      // Large file: split into 20-min segments via ffmpeg
      rawTranscript = await transcribeLargeFile(processedPath, model, opts, key);
    } else if (opts.timestamps) {
      // Single chunk with timestamps: use verbose_json to get segment timings
      const { segments } = await transcribeChunkVerbose(processedPath, model, opts, key);
      rawTranscript = formatByMinute(segments, 0);
    } else {
      rawTranscript = await transcribeChunk(processedPath, model, opts, key);
    }

    // 1. Filter known Whisper hallucination phrases (silence artifacts)
    // 2. Remove excessive repetitions
    // For timestamped output, apply both filters per-line
    if (opts.timestamps) {
      const lines = rawTranscript.split('\n');
      const deduped = lines
        .map(line => {
          const colonIdx = line.indexOf(': ');
          if (colonIdx === -1) return line;
          const label = line.slice(0, colonIdx + 2);
          const text  = removeExcessiveRepetitions(filterWhisperHallucinations(line.slice(colonIdx + 2)));
          return text ? label + text : '';
        })
        .filter(Boolean);
      rawTranscript = deduped.join('\n');
    } else {
      rawTranscript = removeExcessiveRepetitions(filterWhisperHallucinations(rawTranscript));
    }

    if (opts.diarize && rawTranscript.length > 0) {
      return diarizeWithGPT(rawTranscript, key);
    }
    return rawTranscript;
  } finally {
    if (isTemp) { try { fs.unlinkSync(processedPath); } catch {} }
  }
}

/**
 * Split a large audio file into 20-min mp3 chunks using ffmpeg,
 * transcribe each sequentially, join results.
 */
const CHUNK_DURATION_S = 1200; // 20 minutes per chunk

async function transcribeLargeFile(
  filePath: string,
  model: string,
  opts: TranscribeOptions,
  key: string,
): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-chunks-'));
  try {
    const chunkPattern = path.join(tmpDir, 'chunk_%03d.mp3');
    execSync(
      `ffmpeg -i "${filePath}" -f segment -segment_time ${CHUNK_DURATION_S} -c:a libmp3lame -q:a 2 -ar 16000 -ac 1 "${chunkPattern}" -y`,
      { timeout: 300_000 },
    );
    const chunkFiles = fs.readdirSync(tmpDir)
      .filter(f => f.endsWith('.mp3'))
      .sort()
      .map(f => path.join(tmpDir, f));

    console.log(`[whisper/split] ${chunkFiles.length} chunks from ${path.basename(filePath)}`);

    if (opts.timestamps) {
      // Timestamps mode: collect all segments with correct absolute offsets
      const allSegments: WhisperSegment[] = [];
      for (let i = 0; i < chunkFiles.length; i++) {
        const chunk = chunkFiles[i];
        const offsetSeconds = i * CHUNK_DURATION_S;
        console.log(`[whisper/chunk] Timestamped ${i + 1}/${chunkFiles.length}: ${path.basename(chunk)} offset=${offsetSeconds}s`);
        try {
          const chunkOpts = { ...opts, skipPreprocess: true };
          const { segments } = await transcribeChunkVerbose(chunk, model, chunkOpts, key);
          // Shift segment timestamps by chunk offset
          for (const seg of segments) {
            allSegments.push({ start: seg.start + offsetSeconds, end: seg.end + offsetSeconds, text: seg.text });
          }
          console.log(`[whisper/chunk] ${i + 1}/${chunkFiles.length} done — ${segments.length} segments`);
        } catch (e: any) {
          console.error(`[whisper/chunk] ${i + 1}/${chunkFiles.length} FAILED:`, e.message);
          throw e;
        }
      }
      console.log(`[whisper/split] All chunks done — total ${allSegments.length} segments`);
      return formatByMinute(allSegments, 0);
    }

    // Plain text mode (original behaviour)
    const parts: string[] = [];
    for (let i = 0; i < chunkFiles.length; i++) {
      const chunk = chunkFiles[i];
      console.log(`[whisper/chunk] Transcribing ${i + 1}/${chunkFiles.length}: ${path.basename(chunk)}`);
      try {
        const chunkOpts = { ...opts, skipPreprocess: true };
        const text = await transcribeChunk(chunk, model, chunkOpts, key);
        console.log(`[whisper/chunk] ${i + 1}/${chunkFiles.length} done — ${text.length} chars`);
        if (text.trim()) parts.push(text.trim());
      } catch (e: any) {
        console.error(`[whisper/chunk] ${i + 1}/${chunkFiles.length} FAILED:`, e.message);
        throw e;
      }
    }
    console.log(`[whisper/split] All chunks done — total ${parts.length} parts, ${parts.join(' ').length} chars`);
    return parts.join('\n');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Builds a concise, vocabulary-priming transcription prompt for gpt-4o-transcribe.
 *
 * Design principles:
 *   - No example sentences (Whisper reproduces them verbatim as hallucinations)
 *   - No speaker labels in ASR prompt (handled by diarizeWithGPT separately)
 *   - Short: just language declaration + subject + expected vocabulary
 */
function buildTranscriptionPrompt(opts: TranscribeOptions): string {
  const subj = opts.subject?.trim() || 'cours universitaire';
  const lang = opts.language;

  const subjectVocabFr: Record<string, string> = {
    math:     'théorème, démonstration, intégrale, dérivée, gradient, vecteur, matrice, espace vectoriel, limite, continuité, convergence',
    physique: 'force, énergie cinétique, potentiel électrique, champ magnétique, loi de Newton, thermodynamique, enthalpie, entropie',
    chimie:   'molécule, liaison covalente, oxydoréduction, cinétique chimique, équilibre, pH, solution tampon, stœchiométrie',
    biologie: 'cellule, mitose, méiose, ADN, transcription, traduction, métabolisme, enzyme, homéostasie',
    droit:    'article, jurisprudence, contrat, obligation, responsabilité civile, dommages-intérêts, prescription, recours',
    économie: 'offre, demande, élasticité, PIB, inflation, taux d\'intérêt, marché, monopole, externalité',
    info:     'algorithme, complexité, récursion, structure de données, compilation, processus, mémoire, réseau',
  };

  const subjectVocabAr: Record<string, string> = {
    math:     'النظرية، البرهان، التكامل، الاشتقاق، المصفوفة، الفضاء المتجهي، الحد، الاستمرارية، التقارب',
    physique: 'القوة، الطاقة الحركية، الكمون الكهربائي، المجال المغناطيسي، قانون نيوتن، الديناميكا الحرارية',
    chimie:   'الجزيء، الرابطة التساهمية، الأكسدة والاختزال، الحركية الكيميائية، الاتزان، الرقم الهيدروجيني',
    biologie: 'الخلية، الانقسام، الحمض النووي، النسخ، الترجمة، الأيض، الإنزيم، الاستتباب',
    droit:    'المادة، الاجتهاد القضائي، العقد، الالتزام، المسؤولية المدنية، التعويض، التقادم',
    économie: 'العرض، الطلب، المرونة، الناتج المحلي الإجمالي، التضخم، سعر الفائدة، الاحتكار',
    info:     'الخوارزمية، التعقيد، العودية، بنية البيانات، المترجم، العملية، الذاكرة، الشبكة',
  };

  const subjLower = subj.toLowerCase();
  const matchKey  = Object.keys(subjectVocabFr).find(k => subjLower.includes(k)) ?? '';

  const vocabFr = subjectVocabFr[matchKey] ?? 'définition, propriété, exemple, exercice, démonstration';
  const vocabAr = subjectVocabAr[matchKey] ?? 'تعريف، خاصية، مثال، تمرين، برهان';

  // ── Arabic ─────────────────────────────────────────────────────────────────
  if (lang === 'ar') {
    return [
      `Transcript of a university lecture mainly in Arabic about ${subj}.`,
      `Keep Arabic in Arabic script.`,
      `Preserve numbers, formulas, symbols, abbreviations, and technical terms exactly.`,
      `Expected terms: ${vocabAr}.`,
    ].join(' ');
  }

  // ── French ─────────────────────────────────────────────────────────────────
  if (lang === 'fr') {
    return [
      `Transcription d'un cours universitaire principalement en français sur ${subj}.`,
      `Conserver la ponctuation normale.`,
      `Préserver exactement les nombres, formules, sigles et termes techniques.`,
      `Termes attendus : ${vocabFr}.`,
    ].join(' ');
  }

  // ── Bilingual / Auto (Mauritanian lectures: Arabic ↔ French code-switching) ─
  return [
    `Transcription d'un cours universitaire mauritanien sur ${subj}, avec alternance possible entre arabe et français.`,
    `Conserver chaque passage dans sa langue d'origine, sans traduction.`,
    `Préserver exactement les nombres, formules, sigles et termes techniques.`,
    `Français : ${vocabFr}.`,
    `العربية: ${vocabAr}.`,
  ].join(' ');
}

/** Send one audio file (<24 MB) to OpenAI and return raw text. */
async function transcribeChunk(
  filePath: string,
  model: string,
  opts: TranscribeOptions,
  key: string,
): Promise<string> {
  const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'mp3';
  const mimeMap: Record<string, string> = {
    mp3:  'audio/mpeg',
    m4a:  'audio/mp4',   // OpenAI rejects 'audio/m4a' — must be 'audio/mp4'
    mp4:  'audio/mp4',
    wav:  'audio/wav',
    webm: 'audio/webm',
    ogg:  'audio/ogg',
  };
  const mimeType = mimeMap[ext] ?? 'audio/mpeg';

  const fileBuffer = fs.readFileSync(filePath);
  // Use File (not Blob) — Node.js 20 FormData correctly includes Content-Type for File objects
  const file = new File([fileBuffer], path.basename(filePath), { type: mimeType });

  const form = new FormData();
  form.append('file', file);
  form.append('model', model);
  form.append('response_format', 'text');
  form.append('prompt', buildTranscriptionPrompt(opts));
  if (!opts.diarize && opts.language) form.append('language', opts.language);

  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI transcription error ${res.status}: ${err}`);
  }

  return (await res.text()).trim();
}

/** Same as transcribeChunk but requests verbose_json to get segment timestamps.
 * ALWAYS uses whisper-1 — gpt-4o-transcribe does NOT support verbose_json.
 */
async function transcribeChunkVerbose(
  filePath: string,
  _model: string,  // ignored — must use whisper-1 for verbose_json
  opts: TranscribeOptions,
  key: string,
): Promise<{ text: string; segments: WhisperSegment[] }> {
  const model = TRANSCRIPTION_MODEL_TIMESTAMPS;
  const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'mp3';
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4',
    wav: 'audio/wav',  webm: 'audio/webm', ogg: 'audio/ogg',
  };
  const mimeType = mimeMap[ext] ?? 'audio/mpeg';

  const fileBuffer = fs.readFileSync(filePath);
  const file = new File([fileBuffer], path.basename(filePath), { type: mimeType });

  const form = new FormData();
  form.append('file', file);
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('prompt', buildTranscriptionPrompt(opts));
  if (!opts.diarize && opts.language) form.append('language', opts.language);

  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI transcription error ${res.status}: ${err}`);
  }

  const json = await res.json() as WhisperVerboseResponse;
  return {
    text: json.text?.trim() ?? '',
    segments: Array.isArray(json.segments) ? json.segments : [],
  };
}

/**
 * Takes a raw single-stream transcript and uses GPT-4o to split it by speaker.
 * Returns lines like:
 *   [Intervenant 1] Bonjour, aujourd'hui on parle de...
 *   [Intervenant 2] Professeur, j'ai une question...
 */
async function diarizeWithGPT(transcript: string, key: string): Promise<string> {
  const systemPrompt =
    'You are an expert multilingual speaker diarization system. '
    + 'You receive a raw transcript that may contain multiple speakers, possibly speaking DIFFERENT LANGUAGES (Arabic, French, English, Hassaniya, or any mix). '
    + 'Your task: re-format the transcript so EACH speaking turn is on its own line, '
    + 'prefixed with [Intervenant 1], [Intervenant 2], etc. '
    + 'Rules:\n'
    + '- Identify speaker changes from: questions vs answers, topic shifts, different vocabulary/register/style, clear conversational turn-taking\n'
    + '- A language switch alone is NOT sufficient evidence of a speaker change; the same speaker may switch between Arabic, French, English, or Hassaniya within the same turn\n'
    + '- Do NOT translate anything — preserve every word exactly as transcribed, in its original language\n'
    + '- Do NOT skip or remove any content — every word must appear in the output\n'
    + '- If you cannot determine the speaker, use [Intervenant ?]\n'
    + '- Keep the original language of EACH segment exactly as-is\n'
    + '- Output ONLY the labeled transcript, no commentary, no explanations';

  console.log(`[whisper/diarize] calling GPT-4o to separate speakers — chars=${transcript.length}`);

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: `RAW TRANSCRIPT:\n"""\n${transcript}\n"""` },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    // If GPT-4o fails, return the raw transcript rather than crashing
    console.warn(`[whisper/diarize] GPT-4o failed (${res.status}) — returning raw transcript`);
    return transcript;
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() ?? transcript;
}

// ─── 2. Enhancement ───────────────────────────────────────────────────────────

/**
 * Enhances a raw transcript using gpt-4o (or gpt-4o-mini if cheap=true).
 * Always returns a structured EnhancedTranscript.
 */
export async function enhanceTranscriptStructured(
  transcript: string,
  subject: string,
  opts: EnhanceOptions = {},
): Promise<EnhancedTranscript> {
  const key = getKey();
  const model = pickEnhancementModel(opts);

  const inputCharsMax =
    Math.max(1000, Math.floor(opts.limits?.inputCharsMax ?? (ENHANCE_INPUT_CHARS_MAX_BY_MODEL[model] ?? 20_000)));
  const outputTokensMax =
    Math.max(200, Math.floor(opts.limits?.outputTokensMax ?? (ENHANCE_OUTPUT_TOKENS_MAX_BY_MODEL[model] ?? 1600)));

  const safeTranscript = clampInput(
    transcript,
    inputCharsMax,
    '\n\n[...transcript truncated for processing]',
  );

  const userMessage = `Subject: ${subject || 'lecture'}\n\nRAW TRANSCRIPT:\n"""\n${safeTranscript}\n"""`;

  console.log(`[whisper/openai] enhance — model=${model} chars=${safeTranscript.length}`);

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: ENHANCEMENT_SYSTEM_PROMPT },
        { role: 'user',   content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: outputTokensMax,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI enhancement error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  const raw = data.choices[0]?.message?.content?.trim() ?? '{}';

  let parsed: Partial<EnhancedTranscript>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // If model returns non-JSON despite json_object mode, wrap it gracefully
    parsed = { clean_transcript: raw };
  }

  return {
    clean_transcript:  parsed.clean_transcript  ?? transcript,
    summary:           parsed.summary           ?? '',
    action_items:      Array.isArray(parsed.action_items)     ? parsed.action_items     : [],
    key_topics:        Array.isArray(parsed.key_topics)       ? parsed.key_topics       : [],
    unclear_segments:  Array.isArray(parsed.unclear_segments) ? parsed.unclear_segments : [],
  };
}

// ─── 3. AI Course Generation (Wikipedia-enriched) ────────────────────────────

/**
 * Extracts the specific academic topic and 2-3 key themes from a transcript.
 * Used to build a targeted Wikipedia search even when no subject is explicitly set.
 * Returns { topic, searchQueries } where searchQueries are 1-3 short strings to search.
 *
 * @param transcript  Full or partial transcript text
 * @param subjectHint Optional user-set matière ("biologie", "droit") — used as context
 * @param key         OpenAI API key
 */
async function extractTopicsFromTranscript(
  transcript: string,
  subjectHint: string,
  key: string,
): Promise<{ topic: string; searchQueries: string[] }> {
  const sample = transcript.slice(0, 1200);
  const hintClause = subjectHint
    ? `The recording is from the course "${subjectHint}". `
    : '';
  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ENHANCEMENT_MODEL_CHEAP,
        messages: [
          {
            role: 'system',
            content:
              'You are an academic topic extractor. '
              + hintClause
              + 'Given the start of a university lecture transcript, extract:\n'
              + '1. "topic": the precise specific subject of this recording (3-8 words max, NOT the general course name). '
              + 'Example: if matière=biologie and the prof talks about bones, topic="système osseux os" not "biologie".\n'
              + '2. "queries": array of 1-3 short search strings for Wikipedia (each ≤4 words), '
              + 'covering the main concepts discussed.\n'
              + 'Reply in the SAME LANGUAGE as the transcript (Arabic or French).\n'
              + 'Return ONLY valid JSON: {"topic": "...", "queries": ["...", "..."]}',
          },
          { role: 'user', content: sample },
        ],
        temperature: 0,
        max_tokens: 80,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json() as { choices: { message: { content: string } }[] };
    const parsed = JSON.parse(data.choices[0]?.message?.content ?? '{}') as {
      topic?: string;
      queries?: string[];
    };
    const topic   = parsed.topic?.trim() ?? subjectHint;
    const queries = Array.isArray(parsed.queries) && parsed.queries.length
      ? parsed.queries.map((q: string) => q.trim()).filter(Boolean)
      : [topic];
    return { topic, searchQueries: queries };
  } catch {
    // Fallback: use subject hint as-is
    return { topic: subjectHint, searchQueries: [subjectHint].filter(Boolean) };
  }
}

/**
 * Searches Wikipedia (free, no API key) for a subject and returns up to ~6 KB
 * of extracted article text as context.
 * Tries the target language first, falls back to English.
 */
async function searchWikipedia(query: string, lang: 'fr' | 'ar' | 'en'): Promise<string> {
  const base = `https://${lang}.wikipedia.org/w/api.php`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    // 1. Search for best matching article titles
    const searchRes = await fetch(
      `${base}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`,
      { signal: controller.signal },
    );
    if (!searchRes.ok) return '';

    const searchData = await searchRes.json() as { query?: { search?: { title: string }[] } };
    const titles = (searchData.query?.search ?? []).slice(0, 2).map(r => r.title);
    if (!titles.length) return '';

    // 2. Fetch full extracts (plain text) for those titles
    const titlesParam = titles.map(encodeURIComponent).join('|');
    const extractRes = await fetch(
      `${base}?action=query&prop=extracts&explaintext=true&exsectionformat=plain&titles=${titlesParam}&exlimit=2&format=json&origin=*`,
      { signal: controller.signal },
    );
    if (!extractRes.ok) return '';

    const extractData = await extractRes.json() as { query?: { pages?: Record<string, { title?: string; extract?: string }> } };
    const pages = Object.values(extractData.query?.pages ?? {});

    return pages
      .filter(p => p.extract && p.extract.length > 100)
      .map(p => `### ${p.title}\n${(p.extract ?? '').slice(0, 3500)}`)
      .join('\n\n---\n\n');
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generates a full structured university course from a raw transcript,
 * enriched with Wikipedia context (free — no extra API key needed).
 *
 * Strategy:
 *  1. Detect transcript language (Arabic / French / English)
 *  2. Search Wikipedia for the subject + related topics
 *  3. Send transcript + Wikipedia context to GPT-4o with a carefully crafted prompt
 *  4. The output size mirrors the original: detailed lecture → detailed course, brief → brief
 */
export async function generateCourseFromTranscript(
  transcript: string,
  subject: string,
  opts: EnhanceOptions = {},
): Promise<string> {
  const key   = getKey();
  // Keep quality high when the request is small, but protect margin on long inputs.
  // - If client forces cheap=true → always mini
  // - Otherwise: GPT-4o only for short transcripts; mini for long transcripts
  const model = opts.cheap
    ? ENHANCEMENT_MODEL_CHEAP
    : (transcript.length <= 9_000 ? ENHANCEMENT_MODEL_DEFAULT : ENHANCEMENT_MODEL_CHEAP);

  // ── Always extract the precise topic + search queries from the transcript ───
  // Even when subject is set (e.g. "biologie"), we need the specific topic
  // of THIS recording (e.g. "système osseux") for a relevant Wikipedia search.
  console.log(`[whisper/course] Extracting topics from transcript (hint="${subject}")...`);
  const { topic: resolvedSubject, searchQueries } =
    await extractTopicsFromTranscript(transcript, subject.trim(), key);
  console.log(`[whisper/course] topic="${resolvedSubject}" queries=${JSON.stringify(searchQueries)}`);

  // Detect dominant language
  const arabicChars = (transcript.match(/[\u0600-\u06FF]/g) ?? []).length;
  const totalChars  = transcript.replace(/\s/g, '').length || 1;
  const lang: 'ar' | 'fr' = (arabicChars / totalChars) > 0.25 ? 'ar' : 'fr';

  // Search Wikipedia for each extracted query and merge results
  console.log(`[whisper/course] Wikipedia search (${lang}) — queries: ${searchQueries.join(', ')}`);
  let wikiContext = '';
  try {
    const wikiParts: string[] = [];
    for (const q of searchQueries) {
      if (!q) continue;
      let ctx = await searchWikipedia(q, lang);
      if (ctx.length < 300) {
        const enCtx = await searchWikipedia(q, 'en');
        if (enCtx.length > ctx.length) ctx = enCtx;
      }
      if (ctx) wikiParts.push(ctx);
    }
    wikiContext = wikiParts.join('\n\n---\n\n');
  } catch (e: any) {
    console.warn('[whisper/course] Wikipedia search failed:', e.message);
  }

  const courseInputCharsMax =
    Math.max(2000, Math.floor(opts.limits?.inputCharsMax ?? COURSE_INPUT_CHARS_MAX));
  const wikiCharsMax =
    Math.max(0, Math.floor(opts.limits?.wikiCharsMax ?? COURSE_WIKI_CHARS_MAX));
  const outputTokensMax =
    Math.max(400, Math.floor(opts.limits?.outputTokensMax ?? (COURSE_OUTPUT_TOKENS_MAX_BY_MODEL[model] ?? 2300)));

  const safeTranscript = clampInput(transcript, courseInputCharsMax, '\n\n[...transcription tronquée]');

  // Word count heuristic to calibrate output density
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  const densityHint = wordCount > 3000
    ? 'Le cours source est long et détaillé — le cours généré doit être également long et très détaillé, avec des explications approfondies pour chaque concept.'
    : wordCount > 800
    ? 'Le cours source est de longueur moyenne — conserve le même niveau de détail, ni trop résumé ni trop expansé.'
    : 'Le cours source est bref — reste concis, n\'ajoute pas plus de 30 % de contenu supplémentaire.';

  const densityHintAr = wordCount > 3000
    ? 'المحاضرة المصدر مفصلة جداً — يجب أن يكون الدرس المولّد مفصلاً أيضاً مع شرح معمّق لكل مفهوم.'
    : wordCount > 800
    ? 'المحاضرة المصدر متوسطة الطول — حافظ على نفس مستوى التفصيل.'
    : 'المحاضرة المصدر موجزة — ابقَ موجزاً ولا تضف أكثر من 30% من المحتوى الإضافي.';

  const systemPrompt = lang === 'ar'
    ? `أنت أستاذ جامعي خبير. مهمتك تحويل تفريغات المحاضرات إلى دروس جامعية منظمة وشاملة.
قواعد صارمة:
- ${densityHintAr}
- استخدم ويكيبيديا لتصحيح الأخطاء العلمية وإكمال المعلومات الناقصة بصمت (دون الإشارة لها)
- رتّب المحتوى منطقياً: مقدمة → مفاهيم أساسية → تفصيل → خلاصة
- استخدم عناوين (##) وعناوين فرعية (###) ونقاطاً (-)
- اكتب بالعربية الفصحى الأكاديمية
- لا تخترع معلومات — استند فقط على التفريغ والسياق المقدم`
    : `Tu es un professeur universitaire expert. Ta mission : transformer une transcription de cours en un cours universitaire complet et structuré.
Règles STRICTES :
- ${densityHint}
- Utilise Wikipedia pour corriger silencieusement les erreurs et combler les lacunes (sans le mentionner)
- Structure logique : Introduction → Concepts fondamentaux → Développement → Conclusion/Synthèse
- Utilise des titres (##), sous-titres (###), listes à puces (-), et des exemples concrets
- Rédige en français académique clair et précis
- N'invente aucune information — base-toi UNIQUEMENT sur la transcription et le contexte fourni`;

  const userMessage = [
    `**Matière / Sujet :** ${resolvedSubject || 'Cours universitaire'}`,
    ``,
    `=== TRANSCRIPTION BRUTE ===`,
    safeTranscript,
    wikiContext
      ? `\n=== CONTEXTE ENCYCLOPÉDIQUE (Wikipedia) ===\n${wikiContext.slice(0, wikiCharsMax)}`
      : '',
    ``,
    `=== INSTRUCTION ===`,
    lang === 'ar'
      ? 'اكتب الدرس الجامعي الكامل المنظم بناءً على التفريغ والسياق أعلاه. استخدم تنسيق Markdown.'
      : 'Rédige maintenant le cours universitaire complet et structuré en Markdown, basé sur la transcription et le contexte ci-dessus.',
  ].join('\n');

  console.log(
    `[whisper/course] Generating — model=${model} subject="${resolvedSubject}" transcript=${safeTranscript.length}c wiki=${wikiContext.length}c words≈${wordCount}`,
  );

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      temperature: 0.25,
      max_tokens:  outputTokensMax,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI course generation error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() ?? '';
}

// ─── 4. Legacy EnhanceResult wrapper (keeps route contract stable) ─────────────

/**
 * Backward-compatible enhanceTranscript() wrapper.
 * Routes to structured enhancement for summary/rewrite,
 * and to flashcard generation for flashcards mode.
 */
export async function enhanceTranscript(
  transcript: string,
  mode: EnhanceMode,
  subject: string = 'lecture',
  opts: EnhanceOptions = {},
): Promise<EnhanceResult> {
  if (mode === 'flashcards') {
    const cards = await generateFlashcards(transcript, subject, opts);
    return { mode, cards };
  }

  const enhanced = await enhanceTranscriptStructured(transcript, subject, opts);
  return { mode, enhanced };
}

async function generateFlashcards(
  transcript: string,
  subject: string,
  opts: EnhanceOptions,
): Promise<FlashcardPair[]> {
  const key   = getKey();
  const model = pickEnhancementModel(opts);
  const cardCount = Math.max(
    1,
    Math.min(
      WHISPER_FLASHCARD_HARD_MAX,
      Math.floor(opts.limits?.flashcardCount ?? 10),
    ),
  );
  const deckLang: 'ar' | 'fr' = opts.limits?.deckLanguage === 'ar' ? 'ar' : 'fr';

  const inputCharsMax =
    Math.max(1000, Math.floor(opts.limits?.inputCharsMax ?? (FLASHCARDS_INPUT_CHARS_MAX_BY_MODEL[model] ?? 15_000)));
  const outputTokensMax =
    Math.max(200, Math.floor(opts.limits?.outputTokensMax ?? (FLASHCARDS_OUTPUT_TOKENS_MAX_BY_MODEL[model] ?? 1400)));

  const safeTranscript = clampInput(
    transcript,
    inputCharsMax,
    '\n\n[...truncated]',
  );

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: buildWhisperStudioFlashcardPrompt(safeTranscript, subject, cardCount, deckLang),
      }],
      temperature: 0.3,
      max_tokens: outputTokensMax,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI flashcard error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  const content = data.choices[0]?.message?.content?.trim() ?? '[]';

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Invalid flashcard response (expected JSON array)');

  const raw = JSON.parse(jsonMatch[0]) as FlashcardPair[];
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, Math.min(cardCount, WHISPER_FLASHCARD_HARD_MAX));
}

