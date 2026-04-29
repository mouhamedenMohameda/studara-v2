/**
 * chirpService.ts — Google Cloud Speech-to-Text v1 (bucket "Chirp 2" in UI)
 *
 * Universal pipeline for ANY audio/video input, ANY duration:
 *
 *   input file  ─► ffmpeg normalize (vn, mono, 16kHz, FLAC)
 *               ─► ffprobe duration
 *               ─► if ≤55s : single sync /speech:recognize call
 *               ─► if >55s : segment into 55s FLAC chunks,
 *                            transcribe in parallel (max 4 concurrent),
 *                            concatenate transcripts in order
 *               ─► return combined transcript
 *
 * Why v1 (and not v2):
 *   v2 requires GCS upload or complex region config; v1 sync recognize with
 *   inline base64 is simple and works for any normalized FLAC under ~10 MB.
 *   FLAC 16kHz mono for 55s ≈ 1.7 MB, well under the limit.
 *
 * Required env (in order of preference):
 *   WHISPER_GOOGLE_CLOUD_API_KEY   — dedicated Whisper Studio key
 *   GOOGLE_CLOUD_API_KEY           — legacy fallback
 *
 * The API key must be attached to a Google Cloud project with
 * "Cloud Speech-to-Text API" enabled. Restrict the key to that API for safety.
 */

import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

// ─── Config ──────────────────────────────────────────────────────────────────

const CHIRP_BASE       = 'https://speech.googleapis.com/v1';
const CHIRP_MODEL      = 'latest_long';    // Best v1 model for lectures / long speech
// Google's sync `speech:recognize` rejects audio > 60s with
//   "Sync input too long. For audio longer than 1 min use LongRunningRecognize".
// We aim for 50s to keep a safety margin (ffmpeg cuts can drift by a few
// hundred ms if alignment is imperfect).
const CHUNK_SECONDS    = 50;
const MAX_CONCURRENT   = 4;                // Respect Google STT per-project QPS
const MAX_RETRIES      = 3;                // For 429 / 503 / transient network errors
const CHUNK_TIMEOUT_MS = 60_000;           // Per-chunk HTTP timeout
const MAX_INLINE_BYTES = 9 * 1024 * 1024;  // Safety margin under Google's ~10 MB inline limit

// ─── Credentials ─────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key =
    process.env.WHISPER_GOOGLE_CLOUD_API_KEY ||
    process.env.GOOGLE_CLOUD_API_KEY;
  if (!key) {
    throw new Error(
      'WHISPER_GOOGLE_CLOUD_API_KEY (ou GOOGLE_CLOUD_API_KEY) non configuré. ' +
      'Créez une clé sur https://console.cloud.google.com/apis/credentials ' +
      'avec "Cloud Speech-to-Text API" activé.',
    );
  }
  return key;
}

// ─── Language mapping ────────────────────────────────────────────────────────

function resolveLanguageCode(language: string | null): string {
  if (language === 'ar') return 'ar-SA';
  if (language === 'fr') return 'fr-FR';
  // Auto-fallback: French (widest accuracy for mixed FR/AR Mauritanian content)
  return 'fr-FR';
}

// ─── Audio preprocessing via ffmpeg ──────────────────────────────────────────

/**
 * Normalize any input (m4a, mp3, mp4, wav, webm, ogg, video, …) to FLAC mono 16 kHz.
 * Strips video streams (-vn), downmixes to mono (-ac 1), resamples (-ar 16000).
 * Google STT accepts FLAC natively — no encoding field needed client-side.
 */
async function normalizeToFlac(inputPath: string, outputPath: string): Promise<void> {
  await execFileP('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', inputPath,
    '-vn',                // strip any video track (handles mp4 with video)
    '-ac', '1',           // mono
    '-ar', '16000',       // 16 kHz (required by latest_long for best accuracy)
    '-c:a', 'flac',
    '-y', outputPath,
  ]);
}

