# Endpoints map (source of truth)

Objectif: savoir **quel service** possède **quels endpoints** pour éviter la duplication/dérive.

## Service A — Backend principal (Express)

**Code**: `backend/`  
**Base**: `/api/v1` (et health `GET /health`)  
**Rôle**: API produit (auth, ressources, flashcards, jobs, billing, admin, IA, etc.) + PostgreSQL.

Routeurs montés dans `backend/src/app.ts`:

- `/api/v1/auth` → `backend/src/routes/auth.ts`
- `/api/v1/billing` → `backend/src/routes/billing.ts`
- `/api/v1/resources` → `backend/src/routes/resources.ts`
- `/api/v1/timetable` → `backend/src/routes/timetable.ts`
- `/api/v1/reminders` → `backend/src/routes/reminders.ts`
- `/api/v1/admin` → `backend/src/routes/admin.ts`
- `/api/v1/flashcards` → `backend/src/routes/flashcards.ts`
- `/api/v1/home` → `backend/src/routes/home.ts`
- `/api/v1/jobs` → `backend/src/routes/jobs.ts`
- `/api/v1/xp` → `backend/src/routes/xp.ts`
- `/api/v1/exams` → `backend/src/routes/exam-mode.ts`
- `/api/v1/housing` → `backend/src/routes/housing.ts`
- `/api/v1/daily-challenge` → `backend/src/routes/daily-challenge.ts`
- `/api/v1/voice-notes` → `backend/src/routes/voiceNotes.ts`
- `/api/v1/ai` → `backend/src/routes/ai.ts`
- `/api/v1/forum` → `backend/src/routes/forum.ts`
- `/api/v1/academic-structure` → `backend/src/routes/academicStructure.ts`
- `/api/v1/*` (entitlements) → `backend/src/routes/entitlements.ts`

Notes:
- Uploads: `GET /uploads/*` est servi par Express et protégé par `authenticate`.
- Faculties public: `GET /api/v1/faculties` est défini directement dans `app.ts`.

## Service B — Service secondaire (Fastify)

**Code**: `services/fastify-api/`  
**Base**: `/api/v1`  
**Rôle**: service dédié “Correction IA d’exercices” + export PDF (in-memory).

Endpoints (définis dans `services/fastify-api/src/routes/*`):

- `GET  /api/v1/health`
- `POST /api/v1/ai/exercise-corrections/documents/text`
- `POST /api/v1/ai/exercise-corrections/documents`
- `GET  /api/v1/ai/exercise-corrections/documents/:documentId`
- `POST /api/v1/ai/exercise-corrections`
- `GET  /api/v1/ai/exercise-corrections/:correctionId`
- `POST /api/v1/ai/exercise-corrections/:correctionId/simplify`
- `POST /api/v1/ai/exercise-corrections/:correctionId/similar-exercise`
- `GET  /api/v1/ai/exercise-corrections/:correctionId/export.pdf`

## Règles côté clients (pour éviter de pointer le mauvais service)

### Mobile (Expo)

- Base URL: `EXPO_PUBLIC_API_BASE`
- Les features “Correction IA d’exercices” fonctionneront **uniquement** si `EXPO_PUBLIC_API_BASE` pointe vers le service qui possède les endpoints correspondants.

### Admin web (Vite)

- Base URL: `VITE_API_BASE` (ou fallback codé)
- Proxy dev: `admin/vite.config.ts` proxifie `/api` vers une cible.

## Politique “no break”

- Ne pas déplacer/renommer des routes existantes sans compatibilité ascendante.
- Si un endpoint est implémenté dans un service, éviter de le “ré-implémenter” dans l’autre: documenter + router proprement.

