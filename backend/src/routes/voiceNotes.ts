/**
 * voiceNotes.ts — routes /api/v1/voice-notes  (Whisper Studio — OpenAI edition)
 *
 * Pipeline:
 *   POST   /              — upload audio → transcription (gpt-4o-transcribe) → store in DB
 *   GET    /              — list authenticated user's voice notes
 *   GET    /:id           — single note detail
 *   GET    /:id/audio     — stream the original audio file (token via ?t=)
 *   POST   /:id/enhance   — AI enhancement (summary / rewrite / flashcards)
 *   PATCH  /:id           — edit title / transcript
 *   DELETE /:id           — delete (also removes the audio file)
 *
 * POST / extra body fields:
 *   diarize   "true"  → use gpt-4o-transcribe-diarize (speaker separation)
 *   cheap     "true"  → use gpt-4o-mini-transcribe (lower-cost fallback)
 *
 * POST /:id/enhance extra body fields:
 *   cheap     "true"  → use gpt-4o-mini instead of gpt-4o
 */

import { Router, Response, Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { authenticate, AuthRequest } from '../middleware/auth';
import pool from '../db/pool';
import { getFeaturePricing } from '../services/subscriptionService';
import { chargeVoiceStudioUsage } from '../services/voiceEntitlementsBilling';
import {
  transcribeAudio,
  enhanceTranscript,
  enhanceTranscriptStructured,
  generateCourseFromTranscript,
  EnhanceMode,
  EnhancedTranscript,
  TRANSCRIPTION_MODEL_DEFAULT,
  TRANSCRIPTION_MODEL_DIARIZE,
  TRANSCRIPTION_MODEL_CHEAP,
} from '../services/whisperService';
import {
  transcribeAudio as transcribeAudioGroq,
  enhanceTranscript as enhanceTranscriptGroq,
} from '../services/groqService';
import {
  transcribeAudio as transcribeAudioGemini,
  enhanceTranscript as enhanceTranscriptGemini,
} from '../services/geminiService';
import {
  transcribeAudio as transcribeAudioChirp,
} from '../services/chirpService';
import { analyzeTranscriptConfidence } from '../services/transcriptConfidenceHeuristics';

// ─── Supported model identifiers (sent by the mobile app) ────────────────────
const VALID_TRANSCRIPTION_MODELS = [
  'gpt-4o-transcribe',       // OpenAI — highest quality (default)
  'gpt-4o-mini-transcribe',  // OpenAI — lower-cost
  'groq-whisper',            // Groq whisper-large-v3
  'google-chirp',            // Google Cloud STT v2 — Chirp 2
] as const;
type TranscriptionModelKey = typeof VALID_TRANSCRIPTION_MODELS[number];

const VALID_ENHANCEMENT_MODELS = [
  'gpt-4o',        // OpenAI — highest quality (default)
  'gpt-4o-mini',   // OpenAI — lower-cost
  'groq-llama',    // Groq LLaMA-3.3-70B
  'gemini-flash',  // Google Gemini Flash
] as const;
type EnhancementModelKey = typeof VALID_ENHANCEMENT_MODELS[number];

// ─── Per-model pricing (MRU) ─────────────────────────────────────────────────
// Transcription: cost per minute of audio
// Enhancement:   flat cost per action (summary / rewrite / flashcards)
//
// Even "free" API models carry a platform overhead fee.
// Mutable: values are loaded from DB overrides on startup and can be updated by admin.
export let TRANSCRIPTION_PRICE_PER_MIN: Record<TranscriptionModelKey, number> = {
  // Aligned with mobile PAYG pricing (price = 2 × estimated max provider cost).
  'gpt-4o-transcribe':       0.48,
  'gpt-4o-mini-transcribe':  0.24,
  'groq-whisper':            0.054,
  'google-chirp':            1.28,
};

export let ENHANCEMENT_PRICE_PER_ACTION: Record<EnhancementModelKey, number> = {
  'gpt-4o':       1.50,  // coût API 0.47 MRU → ×3.2
  'gpt-4o-mini':  0.10,  // coût API 0.03 MRU → ×3.3
  'groq-llama':   0.15,  // frais plateforme
  'gemini-flash': 0.05,
};

// ─── Dynamic “fair use” limits derived from pricing (keeps margin stable) ─────
// We scale caps linearly with price vs baseline. This keeps cost ~proportional
// to payload size even when admin changes MRU prices.
type ActionLimits = { inputCharsMax: number; outputTokensMax: number; wikiCharsMax?: number };
type EnhancementBilling = {
  totalChars: number;
  units100Chars: number;
  pricePer100CharsMru: number;
  costMru: number;
};

function estimateProviderCostFromCharge(chargeMru: number): number {
  const c = Math.max(0, Number(chargeMru) || 0);
  if (c < 0.1) return c / 4;  // price = 4× cost
  if (c < 1)   return c / 3;  // price = 3× cost
  return c / 2;               // price = 2× cost
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function scaleLimit(base: number, factor: number, min: number, max: number): number {
  return clampInt(Math.round(base * factor), min, max);
}

const BASELINE_ENHANCEMENT: Record<EnhancementModelKey, {
  price: number;
  summary: ActionLimits;
  rewrite: ActionLimits;
  flashcards: ActionLimits;
}> = {
  'gpt-4o': {
    price: 1.50,
    summary:    { inputCharsMax: 20_000, outputTokensMax: 1600 },
    rewrite:    { inputCharsMax: 20_000, outputTokensMax: 1600 },
    flashcards: { inputCharsMax: 15_000, outputTokensMax: 900  },
  },
  'gpt-4o-mini': {
    price: 0.10,
    summary:    { inputCharsMax: 25_000, outputTokensMax: 1800 },
    rewrite:    { inputCharsMax: 25_000, outputTokensMax: 1800 },
    flashcards: { inputCharsMax: 18_000, outputTokensMax: 1100 },
  },
  'groq-llama': {
    price: 0.15,
    summary:    { inputCharsMax: 20_000, outputTokensMax: 900  },
    rewrite:    { inputCharsMax: 20_000, outputTokensMax: 1400 },
    flashcards: { inputCharsMax: 15_000, outputTokensMax: 2000 },
  },
  'gemini-flash': {
    price: 0.05,
    summary:    { inputCharsMax: 20_000, outputTokensMax: 900  },
    rewrite:    { inputCharsMax: 20_000, outputTokensMax: 1400 },
    flashcards: { inputCharsMax: 15_000, outputTokensMax: 2000 },
  },
};

const BASELINE_COURSE = {
  price: 0.81,
  limits: {
    inputCharsMax: 18_000,
    wikiCharsMax:  2_500,
    // Note: OpenAI course tokens differ by model; we keep a single baseline cap
    // and the service applies it to whichever model is used.
    outputTokensMax: 2300,
  } as ActionLimits,
};

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Transparent volume-based pricing:
 * cost = pricePer100Chars × ceil((inputChars + outputChars) / 100)
 *
 * We derive pricePer100Chars from the per-action price and a baseline payload size.
 * This preserves your margin logic while making small requests cheaper and visible.
 */
function computeEnhancementBilling(params: {
  model: EnhancementModelKey;
  mode: EnhanceMode;
  inputChars: number;
  outputChars: number;
}): EnhancementBilling {
  const { model, mode } = params;
  const totalChars = Math.max(0, Math.floor((params.inputChars ?? 0) + (params.outputChars ?? 0)));
  const units100Chars = Math.max(1, Math.ceil(totalChars / 100));

  const actionPrice = ENHANCEMENT_PRICE_PER_ACTION[model] ?? 0.5;

  // Baseline payload per action (chars). Roughly: input cap + typical output size.
  // Output size is estimated; caps still prevent runaway costs.
  const baselineTotalCharsByModelMode: Record<EnhancementModelKey, Record<EnhanceMode, number>> = {
    'gpt-4o': {
      summary:    20_000 + 6_400, // 1600 tokens ≈ 6400 chars
      rewrite:    20_000 + 6_400,
      flashcards: 15_000 + 3_600, // 900 tokens ≈ 3600 chars
    },
    'gpt-4o-mini': {
      summary:    25_000 + 7_200, // 1800 tokens ≈ 7200 chars
      rewrite:    25_000 + 7_200,
      flashcards: 18_000 + 4_400, // 1100 tokens ≈ 4400 chars
    },
    'groq-llama': {
      summary:    20_000 + 3_600, // 900 tokens
      rewrite:    20_000 + 5_600, // 1400 tokens
      flashcards: 15_000 + 8_000, // 2000 tokens
    },
    'gemini-flash': {
      summary:    20_000 + 3_600,
      rewrite:    20_000 + 5_600,
      flashcards: 15_000 + 8_000,
    },
  };

  const baselineTotalChars = baselineTotalCharsByModelMode[model]?.[mode] ?? 25_000;
  const pricePer100CharsMru = actionPrice / Math.max(1, baselineTotalChars / 100);
  const costMru = round4(units100Chars * pricePer100CharsMru);

  return {
    totalChars,
    units100Chars,
    pricePer100CharsMru: round4(pricePer100CharsMru),
    costMru,
  };
}

function getEnhancementLimits(
  modelKey: EnhancementModelKey,
  mode: EnhanceMode,
): ActionLimits {
  const baseline = BASELINE_ENHANCEMENT[modelKey];
  const currentPrice = ENHANCEMENT_PRICE_PER_ACTION[modelKey] ?? baseline.price;
  const factorRaw = baseline.price > 0 ? (currentPrice / baseline.price) : 1;
  // Don’t let a broken admin value explode limits.
  const factor = Math.max(0.25, Math.min(4, factorRaw));

  const base = baseline[mode];
  return {
    inputCharsMax:   scaleLimit(base.inputCharsMax,   factor, 4000, 60_000),
    outputTokensMax: scaleLimit(base.outputTokensMax, factor, 300,  8000),
  };
}

function getCourseLimits(coursePriceMru: number): ActionLimits {
  const baselinePrice = BASELINE_COURSE.price;
  const factorRaw = baselinePrice > 0 ? (coursePriceMru / baselinePrice) : 1;
  const factor = Math.max(0.25, Math.min(4, factorRaw));
  const b = BASELINE_COURSE.limits;
  return {
    inputCharsMax:   scaleLimit(b.inputCharsMax,   factor, 6000, 60_000),
    wikiCharsMax:    scaleLimit(b.wikiCharsMax!,   factor, 0,    12_000),
    outputTokensMax: scaleLimit(b.outputTokensMax, factor, 600,  10_000),
  };
}

// Build pricing response dynamically (reflects runtime overrides)
function buildModelPricingResponse() {
  return {
    transcription: Object.fromEntries(
      (Object.entries(TRANSCRIPTION_PRICE_PER_MIN) as [TranscriptionModelKey, number][]).map(
        ([k, v]) => [k, { pricePerMinMru: v, unit: 'par minute' }]
      )
    ),
    enhancement: Object.fromEntries(
      (Object.entries(ENHANCEMENT_PRICE_PER_ACTION) as [EnhancementModelKey, number][]).map(
        ([k, v]) => [k, { pricePerActionMru: v, unit: 'par action' }]
      )
    ),
  };
}

const router = Router();

// ─── Auto-create model_pricing_overrides table + load DB overrides on startup ─
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS model_pricing_overrides (
        model_key  TEXT PRIMARY KEY,
        price_mru  NUMERIC(8,4) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const maybe = (pool as any).query?.('SELECT model_key, price_mru FROM model_pricing_overrides');
    const result =
      maybe && typeof maybe.then === 'function'
        ? await (maybe as Promise<any>).catch(() => ({ rows: [] as any[] }))
        : ({ rows: [] as any[] });
    const rows = result?.rows ?? [];
    for (const row of rows) {
      const k = row.model_key as string;
      const v = parseFloat(row.price_mru);
      if (k in TRANSCRIPTION_PRICE_PER_MIN)  (TRANSCRIPTION_PRICE_PER_MIN  as Record<string,number>)[k] = v;
      else if (k in ENHANCEMENT_PRICE_PER_ACTION) (ENHANCEMENT_PRICE_PER_ACTION as Record<string,number>)[k] = v;
    }
    if (rows.length > 0) console.log(`[model-pricing] Loaded ${rows.length} override(s) from DB`);
  } catch (e) { console.error('[model-pricing] DB init error:', e); }
})();

