import { resolveEffectiveEntitlements } from './entitlementResolver';
import { AuthorizationDecision, CounterKey, FeatureKey } from './types';

/** Contexte passé à `authorizeFeature`. `channel: 'chat_http'` = POST /ai/chat uniquement (pas de débit compteurs messages). */
export interface AuthorizeContext {
  pages?: number;
  documentSizeMb?: number;
  deepModeRequested?: boolean;
  reasoningComplexityScore?: number;
  /** Unités de quota `ai_messages` (ex. minutes de transcription voix). Défaut 1. */
  aiMessageUnits?: number;
  /** Présent uniquement pour le chat HTTP : pas de consommation `ai_messages` / `premium_answers`. */
  channel?: 'chat_http';
}

interface FeatureRequirement {
  requiredAccess: string[];
  consumptions: Array<{ counterKey: CounterKey; amountFrom: (ctx: AuthorizeContext) => number }>;
  requiredLimits?: Array<{ key: string; min: number }>;
  maxDocumentSizeFromEntitlement?: string;
}

const FEATURE_REQUIREMENTS: Record<FeatureKey, FeatureRequirement> = {
  chat_standard: {
    requiredAccess: ['chat_text_access', 'standard_answer_access'],
    consumptions: [
      {
        counterKey: 'ai_messages',
        amountFrom: (ctx) => Math.max(1, Math.floor(Number(ctx.aiMessageUnits ?? 1))),
      },
    ],
  },
  chat_premium: {
    requiredAccess: ['chat_text_access', 'standard_answer_access'],
    consumptions: [
      { counterKey: 'ai_messages', amountFrom: () => 1 },
      { counterKey: 'premium_answers', amountFrom: () => 1 },
    ],
  },
  pdf_ingest: {
    requiredAccess: ['pdf_upload_access'],
    consumptions: [{ counterKey: 'pdf_analyses', amountFrom: () => 1 }],
    maxDocumentSizeFromEntitlement: 'max_document_size_mb',
  },
  ocr_scan: {
    requiredAccess: ['ocr_access'],
    consumptions: [{ counterKey: 'ocr_pages', amountFrom: (ctx) => Math.max(1, Number(ctx.pages ?? 1)) }],
    maxDocumentSizeFromEntitlement: 'max_document_size_mb',
  },
  long_context_session: {
    requiredAccess: ['long_context_access'],
    consumptions: [],
  },
};

function hasTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function recommendPlan(featureKey: FeatureKey): { planCode: string } | null {
  if (featureKey === 'pdf_ingest' || featureKey === 'ocr_scan') return { planCode: 'course_pdf' };
  if (featureKey === 'long_context_session') return { planCode: 'elite_monthly' };
  if (featureKey === 'chat_premium') return { planCode: 'course_pdf' };
  return { planCode: 'essential' };
}

function recommendBooster(counterKey: CounterKey): { boosterCode: string } | null {
  if (counterKey === 'ocr_pages') return { boosterCode: 'pack_scans' };
  if (counterKey === 'premium_answers') return { boosterCode: 'pack_reponses_premium' };
  if (counterKey === 'ai_messages') return { boosterCode: 'pass_intensif_7j' };
  return null;
}

function resolvePremiumIntent(ctx: AuthorizeContext): 'yes' | 'confirm' | 'no' {
  if (ctx.deepModeRequested) return 'yes';
  if ((ctx.reasoningComplexityScore ?? 0) >= 0.8) return 'confirm';
  return 'no';
}

