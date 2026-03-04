/* ═══════════════════════════════════════════════════════════════════
   006_listing_search_indexes.sql
   Phase 4: add missing listing columns + search/filter indexes.

   Existing indexes (from 001): status, store_id, owner_user_id
   Existing columns confirmed present: city, state, latitude, longitude
   ═══════════════════════════════════════════════════════════════════ */

-- ── 1. New listing columns ────────────────────────────────────────

ALTER TABLE listings
  -- Tiered pricing (optional discounts for longer bookings)
  ADD COLUMN price_per_week    NUMERIC(10, 2) CHECK (price_per_week > 0),
  ADD COLUMN price_per_month   NUMERIC(10, 2) CHECK (price_per_month > 0),

  -- Delivery
  ADD COLUMN is_deliverable         BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN delivery_radius_miles  NUMERIC(6, 1) CHECK (delivery_radius_miles > 0),

  -- Physical attributes
  ADD COLUMN weight_lbs         NUMERIC(8, 2) CHECK (weight_lbs >= 0),
  ADD COLUMN dimensions_inches  JSONB;

-- group_name was a Phase 1 placeholder (display label for category).
-- category now serves this role. Make it optional so inserts don't
-- need to supply it.
ALTER TABLE listings ALTER COLUMN group_name DROP NOT NULL;
ALTER TABLE listings ALTER COLUMN group_name SET DEFAULT NULL;

-- ── 2. New search / filter indexes ───────────────────────────────
-- (idx_listings_status, idx_listings_store_id, idx_listings_owner_user_id
--  already created in migration 001 — do not recreate.)

CREATE INDEX idx_listings_category
  ON listings(category);

CREATE INDEX idx_listings_is_deliverable
  ON listings(is_deliverable);

CREATE INDEX idx_listings_city
  ON listings(city);

CREATE INDEX idx_listings_price_per_day
  ON listings(price_per_day);

-- GIN index for arbitrary JSONB attribute filtering
CREATE INDEX idx_listings_attributes
  ON listings USING GIN (attributes);

-- Full-text search across title + description
CREATE INDEX idx_listings_fts
  ON listings USING GIN (
    to_tsvector('english', title || ' ' || COALESCE(description, ''))
  );
