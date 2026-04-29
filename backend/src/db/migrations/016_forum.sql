-- Migration 016: Forum / Q&A par matière
-- Permet aux étudiants de poser des questions et répondre

CREATE TABLE IF NOT EXISTS forum_posts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  body          TEXT        NOT NULL,
  subject       VARCHAR(100),
  faculty       VARCHAR(50),
  upvotes       INTEGER     NOT NULL DEFAULT 0,
  replies_count INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forum_posts_faculty    ON forum_posts(faculty, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_subject    ON forum_posts(subject);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user_id    ON forum_posts(user_id);

CREATE TABLE IF NOT EXISTS forum_replies (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        UUID        NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body           TEXT        NOT NULL,
  upvotes        INTEGER     NOT NULL DEFAULT 0,
  is_best_answer BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forum_replies_post_id ON forum_replies(post_id, created_at ASC);

CREATE TABLE IF NOT EXISTS forum_votes (
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('post', 'reply')),
  target_id   UUID        NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);
