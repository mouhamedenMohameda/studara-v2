# Contributing (no-break policy)

Règle #1: **ne jamais casser une fonctionnalité existante**.

## Principes

- **Changements incrémentaux**: petites PR/commits, scope limité.
- **Backward compatible par défaut**:
  - ne pas renommer/supprimer un endpoint existant,
  - ne pas changer un format de réponse consommé par les clients,
  - si changement nécessaire: ajouter une compatibilité (alias/feature flag) avant de migrer.
- **Config > hardcode**: privilégier env vars pour URLs, origins, clés, etc. (avec fallback).

## Structure & boundaries (guidelines)

### Backend (`backend/`)

- `routes/` = HTTP (validation zod, statut HTTP, réponse)
- `services/` = logique métier (pas de `req/res`)
- `db/` = accès DB (pool, queries)
- `middleware/` = auth, rate limit, upload, logging

Règles:
- éviter que `services/` importent `routes/`
- centraliser les validations `zod` par route

### Mobile (`mobile/`)

- `src/screens/` = écrans (composition UI + appels API via helpers)
- `src/ui/` = composants UI réutilisables (design system)
- `src/utils/` = helpers (api client, storage, formatting)
- `src/context/` = état global (auth, theme, i18n…)

Règle:
- éviter `fetch` “direct” dans les écrans; préférer une couche `api` unique.

### Admin web (`admin/`)

- garder une couche `src/api/` centralisée
- si tu gardes `api: any`, ajouter des types minimaux sur endpoints critiques (login/modération)

## Avant de livrer

- Backend: `npm test` (si configuré) + `npm run lint`
- Mobile: `npm run lint` + démarrage Expo
- Admin: `npm run build` (ou `npm run dev` + smoke check)

## Garde-fous

- Scan best-effort secrets: `node scripts/check-secrets.mjs`
- Health checks: `node scripts/check-health.mjs http://localhost:3000/health`

