import PDFDocument from 'pdfkit';

export async function renderCourseSummaryPdf(result: any): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (d) => chunks.push(d as Buffer));

  const title = typeof result?.title === 'string' ? result.title : 'Résumé';
  doc.fontSize(20).text(title, { underline: true });
  doc.moveDown();

  const section = (h: string) => {
    doc.fontSize(14).text(h);
    doc.moveDown(0.4);
    doc.fontSize(11);
  };

  if (typeof result?.short_summary === 'string') {
    section('Résumé court');
    doc.text(result.short_summary);
    doc.moveDown();
  }

  if (typeof result?.full_summary === 'string') {
    section('Résumé complet');
    doc.text(result.full_summary);
    doc.moveDown();
  }

  if (result?.revision_sheet?.key_points?.length) {
    section('Fiche de révision — points clés');
    for (const p of result.revision_sheet.key_points) doc.text(`• ${p}`);
    doc.moveDown();
  }

  if (Array.isArray(result?.important_definitions) && result.important_definitions.length) {
    section('Définitions importantes');
    for (const d of result.important_definitions.slice(0, 80)) {
      doc.text(`${d.term}: ${d.definition}`);
      doc.moveDown(0.2);
    }
    doc.moveDown();
  }

  if (Array.isArray(result?.important_formulas) && result.important_formulas.length) {
    section('Formules importantes');
    for (const f of result.important_formulas.slice(0, 80)) {
      doc.text(`${f.name}: ${f.formula}`);
      if (f.explanation) doc.text(f.explanation);
      doc.moveDown(0.3);
    }
    doc.moveDown();
  }

  if (Array.isArray(result?.likely_exam_topics) && result.likely_exam_topics.length) {
    section("Notions probables à l'examen");
    for (const t of result.likely_exam_topics.slice(0, 100)) doc.text(`• ${t}`);
    doc.moveDown();
  }

  if (Array.isArray(result?.common_mistakes) && result.common_mistakes.length) {
    section('Erreurs fréquentes à éviter');
    for (const t of result.common_mistakes.slice(0, 100)) doc.text(`• ${t}`);
    doc.moveDown();
  }

  if (Array.isArray(result?.warnings) && result.warnings.length) {
    section('Ambiguïtés / avertissements');
    for (const w of result.warnings.slice(0, 80)) doc.text(`• ${w}`);
    doc.moveDown();
  }

  doc.end();

  await new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', (e) => reject(e));
  });

  return Buffer.concat(chunks);
}

