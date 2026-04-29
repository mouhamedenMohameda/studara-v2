# Studara — API (Correction IA d’exercices)

Service API minimal pour supporter le flow mobile:

- import image/texte
- extraction OCR via Groq Vision (si `GROQ_API_KEY`)
- génération correction via Groq
- export PDF

## Démarrer

Dans `services/fastify-api`:

```bash
npm install
PORT=3101 GROQ_API_KEY=... npm run dev
```

Puis côté app mobile, définir:

- `EXPO_PUBLIC_API_BASE=http://127.0.0.1:3101/api/v1`

## Endpoints

Voir `docs/ai-exercise-correction-architecture.md`.

## Notes importantes

- Ce service est **in-memory** (pas de Postgres) pour accélérer le dev local.
- Pour prod, implémenter les tables Postgres et le stockage fichier (S3/volume) comme décrit dans l’architecture.

