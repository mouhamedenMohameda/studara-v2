/**
 * ai.ts — Routes IA génériques
 *
 *  POST /api/v1/ai/scan-deck          → OCR image → deck de flashcards
 *  POST /api/v1/ai/resources/:id/summary → résumé IA (Groq : SUMMARY_AI_GROQ_API_KEY uniquement, PDF + prompt FR)
 *  GET  /api/v1/resources/:id/summary → récupérer le résumé mis en cache
 *
 * Stratégie coûts / quotas (hard limits, pré-check, réservation, UX) :
 * voir `docs/subscriptions-entitlements-architecture.md` section 12.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import pool from '../db/pool';
import { v4 as uuidv4 } from 'uuid';
import { getActiveSubscription } from '../services/entitlements/activeSubscriptionService';
import { authorizeFeature } from '../services/entitlements/authorizationService';
import { consumeQuota } from '../services/entitlements/usageCounterService';
import { resolveEffectiveEntitlements } from '../services/entitlements/entitlementResolver';
import type { FeatureKey } from '../services/entitlements/types';
import { visionPrompt as geminiVisionPrompt } from '../services/geminiService';
import { chatPro as geminiChatPro } from '../services/geminiService';
import {
  AI_SUMMARY_PROMPT_VERSION,
  buildCourseSummaryUserMessage,
} from '../prompts/courseSummaryPrompt';
import { extractCourseTextForSummary } from '../services/resourcePdfTextService';
import { MISSING_GROQ_KEY, resolveGroqApiKey } from '../services/groqService';
import { deductFromWallet, getWallet } from '../services/subscriptionService';
import { upload, validateFileType } from '../middleware/upload';
import { extractUploadText, normalizeExtractedText } from '../services/courseUploadTextService';
import { generateStructuredCourseSummary, type OutputLanguage, type SummaryLevel } from '../services/courseSummaryStructuredService';
import { renderCourseSummaryPdf } from '../services/courseSummaryPdfService';
import { toUserFacingAiError } from '../services/aiUserError';
import { renderExerciseCorrectionPdf } from '../services/exerciseCorrectionPdfService';
import { estimateAiSummaryPriceMru, estimateAiSummaryProviderCostMru } from '../services/aiDocumentPricing';

const router = Router();
router.use(authenticate);

// ─── AI User history ─────────────────────────────────────────────────────────
// GET /api/v1/ai/history?type=ai_summary|ai_exercise_correction&page=1&limit=20
router.get('/history', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { type, page = '1', limit = '20' } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page || '1', 10) || 1);
  const l = Math.min(50, Math.max(1, parseInt(limit || '20', 10) || 20));
  const offset = (p - 1) * l;
  const allowedTypes = new Set(['ai_summary', 'ai_exercise_correction']);
  const t = type && allowedTypes.has(type) ? type : null;

  try {
    const where = t ? `AND a.activity_type = $2` : '';
    const params = t ? [userId, t, l, offset] : [userId, l, offset];
    const limitIdx = t ? 3 : 2;
    const offsetIdx = t ? 4 : 3;

    const { rows } = await pool.query(
      `SELECT
         a.id,
         a.activity_type,
         a.resource_id,
         a.correction_id,
         a.price_mru,
         a.meta_json,
         a.created_at,
         r.title,
         r.title_ar,
         r.subject,
         c.status AS correction_status
       FROM ai_user_activity a
       LEFT JOIN resources r ON r.id = a.resource_id
       LEFT JOIN ai_exercise_corrections c ON c.id = a.correction_id
       WHERE a.user_id = $1
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM ai_user_activity a
       WHERE a.user_id = $1
       ${where}`,
      t ? [userId, t] : [userId],
    );

    return res.json({
      data: rows,
      pagination: {
        page: p,
        limit: l,
        total: cnt?.[0]?.total ?? 0,
        totalPages: Math.ceil((cnt?.[0]?.total ?? 0) / l),
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Erreur serveur' });
  }
});

// In-memory background runner (PM2 single instance). If you need multi-instance, switch to a queue.
const running: Record<string, boolean> = {};

function entitlementTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

async function ensureAiSummaryWalletHasEnough(params: {
  userId: string;
  requiredMru: number;
}): Promise<{ ok: true; balanceMru: number } | { ok: false; balanceMru: number }> {
  // Prefer the universal PAYG wallet when funded, fallback to legacy per-feature wallet.
  const u = await getWallet(params.userId, 'wallet_universal');
  const ub = u.balanceMru ?? 0;
  if (ub >= params.requiredMru) return { ok: true, balanceMru: ub };

  const w = await getWallet(params.userId, 'ai_summary');
  const balance = w.balanceMru ?? 0;
  if (balance >= params.requiredMru) return { ok: true, balanceMru: balance };
  return { ok: false, balanceMru: Math.max(ub, balance) };
}

async function ensureExerciseCorrectionWalletHasEnough(params: {
  userId: string;
  requiredMru: number;
}): Promise<{ ok: true; balanceMru: number } | { ok: false; balanceMru: number }> {
  // Prefer the universal PAYG wallet when funded, fallback to legacy per-feature wallet.
  const u = await getWallet(params.userId, 'wallet_universal');
  const ub = u.balanceMru ?? 0;
  if (ub >= params.requiredMru) return { ok: true, balanceMru: ub };

  const w = await getWallet(params.userId, 'ai_exercise_correction');
  const balance = w.balanceMru ?? 0;
  if (balance >= params.requiredMru) return { ok: true, balanceMru: balance };
  return { ok: false, balanceMru: Math.max(ub, balance) };
}

// ─── Model definitions (DB-backed with 60s in-memory cache) ──────────────────

export type ChatModelId = 'ara' | 'deepseek' | 'gpt';

interface ModelDef {
  id: ChatModelId;
  creditCost: number;
  maxContextMessages: number;
  maxOutputTokens: number;
  dailyQuota: number;
  isEnabled: boolean;
  displayName: string;
}

// Fallback defaults (used if DB not yet migrated)
const MODEL_DEFAULTS: Record<ChatModelId, ModelDef> = {
  ara:      { id: 'ara',      displayName: 'Ara (Claude Haiku)', creditCost: 3, maxContextMessages: 16, maxOutputTokens: 1500, dailyQuota: 150, isEnabled: true },
  deepseek: { id: 'deepseek', displayName: 'DeepSeek Chat',      creditCost: 1, maxContextMessages: 12, maxOutputTokens: 1000, dailyQuota: 150, isEnabled: true },
  gpt:      { id: 'gpt',      displayName: 'GPT-4o Mini',        creditCost: 2, maxContextMessages: 12, maxOutputTokens: 1000, dailyQuota: 150, isEnabled: true },
};

let _modelCache: Record<ChatModelId, ModelDef> | null = null;
let _modelCacheAt = 0;
const MODEL_CACHE_TTL = 60_000; // 60 seconds

async function getChatModels(): Promise<Record<ChatModelId, ModelDef>> {
  if (_modelCache && Date.now() - _modelCacheAt < MODEL_CACHE_TTL) return _modelCache;
  try {
    const { rows } = await pool.query(
      `SELECT model_id, display_name, credit_cost, max_context_messages, max_output_tokens, daily_quota, is_enabled
       FROM ai_chat_model_config WHERE is_enabled = true`,
    );
    if (!rows.length) return MODEL_DEFAULTS;
    const result: Partial<Record<ChatModelId, ModelDef>> = {};
    for (const r of rows) {
      result[r.model_id as ChatModelId] = {
        id:                  r.model_id,
        displayName:         r.display_name,
        creditCost:          r.credit_cost,
        maxContextMessages:  r.max_context_messages,
        maxOutputTokens:     r.max_output_tokens,
        dailyQuota:          r.daily_quota,
        isEnabled:           r.is_enabled,
      };
    }
    _modelCache = { ...MODEL_DEFAULTS, ...result };
    _modelCacheAt = Date.now();
    return _modelCache;
  } catch {
    return MODEL_DEFAULTS;
  }
}

// Keep backwards compat export (used in tests)
export const CHAT_MODELS = MODEL_DEFAULTS;

// ─────────────────────────────────────────────────────────────────────────────
// Résumé intelligent de cours (upload dédié) — /api/v1/ai/course-summaries/*
// ─────────────────────────────────────────────────────────────────────────────

router.post('/course-summaries/documents', upload.single('file'), validateFileType, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: 'Missing file' });

    const ins = await pool.query<{ id: string }>(
      `INSERT INTO ai_course_documents (user_id, original_name, mime_type, size_bytes, storage_path, status)
       VALUES ($1, $2, $3, $4, $5, 'UPLOADED')
       RETURNING id`,
      [userId, file.originalname, file.mimetype || 'application/octet-stream', file.size, file.path],
    );
    const documentId = ins.rows[0]!.id;
    res.json({ documentId, status: 'UPLOADED' });

    if (running[documentId]) return;
    running[documentId] = true;
    (async () => {
      try {
        await pool.query(
          `UPDATE ai_course_documents SET status='TEXT_EXTRACTING', error_message=NULL WHERE id=$1 AND user_id=$2`,
          [documentId, userId],
        );

        const extracted = await extractUploadText({
          filePath: file.path,
          originalName: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
        });
        const norm = normalizeExtractedText(extracted.text);

        await pool.query(
          `UPDATE ai_course_documents
           SET status='TEXT_READY', extracted_text=$1, extracted_at=NOW(), error_message=NULL
           WHERE id=$2 AND user_id=$3`,
          [norm.cleaned, documentId, userId],
        );
      } catch (e: any) {
        await pool.query(
          `UPDATE ai_course_documents SET status='FAILED', error_message=$1 WHERE id=$2 AND user_id=$3`,
          [String(e?.message || e), documentId, userId],
        );
      } finally {
        delete running[documentId];
      }
    })().catch(() => {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Erreur serveur' });
  }
});

router.get('/course-summaries/documents/:id', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const r = await pool.query(
    `SELECT id, status, original_name, mime_type, size_bytes, extracted_at, error_message, created_at
     FROM ai_course_documents
     WHERE id=$1 AND user_id=$2
     LIMIT 1`,
    [id, userId],
  );
  const row = r.rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  return res.json({
    id: row.id,
    status: row.status,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    extractedAt: row.extracted_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  });
});

// GET /api/v1/ai/course-summaries/documents/:id/pricing
// Returns wallet balance + estimated price based on extracted words (same grid as other doc AI).
router.get('/course-summaries/documents/:id/pricing', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  try {
    const r = await pool.query<{ status: string; extracted_text: string | null; original_name: string }>(
      `SELECT status, extracted_text, original_name
       FROM ai_course_documents
       WHERE id=$1 AND user_id=$2
       LIMIT 1`,
      [id, userId],
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });

    const u = await getWallet(userId, 'wallet_universal');
    const w = await getWallet(userId, 'ai_summary');
    const balance = Math.max(u.balanceMru ?? 0, w.balanceMru ?? 0);

    if (row.status !== 'TEXT_READY' || !row.extracted_text) {
      return res.json({
        status: row.status,
        feature_key: 'ai_summary',
        balance_mru: balance,
        pricing: null,
        word_count: null,
        original_name: row.original_name,
      });
    }

    const wordCount = normalizeExtractedText(row.extracted_text).wordCount;
    const pricing = estimateAiSummaryPriceMru({ pageCount: null, wordCount });
    return res.json({
      status: row.status,
      feature_key: 'ai_summary',
      balance_mru: balance,
      original_name: row.original_name,
      word_count: wordCount,
      pricing: {
        price_mru: pricing.priceMru,
        basis: pricing.basis,
        per_page_mru: 0.04,
        per_1k_words_mru: 0.08,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

router.post('/course-summaries', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const schema = z.object({
      documentId: z.string().uuid(),
      level: z.enum(['simple', 'normal', 'advanced', 'very_synthetic', 'exam_tomorrow']).default('normal'),
      outputLanguage: z.enum(['fr', 'ar', 'en', 'fr_ar']).default('fr'),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const { documentId, level, outputLanguage } = body.data as {
      documentId: string;
      level: SummaryLevel;
      outputLanguage: OutputLanguage;
    };

    const doc = await pool.query<{ extracted_text: string | null; status: string; original_name: string }>(
      `SELECT extracted_text, status, original_name FROM ai_course_documents WHERE id=$1 AND user_id=$2 LIMIT 1`,
      [documentId, userId],
    );
    const d = doc.rows[0];
    if (!d) return res.status(404).json({ error: 'Document not found' });
    if (d.status !== 'TEXT_READY' || !d.extracted_text) return res.status(400).json({ error: 'Text not ready yet' });

    // Wallet pricing & pre-check (PAYG): use same pricing grid as other document-heavy AI.
    const wordCount = normalizeExtractedText(d.extracted_text).wordCount;
    const pricing = estimateAiSummaryPriceMru({ pageCount: null, wordCount });
    const provider = estimateAiSummaryProviderCostMru({ pageCount: null, wordCount });
    const walletCheck = await ensureAiSummaryWalletHasEnough({ userId, requiredMru: pricing.priceMru });
    if (!walletCheck.ok) {
      return res.status(402).json({
        error: 'wallet_insufficient',
        code: 'wallet_insufficient',
        feature_key: 'ai_summary',
        required_mru: pricing.priceMru,
        balance_mru: walletCheck.balanceMru,
        word_count: wordCount,
        basis: pricing.basis,
      });
    }

    const ins = await pool.query<{ id: string }>(
      `INSERT INTO ai_course_summaries (user_id, document_id, status, level, output_language, input_char_count, started_at)
       VALUES ($1, $2, 'PENDING', $3, $4, $5, NOW())
       RETURNING id`,
      [userId, documentId, level, outputLanguage, d.extracted_text.length],
    );
    const summaryId = ins.rows[0]!.id;
    res.json({ summaryId, status: 'PENDING', price_mru: pricing.priceMru });

    if (running[summaryId]) return;
    running[summaryId] = true;
    (async () => {
      try {
        await pool.query(`UPDATE ai_course_summaries SET status='RUNNING' WHERE id=$1 AND user_id=$2`, [summaryId, userId]);
        const out = await generateStructuredCourseSummary({
          titleHint: d.original_name,
          cleanedText: d.extracted_text!,
          level,
          outputLanguage,
        });
        await pool.query(
          `UPDATE ai_course_summaries
           SET status='COMPLETED', model=$1, output_char_count=$2,
               result_json=$3::jsonb, warnings_json=$4::jsonb, error_message=NULL, completed_at=NOW()
           WHERE id=$5 AND user_id=$6`,
          [
            out.model,
            JSON.stringify(out.result).length,
            JSON.stringify(out.result),
            JSON.stringify(out.warnings || []),
            summaryId,
            userId,
          ],
        );

        // Debit wallet after success (best-effort).
        try {
          await deductFromWallet(
            userId,
            'ai_summary',
            pricing.priceMru,
            `Résumé intelligent — ${d.original_name} (${wordCount} mots, ${pricing.basis})`,
            provider.providerCostMru,
          );
        } catch (we) {
          console.error('[ai/course-summaries] wallet debit failed', we);
        }

        // Record per-user history (best-effort).
        try {
          await pool.query(
            `INSERT INTO ai_user_activity (user_id, activity_type, price_mru, meta_json)
             VALUES ($1, 'ai_summary', $2, $3::jsonb)
             ON CONFLICT DO NOTHING`,
            [
              userId,
              pricing.priceMru,
              JSON.stringify({
                source: 'course_summaries',
                document_id: documentId,
                summary_id: summaryId,
                original_name: d.original_name,
                word_count: wordCount,
                basis: pricing.basis,
                cached: false,
              }),
            ],
          );
        } catch {
          /* ignore */
        }
      } catch (e: any) {
        const raw = String(e?.message || e);
        console.error('[ai/course-summaries] generation failed:', raw);
        const friendly = toUserFacingAiError(raw);
        await pool.query(
          `UPDATE ai_course_summaries SET status='FAILED', error_message=$1, completed_at=NOW() WHERE id=$2 AND user_id=$3`,
          [friendly, summaryId, userId],
        );
      } finally {
        delete running[summaryId];
      }
    })().catch(() => {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Erreur serveur' });
  }
});

