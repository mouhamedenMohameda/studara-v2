# RUNBOOK — Dev & Ops (Studara)

Objectif: permettre à n’importe qui de **lancer / diagnostiquer** le projet sans “toucher au code”.

## Cartographie rapide

- **Mobile**: `mobile/` (Expo)
- **Backend principal**: `backend/` (Express + PostgreSQL)
- **Admin web**: `admin/` (Vite + React)
- **Service secondaire**: `services/fastify-api/` (Fastify) — fonctionnalités spécifiques (ex: correction/exercices, export PDF)

## Ports & URLs (par défaut)

> Les ports exacts peuvent être overridés via `.env` côté backend ou config Expo côté mobile.

- **Backend Express**: `PORT` (défaut `3000`)
  - Health: `GET /health`
  - API: `GET/POST ... /api/v1/*`
- **Admin Vite**: port Vite (souvent `5173`)
- **Fastify service**: `PORT` dans `services/fastify-api` (voir son `.env` / `env.ts`)

## Variables d’environnement

### Mobile (`mobile/`)

- **`EXPO_PUBLIC_API_BASE`**: base URL de l’API, ex: `http://localhost:3000/api/v1`
  - Si absent, le code utilise une valeur par défaut dans `src/utils/api.ts`.

### Backend Express (`backend/`)

Minimum attendu au démarrage (validé au boot):
- `DATABASE_URL`
- `JWT_SECRET` (>= 32 chars)
- `JWT_REFRESH_SECRET` (>= 32 chars)

Autres variables (selon features):
- `PORT`
- `SCRAPER_ENABLED`
- Variables IA (selon routes)

## Démarrage (local)

### 1) Backend (Express)

```bash
cd backend
npm install
npm run env:init   # crée .env depuis env.example si absent
npm run dev
```

Vérifier:
- `GET http://localhost:3000/health`

### 2) Admin web (Vite)

```bash
cd admin
npm install
npm run dev
```

### 3) Mobile (Expo)

```bash
cd mobile
npm install
EXPO_PUBLIC_API_BASE="http://localhost:3000/api/v1" npm run start
```

## Démarrage (service secondaire Fastify)

```bash
cd services/fastify-api
npm install
npm run dev
```

Health:
- `GET /api/v1/health`

## Déploiement (prod) — API + Admin sur le même domaine

### Script de déploiement

Le déploiement “standard” (API + build admin UI) se fait via:

```bash
cd backend
bash deploy/deploy.sh
```

### Nginx (exemple)

Pour servir l’admin en statique sur `/admin` et proxy l’API, voir:

- `backend/deploy/nginx.studara.example.conf`

## Diagnostic rapide

### Scans “garde-fous”

Scanner best-effort de secrets committés par erreur:

```bash
node scripts/check-secrets.mjs
```

Checker health endpoints (backend + service secondaire):

```bash
node scripts/check-health.mjs http://localhost:3000/health http://localhost:3101/api/v1/health
```

### Erreurs CORS (admin web)

- Vérifier l’origine utilisée par le navigateur (devtools → Network).
- Vérifier la whitelist dans `backend/src/app.ts`.

### Erreurs DB

- Vérifier `DATABASE_URL` dans `.env` du backend.
- Vérifier que Postgres tourne et accepte les connexions.

### Problèmes mobile (API base)

- Vérifier `EXPO_PUBLIC_API_BASE`.
- Sur device: `localhost` ne marche pas; utiliser l’IP LAN de la machine.

