import { z } from 'zod';

export type SummaryLevel = 'simple' | 'normal' | 'advanced' | 'very_synthetic' | 'exam_tomorrow';
export type OutputLanguage = 'fr' | 'ar' | 'en' | 'fr_ar';

const SummarySchema = z.object({
  title: z.string(),
  full_summary: z.string(),
  short_summary: z.string(),
  revision_sheet: z.object({
    key_points: z.array(z.string()),
    tables: z.array(z.object({ title: z.string(), rows: z.array(z.array(z.string())) })).default([]),
  }),
  important_definitions: z
    .array(z.object({ term: z.string(), definition: z.string(), source_section: z.string() }))
    .default([]),
  important_formulas: z
    .array(z.object({ name: z.string(), formula: z.string(), explanation: z.string(), source_section: z.string() }))
    .default([]),
  likely_exam_topics: z.array(z.string()).default([]),
  common_mistakes: z.array(z.string()).default([]),
  section_summaries: z
    .array(z.object({ title: z.string(), bullets: z.array(z.string()) }))
    .default([]),
  warnings: z.array(z.string()).default([]),
});

export type StructuredCourseSummary = z.infer<typeof SummarySchema>;

function systemPrompt(): string {
  return [
    'You summarize course documents for students.',
    'Hard rule: do NOT invent facts that are not in the provided text.',
    'If something is ambiguous or missing, explicitly say so in "warnings".',
    'Use ONLY the content from the provided course text.',
    'Output MUST be valid JSON (no markdown).',
  ].join('\n');
}

function levelGuidance(level: SummaryLevel): string {
  switch (level) {
    case 'simple':
      return 'Explain with very simple words, short sentences, beginner-friendly.';
    case 'normal':
      return 'Balanced detail, clear structure, useful for revision.';
    case 'advanced':
      return 'More depth: include nuances, pitfalls, and connections between ideas.';
    case 'very_synthetic':
      return 'Ultra concise: only key points, no fluff.';
    case 'exam_tomorrow':
      return 'Exam mode: focus on likely questions, key definitions, formulas, common errors, quick recall.';
  }
}

function languageGuidance(lang: OutputLanguage): string {
  switch (lang) {
    case 'fr':
      return 'Write in French.';
    case 'ar':
      return 'اكتب بالعربية الفصحى الواضحة.';
    case 'en':
      return 'Write in English.';
    case 'fr_ar':
      return 'Bilingual: for each section, provide French then Arabic. Keep both concise and aligned.';
  }
}

function userPrompt(params: {
  titleHint?: string;
  cleanedText: string;
  level: SummaryLevel;
  outputLanguage: OutputLanguage;
}): string {
  const { titleHint, cleanedText, level, outputLanguage } = params;

  return [
    titleHint ? `Course title hint: ${titleHint}` : '',
    `Summary level: ${level} (${levelGuidance(level)})`,
    `Output language: ${outputLanguage} (${languageGuidance(outputLanguage)})`,
    '',
    'Return this JSON schema:',
    '{',
    '  "title": string,',
    '  "full_summary": string,',
    '  "short_summary": string,',
    '  "revision_sheet": { "key_points": string[], "tables": { "title": string, "rows": string[][] }[] },',
    '  "important_definitions": { "term": string, "definition": string, "source_section": string }[],',
    '  "important_formulas": { "name": string, "formula": string, "explanation": string, "source_section": string }[],',
    '  "likely_exam_topics": string[],',
    '  "common_mistakes": string[],',
    '  "section_summaries": { "title": string, "bullets": string[] }[],',
    '  "warnings": string[]',
    '}',
    '',
    'Constraints:',
    '- Every item MUST be grounded in the provided text.',
    '- If you cannot find formulas/definitions, return empty arrays.',
    '- Use "warnings" to flag ambiguity or missing info.',
    '',
    'Course text:',
    cleanedText.slice(0, 200_000),
  ]
    .filter(Boolean)
    .join('\n');
}

async function openaiJson(model: string, messages: any[]): Promise<{ model: string; json: any }> {
  // Dedicated key for this feature (requested): SUMARRY_OPENAI_API_KEY
  // Falls back to the global OPENAI_API_KEY.
  const key = process.env.SUMARRY_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY / SUMARRY_OPENAI_API_KEY non configuré');

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });
  const data = (await resp.json().catch(() => ({}))) as any;
  if (!resp.ok) {
    const msg = typeof data?.error?.message === 'string' ? data.error.message : `OpenAI error ${resp.status}`;
    throw new Error(msg);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Empty AI response');
  return { model: data?.model ?? model, json: JSON.parse(content) };
}

export async function generateStructuredCourseSummary(params: {
  titleHint?: string;
  cleanedText: string;
  level: SummaryLevel;
  outputLanguage: OutputLanguage;
}): Promise<{ model: string; result: StructuredCourseSummary; warnings: string[] }> {
  const model = params.cleanedText.length > 90_000 ? 'gpt-4o' : 'gpt-4o-mini';
  const { json, model: usedModel } = await openaiJson(model, [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: userPrompt(params) },
  ]);

  const parsed = SummarySchema.safeParse(json);
  if (!parsed.success) throw new Error('AI response schema mismatch');
  const warnings = parsed.data.warnings ?? [];
  return { model: usedModel, result: parsed.data, warnings };
}

