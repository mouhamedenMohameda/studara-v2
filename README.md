# Studara migration workspace

Ce workspace contient plusieurs applications (mobile, backend, admin web, service secondaire).

## Structure du workspace

- **`backend/`**: API principale (Express + PostgreSQL) — base `/api/v1` + `GET /health`
- **`admin/`**: dashboard web (Vite + React) — build statique dans `admin/dist/`
- **`mobile/`**: app Expo / React Native — appelle l’API via `EXPO_PUBLIC_API_BASE`
- **`services/fastify-api/`**: service secondaire (Fastify) — endpoints dédiés (ex: correction IA + export PDF)
- **`scripts/`**: scripts utilitaires (scan secrets, health checks)
- **`shared/`**: réservé pour du code partagé (types/validators) si tu veux dédupliquer plus tard

## Documents utiles

- `PROJECTS.md` — commandes de lancement (quick start)
- `RUNBOOK.md` — dev & ops (ports, env, diagnostic)
- `CONFIGURATION.md` — variables d’environnement (mobile/admin/back)
- `ARCHITECTURE.md` — cartographie & risques
- `ENDPOINTS_MAP.md` — qui possède quels endpoints (Express vs Fastify)
- `DECISIONS.md` — décisions d’architecture (ADR-lite)
- `CONTRIBUTING.md` — règles de contribution (no-break)
- `CI_PLAN.md` — plan CI minimal (optionnel)
- `SECURITY.md` — règles de sécurité (secrets)
- `scripts/check-secrets.mjs` — scan best-effort secrets
- `scripts/check-health.mjs` — check health endpoints

## TL;DR démarrer en local

Backend:

```bash
cd backend
npm install
npm run env:init
npm run dev
```

Mobile:

```bash
cd mobile
npm install
EXPO_PUBLIC_API_BASE="http://localhost:3000/api/v1" npm run start
```

Admin (web):

```bash
cd admin
npm install
npm run dev
```

Service secondaire (Fastify):

```bash
cd services/fastify-api
npm install
PORT=3101 GROQ_API_KEY=... npm run dev
```

## Déploiement (prod) — 1 domaine (API + Admin)

Objectif: déployer un seul domaine (ex: `api.radar-mr.com`) qui sert:

- **API**: `/api/v1/*` + `/health` (Express, PM2)
- **Admin**: `/admin` (fichiers statiques build Vite)

### 1) Build + sync vers le VPS

Le script de déploiement build en local puis synchronise:

- `backend/` → `/var/www/studara/api`
- `admin/dist/` → `/var/www/studara/admin`

Commande:

```bash
cd backend
bash deploy/deploy.sh
```

Le script utilise aussi PM2 via:

- `backend/deploy/ecosystem.config.cjs`

### 2) Nginx (exemple)

Un vhost Nginx prêt à adapter est fourni ici:

- `backend/deploy/nginx.studara.example.conf`

Il sert `/admin` en statique et proxy `/api/*` + `/health` vers `127.0.0.1:3000`.

### 3) Variables d’environnement côté clients

- **Mobile (Expo)**: `EXPO_PUBLIC_API_BASE="https://api.radar-mr.com/api/v1"`
- **Admin (Vite)**: `VITE_API_BASE="https://api.radar-mr.com/api/v1"` (si utilisé côté front)

### Notes “no-break”

- Les endpoints existants restent **inchangés** (`/api/v1/*`).
- Si tu changes de domaine/URL, fais-le via variables d’environnement côté clients plutôt que de modifier le code.

## Défi du jour — test “50 users” (sans déclencher le rate-limit)

Contexte: l’endpoint `POST /api/v1/auth/login` peut renvoyer `429 Too many requests` si on fait 50 logins d’un coup.
La stratégie est donc:

- **Warmup**: générer les tokens **lentement** (séquentiel + backoff) et les sauvegarder localement.
- **Run**: exécuter `start/submit` pour 50 users **sans re-login** pendant la fenêtre.
- **Grace**: valider la règle “soumission acceptée jusqu’à +15s après `windowEndUtc`”.

### Pré-requis

- Bash + `curl` + `python3`
- Un fichier d’emails (1 email par ligne), ex: `./tmp/dc_emails.txt`

### Exécution

```bash
# 1) Warmup tokens (lent, évite 429)
API_BASE="https://api.radar-mr.com/api/v1" \
PASSWORD="medn1234" \
EMAILS_FILE="./tmp/dc_emails.txt" \
TOKENS_FILE="/tmp/daily_challenge_tokens.jsonl" \
./scripts/daily-challenge-load-test.sh warmup

# 2) Run: start + submit pour tous les users (sans login)
API_BASE="https://api.radar-mr.com/api/v1" \
PASSWORD="medn1234" \
EMAILS_FILE="./tmp/dc_emails.txt" \
TOKENS_FILE="/tmp/daily_challenge_tokens.jsonl" \
./scripts/daily-challenge-load-test.sh run

# 3) Grace test: soumettre à windowEnd+5s (doit passer si grace=15s)
API_BASE="https://api.radar-mr.com/api/v1" \
PASSWORD="medn1234" \
EMAILS_FILE="./tmp/dc_emails.txt" \
TOKENS_FILE="/tmp/daily_challenge_tokens.jsonl" \
./scripts/daily-challenge-load-test.sh grace
```

Notes:
- Le script est dans `scripts/daily-challenge-load-test.sh`.
- Tu peux ajuster la vitesse du warmup via `WARMUP_SLEEP_S=2` (ou plus si ton rate-limit est strict).

