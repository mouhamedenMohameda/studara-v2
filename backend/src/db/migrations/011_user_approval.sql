-- Migration 011: Manual account approval flow
-- Users must be approved by admin before they can log in.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;

-- All existing users are auto-approved (so they aren't locked out)
UPDATE users SET is_approved = TRUE WHERE is_approved = FALSE;

-- Admin accounts are always auto-approved at registration
-- (handled in application code for role = 'admin')
