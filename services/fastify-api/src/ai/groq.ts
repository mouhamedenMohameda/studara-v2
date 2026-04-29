type GroqChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | {
      role: 'user';
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
    };

type GroqChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export async function groqVisionOcr(params: {
  apiKey: string;
  model: string;
  base64: string;
  mimeType: string;
}): Promise<{ text: string; confidence: number; warnings: string[] }> {
  const prompt = [
    "Tu fais une extraction OCR fidèle d'un énoncé d'exercice à partir d'une image.",
    "Règles:",
    "- Ne pas inventer. Si une partie est illisible, écris [ILLISIBLE] à l'endroit et ajoute un warning.",
    "- Préserver les symboles, unités, exposants, indices, fractions si possible (texte).",
    "- Retourne UNIQUEMENT un JSON strict avec: { text, confidence, warnings }.",
    "",
    "confidence: nombre entre 0 et 1 estimant la lisibilité globale.",
  ].join('\n');

  const url = `data:${params.mimeType};base64,${params.base64}`;
  const content: GroqChatMessage = {
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url } },
    ],
  };

  const raw = await groqChat({
    apiKey: params.apiKey,
    model: params.model,
    messages: [content],
  });

  const json = safeJsonParse(raw);
  if (!json) {
    return { text: raw.slice(0, 12000), confidence: 0.4, warnings: ['Extraction non structurée (fallback).'] };
  }
  const text = typeof json.text === 'string' ? json.text : '';
  const confidence = typeof json.confidence === 'number' ? clamp01(json.confidence) : 0.5;
  const warnings = Array.isArray(json.warnings) ? json.warnings.filter((w: any) => typeof w === 'string') : [];
  return { text, confidence, warnings };
}

export async function groqSolveExercise(params: {
  apiKey: string;
  model: string;
  subject: string;
  statementText: string;
  studentAnswer?: string;
  outputLanguage: string;
  requireLatex: boolean;
  medical: boolean;
}): Promise<{ result: any; warnings: string[]; confidence: number }> {
  const sys = [
    "Tu es un correcteur d'exercices universitaire. Tu dois être fiable et pédagogique.",
    "Contraintes:",
    "- N'invente jamais une donnée absente de l'énoncé.",
    "- Si l'énoncé est ambigu, flou, incomplet, tu le dis et tu ajoutes des avertissements.",
    "- Donne une correction étape par étape, méthode, résultat final, erreurs fréquentes, résumé, exercice similaire.",
    "- Si une réponse étudiant est fournie: identifier erreurs, pourquoi c'est faux, et proposer correction propre.",
    params.medical ? "- Médecine: rappeler que c'est pédagogique, pas un avis médical." : "",
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
  ]
    .filter(Boolean)
    .join('\n');

  const user = [
    `Matière: ${params.subject}`,
    `Langue: ${params.outputLanguage}`,
    params.requireLatex ? "Important: utilise des notations LaTeX dans les parties mathématiques (ex: \\(x^2\\), \\[...\\])." : "",
    "",
    "Énoncé:",
    params.statementText,
    "",
    params.studentAnswer ? "Réponse étudiant:\n" + params.studentAnswer : "",
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await groqChat({
    apiKey: params.apiKey,
    model: params.model,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
  });

  const json = safeJsonParse(raw);
  if (!json) {
    return {
      result: {
        statement: params.statementText,
        confidence: 0.35,
        correction_step_by_step: raw,
        method_explanation: '',
        final_answer: '',
        common_errors: [],
        method_summary: '',
        similar_exercise: '',
        latex: { enabled: params.requireLatex },
        medical_disclaimer: params.medical ? "Usage pédagogique uniquement — pas un avis médical." : undefined,
      },
      warnings: ['Réponse non structurée (fallback).'],
      confidence: 0.35,
    };
  }

  const confidence = typeof json.confidence === 'number' ? clamp01(json.confidence) : 0.6;
  const warnings: string[] = [];
  if (confidence < 0.65) warnings.push('Confiance faible — énoncé possiblement flou/incomplet.');
  return { result: json, warnings, confidence };
}

async function groqChat(params: {
  apiKey: string;
  model: string;
  messages: GroqChatMessage[];
}): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: 0.2,
      max_tokens: 1800,
    }),
  });

  const data = (await res.json().catch(() => null)) as GroqChatResponse | null;
  if (!res.ok) {
    const msg = (data as any)?.error?.message || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  const text = data?.choices?.[0]?.message?.content;
  return String(text || '').trim();
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function safeJsonParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {}
  const m = raw.match(/\{[\s\S]*\}$/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