// ─── GET /api/v1/voice-notes/model-pricing ────────────────────────────────────
// Admin only — internal pricing knobs (never expose model names/costs to end users).
router.get('/model-pricing', authenticate, (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  res.json(buildModelPricingResponse());
});

// ─── GET /api/v1/voice-notes/public-pricing ───────────────────────────────────
// Authenticated users — expose user-facing PAYG prices (no internal knobs).
router.get('/public-pricing', authenticate, (_req: AuthRequest, res: Response) => {
  res.json({
    transcription: Object.fromEntries(
      (Object.entries(TRANSCRIPTION_PRICE_PER_MIN) as [TranscriptionModelKey, number][]).map(
        ([k, v]) => [k, { pricePerMinMru: v, unit: 'per_minute' }],
      ),
    ),
  });
});

// ─── PUT /api/v1/voice-notes/admin/model-pricing ─────────────────────────────
// Admin only — update per-model prices (persisted to DB, shared across all workers).
router.put('/admin/model-pricing', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
  const updates = req.body as Record<string, number>;
  const saved: string[] = [];
  try {
    for (const [key, price] of Object.entries(updates)) {
      if (typeof price !== 'number' || price < 0) continue;
      const inT = key in TRANSCRIPTION_PRICE_PER_MIN;
      const inE = key in ENHANCEMENT_PRICE_PER_ACTION;
      if (!inT && !inE) continue;
      await pool.query(
        `INSERT INTO model_pricing_overrides (model_key, price_mru, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (model_key) DO UPDATE SET price_mru = $2, updated_at = NOW()`,
        [key, price],
      );
      if (inT) (TRANSCRIPTION_PRICE_PER_MIN  as Record<string,number>)[key] = price;
      else     (ENHANCEMENT_PRICE_PER_ACTION as Record<string,number>)[key] = price;
      saved.push(key);
    }
    res.json({ success: true, updated: saved, ...buildModelPricingResponse() });
  } catch (e) { res.status(500).json({ error: 'DB error' }); }
});