router.get('/course-summaries/:id', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const r = await pool.query(
    `SELECT id, status, level, output_language, model, result_json, warnings_json, error_message, created_at, started_at, completed_at
     FROM ai_course_summaries
     WHERE id=$1 AND user_id=$2
     LIMIT 1`,
    [id, userId],
  );
  const row = r.rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  return res.json({
    id: row.id,
    status: row.status,
    level: row.level,
    outputLanguage: row.output_language,
    model: row.model,
    result: row.result_json,
    warnings: row.warnings_json,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  });
});

router.get('/course-summaries/:id/export.pdf', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const r = await pool.query<{ status: string; result_json: any }>(
    `SELECT status, result_json FROM ai_course_summaries WHERE id=$1 AND user_id=$2 LIMIT 1`,
    [id, userId],
  );
  const row = r.rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.status !== 'COMPLETED' || !row.result_json) return res.status(400).json({ error: 'Not ready' });

  const pdf = await renderCourseSummaryPdf(row.result_json);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="resume-${id}.pdf"`);
  return res.send(pdf);
});

// ─────────────────────────────────────────────────────────────────────────────
// Correction IA d'exercices (upload + OCR/vision + correction + export PDF)
// ─────────────────────────────────────────────────────────────────────────────

type ExerciseDocStatus = 'UPLOADED' | 'TEXT_EXTRACTING' | 'TEXT_READY' | 'FAILED';
type ExerciseJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
type ExerciseSubject =
  | 'mathematiques'
  | 'physique'
  | 'chimie'
  | 'economie'
  | 'comptabilite'
  | 'finance'
  | 'informatique'
  | 'biologie'
  | 'medecine';

function parseJsonObjectFromText(raw: string): any | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  const tryParse = (input: string): any | null => {
    const t = String(input || '').trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {}

    // Best-effort cleanup for common model JSON issues:
    // - trailing commas
    // - smart quotes
    // - leading "json" token
    const cleaned = t
      .replace(/^\s*json\s*/i, '')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, '$1');
    if (cleaned !== t) {
      try {
        return JSON.parse(cleaned);
      } catch {}
    }
    return null;
  };

  // 1) Direct JSON
  {
    const direct = tryParse(s);
    if (direct) return direct;
  }

  // 2) ```json ... ``` fenced block
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    const parsed = tryParse(inner);
    if (parsed) return parsed;
  }

  // 3) Best-effort: substring from first "{" to last "}"
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const sub = s.slice(first, last + 1);
    const parsed = tryParse(sub);
    if (parsed) return parsed;
  }

  return null;
}

async function groqExerciseOcrFromImage(imageBase64: string, mimeType: 'image/jpeg' | 'image/png'): Promise<{
  text: string;
  confidence: number;
  warnings: string[];
}> {
  const prompt = [
    "Tu fais une extraction OCR fidèle d'un énoncé d'exercice à partir d'une image.",
    "Règles:",
    "- Ne pas inventer. Si une partie est illisible, écris [ILLISIBLE] à l'endroit et ajoute un warning.",
    "- Préserver les symboles, unités, exposants, indices, fractions si possible (texte).",
    "- Retourne UNIQUEMENT un JSON strict avec: { text, confidence, warnings }.",
    "",
    "confidence: nombre entre 0 et 1 estimant la lisibilité globale.",
  ].join('\n');

  const raw = hasGeminiKey()
    ? await geminiVisionPrompt(imageBase64, mimeType, prompt, 2500)
    : await groqVision(imageBase64, prompt);

  const json = parseJsonObjectFromText(raw);
  if (!json) {
    return { text: raw.slice(0, 12000), confidence: 0.4, warnings: ['Extraction non structurée (fallback).'] };
  }
  const text = typeof json.text === 'string' ? json.text : '';
  const confidence = typeof json.confidence === 'number' ? Math.max(0, Math.min(1, json.confidence)) : 0.5;
  const warnings = Array.isArray(json.warnings) ? json.warnings.filter((w: any) => typeof w === 'string') : [];
  return { text, confidence, warnings };
}

async function groqExerciseCorrection(params: {
  subject: ExerciseSubject;
  statementText: string;
  studentAnswer?: string;
  outputLanguage: OutputLanguage;
}): Promise<{ result: any; warnings: string[]; confidence: number; model: string }> {
  const requireLatex = params.subject === 'mathematiques';
  const medical = params.subject === 'medecine';

  const sys = [
    "Tu es un correcteur d'exercices universitaire. Tu dois être fiable et pédagogique.",
    "Contraintes:",
    "- N'invente jamais une donnée absente de l'énoncé.",
    "- Si l'énoncé est ambigu, flou, incomplet, tu le dis et tu ajoutes des avertissements.",
    "- Donne une correction étape par étape, méthode, résultat final, erreurs fréquentes, résumé, exercice similaire.",
    "- Si une réponse étudiant est fournie: identifier erreurs, pourquoi c'est faux, et proposer correction propre.",
    medical ? "- Médecine: rappeler que c'est pédagogique, pas un avis médical." : "",
    "",
    "Retourne UNIQUEMENT un JSON valide avec les clés:",
    "{",
    '  "statement": string,',
    '  "confidence": number,',
    '  "correction_step_by_step": string,',
    '  "method_explanation": string,',
    '  "final_answer": string,',
    '  "common_errors": string[],',
    '  "method_summary": string,',
    '  "similar_exercise": string,',
    '  "student_answer_feedback"?: { "errors": { "excerpt": string, "why_wrong": string, "fix": string }[], "corrected_solution": string },',
    '  "latex"?: { "enabled": boolean },',
    '  "medical_disclaimer"?: string',
    "}",
  ].filter(Boolean).join('\n');

  const user = [
    `Matière: ${params.subject}`,
    `Langue: ${params.outputLanguage}`,
    requireLatex ? "Important: utilise des notations LaTeX dans les parties mathématiques (ex: \\(x^2\\), \\[...\\])." : "",
    "",
    "Énoncé:",
    params.statementText,
    "",
    params.studentAnswer ? "Réponse étudiant:\n" + params.studentAnswer : "",
  ].filter(Boolean).join('\n');

  const model = 'llama-3.3-70b-versatile';
  const raw = await groqChat(
    [{ role: 'system', content: sys }, { role: 'user', content: user }],
    model,
    2200,
  );

  const json = parseJsonObjectFromText(raw);
  if (!json) {
    return {
      model,
      result: {
        statement: params.statementText,
        confidence: 0.35,
        correction_step_by_step: raw,
        method_explanation: '',
        final_answer: '',
        common_errors: [],
        method_summary: '',
        similar_exercise: '',
        latex: { enabled: requireLatex },
        medical_disclaimer: medical ? "Usage pédagogique uniquement — pas un avis médical." : undefined,
      },
      warnings: ['Réponse non structurée (fallback).'],
      confidence: 0.35,
    };
  }

  const confidence = typeof json.confidence === 'number' ? Math.max(0, Math.min(1, json.confidence)) : 0.6;
  const warnings: string[] = [];
  if (confidence < 0.65) warnings.push('Confiance faible — énoncé possiblement flou/incomplet.');
  if (medical && typeof json.medical_disclaimer !== 'string') {
    json.medical_disclaimer = "Usage pédagogique uniquement — pas un avis médical.";
  }
  // Never trust model for statement: enforce server-side canonical statement.
  json.statement = params.statementText;
  if (!json.latex) json.latex = { enabled: requireLatex };
  if (json?.latex && typeof json.latex.enabled !== 'boolean') json.latex.enabled = requireLatex;
  return { result: json, warnings, confidence, model };
}

router.post('/exercise-corrections/documents/text', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const schema = z.object({ statementText: z.string().min(10).max(8000) });
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const norm = normalizeExtractedText(body.data.statementText.trim());
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO ai_exercise_documents (user_id, source_type, status, statement_text, warnings_json, extracted_at, page_count, word_count)
       VALUES ($1, 'text', 'TEXT_READY', $2, '[]'::jsonb, NOW(), NULL, $3)
       RETURNING id`,
      [userId, norm.cleaned, norm.wordCount],
    );
    return res.json({ documentId: ins.rows[0]!.id, status: 'TEXT_READY' as ExerciseDocStatus });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Erreur serveur' });
  }
});

