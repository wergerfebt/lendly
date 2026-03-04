/* ═══════════════════════════════════════════════════════════════════
   001_initial_schema.sql
   Lendly — full initial database schema.

   Tables
     users, stores, store_users, listings, listing_availability,
     rentals, reviews, cart_items

   Run via:  npm run migrate   (scripts/migrate.js)
   ═══════════════════════════════════════════════════════════════════ */

-- ── ENUMs ─────────────────────────────────────────────────────────

CREATE TYPE user_interest AS ENUM (
  'Home',
  'Construction',
  'Automotive',
  'Photography',
  'Audio',
  'Commercial AV',
  'Party & Event'
);

CREATE TYPE store_user_role AS ENUM (
  'owner',
  'admin',
  'member'
);

CREATE TYPE listing_status AS ENUM (
  'draft',
  'active',
  'paused',
  'deleted'
);

CREATE TYPE availability_reason AS ENUM (
  'rented',
  'maintenance',
  'blocked'
);

CREATE TYPE rental_status AS ENUM (
  'pending',
  'confirmed',
  'active',
  'completed',
  'cancelled'
);

CREATE TYPE delivery_method AS ENUM (
  'same-day',
  'next-day',
  'pickup'
);

CREATE TYPE review_type AS ENUM (
  'renter_to_owner',
  'owner_to_renter'
);

-- ── Helper: updated_at trigger ─────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── USERS ─────────────────────────────────────────────────────────

