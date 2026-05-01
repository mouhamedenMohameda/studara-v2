-- ─── Opportunities (Scholarships / Study abroad / etc.) ───────────────────────

DO $$ BEGIN
  CREATE TYPE opportunity_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE opportunity_type AS ENUM ('scholarship', 'exchange', 'internship', 'fellowship', 'grant', 'summer_school', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS opportunities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            VARCHAR(600) NOT NULL,
  opportunity_type opportunity_type NOT NULL DEFAULT 'other',

  -- Provider / host
  provider_name    VARCHAR(255),
  host_country     VARCHAR(120),
  host_city        VARCHAR(120),
  host_institution VARCHAR(255),

  -- Content
  description      TEXT,
  eligibility      TEXT,
  benefits         TEXT,

  -- Links
  apply_url        TEXT,
  official_url     TEXT,
  source_name      VARCHAR(255),
  source_url       TEXT,

  -- Timeline
  deadline         DATE,

  -- Workflow
  status           opportunity_status NOT NULL DEFAULT 'pending',
  reject_reason    TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,

  extracted_by     UUID REFERENCES users(id),
  extracted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  moderated_by     UUID REFERENCES users(id),
  moderated_at     TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deduplication: apply_url is often the canonical key (can be NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_opportunities_apply_url
  ON opportunities (apply_url)
  WHERE apply_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_status_created
  ON opportunities(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunities_active_deadline
  ON opportunities(is_active, deadline);

CREATE INDEX IF NOT EXISTS idx_opportunities_search ON opportunities USING GIN(
  to_tsvector('simple',
    title || ' ' ||
    COALESCE(provider_name, '') || ' ' ||
    COALESCE(host_country, '')  || ' ' ||
    COALESCE(description, '')
  )
);

DO $$ BEGIN
  CREATE TRIGGER trg_opportunities_updated
  BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

