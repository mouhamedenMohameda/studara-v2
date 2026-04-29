-- Migration 005: Housing listings (user-submitted, admin-moderated)

CREATE TABLE IF NOT EXISTS housing_listings (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  title_ar       TEXT,
  type           TEXT        NOT NULL CHECK (type IN ('studio','chambre','appartement','colocation')),
  price          INTEGER     NOT NULL CHECK (price > 0),
  area           TEXT,
  description    TEXT,
  description_ar TEXT,
  phone          TEXT,
  whatsapp       TEXT,
  furnished      BOOLEAN     NOT NULL DEFAULT FALSE,
  features       TEXT[]      NOT NULL DEFAULT '{}',
  status         TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','rejected')),
  reject_reason  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_housing_status  ON housing_listings(status);
CREATE INDEX IF NOT EXISTS idx_housing_user    ON housing_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_housing_created ON housing_listings(created_at DESC);
