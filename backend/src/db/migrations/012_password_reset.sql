-- Migration 012: password reset requests
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_password_hash TEXT      NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prr_user_id ON password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_prr_status  ON password_reset_requests(status);
