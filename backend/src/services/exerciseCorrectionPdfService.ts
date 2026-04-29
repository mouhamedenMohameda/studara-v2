import PDFDocument from 'pdfkit';

export async function renderExerciseCorrectionPdf(params: {
  result: any;
  warnings?: string[];
  createdAt?: string | Date;
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (d) => chunks.push(d as Buffer));

  const r = params.result || {};
  const warnings = Array.isArray(params.warnings) ? params.warnings : [];

  doc.fontSize(20).text("Correction IA d'exercice", { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor('#666').text(new Date(params.createdAt || Date.now()).toLocaleString());
  doc.moveDown(1);
  doc.fillColor('#111');

  const section = (h: string) => {
    doc.fontSize(14).text(h);
    doc.moveDown(0.4);
    doc.fontSize(11);
  };

  section('Énoncé');
  doc.text(String(r.statement || ''));
  doc.moveDown();

  section('Correction étape par étape');
  doc.text(String(r.correction_step_by_step || ''));
  doc.moveDown();

  section('Méthode (explication)');
  doc.text(String(r.method_explanation || ''));
  doc.moveDown();

  section('Résultat final');
  doc.text(String(r.final_answer || ''));
  doc.moveDown();

  section('Erreurs fréquentes');
  if (Array.isArray(r.common_errors) && r.common_errors.length) {
    for (const e of r.common_errors.slice(0, 80)) doc.text(`• ${e}`);
  }
  doc.moveDown();

  section('Résumé de la méthode à retenir');
  doc.text(String(r.method_summary || ''));
  doc.moveDown();

  section("Exercice similaire (pour s'entraîner)");
  doc.text(String(r.similar_exercise || ''));
  doc.moveDown();

  if (r.student_answer_feedback) {
    section('Correction de ta réponse');
    const errs = Array.isArray(r.student_answer_feedback.errors) ? r.student_answer_feedback.errors : [];
    for (const err of errs.slice(0, 30)) {
      doc.text(`Erreur: ${err.excerpt ?? ''}`);
      doc.fillColor('#444').text(`Pourquoi: ${err.why_wrong ?? ''}`);
      doc.fillColor('#111').text(`Correction: ${err.fix ?? ''}`);
      doc.moveDown(0.6);
    }
    doc.moveDown(0.2);
    doc.text('Solution propre:');
    doc.text(String(r.student_answer_feedback.corrected_solution || ''));
    doc.moveDown();
  }

  if (typeof r.medical_disclaimer === 'string' && r.medical_disclaimer.trim()) {
    section('Avertissement (médecine)');
    doc.text(r.medical_disclaimer.trim());
    doc.moveDown();
  }

  if (warnings.length) {
    section('Ambiguïtés / avertissements');
    doc.fillColor('#B45309');
    for (const w of warnings.slice(0, 120)) doc.text(`• ${w}`);
    doc.fillColor('#111');
    doc.moveDown();
  }

  doc.end();

  await new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', (e) => reject(e));
  });

  return Buffer.concat(chunks);
}

