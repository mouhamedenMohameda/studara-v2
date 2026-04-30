/**
 * Facturation Whisper Studio : abonnement catalogue → quotas `chat_standard` / `ai_messages`,
 * sinon débit portefeuille MRU (`whisper_studio`) comme avant.
 */

import { deductFromWallet } from './subscriptionService';
import { getActiveSubscription } from './entitlements/activeSubscriptionService';
import { authorizeFeature } from './entitlements/authorizationService';
import { consumeQuota } from './entitlements/usageCounterService';

const MAX_AI_MESSAGE_UNITS = 500;

export async function chargeVoiceStudioUsage(params: {
  userId: string;
  userRole?: string;
  aiMessageUnits: number;
  idempotencyKey: string;
  walletFeatureKey: string;
  walletCostMru: number;
  walletDescription: string;
  providerCostMru?: number | null;
}): Promise<void> {
  const { userId, userRole, idempotencyKey, walletFeatureKey, walletCostMru, walletDescription, providerCostMru } = params;
  const units = Math.max(1, Math.min(MAX_AI_MESSAGE_UNITS, Math.floor(params.aiMessageUnits)));

  const sub = await getActiveSubscription(userId);
  if (!sub) {
    await deductFromWallet(userId, walletFeatureKey, walletCostMru, walletDescription, providerCostMru ?? null);
    return;
  }

  const decision = await authorizeFeature({
    userId,
    userRole,
    featureKey: 'chat_standard',
    context: { aiMessageUnits: units },
  });

  if (decision.decision !== 'allowed') {
    console.warn('[voiceEntitlementsBilling] authorize blocked', userId, decision.reasonCode, walletDescription);
    return;
  }

  try {
    await consumeQuota(
      userId,
      {
        idempotencyKey,
        featureKey: 'chat_standard',
        items: decision.requiredConsumptions.map((c) => ({
          counterKey: c.counterKey,
          amount: c.amount,
        })),
        metadata: { channel: 'voice_notes', walletDescription },
      },
      userRole,
    );
  } catch (err) {
    console.error('[voiceEntitlementsBilling] consumeQuota failed', userId, idempotencyKey, err);
  }
}
