/* ═══════════════════════════════════════════════════════════════════
   002_auth_user_columns.sql
   Add email-verification columns to the users table.

   NOTE: The existing `id_verified` column tracks government ID
   verification (a separate trust feature). These new columns handle
   email-address verification during registration.
   ═══════════════════════════════════════════════════════════════════ */

ALTER TABLE users
  ADD COLUMN email_verified            BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN email_verification_token  TEXT;
