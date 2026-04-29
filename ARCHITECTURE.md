# Studara / Tawjeeh — Architecture

This workspace contains multiple JavaScript/TypeScript applications.

## Projects

### `mobile/` (Mobile app)

- **Type**: Expo / React Native (TypeScript)
- **Entry**: `mobile/index.ts` (via Expo) and `mobile/App.tsx`
- **App code**: `mobile/src/`
- **Key libraries**: React Navigation, React Query, AsyncStorage

Common directories:
- `src/screens/`: screen-level UI
- `src/navigation/`: navigators and routing
- `src/ui/`: reusable UI primitives (design system)
- `src/hooks/`: reusable hooks
- `src/utils/`: helpers (API client, storage, etc.)
- `src/types/`: shared TS types for the app

### `admin/` (Admin dashboard)

- **Type**: Vite + React (TypeScript)
- **Run**: `npm run dev` inside `admin`

### `backend/` (Backend API)

- **Type**: Node.js + Express + TypeScript
- **Entry**: `backend/src/index.ts`
- **Build output**: `backend/dist/`
- **Run**: `npm run dev` inside `backend`

### `services/fastify-api/` (Secondary backend / service)

- **Type**: Node.js + Fastify + TypeScript (ESM)
- **Entry**: `services/fastify-api/src/server.ts`
- **Run**: `npm run dev` inside `services/fastify-api`

## Key architecture risks (and safe mitigations)

### 1) Two backends (Express + Fastify)

**Risk**: duplicated auth/validation/types and silent divergence over time.

**Safe mitigations** (no behavior change):
- Document ownership: which backend serves which endpoints/features.
- Centralize shared DTO/types in a dedicated package or folder later (planned change).

### 2) Secrets and operational credentials

**Rule**: secrets must not live in tracked files.

**Safe mitigations**:
- Keep `.env.example` templates only.
- Keep operational notes in private storage (password manager / private doc).