router.post('/exercise-corrections/documents', upload.single('file'), validateFileType, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: 'Missing file' });

    const ins = await pool.query<{ id: string }>(
      `INSERT INTO ai_exercise_documents (user_id, source_type, original_name, mime_type, size_bytes, storage_path, status)
       VALUES ($1, 'file', $2, $3, $4, $5, 'UPLOADED')
       RETURNING id`,
      [userId, file.originalname, file.mimetype || 'application/octet-stream', file.size, file.path],
    );
    const documentId = ins.rows[0]!.id;
    res.json({ documentId, status: 'UPLOADED' as ExerciseDocStatus });

    if (running[documentId]) return;
    running[documentId] = true;
    (async () => {
      try {
        await pool.query(
          `UPDATE ai_exercise_documents SET status='TEXT_EXTRACTING', error_message=NULL WHERE id=$1 AND user_id=$2`,
          [documentId, userId],
        );

        const isImage = String(file.mimetype || '').startsWith('image/');
        if (isImage) {
          const b64 = (await import('fs')).default.readFileSync(file.path).toString('base64');
          const mt = file.mimetype === 'image/png' ? 'image/png' : 'image/jpeg';
          const ocr = await groqExerciseOcrFromImage(b64, mt);
          const norm = normalizeExtractedText(ocr.text);
          await pool.query(
            `UPDATE ai_exercise_documents
             SET status='TEXT_READY', statement_text=$1, ocr_provider=$2, ocr_confidence=$3,
                 warnings_json=$4::jsonb, extracted_at=NOW(), error_message=NULL,
                 page_count=1, word_count=$5
             WHERE id=$6 AND user_id=$7`,
            [
              norm.cleaned,
              hasGeminiKey() ? 'gemini' : 'groq_vision',
              ocr.confidence,
              JSON.stringify(ocr.warnings || []),
              norm.wordCount,
              documentId,
              userId,
            ],
          );
        } else {
          const extracted = await extractUploadText({
            filePath: file.path,
            originalName: file.originalname,
            mimeType: file.mimetype || 'application/octet-stream',
          });
          const norm = normalizeExtractedText(extracted.text);
          await pool.query(
            `UPDATE ai_exercise_documents
             SET status='TEXT_READY', statement_text=$1, extracted_at=NOW(), error_message=NULL,
                 page_count=$2, word_count=$3
             WHERE id=$4 AND user_id=$5`,
            [norm.cleaned, extracted.pageCount, norm.wordCount, documentId, userId],
          );
        }
      } catch (e: any) {
        await pool.query(
          `UPDATE ai_exercise_documents SET status='FAILED', error_message=$1 WHERE id=$2 AND user_id=$3`,
          [String(e?.message || e), documentId, userId],
        );
      } finally {
        delete running[documentId];
      }
    })().catch(() => {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Erreur serveur' });
  }
});

router.get('/exercise-corrections/documents/:id/pricing', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  try {
    const r = await pool.query<{
      status: string;
      error_message: string | null;
      page_count: number | null;
      word_count: number | null;
      statement_text: string | null;
      mime_type: string | null;
      source_type: string;
    }>(
      `SELECT status, error_message, page_count, word_count, statement_text, mime_type, source_type
       FROM ai_exercise_documents WHERE id=$1 AND user_id=$2 LIMIT 1`,
      [id, userId],
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });

    const u = await getWallet(userId, 'wallet_universal');
    const w = await getWallet(userId, 'ai_exercise_correction');
    const balance = Math.max(u.balanceMru ?? 0, w.balanceMru ?? 0);
    if (row.status !== 'TEXT_READY' || !row.statement_text) {
      return res.json({
        status: row.status,
        errorMessage: row.error_message,
        feature_key: 'ai_exercise_correction',
        balance_mru: balance,
        pricing: null,
      });
    }

    const wordCount =
      typeof row.word_count === 'number' && row.word_count >= 0
        ? row.word_count
        : normalizeExtractedText(row.statement_text || '').wordCount;
    const pageCount =
      typeof row.page_count === 'number' && row.page_count > 0
        ? row.page_count
        : String(row.mime_type || '').startsWith('image/')
          ? 1
          : null;

    const pricing = estimateAiSummaryPriceMru({ pageCount, wordCount });
    const isPhoto = String(row.mime_type || '').startsWith('image/');

    return res.json({
      status: row.status,
      feature_key: 'ai_exercise_correction',
      balance_mru: balance,
      page_count: pageCount,
      word_count: wordCount,
      is_photo: isPhoto,
      source_type: row.source_type,
      pricing: {
        price_mru: pricing.priceMru,
        basis: pricing.basis,
        per_page_mru: 0.04,
        per_1k_words_mru: 0.08,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes('page_count') || msg.includes('word_count')) {
      return res.status(503).json({
        error: 'pricing_unavailable',
        message: 'Migration DB requise (page_count / word_count sur ai_exercise_documents).',
      });
    }
    return res.status(500).json({ error: msg });
  }
});

