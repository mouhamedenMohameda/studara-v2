-- Add AI "Correction d'exercices" (upload/text + corrections + export PDF)
-- Idempotent migration.

DO $$ BEGIN
  CREATE TYPE ai_exercise_doc_status AS ENUM ('UPLOADED','TEXT_EXTRACTING','TEXT_READY','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_exercise_correction_status AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_exercise_subject AS ENUM (
    'mathematiques','physique','chimie','economie','comptabilite','finance','informatique','biologie','medecine'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_exercise_output_language AS ENUM ('fr','ar','en','fr_ar');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ai_exercise_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type     TEXT NOT NULL DEFAULT 'file', -- 'file' | 'text'
  original_name   TEXT,
  mime_type       TEXT,
  size_bytes      BIGINT,
  storage_path    TEXT,
  status          ai_exercise_doc_status NOT NULL DEFAULT 'UPLOADED',
  statement_text  TEXT,
  ocr_provider    TEXT,
  ocr_confidence  NUMERIC(4,3),
  warnings_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_at    TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_exercise_documents_user   ON ai_exercise_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_exercise_documents_status ON ai_exercise_documents(status);

CREATE TABLE IF NOT EXISTS ai_exercise_corrections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES ai_exercise_documents(id) ON DELETE CASCADE,
  subject         ai_exercise_subject NOT NULL DEFAULT 'mathematiques',
  student_answer  TEXT,
  output_language ai_exercise_output_language NOT NULL DEFAULT 'fr',
  status          ai_exercise_correction_status NOT NULL DEFAULT 'PENDING',
  model           TEXT,
  confidence      NUMERIC(4,3),
  result_json     JSONB,
  warnings_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message   TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_exercise_corrections_user   ON ai_exercise_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_exercise_corrections_doc    ON ai_exercise_corrections(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_exercise_corrections_status ON ai_exercise_corrections(status);

