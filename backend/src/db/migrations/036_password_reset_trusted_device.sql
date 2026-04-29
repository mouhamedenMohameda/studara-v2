-- Migration 036: password reset via "trusted device" approval + Expo push tokens
-- Adds: user_devices, password_reset_intents, password_reset_tickets

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Devices that can receive pushes for approvals
CREATE TABLE IF NOT EXISTS user_devices (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expo_push_token TEXT        NOT NULL,
  platform        TEXT        NOT NULL CHECK (platform IN ('ios','android')),
  device_label    TEXT,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, expo_push_token)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);

-- Reset intents (one per request)
DO $$ BEGIN
  CREATE TYPE password_reset_intent_status AS ENUM (
    'PENDING_APPROVAL',
    'APPROVED',
    'DENIED',
    'EXPIRED',
    'COMPLETED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS password_reset_intents (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                 password_reset_intent_status NOT NULL DEFAULT 'PENDING_APPROVAL',
  requested_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ NOT NULL,
  requested_ip           TEXT,
  requested_user_agent   TEXT,
  requested_device_label TEXT,
  approved_at            TIMESTAMPTZ,
  approved_by_device_id  UUID REFERENCES user_devices(id) ON DELETE SET NULL,
  completed_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_reset_intents_user_id ON password_reset_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_intents_status  ON password_reset_intents(status);

-- Reset tickets (single-use)
CREATE TABLE IF NOT EXISTS password_reset_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id   UUID NOT NULL REFERENCES password_reset_intents(id) ON DELETE CASCADE,
  ticket_hash TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tickets_intent_id ON password_reset_tickets(intent_id);