router.get('/exercise-corrections/documents/:id', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  try {
    const r = await pool.query<{
      status: string;
      error_message: string | null;
      page_count: number | null;
      word_count: number | null;
      mime_type: string | null;
      source_type: string;
    }>(
      `SELECT status, error_message, page_count, word_count, mime_type, source_type
       FROM ai_exercise_documents WHERE id=$1 AND user_id=$2 LIMIT 1`,
      [id, userId],
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json({
      status: row.status,
      errorMessage: row.error_message,
      pageCount: row.page_count,
      wordCount: row.word_count,
      mimeType: row.mime_type,
      sourceType: row.source_type,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes('page_count') || msg.includes('word_count')) {
      const r2 = await pool.query(
        `SELECT id, status, error_message FROM ai_exercise_documents WHERE id=$1 AND user_id=$2 LIMIT 1`,
        [id, userId],
      );
      const row2 = r2.rows[0];
      if (!row2) return res.status(404).json({ error: 'Not found' });
      return res.json({ status: row2.status, errorMessage: row2.error_message, pageCount: null, wordCount: null, mimeType: null, sourceType: null });
    }
    return res.status(500).json({ error: msg });
  }
});

router.post('/exercise-corrections', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const schema = z.object({
      documentId: z.string().uuid(),
      subject: z.enum(['mathematiques','physique','chimie','economie','comptabilite','finance','informatique','biologie','medecine']),
      studentAnswer: z.string().max(8000).optional(),
      outputLanguage: z.enum(['fr', 'ar', 'en', 'fr_ar']).default('fr'),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    let doc: { rows: Array<{ status: string; statement_text: string | null; warnings_json: any; page_count: number | null; word_count: number | null; mime_type: string | null }> };
    try {
      doc = await pool.query(
        `SELECT status, statement_text, warnings_json, page_count, word_count, mime_type
         FROM ai_exercise_documents WHERE id=$1 AND user_id=$2 LIMIT 1`,
        [body.data.documentId, userId],
      );
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes('page_count') || msg.includes('word_count')) {
        return res.status(503).json({
          error: 'server_misconfigured',
          message: 'Migration DB requise (page_count / word_count).',
        });
      }
      throw e;
    }

    const d = doc.rows[0];
    if (!d) return res.status(404).json({ error: 'Document not found' });
    if (d.status !== 'TEXT_READY' || !d.statement_text) return res.status(400).json({ error: 'Text not ready yet' });

    const wordCount =
      typeof d.word_count === 'number' && d.word_count >= 0
        ? d.word_count
        : normalizeExtractedText(d.statement_text || '').wordCount;
    const pageCount =
      typeof d.page_count === 'number' && d.page_count > 0
        ? d.page_count
        : String(d.mime_type || '').startsWith('image/')
          ? 1
          : null;

    const pricing = estimateAiSummaryPriceMru({ pageCount, wordCount });
    const provider = estimateAiSummaryProviderCostMru({ pageCount, wordCount });
    const walletCheck = await ensureExerciseCorrectionWalletHasEnough({
      userId,
      requiredMru: pricing.priceMru,
    });
    if (!walletCheck.ok) {
      return res.status(402).json({
        error: 'wallet_insufficient',
        code: 'wallet_insufficient',
        feature_key: 'ai_exercise_correction',
        required_mru: pricing.priceMru,
        balance_mru: walletCheck.balanceMru,
        page_count: pageCount,
        word_count: wordCount,
        basis: pricing.basis,
      });
    }

    const ins = await pool.query<{ id: string }>(
      `INSERT INTO ai_exercise_corrections (user_id, document_id, status, subject, student_answer, output_language, started_at)
       VALUES ($1, $2, 'PENDING', $3, $4, $5, NOW())
       RETURNING id`,
      [userId, body.data.documentId, body.data.subject, body.data.studentAnswer ?? null, body.data.outputLanguage],
    );
    const correctionId = ins.rows[0]!.id;
    const priceMru = pricing.priceMru;
    res.json({ correctionId, status: 'PENDING' as ExerciseJobStatus, price_mru: priceMru });

    if (running[correctionId]) return;
    running[correctionId] = true;
    (async () => {
      try {
        await pool.query(`UPDATE ai_exercise_corrections SET status='RUNNING' WHERE id=$1 AND user_id=$2`, [correctionId, userId]);
        const out = await groqExerciseCorrection({
          subject: body.data.subject as ExerciseSubject,
          statementText: d.statement_text!,
          studentAnswer: body.data.studentAnswer,
          outputLanguage: body.data.outputLanguage as OutputLanguage,
        });
        const mergedWarnings = [
          ...(Array.isArray(d.warnings_json) ? d.warnings_json : []),
          ...(out.warnings || []),
        ];
        await pool.query(
          `UPDATE ai_exercise_corrections
           SET status='COMPLETED', model=$1, confidence=$2, result_json=$3::jsonb, warnings_json=$4::jsonb, error_message=NULL, completed_at=NOW()
           WHERE id=$5 AND user_id=$6`,
          [out.model, out.confidence, JSON.stringify(out.result), JSON.stringify(mergedWarnings), correctionId, userId],
        );
        try {
          await deductFromWallet(
            userId,
            'ai_exercise_correction',
            priceMru,
            `Correction IA — ${pageCount ?? 'n/a'} p., ${wordCount} mots (${pricing.basis})`,
            provider.providerCostMru,
          );
        } catch (we) {
          console.error('[exercise-corrections] wallet debit failed', we);
        }

        // Record per-user history (best-effort)
        try {
          await pool.query(
            `INSERT INTO ai_user_activity (user_id, activity_type, correction_id, price_mru, meta_json)
             VALUES ($1, 'ai_exercise_correction', $2, $3, $4::jsonb)
             ON CONFLICT DO NOTHING`,
            [
              userId,
              correctionId,
              priceMru,
              JSON.stringify({
                page_count: pageCount,
                word_count: wordCount,
                basis: pricing.basis,
              }),
            ],
          );
        } catch {
          /* ignore */
        }
      } catch (e: any) {
        const raw = String(e?.message || e);
        const friendly = toUserFacingAiError(raw);
        await pool.query(
          `UPDATE ai_exercise_corrections SET status='FAILED', error_message=$1, completed_at=NOW() WHERE id=$2 AND user_id=$3`,
          [friendly, correctionId, userId],
        );
      } finally {
        delete running[correctionId];
      }
    })().catch(() => {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Erreur serveur' });
  }
});

router.get('/exercise-corrections/:id', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const r = await pool.query(
    `SELECT id, status, result_json, warnings_json, error_message
     FROM ai_exercise_corrections WHERE id=$1 AND user_id=$2 LIMIT 1`,
    [id, userId],
  );
  const row = r.rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  return res.json({
    status: row.status,
    result: row.result_json,
    warnings: row.warnings_json,
    errorMessage: row.error_message,
  });
});

router.post('/exercise-corrections/:id/simplify', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = req.params.id;
    const r = await pool.query<{ status: string; result_json: any; subject: ExerciseSubject; output_language: OutputLanguage; student_answer: string | null }>(
      `SELECT status, result_json, subject, output_language, student_answer
       FROM ai_exercise_corrections WHERE id=$1 AND user_id=$2 LIMIT 1`,
      [id, userId],
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.status !== 'COMPLETED' || !row.result_json) return res.status(400).json({ error: 'Not ready' });

    const originalStatement = String(row.result_json.statement || '');
    const requireLatex = row.subject === 'mathematiques';
    const medical = row.subject === 'medecine';

    const sys = [
      "Tu es un correcteur d'exercices universitaire.",
      "Ta tâche: réexpliquer PLUS SIMPLEMENT la solution, sans perdre la rigueur.",
      "Contraintes: ne pas inventer de données absentes.",
      "Retourne UNIQUEMENT un JSON valide ExerciseCorrectionResult (mêmes clés).",
    ].join('\n');

    const user = [
      `Matière: ${row.subject}`,
      `Langue: ${row.output_language}`,
      requireLatex ? "Important: utilise des notations LaTeX dans les parties mathématiques (ex: \\(x^2\\), \\[...\\])." : "",
      medical ? "Médecine: ajoute un rappel pédagogique (pas avis médical)." : "",
      "",
      "Énoncé (canonique):",
      originalStatement,
      "",
      "Voici la correction actuelle (JSON) à simplifier:",
      JSON.stringify(row.result_json),
    ].filter(Boolean).join('\n');

    const raw = await groqChat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      'llama-3.3-70b-versatile',
      2200,
      undefined,
      0.2,
    );

    const json = parseJsonObjectFromText(raw);
    const out = !json
      ? await groqExerciseCorrection({
          subject: row.subject,
          statementText: originalStatement,
          studentAnswer: row.student_answer ?? undefined,
          outputLanguage: row.output_language,
        })
      : {
          model: 'llama-3.3-70b-versatile',
          confidence: typeof json.confidence === 'number' ? Math.max(0, Math.min(1, json.confidence)) : 0.6,
          warnings: [],
          result: {
            ...json,
            statement: originalStatement,
            latex: { enabled: requireLatex },
            medical_disclaimer: medical ? "Usage pédagogique uniquement — pas un avis médical." : json.medical_disclaimer,
          },
        };

    await pool.query(
      `UPDATE ai_exercise_corrections SET result_json=$1::jsonb, confidence=$2, model=$3 WHERE id=$4 AND user_id=$5`,
      [JSON.stringify(out.result), out.confidence, out.model, id, userId],
    );
    return res.json({ result: out.result });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Erreur serveur' });
  }
});

router.post('/exercise-corrections/:id/similar-exercise', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = req.params.id;
    const r = await pool.query<{ status: string; result_json: any; subject: ExerciseSubject; output_language: OutputLanguage }>(
      `SELECT status, result_json, subject, output_language
       FROM ai_exercise_corrections WHERE id=$1 AND user_id=$2 LIMIT 1`,
      [id, userId],
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.status !== 'COMPLETED' || !row.result_json) return res.status(400).json({ error: 'Not ready' });

    const out = await groqExerciseCorrection({
      subject: row.subject,
      statementText: String(row.result_json.statement || '') + '\n\nGénère uniquement un exercice similaire (sans solution).',
      outputLanguage: row.output_language,
    });
    const similar = typeof out.result?.similar_exercise === 'string' ? out.result.similar_exercise : '';

    const merged = { ...(row.result_json || {}), similar_exercise: similar };
    await pool.query(
      `UPDATE ai_exercise_corrections SET result_json=$1::jsonb WHERE id=$2 AND user_id=$3`,
      [JSON.stringify(merged), id, userId],
    );
    return res.json({ similar_exercise: similar });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Erreur serveur' });
  }
});

