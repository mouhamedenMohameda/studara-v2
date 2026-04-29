-- Résumé IA v2 : cache versionné + texte issu du PDF (prompt pédagogique FR)
ALTER TABLE resources ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS ai_summary_version SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN resources.ai_summary_version IS 'Incrémenter côté API pour invalider les résumés générés avec un ancien prompt.';
