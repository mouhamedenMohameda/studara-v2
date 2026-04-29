# Studara - Architecture abonnements, entitlements et quotas

Date: 2026-04-20
Statut: proposition cible (voir sections 10–12 pour l’état d’implémentation dans le dépôt et la file d’attente risques coût Ask Ara)

## 1. Position produit retenu

### Plans

1. `Studara Essentiel` - `199 MRU / mois`
   - Promesse: poser des questions de cours, obtenir des explications, reformuler, generer des QCM, faire des resumes courts.
   - Inclus:
     - `20` messages IA / jour
     - reponses standard
     - historique court
     - `3` conversations ou fils actifs max
   - Exclut:
     - import PDF
     - OCR / scan
     - analyse documentaire
     - memoire longue
     - dossiers de revision persistants

2. `Studara Cours & PDF` - `299 MRU / mois`
   - Promesse: tout Essentiel + travailler serieusement sur ses cours et documents.
   - Inclus:
     - `20` messages IA / jour
     - `150` pages OCR / cycle
     - `40` PDF analyses / cycle
     - `20` reponses premium / cycle
     - `10` dossiers de revision actifs
     - memoire intermediaire
     - taille doc max configurable, recommande `25 MB`

3. `Studara Revision Pro` - `399 MRU / mois`
   - Promesse: tout Cours & PDF + usage intensif avant examens.
   - Inclus:
     - `30` messages IA / jour
     - `400` pages OCR / cycle
     - `120` PDF analyses / cycle
     - `100` reponses premium / cycle
     - `50` dossiers de revision actifs
     - memoire longue
     - priorite backend
     - taille doc max configurable, recommande `75 MB`

### Boosters

1. `Pack Scans`
   - Effet recommande: `+100` pages OCR
   - Duree: `30 jours`

2. `Pack Reponses Premium`
   - Effet recommande: `+30` reponses premium
   - Duree: `30 jours`

3. `Pack Memoire+`
   - Effet recommande: `+20` dossiers actifs
   - Duree: `30 jours`
   - Option: rehausse la memoire d'un niveau si le plan a deja `study_memory_access`

4. `Pass Intensif 7 jours`
   - Effet recommande:
     - `+15` messages IA / jour
     - `+20` reponses premium
     - `+100` pages OCR
     - priorite temporaire
   - Duree: `7 jours`

### Principes forts

- Garder les noms produit imposes, avec ids techniques stables (migration `032_catalog_plans_elite_grid.sql`) :
  - `essential` — Studara Essentiel (mensuel)
  - `course_pdf` — Studara Cours & PDF (mensuel)
  - `elite_pass_7d` — Studara Elite Pass Hebdo (7 jours)
  - `elite_monthly` — Studara Elite Mensuel
  - `revision_pro` — **retire du catalogue actif** (lignes historiques possibles ; abonnes actifs migres vers `elite_monthly`)
- Ne jamais exposer les modeles IA au client.
- Les boosters augmentent des quotas existants; ils ne remplacent pas un plan.
- Si une fonctionnalite de base est absente, on pousse vers l'upgrade de plan, pas vers un booster.
- Les reponses premium ne doivent pas etre consommees silencieusement sans signal clair pour l'utilisateur.

## 2. Entitlements produits

Entitlements recommandes:

- `chat_text_access` : boolean
- `daily_ai_messages_limit` : integer
- `standard_answer_access` : boolean
- `premium_answers_monthly_limit` : integer
- `pdf_upload_access` : boolean
- `monthly_pdf_analysis_limit` : integer
- `ocr_access` : boolean
- `monthly_ocr_pages_limit` : integer
- `study_memory_access` : boolean
- `memory_tier` : enum(`none`,`medium`,`long`)
- `active_revision_notebooks_limit` : integer
- `max_document_size_mb` : integer
- `short_history_access` : boolean
- `long_context_access` : boolean
- `priority_processing_access` : boolean
- `active_chat_threads_limit` : integer

Regle produit importante:

- `monthly_pdf_analysis_limit` est consomme a l'ingestion / indexation d'un nouveau PDF, pas a chaque question sur le PDF.
- Un message de chat standard consomme `1` message journalier.
- Une reponse premium consomme:
  - `1` message journalier
  - `1` reponse premium
- Une page OCR consomme `1` page OCR.
- Une question sur PDF deja indexe consomme seulement le quota de chat, sauf si elle demande une reponse premium.

## 3. Schema de donnees cible

### `plans`