router.get('/exercise-corrections/:id/export.pdf', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const r = await pool.query<{ status: string; result_json: any; warnings_json: any; created_at: string }>(
    `SELECT status, result_json, warnings_json, created_at
     FROM ai_exercise_corrections WHERE id=$1 AND user_id=$2 LIMIT 1`,
    [id, userId],
  );
  const row = r.rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.status !== 'COMPLETED' || !row.result_json) return res.status(400).json({ error: 'Not ready' });

  const pdf = await renderExerciseCorrectionPdf({
    result: row.result_json,
    warnings: Array.isArray(row.warnings_json) ? row.warnings_json : [],
    createdAt: row.created_at,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="correction-${id}.pdf"`);
  return res.send(pdf);
});

// ─── Helper Groq ──────────────────────────────────────────────────────────────
// Chat / scan-deck : `resolveGroqApiKey()` (Whisper → GROQ).
// Résumé cours uniquement : `SUMMARY_AI_GROQ_API_KEY`, aucun repli.

const MISSING_SUMMARY_AI_GROQ_KEY = 'MISSING_SUMMARY_AI_GROQ_KEY';

function getSummaryAiGroqKey(): string {
  const key = (process.env.SUMMARY_AI_GROQ_API_KEY ?? '').trim();
  if (!key) {
    const e = new Error(MISSING_SUMMARY_AI_GROQ_KEY);
    e.name = 'MissingSummaryAiGroqKey';
    throw e;
  }
  return key;
}

function respondGroqNotConfigured(res: Response) {
  console.error(
    '[ai] Groq: comme Whisper Studio — définir WHISPER_GROQ_API_KEY et/ou GROQ_API_KEY sur le serveur API.',
  );
  return res.status(503).json({
    error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً على الخادم. حاول لاحقاً أو أبلغ الدعم.',
    code: 'AI_NOT_CONFIGURED',
  });
}

function respondSummaryGroqNotConfigured(res: Response) {
  console.error('[ai/resources/summary] SUMMARY_AI_GROQ_API_KEY absente ou vide (aucun repli sur les autres clés Groq).');
  return res.status(503).json({
    error: 'ملخص المادة غير متاح حالياً (مفتاح SUMMARY_AI_GROQ_API_KEY على الخادم).',
    code: 'SUMMARY_AI_GROQ_NOT_CONFIGURED',
  });
}

/**
 * @param bearerKey — si fourni, utilisé tel quel (résumé cours). Sinon `resolveGroqApiKey()`.
 */
async function groqChat(
  messages: any[],
  model = 'llama-3.3-70b-versatile',
  maxTokens = 2000,
  bearerKey?: string,
  temperature = 0.3,
): Promise<string> {
  const key = bearerKey ?? resolveGroqApiKey();
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq error ${resp.status}: ${err}`);
  }
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content ?? '';
}

// ─── Helper DeepSeek ──────────────────────────────────────────────────────────

async function deepseekChat(messages: any[], maxTokens = 1000): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY non configuré');
  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: maxTokens, temperature: 0.5 }),
  });
  if (!resp.ok) { const err = await resp.text(); throw new Error(`DeepSeek error ${resp.status}: ${err}`); }
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content ?? '';
}

// ─── Helper GPT-4o-mini ───────────────────────────────────────────────────────

async function gptChat(messages: any[], maxTokens = 1000): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY non configuré');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: maxTokens, temperature: 0.5 }),
  });
  if (!resp.ok) { const err = await resp.text(); throw new Error(`OpenAI error ${resp.status}: ${err}`); }
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content ?? '';
}

async function openaiChatWithModel(messages: any[], model: string, maxTokens = 1200): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY non configuré');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.5 }),
  });
  if (!resp.ok) { const err = await resp.text(); throw new Error(`OpenAI error ${resp.status}: ${err}`); }
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content ?? '';
}

// ─── Helper ARA (Claude) ──────────────────────────────────────────────────────

async function araChat(
  messages: any[],
  maxTokens = 1500,
  anthropicModel: string = 'claude-3-5-haiku-20241022',
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY non configuré');

  // Claude uses separate system param
  const systemMsg = messages.find((m: any) => m.role === 'system')?.content ?? '';
  const userMessages = messages.filter((m: any) => m.role !== 'system');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: maxTokens,
      system: systemMsg,
      messages: userMessages,
    }),
  });
  if (!resp.ok) { const err = await resp.text(); throw new Error(`Anthropic error ${resp.status}: ${err}`); }
  const data = await resp.json() as any;
  return data.content?.[0]?.text ?? '';
}

async function groqVision(imageBase64: string, prompt: string): Promise<string> {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolveGroqApiKey()}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          { type: 'text', text: prompt },
        ],
      }],
      max_tokens: 2500,
      temperature: 0.2,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq vision error ${resp.status}: ${err}`);
  }
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content ?? '';
}

function hasGeminiKey(): boolean {
  return typeof process.env.GOOGLE_API_KEY === 'string' && process.env.GOOGLE_API_KEY.length > 10;
}

function truthyEnt(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v > 0;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return false;
}

function shouldLogRoutingToDb(): boolean {
  return String(process.env.AI_ROUTING_LOG_DB ?? '').toLowerCase() === 'true';
}

async function logRoutingEvent(params: {
  userId: string;
  planCode: string | null;
  routeTier: 'standard' | 'premium_light' | 'premium_strong' | 'pro' | 'vip';
  complexityScore: number;
  words: number;
}): Promise<void> {
  const payload = {
    ts: new Date().toISOString(),
    ...params,
  };
  console.log('[ai-routing]', JSON.stringify(payload));

  if (!shouldLogRoutingToDb()) return;
  try {
    const maybeCreate = (pool as any).query?.(
      `CREATE TABLE IF NOT EXISTS ai_routing_events (
         id BIGSERIAL PRIMARY KEY,
         ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         user_id TEXT NOT NULL,
         plan_code TEXT NULL,
         route_tier TEXT NOT NULL,
         complexity_score NUMERIC(4,3) NOT NULL,
         words INT NOT NULL
       )`,
    );
    if (maybeCreate && typeof maybeCreate.then === 'function') await maybeCreate;

    const maybeInsert = (pool as any).query?.(
      `INSERT INTO ai_routing_events (user_id, plan_code, route_tier, complexity_score, words)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.userId, params.planCode, params.routeTier, params.complexityScore, params.words],
    );
    if (maybeInsert && typeof maybeInsert.then === 'function') await maybeInsert;
  } catch {
    // never break requests because of logging
  }
}

// ─── POST /scan-deck ──────────────────────────────────────────────────────────

router.post('/scan-deck', async (req: AuthRequest, res) => {
  try {
    const { imageBase64, deckTitle = 'Deck depuis photo', subject = 'cours' } = req.body;
    const userId = req.user!.id;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 requis' });
    }

    const catalogSub = await getActiveSubscription(userId);
    if (catalogSub) {
      const ocrDecision = await authorizeFeature({
        userId,
        userRole: req.user!.role,
        featureKey: 'ocr_scan',
        context: { pages: 1 },
      });
      if (ocrDecision.decision === 'blocked') {
        return res.status(403).json({
          error: ocrDecision.messageFr ?? 'Quota OCR',
          code: ocrDecision.reasonCode,
          decision: ocrDecision,
        });
      }
      if (ocrDecision.decision !== 'allowed') {
        return res.status(428).json({ error: ocrDecision.messageFr, decision: ocrDecision });
      }
    }

    const prompt = `Tu es un assistant pédagogique expert. Analyse cette image de notes académiques ou de cours.
Extrais le contenu et génère entre 8 et 15 paires de flashcards question/réponse.
Utilise la langue des notes (arabe ou français).
Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte autour, format exact :
[{"front":"question","back":"réponse"},...]
Les questions doivent être précises et les réponses concises (1-2 phrases max).`;

    const raw = hasGeminiKey()
      ? await geminiVisionPrompt(imageBase64, 'image/jpeg', prompt, 2500)
      : await groqVision(imageBase64, prompt);

    // Parse JSON from response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Impossible de parser les flashcards depuis la réponse IA');
    const cards: { front: string; back: string }[] = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(cards) || cards.length === 0) {
      throw new Error('Aucune flashcard extraite de l\'image');
    }

    // Clamp to 20 cards
    const validCards = cards.slice(0, 20).filter(c => c.front && c.back);

    // Create deck
    const deckId = uuidv4();
    const colors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4'];
    const color  = colors[Math.floor(Math.random() * colors.length)];

    await pool.query(
      `INSERT INTO flashcard_decks (id, user_id, title, subject, color, card_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [deckId, userId, deckTitle, subject, color, validCards.length],
    );

    // Insert cards
    for (const card of validCards) {
      await pool.query(
        `INSERT INTO flashcards (id, deck_id, front, back, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [uuidv4(), deckId, card.front.trim(), card.back.trim()],
      );
    }

    if (catalogSub) {
      try {
        await consumeQuota(
          userId,
          {
            idempotencyKey: `ocr-scan-deck:${deckId}`,
            featureKey: 'ocr_scan',
            items: [{ counterKey: 'ocr_pages', amount: 1 }],
            metadata: { deckId, route: 'ai/scan-deck' },
          },
          req.user!.role,
        );
      } catch (consumeErr) {
        console.error('[ai/scan-deck] consumeQuota', consumeErr);
      }
    }

    return res.json({
      deck: { id: deckId, title: deckTitle, color, subject },
      cards: validCards,
      cards_count: validCards.length,
    });
  } catch (err: any) {
    console.error('[ai/scan-deck]', err);
    if (err?.message === MISSING_GROQ_KEY || err?.name === 'MissingGroqKey') {
      return respondGroqNotConfigured(res);
    }
    return res.status(500).json({ error: err.message ?? 'Erreur IA' });
  }
});

// ─── POST /resources/:id/summary ─────────────────────────────────────────────