/** Return duration in seconds, or throw if it cannot be determined. */
async function probeDurationSec(filePath: string): Promise<number> {
  const { stdout } = await execFileP('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const d = parseFloat(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) {
    throw new Error('Durée audio indéterminée (fichier possiblement corrompu)');
  }
  return d;
}

/**
 * Split a FLAC file into chunks of ≤ CHUNK_SECONDS each, durée exacte garantie.
 *
 * Why NOT `-f segment`:
 *   ffmpeg's segment muxer cuts *approximately* at segment_time. Even with
 *   `-c:a flac` re-encoding, the last segment can overshoot (observed:
 *   73/73 chunks was ~60s where the others were 50s). Google's sync STT
 *   rejects any audio ≥ 60s, so a single overshooting chunk fails the
 *   entire transcription.
 *
 * What we do instead:
 *   Probe total duration, then issue one ffmpeg extraction per chunk with
 *   explicit `-ss <start> -t <dur>` where `dur ≤ CHUNK_SECONDS` is
 *   clamped to the remaining duration. Every chunk is then guaranteed to
 *   be under the Google limit.
 *
 * Cost: ~100 ms per ffmpeg invocation for a 50s 16 kHz mono FLAC slice,
 * so a 1h lecture adds ~7s of overhead. Negligible vs the transcription
 * round-trip.
 */
async function splitIntoChunks(flacPath: string, outDir: string): Promise<string[]> {
  const totalSec = await probeDurationSec(flacPath);
  const chunkCount = Math.ceil(totalSec / CHUNK_SECONDS);
  const paths: string[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHUNK_SECONDS;
    // Clamp the last chunk's duration to whatever remains — never > CHUNK_SECONDS.
    const duration = Math.min(CHUNK_SECONDS, totalSec - start);
    // If duration is < ~0.2s (rounding artefact at EOF), skip — Chirp would
    // reject a sub-frame audio payload anyway.
    if (duration < 0.2) continue;

    const outPath = path.join(outDir, `chunk_${String(i).padStart(4, '0')}.flac`);
    await execFileP('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', start.toFixed(3),
      '-t',  duration.toFixed(3),
      '-i', flacPath,
      '-c:a', 'flac',
      '-ar', '16000',
      '-ac', '1',
      '-y', outPath,
    ]);
    paths.push(outPath);
  }

  if (paths.length === 0) {
    throw new Error('Échec du découpage audio (0 chunks produits)');
  }
  return paths;
}

// ─── Chirp API call (single chunk) ───────────────────────────────────────────

interface RecognizeResult {
  results?: Array<{
    alternatives?: Array<{ transcript?: string; confidence?: number }>;
  }>;
  error?: { code?: number; message?: string; status?: string };
}