export async function authorizeFeature(params: {
  userId: string;
  userRole?: string;
  featureKey: FeatureKey;
  context?: AuthorizeContext;
}): Promise<AuthorizationDecision> {
  const ctx = params.context ?? {};
  const req = FEATURE_REQUIREMENTS[params.featureKey];
  if (!req) {
    throw Object.assign(new Error(`Unsupported featureKey: ${params.featureKey}`), { status: 400 });
  }

  if (params.featureKey === 'chat_premium' && ctx.channel !== 'chat_http') {
    const premiumIntent = resolvePremiumIntent(ctx);
    if (premiumIntent === 'confirm') {
      return {
        decision: 'confirmation_required',
        reasonCode: 'premium_confirmation_required',
        messageFr: 'Cette demande peut utiliser 1 reponse premium. Continuer ?',
        requiredConsumptions: [
          { counterKey: 'ai_messages', amount: 1 },
          { counterKey: 'premium_answers', amount: 1 },
        ],
        upgradeRecommendation: null,
        boosterRecommendation: null,
      };
    }
  }

  const effective = await resolveEffectiveEntitlements(params.userId, params.userRole);

  for (const accessKey of req.requiredAccess) {
    if (!hasTruthy(effective.entitlements[accessKey])) {
      return {
        decision: 'blocked',
        reasonCode: 'feature_not_in_plan',
        messageFr:
          params.featureKey === 'pdf_ingest'
            ? 'Vous devez passer a Cours & PDF pour analyser vos documents.'
            : params.featureKey === 'ocr_scan'
              ? 'Vous devez passer a Cours & PDF pour scanner des pages.'
              : params.featureKey === 'long_context_session'
                ? 'Vous devez passer a Revision Pro pour utiliser la memoire longue.'
                : 'Cette fonctionnalite n est pas incluse dans votre offre.',
        requiredConsumptions: [],
        upgradeRecommendation: recommendPlan(params.featureKey),
        boosterRecommendation: null,
      };
    }
  }

  if (params.featureKey === 'chat_premium' && ctx.channel === 'chat_http' && resolvePremiumIntent(ctx) === 'yes') {
    if (!hasTruthy(effective.entitlements.deep_model_access)) {
      return {
        decision: 'blocked',
        reasonCode: 'deep_model_not_in_plan',
        messageFr:
          'Cette option premium n est pas incluse dans ton forfait. Passe a une offre superieure pour la debloquer.',
        requiredConsumptions: [],
        upgradeRecommendation: recommendPlan('chat_premium'),
        boosterRecommendation: null,
      };
    }
  }

  if (req.maxDocumentSizeFromEntitlement && Number.isFinite(ctx.documentSizeMb)) {
    const maxMb = toNumber(effective.entitlements[req.maxDocumentSizeFromEntitlement]);
    if ((ctx.documentSizeMb ?? 0) > maxMb) {
      return {
        decision: 'blocked',
        reasonCode: 'document_too_large',
        messageFr: `Document trop volumineux pour votre offre (${ctx.documentSizeMb} MB > ${maxMb} MB).`,
        requiredConsumptions: [],
        upgradeRecommendation: recommendPlan(params.featureKey),
        boosterRecommendation: null,
      };
    }
  }

  const mappedConsumptions = req.consumptions.map((item) => ({
    counterKey: item.counterKey,
    amount: Math.max(1, Math.floor(item.amountFrom(ctx))),
  }));

  // Chat HTTP (POST /ai/chat) :
  // - chat_standard: pas de débit de `ai_messages` (expérience simple côté catalogue)
  // - chat_premium: on débite UNIQUEMENT `premium_answers` (garde-fou économique), jamais `ai_messages`
  const requiredConsumptions =
    ctx.channel === 'chat_http'
      ? (params.featureKey === 'chat_premium'
          ? mappedConsumptions.filter((c) => c.counterKey === 'premium_answers')
          : [])
      : mappedConsumptions;

  for (const consumption of requiredConsumptions) {
    const remaining = effective.remaining[consumption.counterKey] ?? 0;
    if (remaining < consumption.amount) {
      return {
        decision: 'blocked',
        reasonCode: 'quota_exhausted',
        messageFr:
          consumption.counterKey === 'ocr_pages'
            ? 'Votre quota de scans est epuise. Ajoutez un Pack Scans pour continuer.'
            : consumption.counterKey === 'premium_answers'
              ? 'Vos reponses premium sont epuisees. Ajoutez un Pack Reponses Premium pour continuer.'
              : 'Votre quota est epuise pour cette fonctionnalite.',
        requiredConsumptions: [],
        upgradeRecommendation: recommendPlan(params.featureKey),
        boosterRecommendation: recommendBooster(consumption.counterKey),
      };
    }
  }

  return {
    decision: 'allowed',
    reasonCode: null,
    messageFr: null,
    requiredConsumptions,
    upgradeRecommendation: null,
    boosterRecommendation: null,
  };
}

