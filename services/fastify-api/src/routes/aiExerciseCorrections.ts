import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { corrections, documents, newId } from '../store.js';
import type { DocStatus, ExerciseCorrection, ExerciseDocument, ExerciseSubject, JobStatus } from '../types.js';
import { groqSolveExercise, groqVisionOcr } from '../ai/groq.js';

const SubjectSchema = z.enum([
  'mathematiques',
  'physique',
  'chimie',
  'economie',
  'comptabilite',
  'finance',
  'informatique',
  'biologie',
  'medecine',
]);

export async function registerAiExerciseCorrectionRoutes(app: FastifyInstance) {
  // NOTE: auth is assumed to be handled upstream in the real Studara API.
  // This standalone service accepts requests without auth for local dev.

  app.post('/api/v1/ai/exercise-corrections/documents/text', async (req, reply) => {
    const body = z.object({ statementText: z.string().min(10).max(8000) }).parse(req.body);
    const id = newId('exdoc');
    const now = Date.now();
    const doc: ExerciseDocument = {
      id,
      status: 'TEXT_READY',
      statementText: body.statementText,
      warnings: [],
      createdAt: now,
      updatedAt: now,
    };
    documents.set(id, doc);
    return reply.send({ documentId: id, status: doc.status });
  });

  app.post('/api/v1/ai/exercise-corrections/documents', async (req, reply) => {
    const mp: any = await (req as any).file?.();
    if (!mp) return reply.code(400).send({ error: 'missing file' });

    const id = newId('exdoc');
    const now = Date.now();
    const doc: ExerciseDocument = {
      id,
      status: 'UPLOADED',
      originalFilename: mp.filename,
      mimeType: mp.mimetype,
      warnings: [],
      createdAt: now,
      updatedAt: now,
    };
    documents.set(id, doc);

    // Read file into memory (dev). In production: stream to disk/S3 and store path.
    const buf = await mp.toBuffer();
    doc.storagePath = `memory:${buf.length}`;
    doc.status = 'TEXT_EXTRACTING';
    doc.updatedAt = Date.now();
    documents.set(id, doc);

    // Async extraction
    setTimeout(async () => {
      try {
        const isImage = String(doc.mimeType || '').startsWith('image/');
        if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing (OCR/vision disabled).');
        if (!isImage) {
          // Minimal: PDF/text extraction not implemented in this standalone service.
          throw new Error('Only image OCR is supported in this standalone service (for now).');
        }
        const base64 = buf.toString('base64');
        const ocr = await groqVisionOcr({
          apiKey: env.GROQ_API_KEY,
          model: env.GROQ_VISION_MODEL,
          base64,
          mimeType: doc.mimeType || 'image/jpeg',
        });
        const next: ExerciseDocument = {
          ...doc,
          status: 'TEXT_READY',
          statementText: ocr.text,
          ocrConfidence: ocr.confidence,
          warnings: [...(doc.warnings || []), ...(ocr.warnings || [])],
          updatedAt: Date.now(),
        };
        documents.set(id, next);
      } catch (e: any) {
        const next: ExerciseDocument = {
          ...doc,
          status: 'FAILED',
          errorMessage: e?.message ? String(e.message) : 'OCR failed',
          updatedAt: Date.now(),
        };
        documents.set(id, next);
      }
    }, 20);

    return reply.send({ documentId: id, status: doc.status });
  });

  app.get('/api/v1/ai/exercise-corrections/documents/:documentId', async (req, reply) => {
    const { documentId } = z.object({ documentId: z.string() }).parse(req.params);
    const doc = documents.get(documentId);
    if (!doc) return reply.code(404).send({ error: 'not found' });
    return reply.send({ status: doc.status, errorMessage: doc.errorMessage });
  });

  app.post('/api/v1/ai/exercise-corrections', async (req, reply) => {
    const body = z
      .object({
        documentId: z.string(),
        subject: SubjectSchema,
        studentAnswer: z.string().max(8000).optional(),
        outputLanguage: z.enum(['fr', 'ar', 'en', 'fr_ar']).optional(),
      })
      .parse(req.body);

    const doc = documents.get(body.documentId);
    if (!doc) return reply.code(404).send({ error: 'document not found' });
    if (doc.status !== 'TEXT_READY' || !doc.statementText) {
      return reply.code(409).send({ error: 'text not ready' });
    }

    const id = newId('excor');
    const now = Date.now();
    const job: ExerciseCorrection = {
      id,
      documentId: body.documentId,
      subject: body.subject as ExerciseSubject,
      studentAnswer: body.studentAnswer,
      outputLanguage: body.outputLanguage || 'fr',
      status: 'PENDING',
      warnings: [],
      createdAt: now,
      updatedAt: now,
    };
    corrections.set(id, job);

    // Async solve
    setTimeout(async () => {
      const current = corrections.get(id);
      if (!current) return;
      const running: ExerciseCorrection = { ...current, status: 'RUNNING', updatedAt: Date.now() };
      corrections.set(id, running);
      try {
        if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing (LLM disabled).');
        const solved = await groqSolveExercise({
          apiKey: env.GROQ_API_KEY,
          model: env.GROQ_REASONING_MODEL,
          subject: body.subject,
          statementText: doc.statementText!,
          studentAnswer: body.studentAnswer,
          outputLanguage: job.outputLanguage,
          requireLatex: body.subject === 'mathematiques',
          medical: body.subject === 'medecine',
        });
        const done: ExerciseCorrection = {
          ...running,
          status: 'COMPLETED',
          result: {
            ...solved.result,
            latex: { enabled: body.subject === 'mathematiques' },
            medical_disclaimer: body.subject === 'medecine' ? "Usage pédagogique uniquement — pas un avis médical." : undefined,
          },
          warnings: [...running.warnings, ...(doc.warnings || []), ...(solved.warnings || [])],
          updatedAt: Date.now(),
        };
        corrections.set(id, done);
      } catch (e: any) {
        const failed: ExerciseCorrection = {
          ...running,
          status: 'FAILED',
          errorMessage: e?.message ? String(e.message) : 'generation failed',
          updatedAt: Date.now(),
        };
        corrections.set(id, failed);
      }
    }, 30);

    return reply.send({ correctionId: id });
  });

  app.get('/api/v1/ai/exercise-corrections/:correctionId', async (req, reply) => {
    const { correctionId } = z.object({ correctionId: z.string() }).parse(req.params);
    const job = corrections.get(correctionId);
    if (!job) return reply.code(404).send({ error: 'not found' });
    return reply.send({
      status: job.status as JobStatus,
      result: job.result,
      warnings: job.warnings,
      errorMessage: job.errorMessage,
    });
  });

  app.post('/api/v1/ai/exercise-corrections/:correctionId/simplify', async (req, reply) => {
    const { correctionId } = z.object({ correctionId: z.string() }).parse(req.params);
    const job = corrections.get(correctionId);
    if (!job) return reply.code(404).send({ error: 'not found' });
    if (job.status !== 'COMPLETED' || !job.result) return reply.code(409).send({ error: 'not ready' });
    if (!env.GROQ_API_KEY) return reply.code(503).send({ error: 'GROQ_API_KEY missing' });

    const prompt = [
      "Simplifie l'explication sans perdre la rigueur.",
      "Retourne uniquement un JSON ExerciseCorrectionResult (mêmes clés).",
      "",
      JSON.stringify(job.result),
    ].join('\n');

    const solved = await groqSolveExercise({
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_REASONING_MODEL,
      subject: job.subject,
      statementText: job.result.statement + '\n\n' + prompt,
      studentAnswer: job.studentAnswer,
      outputLanguage: job.outputLanguage,
      requireLatex: job.subject === 'mathematiques',
      medical: job.subject === 'medecine',
    });
    // Use the simplified output as replacement.
    const next = { ...job, result: solved.result, updatedAt: Date.now() };
    corrections.set(correctionId, next);
    return reply.send({ result: next.result });
  });

  app.post('/api/v1/ai/exercise-corrections/:correctionId/similar-exercise', async (req, reply) => {
    const { correctionId } = z.object({ correctionId: z.string() }).parse(req.params);
    const job = corrections.get(correctionId);
    if (!job) return reply.code(404).send({ error: 'not found' });
    if (job.status !== 'COMPLETED' || !job.result) return reply.code(409).send({ error: 'not ready' });
    if (!env.GROQ_API_KEY) return reply.code(503).send({ error: 'GROQ_API_KEY missing' });

    // Ask the model for a new similar exercise only.
    const gen = await groqSolveExercise({
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_REASONING_MODEL,
      subject: job.subject,
      statementText: job.result.statement + '\n\nGénère uniquement un exercice similaire (sans solution).',
      outputLanguage: job.outputLanguage,
      requireLatex: job.subject === 'mathematiques',
      medical: job.subject === 'medecine',
    });

    const similar = typeof gen.result?.similar_exercise === 'string' ? gen.result.similar_exercise : '';
    const next = { ...job, result: { ...job.result, similar_exercise: similar }, updatedAt: Date.now() };
    corrections.set(correctionId, next);
    return reply.send({ similar_exercise: similar });
  });
}

