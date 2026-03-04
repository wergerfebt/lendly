/* ═══════════════════════════════════════════════════════════════════
   003_refresh_tokens.sql
   Stores bcrypt-hashed refresh tokens for JWT rotation.

   One row per active session. Deleted on logout or rotation.
   All rows for a user are deleted on password reset.
   ═══════════════════════════════════════════════════════════════════ */

CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