async function recognizeChunk(
  chunkPath: string,
  language: string | null,
  apiKey: string,
): Promise<string> {
  const stat = await fsp.stat(chunkPath);
  // FLAC inline under 10 MB is guaranteed by our 55s chunk size, but guard anyway.
  if (stat.size > MAX_INLINE_BYTES) {
    throw new Error(
      `Chunk trop volumineux (${(stat.size / 1024 / 1024).toFixed(1)} MB). ` +
      'Limite inline Google STT = 10 MB.',
    );
  }

  const buffer = await fsp.readFile(chunkPath);
  const audioBase64 = buffer.toString('base64');

  const body = {
    config: {
      encoding:                   'FLAC',
      sampleRateHertz:            16000,
      audioChannelCount:          1,
      languageCode:               resolveLanguageCode(language),
      model:                      CHIRP_MODEL,
      enableAutomaticPunctuation: true,
      useEnhanced:                true,
    },
    audio: { content: audioBase64 },
  };

  const endpoint = `${CHIRP_BASE}/speech:recognize?key=${apiKey}`;

  // Retry loop for 429 / 5xx / network transients
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });
      clearTimeout(timer);

      if (response.status === 429 || response.status >= 500) {
        const bodyText = await response.text().catch(() => '');
        lastError = new Error(`Chirp ${response.status}: ${bodyText.slice(0, 200)}`);
        if (attempt < MAX_RETRIES) {
          const delay = Math.round((2 ** attempt) * 1000 + Math.random() * 500);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        let msg = `Chirp ${response.status}`;
        try {
          const parsed = JSON.parse(errText) as RecognizeResult;
          if (parsed.error?.message) msg = parsed.error.message;
        } catch { /* keep fallback */ }
        throw new Error(msg);
      }

      const data = await response.json() as RecognizeResult;
      const transcript = (data.results ?? [])
        .flatMap(r => r.alternatives ?? [])
        .map(a => (a.transcript ?? '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      return transcript;
    } catch (err: any) {
      clearTimeout(timer);
      // Abort / network error → retry
      if (err?.name === 'AbortError' || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT') {
        lastError = new Error(`Chirp network/timeout: ${err.message ?? err.name}`);
        if (attempt < MAX_RETRIES) {
          const delay = Math.round((2 ** attempt) * 1000 + Math.random() * 500);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw lastError;
      }
      // Non-retriable error
      throw err;
    }
  }
  throw lastError ?? new Error('Chirp: unknown error after retries');
}

// ─── Concurrency-limited parallel runner ─────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Transcribes any audio/video file using Google Cloud STT (v1 latest_long).
 *
 * Universal: any input format (m4a / mp3 / mp4 / wav / webm / ogg / opus / …)
 * and any duration (chunked automatically beyond 55s).
 *
 * @param filePath  Absolute path to the source audio/video file.
 * @param language  'ar' | 'fr' | null (null → fr-FR default).
 * @returns         Plain concatenated transcript.
 * @throws          On ffmpeg failure, Chirp API error, or empty result.
 */
export async function transcribeAudio(
  filePath: string,
  language: string | null,
): Promise<string> {
  const apiKey = getApiKey();

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chirp-'));
  const normalizedPath = path.join(tmpDir, 'normalized.flac');

  try {
    // 1. Normalize to a Chirp-friendly format (handles every input type)
    try {
      await normalizeToFlac(filePath, normalizedPath);
    } catch (err: any) {
      throw new Error(
        `ffmpeg n'a pas pu lire le fichier audio (format non supporté ou corrompu): ${err.message ?? err}`,
      );
    }

    // 2. Probe duration to decide single-shot vs chunked
    const durationSec = await probeDurationSec(normalizedPath);
    console.log(`[chirp] normalized duration=${durationSec.toFixed(1)}s lang=${language ?? 'auto'}`);

    // 3. Build the chunk list
    let chunkPaths: string[];
    if (durationSec <= CHUNK_SECONDS) {
      chunkPaths = [normalizedPath];
    } else {
      chunkPaths = await splitIntoChunks(normalizedPath, tmpDir);
      console.log(`[chirp] split into ${chunkPaths.length} chunk(s) of ~${CHUNK_SECONDS}s`);
    }

    // 4. Transcribe chunks with bounded concurrency
    const texts = await mapWithConcurrency(chunkPaths, MAX_CONCURRENT, async (p, i) => {
      try {
        const t = await recognizeChunk(p, language, apiKey);
        if (chunkPaths.length > 1) {
          console.log(`[chirp] chunk ${i + 1}/${chunkPaths.length} → ${t.length} chars`);
        }
        return t;
      } catch (err: any) {
        throw new Error(`Chunk ${i + 1}/${chunkPaths.length}: ${err.message ?? err}`);
      }
    });

    // 5. Concatenate (filter out empty chunks so we don't get double spaces)
    const full = texts.map(t => t.trim()).filter(Boolean).join(' ').trim();

    if (!full) {
      throw new Error(
        'Chirp n\'a produit aucune transcription (audio peut-être silencieux ou ' +
        'dans une langue non reconnue).',
      );
    }

    return full;
  } finally {
    // Always clean up the temp directory
    fsp.rm(tmpDir, { recursive: true, force: true }).catch(err =>
      console.warn(`[chirp] tmp cleanup failed for ${tmpDir}:`, err.message ?? err),
    );
  }
}
