/**
 * geminiService.ts — Google Gemini AI integration
 *
 * Transcription : Gemini 2.0 Flash (audio compris nativement — inline base64)
 * Enhancement  : Gemini 2.0 Flash (LLM texte — résumé / réécriture / flashcards)
 *
 * Required env variable:
 *   GOOGLE_API_KEY  — créer sur https://aistudio.google.com/apikey (gratuit)
 */

import fs from 'fs';
import path from 'path';

import { EnhanceMode, FlashcardPair, EnhanceResult } from './groqService';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TRANSCRIPTION_MODEL = 'gemini-2.0-flash';
const ENHANCEMENT_MODEL   = 'gemini-2.0-flash';
// Docs/OCR/Vision (Sprint 2)
const VISION_MODEL        = 'gemini-2.5-flash';
const CHAT_PRO_MODEL      = 'gemini-2.5-pro';

// Gemini inline_data limit: 20 MB
const MAX_INLINE_MB = 19;

function getKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GOOGLE_API_KEY non configuré dans les variables d\'environnement');
  return key;
}

// ─── 1. Transcription audio ────────────────────────────────────────────────
/**
 * Transcrit un fichier audio via Gemini 2.0 Flash.
 * Limite : 19 MB (Gemini inline_data). Pour les fichiers plus grands,
 * utilisez le File API Gemini (non implémenté ici).
 */
export async function transcribeAudio(
  filePath: string,
  language: 'ar' | 'fr' | null = null,
): Promise<string> {
  const key = getKey();

  const stat = fs.statSync(filePath);
  const mb   = stat.size / (1024 * 1024);
  if (mb > MAX_INLINE_MB) {
    throw new Error(`Fichier trop volumineux pour Gemini (${mb.toFixed(1)} MB > ${MAX_INLINE_MB} MB). Utilisez GPT-4o ou Groq Whisper.`);
  }

  const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'mp3';
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4',
    wav: 'audio/wav',  webm: 'audio/webm', ogg: 'audio/ogg',
  };
  const mimeType  = mimeMap[ext] ?? 'audio/mpeg';
  const base64    = fs.readFileSync(filePath).toString('base64');
  const langHint  = language === 'ar' ? 'Arabic'
    : language === 'fr' ? 'French'
    : 'Arabic or French (auto-detect)';

  const prompt =
    `Transcribe this university lecture audio precisely. Language: ${langHint}. ` +
    `Return ONLY the transcription text — no comments, no summary, no labels. ` +
    `Preserve technical terms, formulas, numbers, and proper nouns exactly.`;

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
  };

  const res = await fetch(
    `${GEMINI_BASE}/models/${TRANSCRIPTION_MODEL}:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini transcription error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}

// ─── 2. Enhancement (résumé / réécriture / flashcards) ────────────────────
const ENHANCE_PROMPTS: Record<EnhanceMode, (t: string, s: string) => string> = {
  summary: (transcript, subject) =>
    `Tu es un assistant pédagogique. Voici la transcription d'un cours sur "${subject}".\n\n` +
    `TRANSCRIPTION :\n"""\n${transcript}\n"""\n\n` +
    `Écris un résumé EN ARABE avec EXACTEMENT ce format :\n` +
    `- 5 points clés maximum (chacun ≤ 2 lignes)\n` +
    `- Commence chaque point par •\n` +
    `- Pas d'introduction, pas de conclusion, pas de titre\n` +
    `IMPORTANT : Réponse courte et directe, maximum 200 mots.`,

  rewrite: (transcript, subject) =>
    `Tu es un assistant pédagogique. Transcription BRUTE d'un cours sur "${subject}".\n\n` +
    `TRANSCRIPTION BRUTE :\n"""\n${transcript}\n"""\n\n` +
    `Réécris en notes propres et COURTES :\n` +
    `1. CORRIGE tous les mots mal transcrits\n` +
    `2. Supprime répétitions, hésitations, remplissages\n` +
    `3. Structure en 2-4 sections avec un titre court chacune\n` +
    `4. Garde les formules, définitions et chiffres exacts\n` +
    `5. Langue : arabe si le cours est en arabe, français sinon\n` +
    `IMPORTANT : Maximum 350 mots.`,

  flashcards: (transcript, subject) =>
    `Tu es un assistant pédagogique. Transcription d'un cours sur "${subject}" :\n\n` +
    `"""\n${transcript}\n"""\n\n` +
    `Génère 8 à 12 flashcards question/réponse en JSON strict UNIQUEMENT (aucun texte avant/après).\n` +
    `Règles :\n` +
    `- Question : courte (≤ 10 mots), en arabe ou français\n` +
    `- Réponse : concise (≤ 20 mots), factuelle\n` +
    `Format :\n` +
    `[{"front": "?", "back": "réponse courte"}, ...]`,
};

export async function enhanceTranscript(
  transcript: string,
  mode: EnhanceMode,
  subject: string = 'cours',
): Promise<EnhanceResult> {
  const key = getKey();

  const safeTranscript = transcript.length > 60_000
    ? transcript.slice(0, 60_000) + '\n\n[...transcription tronquée]'
    : transcript;

  const prompt = ENHANCE_PROMPTS[mode](safeTranscript, subject);
  const MAX_TOKENS: Record<EnhanceMode, number> = { summary: 900, rewrite: 1400, flashcards: 2000 };

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: mode === 'flashcards' ? 0.3 : 0.1,
      maxOutputTokens: MAX_TOKENS[mode],
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/models/${ENHANCEMENT_MODEL}:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini enhancement error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

  if (mode === 'flashcards') {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Réponse Gemini invalide pour les flashcards (JSON attendu)');
    const cards: FlashcardPair[] = JSON.parse(jsonMatch[0]);
    return { mode, cards };
  }

  return { mode, text: content };
}

// ─── 3. Vision (OCR / lecture d’images) ─────────────────────────────────────
/**
 * Analyse une image (notes, emploi du temps, page scannée) via Gemini Flash.
 * Entrée: imageBase64 (JPEG/PNG), prompt texte.
 * Sortie: texte brut (souvent JSON si demandé dans le prompt).
 */
export async function visionPrompt(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  prompt: string,
  maxOutputTokens: number = 2500,
): Promise<string> {
  const key = getKey();

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
      ],
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens },
  };

  const res = await fetch(
    `${GEMINI_BASE}/models/${VISION_MODEL}:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini vision error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}

// ─── 4. Chat (texte) — Gemini Pro (Sprint 5) ────────────────────────────────
/**
 * Chat texte via Gemini Pro — réservé aux cas “lourds / long contexte”.
 * Sortie: texte brut.
 */
export async function chatPro(
  messages: Array<{ role: string; content: string }>,
  maxOutputTokens: number = 2000,
): Promise<string> {
  const key = getKey();
  const last = messages[messages.length - 1]?.content ?? '';
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const context = messages.filter((m) => m.role !== 'system').slice(-20);

  const prompt =
    `${system}\n\n` +
    `Conversation:\n` +
    context.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n') +
    `\n\nRéponds de manière claire, structurée et utile.\nUSER: ${last}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens },
  };

  const res = await fetch(
    `${GEMINI_BASE}/models/${CHAT_PRO_MODEL}:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini chat error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}
