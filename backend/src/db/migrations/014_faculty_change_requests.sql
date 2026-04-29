-- Migration 014: Faculty / university / year change requests
-- Users cannot self-update faculty, university, or year.
-- They submit a request; admin approves/rejects it.

CREATE TABLE IF NOT EXISTS faculty_change_requests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_faculty   TEXT,
  new_university TEXT,
  new_year      SMALLINT,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fcr_user_id ON faculty_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_fcr_status  ON faculty_change_requests(status);
