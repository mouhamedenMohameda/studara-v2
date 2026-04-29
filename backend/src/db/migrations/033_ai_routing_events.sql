-- 033: AI routing observability (tiers only; no model names/costs)

CREATE TABLE IF NOT EXISTS ai_routing_events (
  id               BIGSERIAL PRIMARY KEY,
  ts               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code        TEXT NULL,
  route_tier       TEXT NOT NULL CHECK (route_tier IN ('standard','premium_light','premium_strong','pro','vip')),
  complexity_score NUMERIC(4,3) NOT NULL,
  words            INT NOT NULL DEFAULT 0 CHECK (words >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ai_routing_events_ts
  ON ai_routing_events (ts DESC);

CREATE INDEX IF NOT EXISTS idx_ai_routing_events_user_ts
  ON ai_routing_events (user_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_ai_routing_events_plan_ts
  ON ai_routing_events (plan_code, ts DESC);