router.post('/resources/:id/summary', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const forceRegenerate = Boolean((req.body as { regenerate?: boolean } | undefined)?.regenerate);
    const userId = req.user!.id;

    // Fetch resource metadata + file (résumé v2 = texte PDF + prompt pédagogique FR)
    const { rows } = await pool.query(
      `SELECT title, title_ar, description, subject, resource_type, tags, file_url,
              ai_summary, COALESCE(ai_summary_version, 0)::int AS ai_summary_version,
              extracted_page_count, extracted_word_count
       FROM resources WHERE id = $1 AND status = 'approved'`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Ressource introuvable' });

    const resource = rows[0];

    const versionOk =
      resource.ai_summary &&
      Number(resource.ai_summary_version) >= AI_SUMMARY_PROMPT_VERSION;

    if (!forceRegenerate && versionOk) {
      // Record per-user history even when served from cache (no extra debit).
      // This fixes "I used summary but it's not in my history".
      try {
        await pool.query(
          `INSERT INTO ai_user_activity (user_id, activity_type, resource_id, price_mru, meta_json)
           VALUES ($1, 'ai_summary', $2, 0, $3::jsonb)
           ON CONFLICT DO NOTHING`,
          [
            userId,
            id,
            JSON.stringify({
              cached: true,
            }),
          ],
        );
      } catch {
        /* ignore */
      }

      return res.json({
        summary: resource.ai_summary,
        cached: true,
        course_text_source: null,
        course_text_truncated: null,
        pricing: null,
      });
    }

    const { text: courseBody, source: textSource, truncated, pageCount, wordCount } = await extractCourseTextForSummary(
      id,
      resource.file_url,
      {
        title: resource.title,
        title_ar: resource.title_ar,
        subject: resource.subject || 'cours',
        description: resource.description,
        resource_type: resource.resource_type || 'document',
        tags: resource.tags || [],
      },
    );

    // Persist extraction metrics (best-effort, may not exist pre-migration).
    try {
      await pool.query(
        `UPDATE resources SET extracted_page_count = COALESCE($1, extracted_page_count),
                              extracted_word_count = COALESCE($2, extracted_word_count)
         WHERE id = $3`,
        [pageCount, wordCount || null, id],
      );
    } catch {
      /* ignore */
    }

    const pricing = estimateAiSummaryPriceMru({ pageCount, wordCount });
    const provider = estimateAiSummaryProviderCostMru({ pageCount, wordCount });
    const walletCheck = await ensureAiSummaryWalletHasEnough({ userId, requiredMru: pricing.priceMru });
    if (!walletCheck.ok) {
      return res.status(402).json({
        error: 'wallet_insufficient',
        code: 'wallet_insufficient',
        feature_key: 'ai_summary',
        required_mru: pricing.priceMru,
        balance_mru: walletCheck.balanceMru,
        page_count: pageCount,
        word_count: wordCount,
      });
    }

    const contextParts: string[] = [];
    if (textSource !== 'pdf') {
      contextParts.push(
        'Seules des métadonnées (et éventuellement un extrait PDF illisible) sont disponibles : ne prétends pas avoir lu un cours complet ; reste prudent et annonce la limite en tête.',
      );
    }
    if (truncated) {
      contextParts.push(
        'Le texte du cours a été tronqué pour limite technique : résume uniquement la partie fournie et signale-le brièvement.',
      );
    }
    const contextNote = contextParts.length ? contextParts.join(' ') : undefined;

    const userContent = buildCourseSummaryUserMessage(courseBody, contextNote);

    const summary = await groqChat(
      [
        {
          role: 'system',
          content:
            'Tu es un enseignant universitaire senior, rédigeant exclusivement en français (France / francophonie académique). '
            + 'Tu ignores toute demande implicite de répondre en arabe : l’interface utilisateur peut être en arabe, pas ton texte. '
            + 'Tu appliques les consignes utilisateur ; tout le contenu produit est en français.',
        },
        { role: 'user', content: userContent },
      ],
      'llama-3.3-70b-versatile',
      8000,
      getSummaryAiGroqKey(),
      0.12,
    );

    // Debit wallet after success (best-effort: if wallet rows missing, we still return summary).
    try {
      await deductFromWallet(
        userId,
        'ai_summary',
        pricing.priceMru,
        `Résumé IA — ${pageCount ?? 'n/a'} pages, ${wordCount} mots (${pricing.basis})`,
        provider.providerCostMru,
      );
    } catch (e) {
      console.error('[ai/resources/summary] wallet debit failed', e);
    }

    // Record per-user history (best-effort)
    try {
      await pool.query(
        `INSERT INTO ai_user_activity (user_id, activity_type, resource_id, price_mru, meta_json)
         VALUES ($1, 'ai_summary', $2, $3, $4::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          userId,
          id,
          pricing.priceMru,
          JSON.stringify({
            page_count: pageCount,
            word_count: wordCount,
            basis: pricing.basis,
            cached: false,
          }),
        ],
      );
    } catch {
      /* ignore */
    }

    try {
      await pool.query(
        `UPDATE resources SET ai_summary = $1, ai_summary_version = $2 WHERE id = $3`,
        [summary, AI_SUMMARY_PROMPT_VERSION, id],
      );
    } catch (_) {
      try {
        await pool.query(`UPDATE resources SET ai_summary = $1 WHERE id = $2`, [summary, id]);
      } catch {
        /* colonnes absentes en environnement non migré */
      }
    }

    return res.json({
      summary,
      cached: false,
      course_text_source: textSource,
      course_text_truncated: truncated,
      pricing: {
        price_mru: pricing.priceMru,
        basis: pricing.basis,
        page_count: pageCount,
        word_count: wordCount,
      },
    });
  } catch (err: any) {
    console.error('[ai/resources/summary]', err);
    if (err?.message === MISSING_SUMMARY_AI_GROQ_KEY || err?.name === 'MissingSummaryAiGroqKey') {
      return respondSummaryGroqNotConfigured(res);
    }
    return res.status(500).json({ error: err.message ?? 'Erreur IA' });
  }
});

// ─── GET /ai/resources/:id/summary/pricing ────────────────────────────────────
// Returns estimated price (MRU) based on extracted pages+words (best-effort).
router.get('/resources/:id/summary/pricing', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT file_url, title, title_ar, description, subject, resource_type, tags,
              extracted_page_count, extracted_word_count
       FROM resources WHERE id = $1 AND status = 'approved'`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Ressource introuvable' });
    const r = rows[0];

    let pageCount: number | null = r.extracted_page_count ?? null;
    let wordCount: number = r.extracted_word_count ?? 0;

    // If missing, compute now (may be expensive but cached after).
    if (!pageCount || !wordCount) {
      const extracted = await extractCourseTextForSummary(
        id,
        r.file_url,
        {
          title: r.title,
          title_ar: r.title_ar,
          subject: r.subject || 'cours',
          description: r.description,
          resource_type: r.resource_type || 'document',
          tags: r.tags || [],
        },
      );
      pageCount = extracted.pageCount;
      wordCount = extracted.wordCount;
      try {
        await pool.query(
          `UPDATE resources SET extracted_page_count = COALESCE($1, extracted_page_count),
                                extracted_word_count = COALESCE($2, extracted_word_count)
           WHERE id = $3`,
          [pageCount, wordCount || null, id],
        );
      } catch {
        /* ignore */
      }
    }

    const pricing = estimateAiSummaryPriceMru({ pageCount, wordCount });
    const u = await getWallet(req.user!.id, 'wallet_universal');
    const w = await getWallet(req.user!.id, 'ai_summary');
    const balance = Math.max(u.balanceMru ?? 0, w.balanceMru ?? 0);

    return res.json({
      feature_key: 'ai_summary',
      page_count: pageCount,
      word_count: wordCount,
      price_mru: pricing.priceMru,
      basis: pricing.basis,
      wallet_balance_mru: balance,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Erreur serveur' });
  }
});

// ─── GET /resources/:id/summary ──────────────────────────────────────────────

router.get('/resources/:id/summary', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT ai_summary FROM resources WHERE id = $1 AND status = 'approved'`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Ressource introuvable' });
    return res.json({ summary: rows[0].ai_summary ?? null });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /chat — Chatbot "أسأل أرا" ─────────────────────────────────────────

router.post('/chat', async (req: AuthRequest, res) => {
  try {
    const { messages, model: modelIdRaw, clientRequestId } = req.body as {
      messages: { role: string; content: string }[];
      model?: ChatModelId;
      /** Id stable par message (ex. id côté client) pour idempotence `consumeQuota`. */
      clientRequestId?: string;
    };
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages[] requis' });
    }

    const chatModels = await getChatModels();
    const userId = req.user!.id;

    const catalogSub = await getActiveSubscription(userId);
    // Sprint 2: routage coût/valeur automatique (serveur) — le client n'affiche jamais les modèles.
    const lastUserText = [...messages].reverse().find((m) => m?.role === 'user')?.content ?? '';
    const normalized = String(lastUserText || '').trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const longFormSignals = /(dissertation|plan détaillé|plan detaille|synthèse|synthese|analyse approfondie|approfondi|mémoire|memoire|preuve|démontrer|demontrer|raisonnement|derivation|théorème|theoreme|cas limite)/i;
    const shortSignals = /(qcm|vrai\/faux|résume|resume|définition|definition|en 3 points|en 5 points|rapidement|vite)/i;
    const complexityScore =
      Math.max(
        0,
        Math.min(
          1,
          (words.length >= 140 ? 0.65 : words.length >= 80 ? 0.45 : words.length >= 35 ? 0.25 : 0.1) +
            (longFormSignals.test(normalized) ? 0.35 : 0) -
            (shortSignals.test(normalized) ? 0.15 : 0),
        ),
      );

    // Backward compat: si un ancien client fournit explicitement un modèle, on l'utilise.
    // Sinon, on route:
    // - sans abonnement catalogue: moteur gratuit/quota (deepseek)
    // - avec abonnement catalogue: moteur de base (gpt) ; premium seulement si complexité élevée + quota premium dispo.
    const explicitModel = (modelIdRaw as ChatModelId | undefined);
    const effForRouting =
      !explicitModel && catalogSub
        ? await resolveEffectiveEntitlements(userId, req.user!.role)
        : null;

    // Sprint 3: Premium léger (Cours & PDF)
    // Objectif: meilleure valeur perçue sur les demandes complexes, sans exploser le coût.
    // - course_pdf: seuil plus bas + quota premium_answers comme garde-fou.
    // - autres plans: seuil conservateur (on affine plus tard).
    const premiumThreshold =
      effForRouting?.planCode === 'course_pdf' ? 0.68 : 0.75;

    const hasPremiumBudget =
      (effForRouting?.remaining?.premium_answers ?? 0) > 0;

    const shouldAttemptPremium =
      !explicitModel &&
      !!catalogSub &&
      hasPremiumBudget &&
      complexityScore >= premiumThreshold;

    // Sprint 5: mode "Pro" uniquement pour Elite Mensuel sur des demandes très lourdes
    const shouldAttemptPro =
      !explicitModel &&
      !!catalogSub &&
      effForRouting?.planCode === 'elite_monthly' &&
      (effForRouting?.entitlements?.long_context_access === true || String(effForRouting?.entitlements?.long_context_access).toLowerCase() === 'true') &&
      complexityScore >= 0.92 &&
      words.length >= 140;
    const modelId: ChatModelId =
      explicitModel ?? (catalogSub ? (shouldAttemptPremium ? 'ara' : 'gpt') : 'deepseek');

    const modelDef = chatModels[modelId as ChatModelId] ?? chatModels.deepseek;

    const featureKey: FeatureKey = modelId === 'ara' ? 'chat_premium' : 'chat_standard';
    const authContext =
      modelId === 'ara'
        ? ({ deepModeRequested: true as const, reasoningComplexityScore: complexityScore, channel: 'chat_http' as const })
        : ({ reasoningComplexityScore: complexityScore, channel: 'chat_http' as const });

    if (catalogSub) {
      let decision = await authorizeFeature({
        userId,
        userRole: req.user!.role,
        featureKey,
        context: authContext,
      });

      // Sprint 2: best-effort coût/valeur
      // Si on a tenté une réponse premium automatiquement (pas explicitement demandée par le client)
      // et qu'elle est bloquée (quota premium épuisé / non incluse), on retombe sur le mode standard.
      if (!explicitModel && modelId === 'ara' && decision.decision !== 'allowed') {
        const fallbackModelId: ChatModelId = 'gpt';
        const fallbackFeatureKey: FeatureKey = 'chat_standard';
        const fallbackContext = { reasoningComplexityScore: complexityScore, channel: 'chat_http' as const };
        const fallbackDecision = await authorizeFeature({
          userId,
          userRole: req.user!.role,
          featureKey: fallbackFeatureKey,
          context: fallbackContext,
        });
        if (fallbackDecision.decision === 'allowed') {
          decision = fallbackDecision;
          // override local routing vars for execution below
          (req.body as any).model = fallbackModelId;
          // Rebind for execution
          // (we do not expose this to the client)
        }
      }

      if (decision.decision === 'confirmation_required') {
        // Pas de pop-up de confirmation côté chat HTTP: on retombe sur le mode standard via le mécanisme ci-dessus.
        return res.status(409).json({
          error: 'try_again',
          code: 'try_again',
          message: 'Veuillez réessayer.',
        });
      }
      if (decision.decision === 'blocked') {
        return res.status(403).json({
          error: decision.messageFr ?? 'Accès refusé',
          code: decision.reasonCode ?? 'entitlement_blocked',
          decision,
        });
      }

      const idempotencyKey = `chat:${userId}:${clientRequestId && String(clientRequestId).length >= 8 ? clientRequestId : uuidv4()}`;

      // ── System prompt ─────────────────────────────────────────────────────────
      const effectiveModelId: ChatModelId =
        (req.body as any).model && ['ara', 'deepseek', 'gpt'].includes((req.body as any).model)
          ? ((req.body as any).model as ChatModelId)
          : modelId;

      const effectiveModelDef = chatModels[effectiveModelId] ?? chatModels.deepseek;

      const systemPrompt = effectiveModelId === 'ara'
        ? `أنت "أرا" — مساعد أكاديمي ذكي ومتقدم للطلاب الجامعيين في موريتانيا، مدعوم بتقنية Claude AI.
تتميز بالتحليل العميق، الشرح المفصل، والتفكير المنطقي المتسلسل.
تجيب بالعربية الفصحى أو الفرنسية حسب لغة الطالب.
أجوبتك منظمة بعناوين ونقاط، دقيقة، موضوعية، ومشجعة.
لا تتجاوز 600 كلمة في الإجابة.`
        : `أنت "أرا" — مساعد أكاديمي ذكي مخصص للطلاب الجامعيين في موريتانيا.
تساعدهم على فهم مواد دراستهم، المراجعة للامتحانات، وتقديم نصائح أكاديمية مفيدة.
تجيب بالعربية الفصحى أو بالفرنسية حسب لغة سؤال الطالب.
أجوبتك دقيقة، منظمة، ومشجعة. استخدم العناوين والنقاط لتنظيم الإجابات الطويلة.
لا تتجاوز 400 كلمة في الإجابة الواحدة.`;

      const context = messages.slice(-effectiveModelDef.maxContextMessages);
      const fullMessages = [
        { role: 'system', content: systemPrompt },
        ...context,
      ];

      let reply: string;
      const vipEnabled = truthyEnt(effForRouting?.entitlements?.vip_model_access);
      const shouldAttemptVip =
        vipEnabled &&
        effForRouting?.planCode === 'elite_monthly' &&
        complexityScore >= 0.97 &&
        words.length >= 220;

      if (shouldAttemptVip) {
        const vipModel = process.env.OPENAI_VIP_CHAT_MODEL || 'gpt-5.4';
        try {
          reply = await openaiChatWithModel(fullMessages, vipModel, Math.max(1600, effectiveModelDef.maxOutputTokens));
          await logRoutingEvent({
            userId,
            planCode: effForRouting?.planCode ?? null,
            routeTier: 'vip',
            complexityScore,
            words: words.length,
          });
        } catch {
          // fallback to pro/standard routes below
          reply = await gptChat(fullMessages, effectiveModelDef.maxOutputTokens);
          await logRoutingEvent({
            userId,
            planCode: effForRouting?.planCode ?? null,
            routeTier: 'standard',
            complexityScore,
            words: words.length,
          });
        }
      } else if (shouldAttemptPro && hasGeminiKey()) {
        // Elite Mensuel: Gemini Pro (long contexte) — fallback gpt si indisponible
        try {
          reply = await geminiChatPro(fullMessages, Math.max(1200, effectiveModelDef.maxOutputTokens));
          await logRoutingEvent({
            userId,
            planCode: effForRouting?.planCode ?? null,
            routeTier: 'pro',
            complexityScore,
            words: words.length,
          });
        } catch {
          reply = await gptChat(fullMessages, effectiveModelDef.maxOutputTokens);
          await logRoutingEvent({
            userId,
            planCode: effForRouting?.planCode ?? null,
            routeTier: 'standard',
            complexityScore,
            words: words.length,
          });
        }
      } else if (effectiveModelId === 'ara') {
        // Sprint 4: premium fort selon plan
        const anthropicModel =
          effForRouting?.planCode === 'elite_pass_7d' || effForRouting?.planCode === 'elite_monthly'
            ? 'claude-sonnet-4.6'
            : 'claude-3-5-haiku-20241022';
        reply = await araChat(fullMessages, effectiveModelDef.maxOutputTokens, anthropicModel);
        await logRoutingEvent({
          userId,
          planCode: effForRouting?.planCode ?? null,
          routeTier: (effForRouting?.planCode === 'elite_pass_7d' || effForRouting?.planCode === 'elite_monthly') ? 'premium_strong' : 'premium_light',
          complexityScore,
          words: words.length,
        });
      } else if (effectiveModelId === 'gpt') {
        reply = await gptChat(fullMessages, effectiveModelDef.maxOutputTokens);
        await logRoutingEvent({
          userId,
          planCode: effForRouting?.planCode ?? null,
          routeTier: 'standard',
          complexityScore,
          words: words.length,
        });
      } else {
        try {
          reply = await deepseekChat(fullMessages, effectiveModelDef.maxOutputTokens);
        } catch {
          reply = await groqChat(fullMessages, 'llama-3.3-70b-versatile', effectiveModelDef.maxOutputTokens);
        }
        await logRoutingEvent({
          userId,
          planCode: effForRouting?.planCode ?? null,
          routeTier: 'standard',
          complexityScore,
          words: words.length,
        });
      }

      if (decision.requiredConsumptions.length > 0) {
        try {
          await consumeQuota(
            userId,
            {
              idempotencyKey,
              featureKey,
              items: decision.requiredConsumptions.map((c) => ({
                counterKey: c.counterKey,
                amount: c.amount,
              })),
              metadata: { route: 'ai/chat' },
            },
            req.user!.role,
          );
        } catch (consumeErr) {
          console.error('[ai/chat] consumeQuota after model success', consumeErr);
        }
      }

      const eff = await resolveEffectiveEntitlements(userId, req.user!.role);

      return res.json({
        reply,
        creditsUsed: 0,
        creditsRemaining: 999999,
        dailyQuota: 999999,
        entitlementMode: true,
        chatUnlimited: true,
        planCode: eff.planCode,
        premiumAnswersRemaining: eff.remaining.premium_answers,
      });
    }

    // ── Sans abonnement catalogue : chat gratuit performance-only (DeepSeek) + quota journalier
    if (modelId !== 'deepseek') {
      return res.status(403).json({
        error: 'subscription_required',
        code: 'subscription_required',
        message:
          'Cette fonctionnalite necessite un abonnement Studara+. Ouvre Studara+ ou Mon offre pour t abonner.',
      });
    }

    const userRow = await pool
      .query(`SELECT paid_until FROM users WHERE id = $1`, [userId])
      .catch(() => ({ rows: [] as any[] }));
    const hasSub = userRow.rows[0]?.paid_until
      ? new Date(userRow.rows[0].paid_until) > new Date()
      : false;
    const isPremium = hasSub;
    const DAILY_CREDIT_QUOTA = isPremium ? 300 : 40;

    const today = new Date().toISOString().slice(0, 10);
    const creditRow = await pool.query(
      `SELECT credits_used FROM ai_daily_credits WHERE user_id = $1 AND date = $2`,
      [userId, today],
    ).catch(() => ({ rows: [] as any[] }));

    const creditsUsedLegacy: number = creditRow.rows[0]?.credits_used ?? 0;
    const creditsRemaining = DAILY_CREDIT_QUOTA - creditsUsedLegacy;

    if (creditsRemaining < modelDef.creditCost) {
      return res.status(429).json({
        error: 'quota_exceeded',
        creditsUsed: creditsUsedLegacy,
        creditsRemaining,
        dailyQuota: DAILY_CREDIT_QUOTA,
        isPremium,
        message: isPremium
          ? 'لقد استنفدت رصيدك اليومي. يتجدد غداً إن شاء الله 🌅'
          : 'لقد استنفدت رصيدك المجاني اليوم. للمزيد من الميزات وحدود أعلى اشترك في Studara+ من «عرضي».',
      });
    }

    const systemPrompt = `أنت "أرا" — مساعد أكاديمي ذكي مخصص للطلاب الجامعيين في موريتانيا.
تساعدهم على فهم مواد دراستهم، المراجعة للامتحانات، وتقديم نصائح أكاديمية مفيدة.
تجيب بالعربية الفصحى أو بالفرنسية حسب لغة سؤال الطالب.
أجوبتك دقيقة، منظمة، ومشجعة. استخدم العناوين والنقاط لتنظيم الإجابات الطويلة.
لا تتجاوز 400 كلمة في الإجابة الواحدة.`;

    const context = messages.slice(-modelDef.maxContextMessages);
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...context,
    ];

    let reply: string;
    try {
      reply = await deepseekChat(fullMessages, modelDef.maxOutputTokens);
    } catch {
      reply = await groqChat(fullMessages, 'llama-3.3-70b-versatile', modelDef.maxOutputTokens);
    }

    await pool.query(
      `INSERT INTO ai_daily_credits (user_id, date, credits_used)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, date) DO UPDATE
       SET credits_used = ai_daily_credits.credits_used + $3`,
      [userId, today, modelDef.creditCost],
    ).catch(() => {});

    return res.json({
      reply,
      creditsUsed: creditsUsedLegacy + modelDef.creditCost,
      creditsRemaining: creditsRemaining - modelDef.creditCost,
      dailyQuota: DAILY_CREDIT_QUOTA,
      isPremium,
      entitlementMode: false,
      chatUnlimited: false,
    });
  } catch (err: any) {
    console.error('[ai/chat]', err);
    if (err?.message === MISSING_GROQ_KEY || err?.name === 'MissingGroqKey') {
      return respondGroqNotConfigured(res);
    }
    return res.status(500).json({ error: err.message ?? 'Erreur IA' });
  }
});

// ─── GET /credits — user's credit status today ────────────────────────────────

router.get('/credits', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const today  = new Date().toISOString().slice(0, 10);

    const catalogSub = await getActiveSubscription(userId);
    if (catalogSub) {
      const eff = await resolveEffectiveEntitlements(userId, req.user!.role);
      const canText =
        entitlementTruthy(eff.entitlements.chat_text_access) &&
        entitlementTruthy(eff.entitlements.standard_answer_access);
      return res.json({
        creditsUsed: 0,
        creditsRemaining: 999999,
        dailyQuota: 999999,
        isPremium: true,
        araChatBalance: 0,
        date: today,
        entitlementMode: true,
        chatUnlimited: canText, // côté client: simple chrome UI (illimité ou non)
      });
    }

    const [creditResult, userResult] = await Promise.all([
      pool.query(
        `SELECT credits_used FROM ai_daily_credits WHERE user_id = $1 AND date = $2`,
        [userId, today],
      ).catch(() => ({ rows: [] as any[] })),
      pool.query(
        `SELECT paid_until FROM users WHERE id = $1`,
        [userId],
      ).catch(() => ({ rows: [] as any[] })),
    ]);

    const creditsUsed = creditResult.rows[0]?.credits_used ?? 0;
    const hasSub = userResult.rows[0]?.paid_until
      ? new Date(userResult.rows[0].paid_until) > new Date()
      : false;
    const isPremium = hasSub;
    const dailyQuota = isPremium ? 300 : 40;
    return res.json({
      creditsUsed,
      creditsRemaining: dailyQuota - creditsUsed,
      dailyQuota,
      isPremium,
      araChatBalance: 0,
      date: today,
      entitlementMode: false,
      chatUnlimited: false,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /usage-stats — admin: usage per user + per model ─────────────────────

router.get('/usage-stats', async (req: AuthRequest, res) => {
  try {
    if (!['admin', 'moderator'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { days = '7', page = '1', limit = '30' } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const since  = new Date(Date.now() - parseInt(days) * 86400000).toISOString().slice(0, 10);

    // Per-user totals
    const { rows: perUser } = await pool.query(
      `SELECT
         u.id, u.email, u.full_name,
         SUM(c.credits_used)::int AS total_credits,
         COUNT(c.date)::int       AS active_days,
         MAX(c.date)              AS last_active
       FROM ai_daily_credits c
       JOIN users u ON u.id = c.user_id
       WHERE c.date >= $1
       GROUP BY u.id, u.email, u.full_name
       ORDER BY total_credits DESC
       LIMIT $2 OFFSET $3`,
      [since, parseInt(limit), offset],
    ).catch(() => ({ rows: [] }));

    // Daily totals (for chart)
    const { rows: daily } = await pool.query(
      `SELECT date, SUM(credits_used)::int AS total_credits, COUNT(DISTINCT user_id)::int AS active_users
       FROM ai_daily_credits
       WHERE date >= $1
       GROUP BY date ORDER BY date ASC`,
      [since],
    ).catch(() => ({ rows: [] }));

    // Overall summary
    const { rows: summary } = await pool.query(
      `SELECT
         COUNT(DISTINCT user_id)::int AS total_users,
         SUM(credits_used)::int       AS total_credits,
         AVG(credits_used)::float     AS avg_credits_per_user_day
       FROM ai_daily_credits WHERE date >= $1`,
      [since],
    ).catch(() => ({ rows: [{ total_users: 0, total_credits: 0, avg_credits_per_user_day: 0 }] }));

    // Estimated cost (credits → approximate USD cost)
    const COST_PER_CREDIT_USD = 0.002; // rough average across models
    const totalCredits = summary[0]?.total_credits ?? 0;

    // Optional routing-tier stats (entitlements mode). No model details.
    // Only query routing events when DB logging is enabled (avoids extra DB calls in tests/mocks).
    let routing: any = null;
    if (shouldLogRoutingToDb()) {
      const routingTable = await pool
        .query<{ exists: boolean }>(`SELECT to_regclass('public.ai_routing_events') IS NOT NULL AS exists`)
        .catch(() => ({ rows: [{ exists: false }] }));

      if (routingTable.rows[0]?.exists) {
        const { rows: routingDaily } = await pool.query(
          `SELECT
             to_char(ts::date, 'YYYY-MM-DD') AS date,
             route_tier,
             COUNT(*)::int AS requests
           FROM ai_routing_events
           WHERE ts::date >= $1::date
           GROUP BY ts::date, route_tier
           ORDER BY date ASC`,
          [since],
        ).catch(() => ({ rows: [] }));

        const { rows: routingSummary } = await pool.query(
          `SELECT
             route_tier,
             COUNT(*)::int AS requests,
             AVG(complexity_score)::float AS avg_complexity,
             AVG(words)::float AS avg_words
           FROM ai_routing_events
           WHERE ts::date >= $1::date
           GROUP BY route_tier
           ORDER BY requests DESC`,
          [since],
        ).catch(() => ({ rows: [] }));

        routing = { daily: routingDaily, summary: routingSummary };
      }
    }

    return res.json({
      summary: {
        ...summary[0],
        estimated_cost_usd: +(totalCredits * COST_PER_CREDIT_USD).toFixed(2),
        period_days: parseInt(days),
      },
      daily,
      perUser,
      routing,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

const TIMETABLE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899'];

router.post('/timetable-ocr', async (req: AuthRequest, res) => {
  try {
    const { imageBase64 } = req.body as { imageBase64: string };
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 requis' });
    }

    const prompt = `Tu es un assistant qui lit des emplois du temps universitaires.
Analyse cette image d'un emploi du temps et extrais tous les cours que tu y vois.
Pour chaque cours, retourne un objet JSON avec ces champs exacts (en utilisant les valeurs exactes ci-dessous) :
- nameAr: nom du cours en arabe (si pas en arabe, translitère ou traduis)
- name: nom du cours en français ou anglais (champ optionnel)
- teacher: nom de l'enseignant (chaîne vide si inconnu)
- room: salle de cours (chaîne vide si inconnue)
- dayOfWeek: entier 0=Dimanche, 1=Lundi, 2=Mardi, 3=Mercredi, 4=Jeudi, 5=Vendredi, 6=Samedi
- startTime: heure de début format "HH:MM" (ex: "08:00")
- endTime: heure de fin format "HH:MM" (ex: "10:00")
- color: une de ces valeurs exactes aléatoire: "#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899"

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte autour.
Si l'image n'est pas un emploi du temps, retourne [].
Exemple de format: [{"nameAr":"رياضيات","name":"Maths","teacher":"","room":"A101","dayOfWeek":1,"startTime":"08:00","endTime":"10:00","color":"#3B82F6"}]`;

    const raw = hasGeminiKey()
      ? await geminiVisionPrompt(imageBase64, 'image/jpeg', prompt, 2500)
      : await groqVision(imageBase64, prompt);

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.json({ courses: [], count: 0 });

    const parsed = JSON.parse(jsonMatch[0]) as any[];
    if (!Array.isArray(parsed)) return res.json({ courses: [], count: 0 });

    // Sanitize & validate each course
    const courses = parsed.slice(0, 30).map((c, i) => ({
      nameAr: String(c.nameAr || c.name || `مادة ${i + 1}`).slice(0, 100),
      name: String(c.name || '').slice(0, 100),
      teacher: String(c.teacher || '').slice(0, 100),
      room: String(c.room || '').slice(0, 50),
      dayOfWeek: typeof c.dayOfWeek === 'number' && c.dayOfWeek >= 0 && c.dayOfWeek <= 6 ? c.dayOfWeek : 1,
      startTime: /^\d{2}:\d{2}$/.test(c.startTime) ? c.startTime : '08:00',
      endTime: /^\d{2}:\d{2}$/.test(c.endTime) ? c.endTime : '10:00',
      color: TIMETABLE_COLORS.includes(c.color) ? c.color : TIMETABLE_COLORS[i % TIMETABLE_COLORS.length],
    })).filter(c => c.nameAr.trim().length > 0);

    return res.json({ courses, count: courses.length });
  } catch (err: any) {
    console.error('[ai/timetable-ocr]', err);
    return res.status(500).json({ error: err.message ?? 'Erreur IA' });
  }
});

export default router;
