export type CounterKey = 'ai_messages' | 'ocr_pages' | 'pdf_analyses' | 'premium_answers';

export type FeatureKey =
  | 'chat_standard'
  | 'chat_premium'
  | 'pdf_ingest'
  | 'ocr_scan'
  | 'long_context_session';

export type EntitlementScalar = boolean | number | string | null;
export type EntitlementsMap = Record<string, EntitlementScalar>;

export interface SubscriptionPlan {
  id: string;
  code: string;
  displayNameFr: string;
  descriptionFr: string;
  monthlyPriceMru: number;
  currencyCode: string;
  sortOrder: number;
  isActive: boolean;
}

export interface EntitlementDefinition {
  key: string;
  valueType: 'boolean' | 'integer' | 'enum' | 'json';
  category: 'access' | 'quota' | 'limit' | 'routing';
  resetPolicy: 'none' | 'daily' | 'billing_cycle' | 'booster_window';
  mergeStrategy: 'override' | 'sum' | 'max' | 'or';
}

export interface ActiveSubscription {
  id: string;
  userId: string;
  planId: string;
  planCode: string;
  planNameFr: string;
  status: 'active' | 'grace' | 'cancelled' | 'expired' | 'pending';
  timezone: string;
  currentPeriodStartAt: string;
  currentPeriodEndAt: string;
  cancelAtPeriodEnd: boolean;
}

export interface ActiveBooster {
  id: string;
  userId: string;
  boosterId: string;
  code: string;
  displayNameFr: string;
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  activatedAt: string;
  expiresAt: string;
}

export interface UsageBucket {
  id: string;
  userId: string;
  counterKey: CounterKey;
  sourceType: 'subscription' | 'booster' | 'admin_credit';
  sourceId: string;
  windowType: 'daily' | 'billing_cycle' | 'rolling_30d' | 'fixed_window';
  windowStartAt: string;
  windowEndAt: string;
  limitTotal: number;
  usedTotal: number;
  reservedTotal: number;
  expiresAt: string;
}

export interface CounterUsageSummary {
  counterKey: CounterKey;
  limitTotal: number;
  usedTotal: number;
  reservedTotal: number;
  remainingTotal: number;
}

export interface EffectiveEntitlements {
  planCode: string | null;
  planNameFr: string | null;
  isStaffBypass: boolean;
  entitlements: EntitlementsMap;
  boosters: Array<{
    code: string;
    displayNameFr: string;
    activatedAt: string;
    expiresAt: string;
  }>;
  remaining: Record<CounterKey, number>;
}

export interface AuthorizationDecision {
  decision: 'allowed' | 'blocked' | 'confirmation_required';
  reasonCode: string | null;
  messageFr: string | null;
  requiredConsumptions: Array<{ counterKey: CounterKey; amount: number }>;
  upgradeRecommendation: { planCode: string } | null;
  boosterRecommendation: { boosterCode: string } | null;
}

export interface ConsumeRequest {
  idempotencyKey: string;
  featureKey: FeatureKey;
  items: Array<{ counterKey: CounterKey; amount: number }>;
  metadata?: Record<string, unknown>;
}