const AUDIO_DIR = process.env.AUDIO_DIR || path.join(__dirname, '../../uploads/audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
  filename:    (_req, _file, cb) => cb(null, `${uuidv4()}.m4a`),
});

const AUDIO_MIME_TYPES = new Set([
  'audio/m4a', 'audio/mp4', 'audio/x-m4a',
  'audio/mpeg', 'audio/mp3',
  'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/webm', 'audio/ogg',
  'video/mp4',  // expo-av on Android sometimes encodes as video/mp4
]);

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB — large lectures supported via server-side chunking
  fileFilter: (_req, file, cb) => {
    if (
      AUDIO_MIME_TYPES.has(file.mimetype) ||
      file.originalname.match(/\.(m4a|mp4|mp3|wav|webm|ogg)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ─── POST /api/v1/voice-notes/partial-transcribe ─────────────────────────────
// Transcribes a small audio chunk in real-time — no DB save, returns text only.
// Used by the mobile client to show live transcript while recording.

const tempStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
  filename:    (_req, _file, cb) => cb(null, `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.m4a`),
});
const uploadTemp = multer({ storage: tempStorage, limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/partial-transcribe', authenticate, uploadTemp.single('audio'), async (req: AuthRequest, res: Response) => {
  const audioFile = req.file;
  if (!audioFile) { res.status(400).json({ error: 'Missing audio chunk' }); return; }

  const { language } = req.body as { language?: string };

  try {
    const transcript = await transcribeAudio(audioFile.path, {
      language:       (language === 'ar' || language === 'fr') ? language : null,
      diarize:        false,
      cheap:          true,
      skipPreprocess: true, // small finalized M4A from iOS — no ffmpeg needed, send directly
    });
    res.json({ transcript: transcript.trim() });
  } catch (err: any) {
    console.error('[partial-transcribe] error:', err.message);
    res.status(502).json({ error: err.message });
  } finally {
    // Always delete the temp chunk
    fs.unlink(audioFile.path, () => {});
  }
});

// ─── POST /api/v1/voice-notes ─────────────────────────────────────────────────
// Upload audio + synchronous transcription → persist

router.post('/', authenticate, uploadAudio.single('audio'), async (req: AuthRequest, res: Response) => {
  const audioFile = req.file;

  if (!audioFile) {
    res.status(400).json({ error: 'Missing audio file (field: "audio")' });
    return;
  }

  const { title, subject, duration_s, language, diarize, cheap, transcription_model, pre_transcript } = req.body as {
    title?:                string;
    subject?:              string;
    duration_s?:           string;
    language?:             'ar' | 'fr';
    diarize?:              string;
    cheap?:                string;  // legacy compat
    transcription_model?:  string;  // explicit model key (preferred)
    pre_transcript?:       string;  // client-side accumulated transcript — skip Whisper if provided
  };

  const useDiarize = diarize === 'true';
  // Resolve transcription model: explicit > cheap flag > diarize flag > default
  const resolvedTranscriptionModel: TranscriptionModelKey = (
    VALID_TRANSCRIPTION_MODELS.includes(transcription_model as TranscriptionModelKey)
      ? transcription_model as TranscriptionModelKey
      : cheap === 'true'
        ? 'gpt-4o-mini-transcribe'
        : useDiarize
          ? 'gpt-4o-transcribe'  // diarize handled via option flag, model stays gpt-4o
          : 'gpt-4o-transcribe'
  );
  const useGroqTranscription   = resolvedTranscriptionModel === 'groq-whisper';
  const useGeminiTranscription = false; // gemini STT not used here (inline_data limit); keep enhancement only
  const useChirpTranscription  = resolvedTranscriptionModel === 'google-chirp';
  const useCheap   = resolvedTranscriptionModel === 'gpt-4o-mini-transcribe';
  // Map to OpenAI model constants (ignored for Groq)
  const model = useCheap ? TRANSCRIPTION_MODEL_CHEAP
    : useDiarize ? TRANSCRIPTION_MODEL_DIARIZE
    : TRANSCRIPTION_MODEL_DEFAULT;

  // Nom du fichier audio (UUID.m4a) — conservé pour la lecture ultérieure
  const audioFilename = path.basename(audioFile.path);

  // Create DB entry in processing state
  const { rows } = await pool.query(
    `INSERT INTO voice_notes (user_id, title, subject, duration_s, status, transcription_model, audio_filename)
     VALUES ($1, $2, $3, $4, 'processing', $5, $6)
     RETURNING *`,
    [req.user!.id, title || null, subject || null, duration_s ? parseInt(duration_s) : null, resolvedTranscriptionModel, audioFilename],
  );
  const noteId: string = rows[0].id;
  const noteRow = rows[0];
  const voiceBillingRole = req.user!.role;

  // ── Respond immediately — transcription happens in background ───────────────
  // This prevents iOS from killing the connection on large files (>60s transcription).
  res.status(201).json({ ...noteRow, status: 'processing' });

  // ── Background transcription ─────────────────────────────────────────────────
  setImmediate(async () => {
    try {
      // ── Get exact audio duration via ffprobe ──────────────────────────────
      let exactDurationSec: number | null = null;
      try {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);
        const { stdout } = await execFileAsync('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          audioFile.path,
        ]);
        const parsed = parseFloat(stdout.trim());
        if (!isNaN(parsed) && parsed > 0) exactDurationSec = Math.round(parsed);
      } catch (ffprobeErr) {
        console.warn('[voice-notes] ffprobe failed, will fall back to declared duration:', ffprobeErr);
      }

      const transcript = pre_transcript?.trim()
        ? pre_transcript.trim()
        : useGroqTranscription
          ? await transcribeAudioGroq(audioFile.path, language ?? null)
          : useChirpTranscription
            ? await transcribeAudioChirp(audioFile.path, language ?? null)
            : await transcribeAudio(audioFile.path, {
              language:   language ?? null,
              diarize:    useDiarize,
              cheap:      useCheap,
              subject:    subject || undefined,
              timestamps: true,  // annotate transcript minute by minute (01: ..., 02: ...)
            });

      const finalTitle = title?.trim()
        ? title.trim()
        : transcript.trim().split(/\s+/).slice(0, 6).join(' ');

      await pool.query(
        `UPDATE voice_notes
         SET status = 'done', transcript = $1, title = $2,
             duration_s = COALESCE(NULLIF(duration_s, 0), $4),
             updated_at = now()
         WHERE id = $3`,
        [transcript, finalTitle, noteId, exactDurationSec],
      );

      // ── Billing: deduct per-model cost per minute of audio ─────────────────
      // Priority: 1) ffprobe exact duration  2) client-declared duration  3) transcript estimate
      const declaredSec = noteRow.duration_s ? parseInt(noteRow.duration_s) : 0;
      const billingSource = exactDurationSec != null ? 'exact'
        : declaredSec > 0 ? 'declared'
        : 'estimated';
      const billingSec = exactDurationSec != null ? exactDurationSec
        : declaredSec > 0 ? declaredSec
        : Math.max(60, Math.ceil((transcript.length / 750) * 60));
      if (noteRow.user_id) {
        try {
          const minutes  = Math.max(1, Math.ceil(billingSec / 60));
          const pricePerMin = TRANSCRIPTION_PRICE_PER_MIN[resolvedTranscriptionModel] ?? 2.0;
          const costMru  = minutes * pricePerMin;
          await chargeVoiceStudioUsage({
            userId: noteRow.user_id,
            userRole: voiceBillingRole,
            aiMessageUnits: minutes,
            idempotencyKey: `voicetx:${noteId}`,
            walletFeatureKey: 'whisper_studio',
            walletCostMru: costMru,
            providerCostMru: estimateProviderCostFromCharge(costMru),
            walletDescription:
              `Transcription (${resolvedTranscriptionModel}) — ${minutes} min [${billingSource}] × ${pricePerMin} MRU`,
          });
        } catch (billingErr) {
          console.warn('[voice-notes] billing deduction failed:', billingErr);
        }
      }

      console.log(`[voice-notes] background transcription done — noteId=${noteId} chars=${transcript.length}`);

    } catch (err: any) {
      await pool.query(
        `UPDATE voice_notes SET status = 'failed', error_message = $1, updated_at = now() WHERE id = $2`,
        [err.message ?? 'Unknown error', noteId],
      );
      // On failure, clean up the audio file
      fs.unlink(audioFile.path, () => {});
      await pool.query(`UPDATE voice_notes SET audio_filename = NULL WHERE id = $1`, [noteId]);
      console.error('[voice-notes] background transcription error:', err);
    }
  });
});

