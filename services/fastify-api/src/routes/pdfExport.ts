import type { FastifyInstance } from 'fastify';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { corrections, documents } from '../store.js';

export async function registerPdfExportRoutes(app: FastifyInstance) {
  app.get('/api/v1/ai/exercise-corrections/:correctionId/export.pdf', async (req, reply) => {
    const { correctionId } = z.object({ correctionId: z.string() }).parse(req.params);
    const job = corrections.get(correctionId);
    if (!job) return reply.code(404).send('not found');
    if (job.status !== 'COMPLETED' || !job.result) return reply.code(409).send('not ready');

    const docRow = documents.get(job.documentId);
    const warnings = [...(docRow?.warnings || []), ...(job.warnings || [])];

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="correction_${correctionId}.pdf"`);

    const pdf = new PDFDocument({ margin: 48 });
    pdf.on('error', () => {});
    reply.send(pdf);

    pdf.fontSize(18).text('Correction IA d’exercice');
    pdf.moveDown(0.4);
    pdf.fontSize(10).fillColor('#666').text(new Date(job.createdAt).toLocaleString());
    pdf.moveDown(1);

    pdf.fillColor('#111');
    pdf.fontSize(12).text('Énoncé', { underline: true });
    pdf.moveDown(0.4);
    pdf.fontSize(11).text(job.result.statement || '');
    pdf.moveDown(1);

    const section = (title: string, body: string) => {
      pdf.fontSize(12).text(title, { underline: true });
      pdf.moveDown(0.4);
      pdf.fontSize(11).text(body || '');
      pdf.moveDown(1);
    };

    section('Correction étape par étape', job.result.correction_step_by_step);
    section('Méthode', job.result.method_explanation);
    section('Résultat final', job.result.final_answer);
    section('Résumé de la méthode à retenir', job.result.method_summary);
    section('Exercice similaire', job.result.similar_exercise);

    if (Array.isArray(job.result.common_errors) && job.result.common_errors.length) {
      pdf.fontSize(12).text('Erreurs fréquentes', { underline: true });
      pdf.moveDown(0.4);
      pdf.fontSize(11);
      for (const e of job.result.common_errors.slice(0, 40)) {
        pdf.text(`• ${e}`);
      }
      pdf.moveDown(1);
    }

    if (job.result.student_answer_feedback) {
      pdf.fontSize(12).text('Correction de ta réponse', { underline: true });
      pdf.moveDown(0.4);
      for (const err of (job.result.student_answer_feedback.errors || []).slice(0, 20)) {
        pdf.fontSize(11).text(`Erreur: ${err.excerpt}`);
        pdf.fontSize(11).fillColor('#444').text(`Pourquoi: ${err.why_wrong}`);
        pdf.fontSize(11).fillColor('#111').text(`Correction: ${err.fix}`);
        pdf.moveDown(0.6);
      }
      pdf.moveDown(0.2);
      pdf.fontSize(11).text('Solution propre:');
      pdf.fontSize(11).fillColor('#111').text(job.result.student_answer_feedback.corrected_solution || '');
      pdf.moveDown(1);
    }

    if (job.result.medical_disclaimer) {
      section('Avertissement (médecine)', job.result.medical_disclaimer);
    }

    if (warnings.length) {
      pdf.fontSize(12).fillColor('#B45309').text('Avertissements', { underline: true });
      pdf.moveDown(0.4);
      pdf.fontSize(10).fillColor('#B45309');
      for (const w of warnings.slice(0, 80)) pdf.text(`• ${w}`);
      pdf.fillColor('#111');
      pdf.moveDown(1);
    }

    pdf.end();
  });
}

