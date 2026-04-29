# Configuration (clients + services)

Objectif: éviter les erreurs “ça marche chez moi” en standardisant les variables d’environnement et les URLs.

## Mobile (Expo) — `mobile/`

### Variable

- **`EXPO_PUBLIC_API_BASE`**: base URL de l’API **(inclure `/api/v1`)**

### Exemples

Local (simulateur / web):

```bash
EXPO_PUBLIC_API_BASE="http://localhost:3000/api/v1"
```

Device physique (Android/iOS sur le même Wi‑Fi):

```bash
EXPO_PUBLIC_API_BASE="http://<IP_LAN_DE_TA_MACHINE>:3000/api/v1"
```

Prod:

```bash
EXPO_PUBLIC_API_BASE="https://api.radar-mr.com/api/v1"
```

### Important

- Sur un **device**, `localhost` pointe vers le téléphone, pas vers ta machine.
- Pour les features “correction IA d’exercices”, assure-toi que `EXPO_PUBLIC_API_BASE` pointe vers le service qui possède les endpoints (voir `ENDPOINTS_MAP.md`).

## Admin web (Vite) — `admin/`

### Variables

- **`VITE_API_BASE`**: base URL de l’API **(inclure `/api/v1`)**

### Exemples

Local:

```bash
VITE_API_BASE="http://localhost:3000/api/v1"
```

Prod:

```bash
VITE_API_BASE="https://api.radar-mr.com/api/v1"
```

### Proxy dev

`admin/vite.config.ts` configure un proxy `/api` → cible.
Si tu utilises `VITE_API_BASE`, tu peux éviter certaines confusions `/api` vs `/api/v1` en étant explicite.

## Backend Express — `backend/`

### Variables minimales

- `DATABASE_URL`
- `JWT_SECRET` (>= 32 chars)
- `JWT_REFRESH_SECRET` (>= 32 chars)

### Autres variables fréquentes

- `PORT` (défaut 3000)
- `NODE_ENV` (`development` / `production` / `test`)

### Vérifier

Health:

```bash
curl -i http://localhost:3000/health
```

## Service Fastify (secondaire) — `services/fastify-api/`

### Variables

- `PORT` (ex: 3101)
- `GROQ_API_KEY` (si OCR/correction IA)
- autres variables dans son module `env`

### Vérifier

```bash
curl -i http://localhost:3101/api/v1/health
```

