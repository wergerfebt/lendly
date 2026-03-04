/* ═══════════════════════════════════════════════════════════════════
   005_phase3_schema_updates.sql
   Schema changes required for Phase 3 (user profiles + store management).

   Changes:
     1. Replace store_user_role ENUM (owner/admin/member → owner/manager/staff)
     2. Replace user_interest ENUM (capitalised display labels → lowercase API values)
     3. Add contact_email and store_hours columns to stores
   ═══════════════════════════════════════════════════════════════════ */

-- ── 1. store_user_role: owner / manager / staff ───────────────────
--   (was: owner, admin, member — Phase 1 placeholder values)
--   No data exists in store_users yet, so the USING cast is a no-op.

ALTER TABLE store_users ALTER COLUMN role DROP DEFAULT;

CREATE TYPE store_user_role_new AS ENUM ('owner', 'manager', 'staff');

ALTER TABLE store_users
  ALTER COLUMN role TYPE store_user_role_new
  USING role::text::store_user_role_new;

DROP TYPE store_user_role;
ALTER TYPE store_user_role_new RENAME TO store_user_role;

ALTER TABLE store_users ALTER COLUMN role SET DEFAULT 'staff';

-- ── 2. user_interest: lowercase API-friendly values ───────────────
--   (was: 'Home', 'Construction', 'Automotive', 'Photography',
--         'Audio', 'Commercial AV', 'Party & Event')
--   No interest data has been stored via the API yet (all NULL), so we
--   drop and recreate the column — no data migration needed.

ALTER TABLE users DROP COLUMN interests;
DROP TYPE user_interest;

CREATE TYPE user_interest AS ENUM (
  'photography',
  'videography',
  'audio',
  'instruments',
  'automotive',
  'construction',
  'outdoor',
  'other'
);

ALTER TABLE users ADD COLUMN interests user_interest[];

-- ── 3. stores: add contact_email and store_hours ──────────────────

ALTER TABLE stores
  ADD COLUMN contact_email TEXT,
  ADD COLUMN store_hours   JSONB NOT NULL DEFAULT '{}';