```sql
plans (
  id uuid pk,
  code text unique not null,
  display_name_fr text not null,
  description_fr text not null,
  monthly_price_mru integer not null,
  currency_code text not null default 'MRU',
  billing_period_unit text not null default 'month',
  billing_period_count integer not null default 1,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### `entitlement_definitions`

```sql
entitlement_definitions (
  key text pk,
  value_type text not null,         -- boolean | integer | enum | json
  unit text,
  category text not null,           -- access | quota | limit | routing
  reset_policy text not null,       -- none | daily | billing_cycle | booster_window
  merge_strategy text not null,     -- override | sum | max | or
  description text,
  created_at timestamptz not null default now()
)
```

### `plan_entitlements`

```sql
plan_entitlements (
  id uuid pk,
  plan_id uuid not null references plans(id) on delete cascade,
  entitlement_key text not null references entitlement_definitions(key),
  value_json jsonb not null,
  created_at timestamptz not null default now(),
  unique(plan_id, entitlement_key)
)
```

### `booster_definitions`

```sql
booster_definitions (
  id uuid pk,
  code text unique not null,
  display_name_fr text not null,
  description_fr text not null,
  price_mru integer not null,
  duration_days integer not null,
  is_active boolean not null default true,
  visibility_scope text not null default 'eligible_only',
  created_at timestamptz not null default now()
)
```

### `booster_entitlements`

```sql
booster_entitlements (
  id uuid pk,
  booster_id uuid not null references booster_definitions(id) on delete cascade,
  entitlement_key text not null references entitlement_definitions(key),
  value_json jsonb not null,
  created_at timestamptz not null default now(),
  unique(booster_id, entitlement_key)
)
```

### `user_subscriptions`

```sql
user_subscriptions (
  id uuid pk,
  user_id uuid not null references users(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status text not null,             -- active | grace | cancelled | expired | pending
  provider_ref text,                -- reference paiement externe
  source text not null,             -- payment | admin | migration | promo
  timezone text not null default 'Africa/Nouakchott',
  current_period_start_at timestamptz not null,
  current_period_end_at timestamptz not null,
  cancel_at_period_end boolean not null default false,
  next_plan_id uuid references plans(id),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Contrainte:

- un seul abonnement `active` ou `grace` par utilisateur.

### `booster_purchases`

```sql
booster_purchases (
  id uuid pk,
  user_id uuid not null references users(id) on delete cascade,
  booster_id uuid not null references booster_definitions(id),
  status text not null,             -- pending | active | expired | cancelled
  provider_ref text,
  activated_at timestamptz,
  expires_at timestamptz,
  source text not null default 'payment',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### `user_usage_counters`

Table cle pour les quotas. Un compteur represente un "bucket" consommable avec sa propre fenetre de validite.

```sql
user_usage_counters (
  id uuid pk,
  user_id uuid not null references users(id) on delete cascade,
  counter_key text not null,        -- ai_messages | ocr_pages | pdf_analyses | premium_answers
  source_type text not null,        -- subscription | booster | admin_credit
  source_id uuid not null,          -- user_subscriptions.id / booster_purchases.id / admin_credit.id
  window_type text not null,        -- daily | billing_cycle | rolling_30d | fixed_window
  window_start_at timestamptz not null,
  window_end_at timestamptz not null,
  limit_total integer not null,
  used_total integer not null default 0,
  reserved_total integer not null default 0,
  expires_at timestamptz not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Regles:

- Les quotas d'abonnement et ceux des boosters sont separes.
- On consomme d'abord le bucket qui expire le plus tot.
- `reserved_total` sert pour les taches lourdes ou asynchrones.

### `usage_events`

```sql
usage_events (
  id uuid pk,
  idempotency_key text unique not null,
  user_id uuid not null references users(id) on delete cascade,
  feature_key text not null,        -- chat_standard | chat_premium | pdf_ingest | ocr_scan
  event_type text not null,         -- authorize | reserve | commit | release | reject | credit
  counter_key text,
  amount_requested integer not null default 0,
  amount_committed integer not null default 0,
  allocation_json jsonb not null default '[]',
  status text not null,             -- pending | committed | released | rejected
  request_ref text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
)
```

### `feature_flags`

Usage recommande: kill switches et rollout operationnel. Pas pour encoder les offres.

```sql
feature_flags (
  key text pk,
  enabled boolean not null,
  plan_code text,
  platform text,                    -- mobile | web | all
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now()
)
```

## 4. Services backend

### `ActiveSubscriptionService`

- Retourne l'abonnement actif ou `null`.
- Gere `active`, `grace`, `cancelled`, `expired`.
- Ne calcule pas les quotas; seulement la fenetre d'abonnement.

### `EntitlementResolver`

- Charge `plan_entitlements` du plan actif.
- Charge les boosters actifs.
- Charge les `feature_flags` globaux ou par plan.
- Produit une vue normalisee:
  - `access`
  - `limits`
  - `remaining`
  - `source_breakdown`

### `UsageAuthorizationService`

- Point d'entree avant toute action IA ou documentaire.
- Recoit `userId`, `featureKey`, `context`.
- Verifie:
  - acces de base
  - taille document
  - memoire / contexte requis
  - disponibilite de quota
- Retourne:
  - `allowed`
  - `blocked`
  - `confirmation_required`

### `QuotaReservationService`

- Pour les operations couteuses:
  - reserve d'abord
  - execute ensuite
  - commit ou release a la fin
- Lock SQL sur les buckets choisis pour eviter la surconsommation.

### `CounterLifecycleService`

- Cree les compteurs journaliers a la premiere consommation du jour.
- Cree les compteurs de cycle a l'activation / renouvellement de l'abonnement.
- Cree les compteurs boosters a l'activation du booster.
- Ne reset pas en effacant des lignes; il ouvre une nouvelle fenetre.

### `BoosterLifecycleService`

- Active un booster apres confirmation de paiement.
- Cree ses buckets de quota.
- Marque `expired` quand `expires_at < now()`.
- L'expiration est verifiee a la lecture; le cron ne sert qu'a mettre a jour les statuts.

## 5. API recommandee

### Lecture

```http
GET /me/subscription
GET /me/entitlements
GET /me/usage
GET /catalog/subscriptions
GET /catalog/boosters
```

### Actions

```http
POST /features/authorize
POST /usage/consume
POST /usage/release
POST /admin/credit
POST /subscription/simulate-upgrade
POST /boosters/activate
```

Exemple `POST /features/authorize`:

```json
{
  "featureKey": "pdf_ingest",
  "context": {
    "documentSizeMb": 18,
    "pageCount": 42,
    "notebookId": "nb_123",
    "deepModeRequested": false
  }
}
```

Reponse:

```json
{
  "decision": "allowed",
  "requiredConsumptions": [
    { "counterKey": "pdf_analyses", "amount": 1 }
  ],
  "upgradeRecommendation": null,
  "boosterRecommendation": null
}
```

Exemple blocage:

```json
{
  "decision": "blocked",
  "reasonCode": "feature_not_in_plan",
  "messageFr": "Vous devez passer a Cours & PDF pour analyser vos documents.",
  "upgradeRecommendation": {
    "planCode": "course_pdf"
  },
  "boosterRecommendation": null
}
```

## 6. UX retenue

### Ecran pricing

- 3 cartes maximum.
- Montrer 4 benefices lisibles par carte, pas une longue liste technique.
- Recommande:
  - Essentiel: `Questions IA`, `QCM`, `Resumes courts`, `Prix accessible`
  - Cours & PDF: `PDF`, `Scan`, `Resume de documents`, `Dossiers de revision`
  - Revision Pro: `Plus de volume`, `Reponses approfondies`, `Memoire longue`, `Priorite`

### Ecran "Mon offre"

- Carte plan actuelle
- date de fin de cycle
- compteurs principaux:
  - `Questions IA aujourd'hui`
  - `Pages scannees ce mois`
  - `PDF analyses ce mois`
  - `Reponses premium restantes`
  - `Dossiers actifs`
- blocs CTA:
  - `Passer a l'offre superieure`
  - `Acheter un booster`

### Etats bloques

- Feature absente du plan:
  - `Vous devez passer a Cours & PDF pour analyser vos documents.`
- Quota epuise:
  - `Vos 150 pages de scan de ce mois sont utilisees. Ajoutez un Pack Scans pour continuer.`
- Confirmation premium:
  - `Cette demande utilise 1 reponse premium. Continuer ?`

## 7. Analytics

Evenements minimum:

- `paywall_viewed`
- `subscription_selected`
- `subscription_activated`
- `feature_blocked`
- `upgrade_clicked`
- `booster_clicked`
- `premium_answer_consumed`
- `ocr_page_consumed`
- `pdf_analysis_started`
- `long_context_used`

Dimensions utiles:

- `user_id`
- `plan_code`
- `feature_key`
- `screen_name`
- `platform`
- `reason_code`
- `remaining_before`
- `remaining_after`
- `recommended_plan_code`
- `recommended_booster_code`
- `document_pages`
- `document_size_mb`
- `notebook_count`

## 8. Roadmap

L’avancement réel dans le dépôt (écarts, fichiers, endpoints) est détaillé en **section 11**.

### MVP

- 3 plans
- entitlements centraux
- quotas journaliers et de cycle
- ecran pricing
- ecran mon offre
- gating propre sur chat, OCR, PDF
- boosters actives en config:
  - `Pack Scans`
  - `Pack Reponses Premium`

### V2

- `Pack Memoire+`
- `Pass Intensif 7 jours`
- mode confirmation reponse premium
- endpoint `simulate-upgrade`
- priorite backend par plan

### V3

- segmentation / promos
- admin avance de credits et ajustements
- files d'attente lourdes priorisees
- historique detaille de consommation dans l'app

## 9. Pseudocode

### Verification d'acces

```ts
function authorizeFeature(userId, featureKey, context, now) {
  const sub = resolveActiveSubscription(userId, now);
  const ent = resolveEffectiveEntitlements(userId, sub, now);
  const req = getFeatureRequirements(featureKey, context);

  for (const accessKey of req.requiredAccess) {
    if (!ent.flags[accessKey]) {
      return blocked("feature_not_in_plan", recommendPlan(featureKey));
    }
  }

  if (req.maxDocumentSizeMb && context.documentSizeMb > ent.limits.max_document_size_mb) {
    return blocked("document_too_large", recommendPlan(featureKey));
  }

  if (req.needsPremiumAnswer) {
    if (ent.remaining.premium_answers <= 0) {
      return blocked("premium_quota_exhausted", recommendUpgradeOrBooster(featureKey));
    }
  }

  for (const need of req.consumptions) {
    if (ent.remaining[need.counterKey] < need.amount) {
      return blocked("quota_exhausted", recommendUpgradeOrBooster(featureKey));
    }
  }

  return allowed(req.consumptions);
}
```

### Consommation

```ts
function consumeQuota(userId, consumptions, idempotencyKey, now) {
  const existing = findUsageEventByIdempotencyKey(idempotencyKey);
  if (existing && existing.status === "committed") return existing;

  beginTransaction();
  const allocations = [];

  for (const item of consumptions) {
    let remaining = item.amount;
    const buckets = lockEligibleBuckets(userId, item.counterKey, now)
      .sort(bySoonestExpiry);

    for (const bucket of buckets) {
      const available = bucket.limit_total - bucket.used_total - bucket.reserved_total;
      if (available <= 0) continue;
      const take = Math.min(available, remaining);
      bucket.used_total += take;
      save(bucket);
      allocations.push({ bucketId: bucket.id, counterKey: item.counterKey, amount: take });
      remaining -= take;
      if (remaining === 0) break;
    }

    if (remaining > 0) {
      rollback();
      throw new Error("insufficient_quota");
    }
  }

  const event = insertCommittedUsageEvent(userId, idempotencyKey, allocations);
  commit();
  return event;
}
```

### Choix premium

```ts
function shouldUsePremiumAnswer(context) {
  if (context.deepModeRequested) return true;
  if (context.multiDocument === true) return "confirm";
  if (context.outputType === "study_plan") return "confirm";
  if (context.reasoningComplexityScore >= 0.8) return "confirm";
  return false;
}
```

### Fusion plan + boosters

```ts
function resolveEffectiveEntitlements(userId, subscription, now) {
  const base = getPlanEntitlements(subscription.planId);
  const boosters = getActiveBoosters(userId, now);
  const flags = getOperationalFeatureFlags(subscription.planCode);

  let result = clone(base);

  for (const booster of boosters) {
    for (const effect of booster.effects) {
      result[effect.key] = merge(result[effect.key], effect.value, effect.mergeStrategy);
    }
  }

  result = applyFlags(result, flags);
  result.remaining = readRemainingCounters(userId, now);
  return result;
}
```

## 10. Migration depuis l'existant — état réel du dépôt

### 10.1 Ancien socle (toujours utilisé côté app)

- `api/src/services/subscriptionService.ts` — abonnement « simple » (essai / payant) + **wallets** par fonctionnalité (PAYG).
- `api/src/routes/billing.ts` — façade HTTP principale pour le mobile: `/billing/status`, `/billing/features`, wallets, demandes de paiement par capture d'écran, etc.
- `src/context/SubscriptionContext.tsx` — charge **`GET /billing/status`**, pas les endpoints entitlements.
- `src/components/common/PremiumGate.tsx` et `src/hooks/usePremiumFeature.ts` — gating basé sur **`/billing/features/:key/access`**, pas sur `POST /features/authorize`.

### 10.2 Nouveau module (déjà présent dans le dépôt)

Le socle décrit aux sections 3–5 est en grande partie **implémenté côté API**:

| Élément cible (doc) | Implémentation actuelle |
|---------------------|-------------------------|
| Tables `plans`, `plan_entitlements`, … | Migration `api/src/db/migrations/029_entitlements_mvp.sql` — table catalogue nommée **`subscription_plans`** (équivalent à `plans`). |
| `user_subscriptions`, boosters, compteurs, `usage_events`, `feature_flags` | Même migration + services associés. |
| `visibility_scope` sur `booster_definitions` | **Non** présent en schéma (colonne absente); filtrage « eligible_only » non matérialisé en DB. |
| Services §4 | `api/src/services/entitlements/` — `activeSubscriptionService`, `entitlementResolver`, `authorizationService`, `usageCounterService`, `catalogService`, `subscriptionManagementService`. |
| API §5 (lecture + authorize + consume) | `api/src/routes/entitlements.ts` monté sous **`/api/v1`** (préfixe à ajouter aux chemins du doc). Inclut aussi `POST /subscription/simulate-upgrade`, `POST /usage/release`, crédits admin et activation admin. |

Décision de migration **toujours valable**:

1. Garder `billing.ts` comme façade de transition le temps de basculer le client.
2. Le module `entitlements/` existe; côté API, **chat + scan-deck** (`api/src/routes/ai.ts`) et **Whisper Studio** (`api/src/routes/voiceNotes.ts`, voir §10.3) appellent déjà `authorizeFeature` / `consumeQuota` lorsqu'un abonnement catalogue est actif. Il reste notamment **OCR/PDF** hors de ce flux unifié et le **client** à aligner sur tous les parcours.
3. Migrer l'app vers `plan_code`, `remaining`, `upgradeRecommendation` via `/me/subscription`, `/me/entitlements`, `/me/usage`.
4. Laisser l'ancien PAYG en lecture seule ou parallèle jusqu'à couverture complète des parcours.
5. Remplacer progressivement le gating « wallet / feature key » par `authorize` + `consume` idempotent.

### 10.3 Whisper Studio (`voice-notes`) — catalogue vs portefeuille

Implémentation: `api/src/routes/voiceNotes.ts` délègue la facturation post-action à `api/src/services/voiceEntitlementsBilling.ts`.

- **Sans abonnement catalogue actif** (`getActiveSubscription` vide): comportement inchangé — **`deductFromWallet`** sur la fonctionnalité **`whisper_studio`** (MRU), avec les mêmes libellés / montants qu'auparavant.
- **Avec abonnement catalogue actif**: après transcription réussie (job asynchrone) ou après **enhance** (flashcards, Groq/Gemini, structured OpenAI), le backend appelle **`authorizeFeature('chat_standard', { aiMessageUnits })`** puis **`consumeQuota`** sur le compteur **`ai_messages`** (même `feature_key` que le chat standard côté `authorizationService`).
- **`aiMessageUnits`**: le contexte d'autorisation (`authorizationService.ts`) mappe ce champ sur la quantité consommée pour `chat_standard` (minimum 1, plafonné côté helper voix). En pratique: **transcription** ≈ **1 unité par minute** facturée (durée arrondie au supérieur sur la base utilisée pour la facturation); **enhance** ≈ unités dérivées du **coût MRU** de l'action (bornées), pour rester cohérent avec l'ancienne granularité PAYG.
- **Idempotence** (`usage_events`): clé stable **`voicetx:{noteId}`** pour une transcription complète par note; clé **`voiceenh:{noteId}:{uuid}`** par requête **enhance** (chaque appel est distinct).
- **`POST …/partial-transcribe`** (aperçu): **aucune** consommation catalogue ni débit wallet (éviter le spam d'aperçus).
- **Accès / paywall**: le **gating mobile** peut encore passer par `PremiumGate` + `/billing/features` pour entrer dans l'écran; la **consommation** après coup est cependant routée comme ci-dessus côté API si un catalogue est actif.

---

## 11. Ce qui n'est pas encore implémenté (ou incomplet) par rapport au doc

Synthèse pour prioriser le travail restant. Les chemins sont relatifs à la racine du dépôt Studara.

### 11.1 Intégration produit (bloquant pour « une seule vérité »)

- **Chat et modèles IA** — côté API, `api/src/routes/ai.ts` appelle **`authorizeFeature` / `consumeQuota`** pour les utilisateurs avec abonnement catalogue (sinon ancien crédits / quotas). Le client (`AskZadScreen`, etc.) expose encore modèles et UX crédits; l'alignement complet « une seule vérité » côté app (messages d'erreur entitlements, écrans 100 % compteurs plan) reste partiel.
- **Application mobile** — `SubscriptionContext` / `MyPlanScreen` utilisent déjà **`GET /me/subscription`** (et usage côté Mon offre); d'autres écrans n'appellent pas encore systématiquement `/me/entitlements`, `POST /features/authorize`, `POST /usage/consume`.
- **Gating OCR / PDF / premium** — beaucoup d'écrans passent encore par **`PremiumGate` + billing features** (`ScanCreateScreen`, etc.), pas par le moteur unifié §4–5 pour l'**entrée** dans la fonctionnalité. **Exception documentée**: Whisper Studio consomme déjà les quotas catalogue côté API après coup (§10.3) lorsque l'utilisateur a un abonnement actif.

### 11.2 Réservations, ledger et feature flags

- **`QuotaReservationService`** (réserve → exécution → commit / release) — pas de service dédié; `user_usage_counters.reserved_total` existe mais le flux principal est un **commit direct** dans `consumeQuota` (`usageCounterService.ts`). Pas d'endpoint public « reserve » distinct du doc §5.
- **`usage_events`** — idempotence et commit / release sont utilisés pour la consommation; les types d'événements `reserve` / `authorize` du schéma ne sont pas exploités comme pipeline complet pour les tâches asynchrones.
- **`feature_flags`** — table créée en migration, mais **`entitlementResolver.ts` ne lit pas** `feature_flags` (pas d'`applyFlags` comme au pseudocode §9).

### 11.3 Boosters, achat et admin

- **`POST /boosters/activate`** — dans `entitlements.ts`, protégé par **`requireRole('admin', 'moderator')`**: pas de parcours **utilisateur final** (paiement → activation) branché comme produit.
- **Admin web** — `SubscriptionsPage` liste les `plan_code` catalogue (`essential`, `course_pdf`, `elite_pass_7d`, `elite_monthly`) ; l'activation admin utilise `POST /admin/users/:id/catalog-plan` ou `POST /api/v1/admin/subscription/activate` avec une duree de periode deduite du plan (`billing_period_*`) si `periodDays` est omis.

### 11.4 UX (section 6)

- **Chat : abonnement catalogue uniquement (2026-04)** — le portefeuille PAYG `ara_chat` (capture d'écran) est **désactivé** pour le chat (`premium_features.is_active = false`, migration `031_chat_catalog_only_deep_model.sql`). Le mobile ouvre **Paywall / Mon offre** pour Studara+ ; `POST /ai/chat` catalogue ne débite plus les compteurs `ai_messages` / `premium_answers` pour le **chat HTTP** (`channel: 'chat_http'` dans `authorizeFeature`) ; le mode réponse profonde (modèle Ara) est contrôlé par l'entitlement booléen **`deep_model_access`**. Hors catalogue, seul **DeepSeek** reste disponible avec quota journalier `ai_daily_credits`.
- **Écran « Mon offre »** — branché sur `/me/subscription` + `/me/usage` ; les compteurs couvrent surtout OCR/PDF/voix lorsque le chat catalogue est en mode illimité côté messages.

### 11.5 Analytics (section 7)

- Les événements listés (`paywall_viewed`, `feature_blocked`, `premium_answer_consumed`, etc.) ne sont **pas** implémentés comme instrumentation commune dans le dépôt (à ajouter côté mobile et/ou API selon la stack analytics choisie).

### 11.6 Qualité et dette documentaire mineure

- **Nommage** — le doc dit `plans`; le code utilise `subscription_plans` (équivalent fonctionnel).
- **Tests** — `api/src/__tests__/ai.test.ts` couvre l'ancien comportement crédits / quotas IA; il manque une suite ciblée **entitlements** (authorize + consume + cas limites) branchée sur les routes réelles avec base de test.

### 11.7 Roadmap doc vs code

| Bloc | Statut |
|------|--------|
| **MVP §8** — 3 plans + entitlements + quotas + gating chat/OCR/PDF | Schéma + API + résolution **faits**; **gating applicatif et client** encore sur l'ancien modèle pour la majeure partie des parcours. |
| **MVP** — boosters Pack Scans + Pack Réponses Premium | **Définis** en seed (et même les boosters V2 en base); **activation / achat côté user** non branchés. |
| **V2 §8** — Pack Mémoire+, Pass 7 j, confirmation premium, simulate-upgrade, priorité | `simulate-upgrade` **existe**; confirmation **`confirmation_required`** existe côté `authorizationService` mais **non portée** sur l'UI chat; priorité backend **non** appliquée comme file séparée; boosters V2 **en catalogue SQL** mais hors périmètre produit tant que l'app n'utilise pas entitlements. |
| **V3 §8** | Non entamé (promos, admin avancé, files prioritaires, historique conso détaillé). |

## 12. Code de la route — risques coût Ask Ara (stratégie cible)

> **Contexte.** Le danger ne vient pas seulement du nombre de messages, mais de l’historique long, des PDF lourds, de l’OCR multi-pages, des sorties longues, du modèle premium trop souvent, des relances et de l’abus. Tant que le positionnement « chat catalogue » reste en transition (messages / premium parfois non débités sur `chat_http`, voir §11.4), cette section sert de **file d’attente** pour ne rien oublier.

### 12.1 Les trois blocs produit

1. **Bloquer le risque avant exécution** — limites dures, pré-check, réservation, routage modèle.
2. **Prévenir avant consommation** — alertes sur actions coûteuses, confirmation explicite.
3. **Rendre le restant visible** — compteurs lisibles, barres 70 / 85 / 95 %, dates de reset.

### 12.2 Grille A → J (état dans ce dépôt)

| Id | Sujet | Déjà / partiel / manquant | Notes |
|----|--------|---------------------------|--------|
| **A** | Hard limits (messages, premium, OCR, PDF, taille fichier, pages PDF, sessions gros contexte, longueur réponse, pièces jointes, taille contexte injecté) | **Partiel** | Entitlements + compteurs (`ai_messages`, `premium_answers`, `ocr_pages`, `pdf_analyses`) et `max_document_size_mb` côté `authorizeFeature` ; **max pages PDF**, **sessions mémoire longue**, **max pièces jointes / conversation**, **plafond contexte tokens** : à modéliser et appliquer partout. |
| **B** | Soft limits 70 % / 85 % / 95 % + messages utilisateur | **Manquant** | Pas d’API dédiée ; à ajouter (ex. champs sur `/me/usage` ou `authorize`/`consume` response). |
| **C** | Quotas séparés par dimension | **Partiel** | Compteurs séparés en base ; le **chat HTTP catalogue** ne débite pas encore `ai_messages` / `premium_answers` (§11.4) — risque « une seule conversation lourde = un message ». |
| **D** | Pré-check coût avant chaque requête (prompt, historique, docs, modèle, décision autoriser / compresser / downgrade / confirmer / bloquer) | **Manquant** | Estimation tokens / coût non centralisée ; pas de branche « compresser » automatique. |
| **E** | Compression contexte (résumé, trimming, chunking, top-k) | **Partiel** | `max_context_messages` + prompts limitant les mots ; pas de résumé de conversation ni RAG borné générique. |
| **F** | Routeur de modèles (tâche simple → économique, etc.) | **Partiel** | Choix côté client + règles `deep_model_access` ; pas de routeur serveur par **profil de tâche**. |
| **G** | Caps de sortie | **Partiel** | `max_output_tokens` en config + consignes « 400 / 600 mots » dans les prompts ; pas de quotas métier « sortie longue » séparés. |
| **H** | Pièces jointes par plan (Essentiel / Cours & PDF / Elite) | **Manquant** | Règles produit à traduire en entitlements + enforcement sur upload / chat. |
| **I** | Idempotence + états pending / committed / failed / refunded | **Partiel** | `idempotencyKey` + `usage_events` ; **pas** de pipeline réservation → exécution → commit systématique ; **scan-deck** et **chat** : `consume` après appel LLM (échec de consommation = incohérence possible). |
| **J** | Kill switch sans redéployer | **Manquant** | Table `feature_flags` non lue par `entitlementResolver` (§11.2). |

### 12.3 Deux temps : pré-autorisation + consommation réelle

| Étape | Cible | État |
|--------|--------|------|
| 1 Pré-autorisation | Droits + quota restant + estimation + **réservation** ; refus ou upgrade | **Partiel** : `authorizeFeature` + vérif remaining sauf `chat_http` ; **pas** de réservation dédiée avant LLM. |
| 2 Consommation réelle | Comparer estimé vs réel, ajuster, journaliser | **Partiel** : commit direct ; pas d’ajustement fin sur tokens réels côté métier. |

### 12.4 Notifier avant actions coûteuses

- **428 `confirmation_required`** existe pour certains chemins `chat_premium` **hors** `chat_http` ; l’**UI mobile** doit intercepter et proposer Continuer / mode économique / upgrade (TODO §11.1).
- Cas listés (premium, mémoire longue, PDF lourd, OCR volumineux, proche limite, sortie très longue) : **à mapper** écran par écran (Ask Ara, scan, PDF, dossiers).

### 12.5 Indicateurs utilisateur (toujours + contextuels + reset)

- **Mon offre** : `MyPlanScreen` + `/me/subscription` / `/me/usage` — **à compléter** avec barres 70–90–100 %, libellés « il te reste… », date de reset partout où c’est un cycle.
- **Chat** : bandeau discret messages / premium — **partiel** selon écran.
- **Quota atteint** : messages structurés (`reasonCode`, `upgradeRecommendation`) côté API ; **harmoniser** toutes les erreurs UI (pas seulement « Erreur »).

### 12.6 Indicateurs internes (finance / risque)

- Admin : usage IA / abonnements en cours d’évolution ; **manque** : coût moyen par user/plan/action, top % coûteux, écart estimé vs réel, alertes seuils internes.

### 12.7 Règles « noyau dur » (checklist permanente)

- [ ] Aucun appel lourd sans pré-check (même minimal : taille + type).
- [ ] Aucun appel lourd sans **réservation** ou consommation **avant** réponse (une fois le modèle produit défini).
- [ ] Aucun PDF sans limite taille + pages (côté upload et côté traitement).
- [ ] Mémoire longue avec compteur dédié + droits.
- [ ] Réponse premium avec compteur dédié **visible** et débité.
- [ ] Toujours montrer le restant avant / après l’action quand c’est coûteux.
- [ ] Toujours bloquer proprement à 100 % + reset + alternative (upgrade / booster / mode économique).

### 12.8 Philosophie affichage

- **Ne pas** exposer les tokens à l’étudiant ; unités : messages, réponses premium, pages scannées, PDF, dossiers, mémoire longue. Les tokens restent **internes** (estimation, debug, admin).

### 12.9 **À faire tout de suite** (priorité technique courte, sans attendre la fin de transition produit)

1. **Lire `feature_flags` dans `entitlementResolver`** (kill switch partiel : couper OCR, premium, taille max, provider).
2. **Enrichir `/me/usage` (ou réponse `authorize`)** avec drapeaux `warningLevel` par compteur (70 / 85 / 95 %) pour alimenter l’app sans logique dupliquée.
3. **Audit des routes `authorize → LLM → consume`** (`ai/chat`, `ai/scan-deck`, résumés ressources, etc.) : documenter par route le risque « réponse OK, consume KO » ; puis implémenter **réserve + commit** ou **consume avant LLM** avec **remboursement** si échec technique (aligné §12.2-I).
4. **UI** : handler global `428` / `confirmation_required` + libellés consommation sur boutons (scan, PDF, mode Ara).

### 12.10 **Backlog** (après stabilisation abonnement Ask Ara / chat)

- Réactiver débit **messages journaliers** + **premium_answers** sur `chat_http` quand la promesse produit le permet (aligné §12.2-C).
- Pré-check coût (estimation tokens / pages) et branche compression / modèle moins cher.
- Routeur serveur par type de requête ; quotas « gros contexte », « sortie longue », max pages PDF, max fichiers par conversation.
- Tableau de bord interne : MRU estimé, top utilisateurs, conversations / PDF les plus chers, alertes seuil.
- Instrumentation analytics (`feature_blocked`, `premium_answer_consumed`, etc., §11.5).

## Recommendation finale

La meilleure architecture pour Studara est:

- un catalogue central `plans + entitlements + boosters`
- des compteurs bucketises par source (`subscription`, `booster`, `admin_credit`)
- un ledger `usage_events` idempotent
- un service de gating unique appele avant toute action IA / OCR / PDF
- un routing interne par `featureKey` et `task profile`, jamais par nom de modele expose

Ce choix est simple a expliquer au client, robuste pour le backend, et extensible pour de futurs providers de paiement, LLM et OCR.
