-- Add AI "Résumé intelligent de cours" (upload + summaries + history)
-- Idempotent migration.

DO $$ BEGIN
  CREATE TYPE ai_course_doc_status AS ENUM ('UPLOADED','TEXT_EXTRACTING','TEXT_READY','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_course_summary_status AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_course_summary_level AS ENUM ('simple','normal','advanced','very_synthetic','exam_tomorrow');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_course_output_language AS ENUM ('fr','ar','en','fr_ar');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ai_course_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name  TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     BIGINT NOT NULL,
  storage_path   TEXT NOT NULL,
  status         ai_course_doc_status NOT NULL DEFAULT 'UPLOADED',
  extracted_text TEXT,
  extracted_at   TIMESTAMPTZ,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_course_documents_user ON ai_course_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_course_documents_status ON ai_course_documents(status);

CREATE TABLE IF NOT EXISTS ai_course_summaries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES ai_course_documents(id) ON DELETE CASCADE,
  status          ai_course_summary_status NOT NULL DEFAULT 'PENDING',
  level           ai_course_summary_level NOT NULL DEFAULT 'normal',
  output_language ai_course_output_language NOT NULL DEFAULT 'fr',
  model           TEXT,
  prompt_version  TEXT NOT NULL DEFAULT 'v1',
  input_char_count  INT NOT NULL DEFAULT 0,
  output_char_count INT NOT NULL DEFAULT 0,
  result_json     JSONB,
  warnings_json   JSONB,
  error_message   TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_course_summaries_user ON ai_course_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_course_summaries_doc ON ai_course_summaries(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_course_summaries_status ON ai_course_summaries(status);

