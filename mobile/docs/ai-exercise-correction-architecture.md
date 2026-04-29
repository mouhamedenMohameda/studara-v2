# Correction IA d’exercices — architecture (API v1)

## Objectif produit

Permettre à l’étudiant de fournir un énoncé (photo/scan/PDF/texte) et obtenir une correction **détaillée, pédagogique, fiable**, avec garde-fous (pas d’invention, signalement flou/incomplet, confiance faible).

## Workflow (mobile → API)

1. **Import**
   - Photo/scan/PDF → upload (multipart) → `documentId` + extraction asynchrone.
   - Texte → création document direct `TEXT_READY`.
2. **Options**
   - Choix matière (obligatoire)
   - Réponse étudiant (optionnel)
3. **Génération**
   - L’API crée un job, exécute OCR/vision si besoin, puis raisonnement + vérifications.
4. **Résultat**
   - Polling `GET` jusqu’à `COMPLETED`/`FAILED`.
   - Actions: **simplifier** et **exercice similaire**.
   - Export PDF.

## Endpoints (proposés)

### Documents (énoncé)

- **POST** `/ai/exercise-corrections/documents`
  - Auth: Bearer
  - Body: `multipart/form-data` avec `file`
  - Response: `{ documentId, status }`

- **POST** `/ai/exercise-corrections/documents/text`
  - Auth: Bearer
  - JSON: `{ statementText: string }`
  - Response: `{ documentId, status: "TEXT_READY" }`

- **GET** `/ai/exercise-corrections/documents/:documentId`
  - Auth: Bearer
  - Response: `{ status, errorMessage? }`

### Correction (job)

- **POST** `/ai/exercise-corrections`
  - Auth: Bearer
  - JSON:
    - `documentId: string`
    - `subject: "mathematiques" | ...`
    - `studentAnswer?: string`
    - `outputLanguage?: "fr" | "ar" | "en" | "fr_ar"`
  - Response: `{ correctionId }`

- **GET** `/ai/exercise-corrections/:correctionId`
  - Auth: Bearer
  - Response:
    - `status: "PENDING"|"RUNNING"|"COMPLETED"|"FAILED"`
    - `result?: ExerciseCorrectionResult`
    - `warnings?: string[]`
    - `errorMessage?: string`

- **POST** `/ai/exercise-corrections/:correctionId/simplify`
  - Auth: Bearer
  - Response: `{ result }` (même format, plus simple)

- **POST** `/ai/exercise-corrections/:correctionId/similar-exercise`
  - Auth: Bearer
  - Response: `{ similar_exercise: string }`

- **GET** `/ai/exercise-corrections/:correctionId/export.pdf`
  - Auth: Bearer
  - Content-Type: `application/pdf`

## Schéma de données (Postgres)

### Table `ai_exercise_documents`

- `id` (uuid, pk)
- `user_id` (uuid, index)
- `source_type` (`file` | `text`)
- `original_filename` (text, nullable)
- `mime_type` (text, nullable)
- `storage_path` (text, nullable) — fichier uploadé (local/S3)
- `status` (`UPLOADED` | `TEXT_EXTRACTING` | `TEXT_READY` | `FAILED`)
- `statement_text` (text, nullable) — texte final nettoyé
- `ocr_provider` (text, nullable)
- `ocr_confidence` (float, nullable)
- `warnings` (jsonb, default `[]`)
- `error_message` (text, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### Table `ai_exercise_corrections`

- `id` (uuid, pk)
- `user_id` (uuid, index)
- `document_id` (uuid, fk -> ai_exercise_documents.id)
- `subject` (text)
- `student_answer` (text, nullable)
- `output_language` (text, default `fr`)
- `status` (`PENDING` | `RUNNING` | `COMPLETED` | `FAILED`)
- `model_route` (jsonb) — { vision, reasoning, simpleTasks }
- `confidence` (float, nullable) — 0..1
- `result` (jsonb, nullable) — réponse structurée
- `warnings` (jsonb, default `[]`)
- `error_message` (text, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

## Contrats de sortie (JSON)

### `ExerciseCorrectionResult` (structure recommandée)

- `statement: string` (énoncé utilisé)
- `confidence?: number` (0..1)
- `correction_step_by_step: string`
- `method_explanation: string`
- `final_answer: string`
- `common_errors: string[]`
- `method_summary: string`
- `similar_exercise: string`
- `student_answer_feedback?: { errors: { excerpt, why_wrong, fix }[]; corrected_solution: string }`
- `latex?: { enabled: boolean; blocks?: { id, latex, displayMode? }[] }`
- `medical_disclaimer?: string`

## Pipeline backend (recommandé)

### 1) Ingestion + extraction texte

- Si **PDF**:
  - tenter `pdf-parse` (texte réel)
  - sinon fallback OCR page->image (si pipeline existant)
- Si **image/scan**:
  - OCR classique (Tesseract / Google Vision / Azure) **ou**
  - vision multimodal (Gemini Flash / GPT-4o Vision / Claude Vision)
- Sortie: `statement_text` + `ocr_confidence` + `warnings` (ex: “photo floue”, “zone coupée”, “parties manquantes”)

### 2) Nettoyage énoncé (anti-invention)

- Normaliser espaces, conserver symboles, unités.
- Détecter trous: variables non définies, valeurs manquantes, schéma/figure absent.
- Si incomplet: générer `warnings` + abaisser `confidence`.

### 3) Raisonnement (LLM) + format structuré

Rendre **obligatoire** un format JSON strict (schema) + interdiction d’inventer des données absentes.

### 4) Vérification calcul (quand possible)

Pour `mathematiques/physique/chimie/finance/comptabilite`:
- extraire les équations/étapes clés (LLM → “checklist”)
- vérifier via:
  - **SymPy** (serveur python interne) quand forme symbolique possible
  - ou “numerical spot-check” (échantillons) si impossible
- Si mismatch: ajouter warning + demander à l’LLM de corriger

### 5) Confiance + avertissements

Construire `confidence` à partir de:
- confiance OCR/vision
- complétude énoncé
- succès vérification SymPy
- contradictions détectées

Si `confidence < 0.65`:
- afficher un avertissement utilisateur (“Confiance faible”)
- recommander “reprendre photo plus nette / recadrer / fournir valeurs manquantes”

### 6) Spécifique Médecine

Toujours inclure:
- `medical_disclaimer`: “usage pédagogique, pas un avis médical…”

## Prompting interne (résumé)

### System / policy (toutes matières)

- Tu **n’inventes jamais** une donnée absente.
- Si l’énoncé est ambigu/flou/incomplet, tu le dis explicitement et tu listes ce qui manque.
- Tu fournis une correction **étape par étape** et un **résultat final**.
- Tu mentionnes **erreurs fréquentes** + un **résumé à retenir** + un **exercice similaire**.
- Si l’étudiant a donné sa réponse: tu identifies les erreurs et expliques pourquoi.

### Sortie JSON (exemple)

Le modèle doit retourner uniquement un JSON valide conforme au schéma `ExerciseCorrectionResult`.

