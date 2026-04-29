import {
  getActiveBoosters,
  getBoosterEntitlements,
  getEntitlementDefinitions,
  getFeatureFlagEntitlementPatches,
  getPlanEntitlements,
} from './catalogService';
import { getActiveSubscription } from './activeSubscriptionService';
import { EntitlementScalar, EntitlementsMap, EffectiveEntitlements } from './types';
import { getRemainingByCounter, ensureUsageBucketsForUser } from './usageCounterService';

const DEFAULT_ENTITLEMENTS: EntitlementsMap = {
  chat_text_access: false,
  standard_answer_access: false,
  daily_ai_messages_limit: 0,
  pdf_upload_access: false,
  monthly_pdf_analysis_limit: 0,
  ocr_access: false,
  monthly_ocr_pages_limit: 0,
  premium_answers_monthly_limit: 0,
  study_memory_access: false,
  memory_tier: 'none',
  active_revision_notebooks_limit: 0,
  max_document_size_mb: 0,
  short_history_access: false,
  long_context_access: false,
  priority_processing_access: false,
  active_chat_threads_limit: 0,
  deep_model_access: false,
};

function toNumber(value: EntitlementScalar): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function toBool(value: EntitlementScalar): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function memoryTierRank(tier: EntitlementScalar): number {
  if (tier === 'long') return 3;
  if (tier === 'medium') return 2;
  return 1;
}

function mergeEntitlementValue(
  current: EntitlementScalar,
  incoming: EntitlementScalar,
  strategy: 'override' | 'sum' | 'max' | 'or',
  key: string,
): EntitlementScalar {
  if (incoming === null || incoming === undefined) return current;

  if (key === 'memory_tier') {
    return memoryTierRank(incoming) >= memoryTierRank(current) ? incoming : current;
  }

  if (strategy === 'sum') return toNumber(current) + toNumber(incoming);
  if (strategy === 'max') return Math.max(toNumber(current), toNumber(incoming));
  if (strategy === 'or') return toBool(current) || toBool(incoming);
  return incoming;
}

function getStaffBypassEntitlements(): EntitlementsMap {
  return {
    chat_text_access: true,
    standard_answer_access: true,
    daily_ai_messages_limit: 999999,
    pdf_upload_access: true,
    monthly_pdf_analysis_limit: 999999,
    ocr_access: true,
    monthly_ocr_pages_limit: 999999,
    premium_answers_monthly_limit: 999999,
    study_memory_access: true,
    memory_tier: 'long',
    active_revision_notebooks_limit: 999999,
    max_document_size_mb: 999999,
    short_history_access: true,
    long_context_access: true,
    priority_processing_access: true,
    active_chat_threads_limit: 999999,
    deep_model_access: true,
  };
}

export async function resolveEffectiveEntitlements(
  userId: string,
  userRole?: string,
): Promise<EffectiveEntitlements> {
  if (userRole === 'admin' || userRole === 'moderator') {
    return {
      planCode: 'staff_bypass',
      planNameFr: 'Staff bypass',
      isStaffBypass: true,
      entitlements: getStaffBypassEntitlements(),
      boosters: [],
      remaining: {
        ai_messages: 999999,
        ocr_pages: 999999,
        pdf_analyses: 999999,
        premium_answers: 999999,
      },
    };
  }

  const [definitions, subscription, boosters] = await Promise.all([
    getEntitlementDefinitions(),
    getActiveSubscription(userId),
    getActiveBoosters(userId),
  ]);

  const entitlements: EntitlementsMap = { ...DEFAULT_ENTITLEMENTS };

  if (subscription) {
    const planValues = await getPlanEntitlements(subscription.planId);
    for (const [key, value] of Object.entries(planValues)) {
      const def = definitions[key];
      const strategy = def?.mergeStrategy ?? 'override';
      entitlements[key] = mergeEntitlementValue(entitlements[key], value, strategy, key);
    }
  }

  for (const booster of boosters) {
    const boosterValues = await getBoosterEntitlements(booster.boosterId);
    for (const [key, value] of Object.entries(boosterValues)) {
      const def = definitions[key];
      const strategy = def?.mergeStrategy ?? 'override';
      entitlements[key] = mergeEntitlementValue(entitlements[key], value, strategy, key);
    }
  }

  const flagPatches = await getFeatureFlagEntitlementPatches(subscription?.planCode ?? null);
  for (const [key, value] of Object.entries(flagPatches)) {
    const def = definitions[key];
    const strategy = def?.mergeStrategy ?? 'override';
    entitlements[key] = mergeEntitlementValue(entitlements[key], value, strategy, key);
  }

  await ensureUsageBucketsForUser(userId, userRole);
  const remaining = await getRemainingByCounter(userId, userRole);

  return {
    planCode: subscription?.planCode ?? null,
    planNameFr: subscription?.planNameFr ?? null,
    isStaffBypass: false,
    entitlements,
    boosters: boosters.map((b) => ({
      code: b.code,
      displayNameFr: b.displayNameFr,
      activatedAt: b.activatedAt,
      expiresAt: b.expiresAt,
    })),
    remaining,
  };
}