// ─── GET /api/v1/voice-notes ──────────────────────────────────────────────────

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, subject, duration_s, status, error_message,
              LEFT(transcript, 200)        AS transcript_preview,
              enhance_mode, deck_id,
              transcription_model,
              created_at, updated_at
       FROM voice_notes
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user!.id],
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/v1/voice-notes/:id/confidence-hints ─────────────────────────────
// Heuristiques locales sur le transcript (répétitions, scripts parasites, etc.).
// Ne modifie pas la note ; pas de suppression. ?language=fr|ar optionnel.

router.get('/:id/confidence-hints', authenticate, async (req: AuthRequest, res: Response) => {
  const langRaw = (req.query.language as string | undefined)?.toLowerCase();
  const language =
    langRaw === 'fr' || langRaw === 'ar' ? (langRaw as 'fr' | 'ar') : null;

  try {
    const { rows } = await pool.query(
      `SELECT transcript, status FROM voice_notes WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (!rows.length) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }
    const note = rows[0];
    if (note.status !== 'done' || !note.transcript?.trim()) {
      res.status(409).json({ error: 'Transcript not yet available' });
      return;
    }

    const hints = analyzeTranscriptConfidence(note.transcript as string, {
      language,
      maxSpans: 16,
    });
    res.json(hints);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/v1/voice-notes/:id ──────────────────────────────────────────────

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM voice_notes WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (!rows.length) { res.status(404).json({ error: 'Note not found' }); return; }
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/v1/voice-notes/:id/audio ───────────────────────────────────────
// Stream the original audio file. Auth via Bearer token OR ?t= query param.

router.get('/:id/audio', async (req: Request, res: Response) => {
  // Accept token from Authorization header or ?t= query param (needed for expo-av direct URIs)
  let userId: string | undefined;
  try {
    const raw =
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null) ?? (req.query.t as string | undefined);

    if (!raw) { res.status(401).json({ error: 'Missing token' }); return; }

    // Support dual-secret rotation (same logic as authenticate middleware)
    const secrets = [process.env.JWT_SECRET!, process.env.JWT_SECRET_OLD]
      .filter(Boolean) as string[];

    if (!secrets.length) { res.status(500).json({ error: 'Server misconfiguration' }); return; }

    let verified = false;
    for (const secret of secrets) {
      try {
        const payload = jwt.verify(raw, secret) as { sub?: string };
        userId = payload.sub;
        verified = true;
        break;
      } catch { /* try next secret */ }
    }

    if (!verified) {
      res.status(401).json({ error: 'Token invalid or expired' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
    return;
  }

  if (!userId) { res.status(401).json({ error: 'Invalid token payload' }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT audio_filename FROM voice_notes WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId],
    );

    if (!rows.length) { res.status(404).json({ error: 'Note not found' }); return; }

    const { audio_filename } = rows[0];
    if (!audio_filename) { res.status(404).json({ error: 'Audio file not available' }); return; }

    const filePath = path.join(AUDIO_DIR, audio_filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Audio file not found on server' });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const ext = path.extname(audio_filename).toLowerCase();
    const mimeType = ext === '.mp3' ? 'audio/mpeg'
      : ext === '.wav' ? 'audio/wav'
      : ext === '.webm' ? 'audio/webm'
      : 'audio/mp4'; // m4a/mp4 — iOS AVFoundation requires audio/mp4

    if (range) {
      // Support HTTP range requests for mobile audio seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end   = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': chunkSize,
        'Content-Type':   mimeType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type':   mimeType,
        'Accept-Ranges':  'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/v1/voice-notes/:id/enhance ────────────────────────────────────
// AI enhancement: summary / rewrite / flashcards

router.post('/:id/enhance', authenticate, async (req: AuthRequest, res: Response) => {
  const { mode, subject: subjectOverride, cheap, enhancement_model } = req.body as {
    mode:               EnhanceMode;
    subject?:           string;
    cheap?:             string;          // legacy compat
    enhancement_model?: string;          // explicit model key (preferred)
  };

  const VALID_MODES: EnhanceMode[] = ['summary', 'rewrite', 'flashcards'];
  if (!VALID_MODES.includes(mode)) {
    res.status(400).json({ error: `Invalid mode — accepted: ${VALID_MODES.join(', ')}` });
    return;
  }

  // Resolve enhancement model
  const resolvedEnhancementModel: EnhancementModelKey = (
    VALID_ENHANCEMENT_MODELS.includes(enhancement_model as EnhancementModelKey)
      ? enhancement_model as EnhancementModelKey
      : cheap === 'true' ? 'gpt-4o-mini' : 'gpt-4o'
  );
  const useGroqEnhancement   = resolvedEnhancementModel === 'groq-llama';
  const useGeminiEnhancement = resolvedEnhancementModel === 'gemini-flash';
  const useCheap = resolvedEnhancementModel === 'gpt-4o-mini';

  try {
    const { rows } = await pool.query(
      `SELECT * FROM voice_notes WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (!rows.length) { res.status(404).json({ error: 'Note not found' }); return; }
    const note = rows[0];

    if (note.status !== 'done' || !note.transcript) {
      res.status(409).json({ error: 'Transcript not yet available' });
      return;
    }

    const subject = subjectOverride || note.subject || 'lecture';
    const dynamicLimits = getEnhancementLimits(resolvedEnhancementModel, mode);

    if (mode === 'flashcards') {
      const result = useGroqEnhancement
        ? await enhanceTranscriptGroq(note.transcript, mode, subject, dynamicLimits)
        : useGeminiEnhancement
          ? await enhanceTranscriptGemini(note.transcript, mode, subject, dynamicLimits)
          : await enhanceTranscript(note.transcript, mode, subject, { cheap: useCheap, limits: dynamicLimits });
      // Hard cap to keep “1 action” bounded (8–15 cards expected by prompt)
      const cards = (result.cards ?? []).slice(0, 15);

      if (cards.length) {
        const deckTitle = (note.title || note.subject || 'Voice Note').slice(0, 80);
        const { rows: deckRows } = await pool.query(
          `INSERT INTO flashcard_decks (user_id, title, subject, color) VALUES ($1, $2, $3, $4) RETURNING *`,
          [req.user!.id, deckTitle, subject, '#8B5CF6'],
        );
        const deck = deckRows[0];

        const placeholders = cards.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
        const values: unknown[] = [deck.id];
        for (const c of cards) values.push(c.front, c.back);
        await pool.query(`INSERT INTO flashcards (deck_id, front, back) VALUES ${placeholders}`, values);
        await pool.query(`UPDATE flashcard_decks SET card_count = $1 WHERE id = $2`, [cards.length, deck.id]);
        await pool.query(
          `UPDATE voice_notes SET enhance_mode = $1, deck_id = $2, updated_at = now() WHERE id = $3`,
          [mode, deck.id, note.id],
        );

        // ── Billing: volume-based cost for enhancement (whisper_studio wallet) ─
        try {
          const outputChars = JSON.stringify(cards).length;
          const bill = computeEnhancementBilling({
            model: resolvedEnhancementModel,
            mode,
            inputChars: Math.min(note.transcript.length, dynamicLimits.inputCharsMax),
            outputChars,
          });
          const costMru = bill.costMru;
          await chargeVoiceStudioUsage({
            userId: req.user!.id,
            userRole: req.user!.role,
            aiMessageUnits: Math.max(1, Math.min(30, Math.ceil(costMru))),
            idempotencyKey: `voiceenh:${note.id}:${uuidv4()}`,
            walletFeatureKey: 'whisper_studio',
            walletCostMru: costMru,
            providerCostMru: estimateProviderCostFromCharge(costMru),
            walletDescription: `IA (flashcards, ${cards.length} cartes) — ${resolvedEnhancementModel} — ${bill.totalChars} chars`,
          });
        } catch (billingErr) {
          console.warn('[voice-notes/enhance] flashcard billing error:', billingErr);
        }

        const outputChars = JSON.stringify(cards).length;
        const billing = computeEnhancementBilling({
          model: resolvedEnhancementModel,
          mode,
          inputChars: Math.min(note.transcript.length, dynamicLimits.inputCharsMax),
          outputChars,
        });
        res.json({ mode, deck, cards, billing });
        return;
      }

      res.json({ mode, cards: [], billing: { totalChars: 0, units100Chars: 0, pricePer100CharsMru: 0, costMru: 0 } });
      return;
    }

    // summary or rewrite → structured JSON enhancement (OpenAI) or plain text (Groq/Gemini)
    if (useGroqEnhancement || useGeminiEnhancement) {
      const result = useGeminiEnhancement
        ? await enhanceTranscriptGemini(note.transcript, mode, subject, dynamicLimits)
        : await enhanceTranscriptGroq(note.transcript, mode, subject, dynamicLimits);
      const text = result.text ?? '';
      await pool.query(
        `UPDATE voice_notes SET enhance_mode = $1, enhanced_text = $2, updated_at = now() WHERE id = $3`,
        [mode, text, note.id],
      );
      // Billing
      try {
        const bill = computeEnhancementBilling({
          model: resolvedEnhancementModel,
          mode,
          inputChars: Math.min(note.transcript.length, dynamicLimits.inputCharsMax),
          outputChars: text.length,
        });
        const costMru = bill.costMru;
        await chargeVoiceStudioUsage({
          userId: req.user!.id,
          userRole: req.user!.role,
          aiMessageUnits: Math.max(1, Math.min(30, Math.ceil(costMru))),
          idempotencyKey: `voiceenh:${note.id}:${uuidv4()}`,
          walletFeatureKey: 'whisper_studio',
          walletCostMru: costMru,
          walletDescription: `IA (${mode}) — ${resolvedEnhancementModel} — ${bill.totalChars} chars`,
        });
      } catch (billingErr) {
        console.warn('[voice-notes/enhance] groq billing error:', billingErr);
      }
      const billing = computeEnhancementBilling({
        model: resolvedEnhancementModel,
        mode,
        inputChars: Math.min(note.transcript.length, dynamicLimits.inputCharsMax),
        outputChars: text.length,
      });
      res.json({ mode, text, billing });
      return;
    }

    // summary or rewrite → structured JSON enhancement
    const enhanced: EnhancedTranscript = await enhanceTranscriptStructured(
      note.transcript,
      subject,
      { cheap: useCheap, limits: dynamicLimits },
    );

    await pool.query(
      `UPDATE voice_notes
       SET enhance_mode      = $1,
           enhanced_text     = $2,
           clean_transcript  = $3,
           summary           = $4,
           action_items      = $5,
           key_topics        = $6,
           unclear_segments  = $7,
           updated_at        = now()
       WHERE id = $8`,
      [
        mode,
        enhanced.clean_transcript,          // enhanced_text kept for backward compat
        enhanced.clean_transcript,
        enhanced.summary,
        JSON.stringify(enhanced.action_items),
        JSON.stringify(enhanced.key_topics),
        JSON.stringify(enhanced.unclear_segments),
        note.id,
      ],
    );

    // ── Billing: catalogue → ai_messages ; sinon portefeuille MRU ───────────
    try {
      const outputChars =
        (enhanced.clean_transcript?.length ?? 0) +
        (enhanced.summary?.length ?? 0) +
        (Array.isArray(enhanced.action_items) ? enhanced.action_items.join('\n').length : 0) +
        (Array.isArray(enhanced.key_topics) ? enhanced.key_topics.join('\n').length : 0) +
        (Array.isArray(enhanced.unclear_segments) ? enhanced.unclear_segments.join('\n').length : 0);
      const bill = computeEnhancementBilling({
        model: resolvedEnhancementModel,
        mode,
        inputChars: Math.min(note.transcript.length, dynamicLimits.inputCharsMax),
        outputChars,
      });
      const costMru = bill.costMru;
      await chargeVoiceStudioUsage({
        userId: req.user!.id,
        userRole: req.user!.role,
        aiMessageUnits: Math.max(1, Math.min(30, Math.ceil(costMru))),
        idempotencyKey: `voiceenh:${note.id}:${uuidv4()}`,
        walletFeatureKey: 'whisper_studio',
        walletCostMru: costMru,
          providerCostMru: estimateProviderCostFromCharge(costMru),
        walletDescription: `IA (${mode}) — ${resolvedEnhancementModel} — ${bill.totalChars} chars`,
      });
    } catch (billingErr) {
      console.warn('[voice-notes/enhance] summary billing error:', billingErr);
    }

    const outputChars =
      (enhanced.clean_transcript?.length ?? 0) +
      (enhanced.summary?.length ?? 0) +
      (Array.isArray(enhanced.action_items) ? enhanced.action_items.join('\n').length : 0) +
      (Array.isArray(enhanced.key_topics) ? enhanced.key_topics.join('\n').length : 0) +
      (Array.isArray(enhanced.unclear_segments) ? enhanced.unclear_segments.join('\n').length : 0);
    const billing = computeEnhancementBilling({
      model: resolvedEnhancementModel,
      mode,
      inputChars: Math.min(note.transcript.length, dynamicLimits.inputCharsMax),
      outputChars,
    });
    res.json({ mode, text: enhanced.clean_transcript, enhanced, billing });

  } catch (e: any) {
    console.error('[voice-notes/enhance] error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/v1/voice-notes/:id/generate-course ────────────────────────────
// Generates a full AI-enriched course from the transcript + Wikipedia context.
// Result is saved in the ai_course column and returned.

router.post('/:id/generate-course', authenticate, async (req: AuthRequest, res: Response) => {
  const { cheap } = req.body as { cheap?: string };
  const useCheap = cheap === 'true';

  try {
    const { rows } = await pool.query(
      `SELECT * FROM voice_notes WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (!rows.length) { res.status(404).json({ error: 'Note not found' }); return; }
    const note = rows[0];

    if (note.status !== 'done' || !note.transcript) {
      res.status(409).json({ error: 'Transcript not yet available' });
      return;
    }

    const subject = note.subject || note.title || '';
    // Course is billed via ai_course feature pricing (per_use)
    const { costPerUnitMru } = await getFeaturePricing('ai_course');
    const courseLimits = getCourseLimits(costPerUnitMru);
    const course = await generateCourseFromTranscript(note.transcript, subject, { cheap: useCheap, limits: courseLimits });

    await pool.query(
      `UPDATE voice_notes SET ai_course = $1, updated_at = now() WHERE id = $2`,
      [course, note.id],
    );

    // ── Billing: debit ai_course PAYG wallet (aligned with mobile pricing) ───
    try {
      const costMru = costPerUnitMru; // per_use
      await chargeVoiceStudioUsage({
        userId: req.user!.id,
        userRole: req.user!.role,
        aiMessageUnits: Math.max(1, Math.min(30, Math.ceil(costMru))),
        idempotencyKey: `voicecourse:${note.id}:${uuidv4()}`,
        walletFeatureKey: 'ai_course',
        walletCostMru: costMru,
        walletDescription: `IA (cours) — ${useCheap ? 'cheap' : 'standard'}`,
      });
    } catch (billingErr) {
      console.warn('[voice-notes/generate-course] billing error:', billingErr);
    }

    res.json({ course });
  } catch (e: any) {
    console.error('[voice-notes/generate-course] error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/v1/voice-notes/:id/retranscribe ───────────────────────────────
// Re-transcribes the existing audio with Whisper, then diffs against the old
// transcript. Changed/added words are wrapped in {{...}} markers in the result.

/**
 * Word-level diff: returns newText with words that differ from oldText
 * wrapped in {{word}} so the client can highlight them.
 * Uses a simple LCS (longest common subsequence) approach.
 */
function diffMarkWords(oldText: string, newText: string): string {
  const oldWords = oldText.split(/\s+/).filter(Boolean);
  const newWords = newText.split(/\s+/).filter(Boolean);

  // Build LCS table
  const m = oldWords.length;
  const n = newWords.length;
  // To save memory on large files, cap at 3000 words each
  const oW = oldWords.slice(0, 3000);
  const nW = newWords.slice(0, 3000);
  const M = oW.length, N = nW.length;

  const dp: number[][] = Array.from({ length: M + 1 }, () => new Array(N + 1).fill(0));
  for (let i = 1; i <= M; i++) {
    for (let j = 1; j <= N; j++) {
      if (oW[i - 1].toLowerCase() === nW[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find which new words are in LCS (unchanged)
  const inLCS = new Set<number>(); // indices in nW
  let i = M, j = N;
  while (i > 0 && j > 0) {
    if (oW[i - 1].toLowerCase() === nW[j - 1].toLowerCase()) {
      inLCS.add(j - 1);
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  // Build output: words not in LCS are wrapped with {{...}}
  const out: string[] = nW.map((word, idx) => inLCS.has(idx) ? word : `{{${word}}}`);

  // Append remaining new words (beyond cap) without marking
  if (newWords.length > 3000) {
    out.push(...newWords.slice(3000));
  }

  return out.join(' ');
}

router.post('/:id/retranscribe', authenticate, async (req: AuthRequest, res: Response) => {
  const { language, cheap } = req.body as { language?: 'ar' | 'fr'; cheap?: string };
  const useCheap = cheap === 'true';

  try {
    const { rows } = await pool.query(
      `SELECT * FROM voice_notes WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (!rows.length) { res.status(404).json({ error: 'Note not found' }); return; }
    const note = rows[0];

    if (!note.audio_filename) {
      res.status(409).json({ error: 'Audio file no longer available — cannot retranscribe' });
      return;
    }

    const audioPath = path.join(AUDIO_DIR, note.audio_filename);
    if (!fs.existsSync(audioPath)) {
      res.status(409).json({ error: 'Audio file not found on disk' });
      return;
    }

    const lang = language ?? note.language ?? null;
    const oldTranscript: string = note.transcript ?? '';

    // Re-transcribe (user-initiated action — synchronous)
    const newTranscript = await transcribeAudio(audioPath, {
      language: lang,
      diarize: false,
      cheap: useCheap,
      subject: note.subject || undefined,
      timestamps: true,
    });

    // Diff: mark words that changed/were added
    const diffedTranscript = diffMarkWords(oldTranscript, newTranscript);

    // Push old transcript into version history (only if it's non-empty)
    const existingVersions: { transcript: string; saved_at: string; label: string }[] =
      Array.isArray(note.transcript_versions) ? note.transcript_versions : [];

    const updatedVersions = oldTranscript.trim()
      ? [
          ...existingVersions,
          {
            transcript: oldTranscript,
            saved_at:   new Date().toISOString(),
            label:      `Version ${existingVersions.length + 1}`,
          },
        ]
      : existingVersions;

    // Persist new transcript + updated version history
    await pool.query(
      `UPDATE voice_notes
         SET transcript = $1, transcript_versions = $2, updated_at = now()
       WHERE id = $3`,
      [newTranscript, JSON.stringify(updatedVersions), note.id],
    );

    res.json({
      transcript: newTranscript,
      diffed:     diffedTranscript,
      versions:   updatedVersions,
      old_length: oldTranscript.length,
      new_length: newTranscript.length,
    });
  } catch (e: any) {
    console.error('[voice-notes/retranscribe] error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/v1/voice-notes/:id/restore-version ────────────────────────────
// Restores a previous transcript version by index (0 = oldest).
// The current transcript is saved as a new version before restoring.

router.post('/:id/restore-version', authenticate, async (req: AuthRequest, res: Response) => {
  const { version_index } = req.body as { version_index: number };

  try {
    const { rows } = await pool.query(
      `SELECT * FROM voice_notes WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (!rows.length) { res.status(404).json({ error: 'Note not found' }); return; }
    const note = rows[0];

    const versions: { transcript: string; saved_at: string; label: string }[] =
      Array.isArray(note.transcript_versions) ? note.transcript_versions : [];

    if (version_index < 0 || version_index >= versions.length) {
      res.status(400).json({ error: 'Invalid version index' });
      return;
    }

    const targetVersion = versions[version_index];
    const currentTranscript: string = note.transcript ?? '';

    // Save current transcript as a new version before restoring
    const updatedVersions = [
      ...versions,
      {
        transcript: currentTranscript,
        saved_at:   new Date().toISOString(),
        label:      `Version ${versions.length + 1}`,
      },
    ];

    // Remove the version being restored (it becomes the active transcript)
    updatedVersions.splice(version_index, 1);

    await pool.query(
      `UPDATE voice_notes
         SET transcript = $1, transcript_versions = $2, updated_at = now()
       WHERE id = $3`,
      [targetVersion.transcript, JSON.stringify(updatedVersions), note.id],
    );

    res.json({
      transcript: targetVersion.transcript,
      versions:   updatedVersions,
    });
  } catch (e: any) {
    console.error('[voice-notes/restore-version] error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /api/v1/voice-notes/:id ───────────────────────────────────────────

router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { title, transcript } = req.body as { title?: string; transcript?: string };

  try {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (title !== undefined)      { fields.push(`title = $${idx++}`);      values.push(title); }
    if (transcript !== undefined) { fields.push(`transcript = $${idx++}`); values.push(transcript); }

    if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

    values.push(req.params.id, req.user!.id);
    const { rows } = await pool.query(
      `UPDATE voice_notes SET ${fields.join(', ')}, updated_at = now()
       WHERE id = $${idx} AND user_id = $${idx + 1}
       RETURNING *`,
      values,
    );
    if (!rows.length) { res.status(404).json({ error: 'Note not found' }); return; }
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /api/v1/voice-notes/:id ──────────────────────────────────────────

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rows, rowCount } = await pool.query(
      `DELETE FROM voice_notes WHERE id = $1 AND user_id = $2 RETURNING audio_filename`,
      [req.params.id, req.user!.id],
    );
    if (!rowCount) { res.status(404).json({ error: 'Note not found' }); return; }

    // Clean up audio file from disk if it exists
    const audioFilename: string | null = rows[0]?.audio_filename ?? null;
    if (audioFilename) {
      const filePath = path.join(AUDIO_DIR, audioFilename);
      fs.unlink(filePath, () => {}); // silent — file may already be gone
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
