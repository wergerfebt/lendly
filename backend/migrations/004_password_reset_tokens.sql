/* ═══════════════════════════════════════════════════════════════════
   004_password_reset_tokens.sql
   Stores bcrypt-hashed password-reset tokens.

   One row per pending reset request (old rows replaced on re-request).
   All rows for a user are deleted on successful reset.
   ═══════════════════════════════════════════════════════════════════ */

CREATE TABLE password_reset_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
