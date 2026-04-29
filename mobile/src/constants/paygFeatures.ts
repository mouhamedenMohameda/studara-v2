export type PaygFeatureKey =
  | 'whisper_studio'
  | 'ai_flashcards'
  | 'ai_course'
  | 'ai_summary_pdf';

export type PaygPriceUnit =
  | 'per_use'
  | 'per_minute'
  | 'per_page'
  | 'per_1k_words';

export interface PaygModelPrice {
  /** Stable technical key (used for analytics / future backend mapping). */
  modelKey: string;
  /** User-facing label (FR/AR). */
  labelFr: string;
  labelAr: string;
  /**
   * Price in MRU for the given unit.
   * If `null`, the UI shows a placeholder to fill later.
   */
  priceMru: number | null;
  unit: PaygPriceUnit;
}

export interface PaygFeatureDefinition {
  key: PaygFeatureKey;
  /** User-facing label (FR/AR) used in the billing hub. */
  labelFr: string;
  labelAr: string;
  /** Short explanation shown under the price. */
  descriptionFr: string;
  descriptionAr: string;
  /**
   * Explicit definition of what counts as "one usage" for PAYG billing.
   * This must be concrete (limits) so users understand what they're buying.
   */
  usageDefinitionFr: string;
  usageDefinitionAr: string;
  /** Pricing by model (some features expose multiple models with different prices). */
  pricing: PaygModelPrice[];
  /** Whether the feature is already live in the app. */
  status: 'active' | 'soon';
}

/**
 * PAYG features list (explicit and centralized).
 *
 * Goal:
 * - One place to add/edit a PAYG feature (label + price + status)
 * - The billing UI and (later) the access gates can reuse this list.
 */
export const PAYG_FEATURES: PaygFeatureDefinition[] = [
  {
    key: 'whisper_studio',
    labelFr: 'Whisper — Transcription vocale',
    labelAr: 'Whisper — تفريغ صوتي',
    descriptionFr: 'Transcription IA de notes vocales + améliorations (résumé, réécriture…).',
    descriptionAr: 'تفريغ ملاحظاتك الصوتية + تحسينات (ملخص، إعادة صياغة…).',
    usageDefinitionFr: 'Facturation par minute d’audio (arrondie à la minute).',
    usageDefinitionAr: 'الدفع لكل دقيقة صوت (يُقرب إلى الدقيقة).',
    pricing: [
      // Pricing rule requested: price = 2 × estimated max provider cost (MRU/min).
      // Max-cost estimates used (USD→MRU≈40):
      // - OpenAI gpt-4o-transcribe: ~$0.006/min → ~0.24 MRU/min → price 0.48
      // - OpenAI gpt-4o-mini-transcribe: ~$0.003/min → ~0.12 MRU/min → price 0.24
      // - Groq whisper-large-v3-turbo: ~$0.04/hr → ~0.027 MRU/min → price 0.054
      // - Google STT Chirp (standard tier): ~$0.016/min → ~0.64 MRU/min → price 1.28
      { modelKey: 'gpt-4o-transcribe', labelFr: 'GPT-4o', labelAr: 'GPT-4o', priceMru: 0.48, unit: 'per_minute' },
      { modelKey: 'gpt-4o-mini-transcribe', labelFr: 'GPT-4o Mini', labelAr: 'GPT-4o Mini', priceMru: 0.24, unit: 'per_minute' },
      { modelKey: 'groq-whisper', labelFr: 'Groq', labelAr: 'Groq', priceMru: 0.054, unit: 'per_minute' },
      { modelKey: 'google-chirp', labelFr: 'Chirp 2', labelAr: 'Chirp 2', priceMru: 1.28, unit: 'per_minute' },
    ],
    status: 'active',
  },
  {
    key: 'ai_flashcards',
    labelFr: 'Flashcards — Scan & Créer',
    labelAr: 'بطاقات — مسح وإنشاء',
    descriptionFr: 'Photo → génération automatique d’un deck de flashcards.',
    descriptionAr: 'صورة → إنشاء بطاقات تعليمية تلقائياً.',
    usageDefinitionFr: '1 utilisation = 1 photo analysée → création d’un deck (jusqu’à 30 cartes). Au-delà: refaire une utilisation.',
    usageDefinitionAr: 'استخدام واحد = تحليل صورة واحدة → إنشاء مجموعة (حتى 30 بطاقة). إذا أكثر: استخدام إضافي.',
    pricing: [
      // price = 2 × estimated max cost per usage (vision high + big deck + retries) ≈ 2 × 0.307 MRU
      { modelKey: 'default', labelFr: 'Prix', labelAr: 'السعر', priceMru: 0.62, unit: 'per_use' },
    ],
    status: 'soon',
  },
  {
    key: 'ai_course',
    labelFr: 'Cours IA',
    labelAr: 'الدرس الذكي',
    descriptionFr: 'Génération d’un cours complet à partir de tes notes.',
    descriptionAr: 'توليد درس كامل انطلاقاً من ملاحظاتك.',
    usageDefinitionFr: '1 utilisation = générer 1 cours (jusqu’à ~1500 mots de sortie). Au-delà: utilisation(s) supplémentaire(s).',
    usageDefinitionAr: 'استخدام واحد = توليد درس واحد (حتى ~1500 كلمة في الناتج). إذا أكثر: استخدام إضافي.',
    pricing: [
      // price = 2 × estimated max cost per usage (very long output + retries) ≈ 2 × 0.403 MRU
      { modelKey: 'default', labelFr: 'Prix', labelAr: 'السعر', priceMru: 0.81, unit: 'per_use' },
    ],
    status: 'soon',
  },
  {
    key: 'ai_summary_pdf',
    labelFr: 'Résumé intelligent (PDF)',
    labelAr: 'ملخص ذكي (PDF)',
    descriptionFr: 'Résumé/explication à partir d’un PDF/Word (prix par document).',
    descriptionAr: 'تلخيص/شرح من PDF/Word (سعر لكل ملف).',
    usageDefinitionFr: '1 utilisation = résumer 1 document (jusqu’à 80 pages et 25 MB). Au-delà: découper en plusieurs utilisations.',
    usageDefinitionAr: 'استخدام واحد = تلخيص ملف واحد (حتى 80 صفحة و 25MB). إذا أكثر: قسّم لعدة استخدامات.',
    pricing: [
      // price = 2 × estimated max cost for a large document (example 80p) ≈ 2 × 0.48 MRU
      { modelKey: 'default', labelFr: 'Prix', labelAr: 'السعر', priceMru: 0.96, unit: 'per_use' },
    ],
    status: 'soon',
  },
];

export function getPaygFeature(key: string): PaygFeatureDefinition | undefined {
  return PAYG_FEATURES.find((f) => f.key === key);
}

