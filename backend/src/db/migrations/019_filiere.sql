-- Migration 019: Add filiere (specialty) column to users and resources
-- This enables the 3-level hierarchy: University → Faculty/Institut → Filière
-- Date: 2026-04-17

-- Users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS filiere VARCHAR(100) DEFAULT NULL;

-- Resources table
ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS filiere VARCHAR(100) DEFAULT NULL;

-- Faculty change requests: also track filiere changes
ALTER TABLE faculty_change_requests
  ADD COLUMN IF NOT EXISTS new_filiere VARCHAR(100) DEFAULT NULL;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_users_filiere     ON users(filiere);
CREATE INDEX IF NOT EXISTS idx_resources_filiere ON resources(filiere);