CREATE TABLE users (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT            NOT NULL UNIQUE,
  password_hash   TEXT            NOT NULL,
  display_name    TEXT            NOT NULL,
  avatar_url      TEXT,
  phone           TEXT,
  bio             TEXT,
  interests       user_interest[],
  -- Location (denormalised for distance queries)
  city            TEXT,
  state           TEXT,
  country         TEXT            NOT NULL DEFAULT 'US',
  latitude        NUMERIC(9, 6),
  longitude       NUMERIC(9, 6),
  -- Trust signals
  id_verified     BOOLEAN         NOT NULL DEFAULT FALSE,
  stripe_customer_id TEXT,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── STORES ────────────────────────────────────────────────────────

CREATE TABLE stores (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT            NOT NULL,
  slug            TEXT            NOT NULL UNIQUE,
  description     TEXT,
  logo_url        TEXT,
  banner_url      TEXT,
  -- Location
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  state           TEXT,
  postal_code     TEXT,
  country         TEXT            NOT NULL DEFAULT 'US',
  latitude        NUMERIC(9, 6),
  longitude       NUMERIC(9, 6),
  -- Contact
  website_url     TEXT,
  phone           TEXT,
  -- Financials
  stripe_account_id TEXT,
  -- Metadata
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_stores_updated_at
  BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── STORE_USERS (many-to-many: users ↔ stores) ────────────────────

CREATE TABLE store_users (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID            NOT NULL REFERENCES stores(id)  ON DELETE CASCADE,
  user_id         UUID            NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role            store_user_role NOT NULL DEFAULT 'member',
  joined_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, user_id)
);

CREATE INDEX idx_store_users_store_id ON store_users(store_id);
CREATE INDEX idx_store_users_user_id  ON store_users(user_id);

-- ── LISTINGS ──────────────────────────────────────────────────────

CREATE TABLE listings (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID            NOT NULL REFERENCES users(id)   ON DELETE RESTRICT,
  store_id        UUID                     REFERENCES stores(id)  ON DELETE SET NULL,
  -- Content
  title           TEXT            NOT NULL,
  description     TEXT,
  category        TEXT            NOT NULL,          -- e.g. 'Camera', 'Guitar'
  group_name      TEXT            NOT NULL,          -- maps to user_interest enum label
  -- Pricing (per day)
  price_per_day   NUMERIC(10, 2)  NOT NULL CHECK (price_per_day >= 0),
  security_deposit NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),
  -- Media
  images          TEXT[]          NOT NULL DEFAULT '{}',
  -- Location (denormalised for radius queries)
  latitude        NUMERIC(9, 6),
  longitude       NUMERIC(9, 6),
  address_line1   TEXT,
  city            TEXT,
  state           TEXT,
  country         TEXT            NOT NULL DEFAULT 'US',
  -- Logistics
  delivery_methods delivery_method[] NOT NULL DEFAULT '{}',
  -- Extra structured data
  attributes      JSONB           NOT NULL DEFAULT '{}',
  -- State
  status          listing_status  NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listings_store_id      ON listings(store_id);
CREATE INDEX idx_listings_owner_user_id ON listings(owner_user_id);
CREATE INDEX idx_listings_status        ON listings(status);

CREATE TRIGGER trg_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── LISTING_AVAILABILITY ──────────────────────────────────────────

CREATE TABLE listing_availability (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID                NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  start_date      DATE                NOT NULL,
  end_date        DATE                NOT NULL,
  reason          availability_reason NOT NULL,
  rental_id       UUID,               -- populated when reason = 'rented' (FK added after rentals table)
  note            TEXT,
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_listing_availability_listing_id
  ON listing_availability(listing_id);

-- ── RENTALS ───────────────────────────────────────────────────────

CREATE TABLE rentals (
  id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        UUID            NOT NULL REFERENCES listings(id)     ON DELETE RESTRICT,
  renter_user_id    UUID            NOT NULL REFERENCES users(id)        ON DELETE RESTRICT,
  owner_user_id     UUID            NOT NULL REFERENCES users(id)        ON DELETE RESTRICT,
  -- Dates
  start_date        DATE            NOT NULL,
  end_date          DATE            NOT NULL,
  CHECK (end_date > start_date),
  -- Pricing snapshot (captured at booking time)
  price_per_day     NUMERIC(10, 2)  NOT NULL,
  total_days        INTEGER         NOT NULL GENERATED ALWAYS AS (end_date - start_date) STORED,
  subtotal          NUMERIC(10, 2)  NOT NULL,
  security_deposit  NUMERIC(10, 2)  NOT NULL DEFAULT 0,
  platform_fee      NUMERIC(10, 2)  NOT NULL DEFAULT 0,
  total_charged     NUMERIC(10, 2)  NOT NULL,
  -- Delivery
  delivery_method   delivery_method NOT NULL,
  delivery_address  JSONB,          -- { line1, city, state, postal_code, country }
  -- Payment
  stripe_payment_intent_id TEXT,
  -- State
  status            rental_status   NOT NULL DEFAULT 'pending',
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rentals_renter_user_id ON rentals(renter_user_id);
CREATE INDEX idx_rentals_owner_user_id  ON rentals(owner_user_id);
CREATE INDEX idx_rentals_status         ON rentals(status);

CREATE TRIGGER trg_rentals_updated_at
  BEFORE UPDATE ON rentals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Back-fill the FK from listing_availability → rentals
ALTER TABLE listing_availability
  ADD CONSTRAINT fk_listing_availability_rental
  FOREIGN KEY (rental_id) REFERENCES rentals(id) ON DELETE SET NULL;

-- ── REVIEWS ───────────────────────────────────────────────────────

CREATE TABLE reviews (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id       UUID            NOT NULL REFERENCES rentals(id)  ON DELETE CASCADE,
  reviewer_id     UUID            NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  reviewee_id     UUID            NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  review_type     review_type     NOT NULL,
  rating          SMALLINT        NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body            TEXT,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  -- One review per direction per rental
  UNIQUE (rental_id, reviewer_id, review_type)
);

-- ── CART_ITEMS ────────────────────────────────────────────────────

CREATE TABLE cart_items (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID            NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  listing_id      UUID            NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  start_date      DATE            NOT NULL,
  end_date        DATE            NOT NULL,
  delivery_method delivery_method NOT NULL,
  CHECK (end_date > start_date),
  added_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cart_items_user_id ON cart_items(user_id);
