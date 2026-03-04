# Lendly Backend — Phase 4: Listings, Search & Availability

## What was added

| File | Purpose |
|------|---------|
| `migrations/006_listing_search_indexes.sql` | New listing columns + search indexes |
| `validators/listingValidators.js` | Validation chains for all listing routes |
| `middleware/authorizeListing.js` | Write-access guard (owner or store manager) |
| `utils/priceUtils.js` | `calculateRentalPrice()` — tiered discount logic |
| `controllers/listingController.js` | All listing + availability business logic |
| `routes/listings.js` | Listing route definitions |

Updated files: `routes/stores.js`, `routes/users.js`, `server.js`

---

## Migration 006 — what changed

### New listing columns

| Column | Type | Purpose |
|--------|------|---------|
| `price_per_week` | `NUMERIC(10,2)` | Optional weekly discount rate |
| `price_per_month` | `NUMERIC(10,2)` | Optional monthly discount rate |
| `is_deliverable` | `BOOLEAN DEFAULT FALSE` | Whether the item can be delivered |
| `delivery_radius_miles` | `NUMERIC(6,1)` | Delivery radius when `is_deliverable = true` |
| `weight_lbs` | `NUMERIC(8,2)` | Item weight (shipping/logistics) |
| `dimensions_inches` | `JSONB` | `{ length, width, height }` |

`group_name` — made nullable (was NOT NULL in Phase 1, now deprecated in favour of `category`).

### New indexes

| Index | Type | Purpose |
|-------|------|---------|
| `idx_listings_category` | btree | Category filter |
| `idx_listings_is_deliverable` | btree | Deliverable filter |
| `idx_listings_city` | btree | City filter |
| `idx_listings_price_per_day` | btree | Price range sort/filter |
| `idx_listings_attributes` | GIN | JSONB attribute search |
| `idx_listings_fts` | GIN | Full-text search on title + description |

Already existed from migration 001: `idx_listings_status`, `idx_listings_store_id`, `idx_listings_owner_user_id`.

---

## Running migration 006

```bash
cd backend
npm run migrate
```

Expected:
```
[migrate] 1 pending migration(s):
  ▶  006_listing_search_indexes.sql … ✓
[migrate] All migrations applied successfully.
```

---

## Endpoint reference and curl examples

> Replace `<TOKEN>` with the access token from `POST /api/auth/login`.
> Replace UUID placeholders with real values.

### Create a listing

```bash
curl -s -X POST http://localhost:3000/api/listings \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sony A7 IV Mirrorless Camera",
    "description": "Excellent condition, full-frame mirrorless. Includes battery grip.",
    "category": "photography",
    "price_per_day": 85,
    "price_per_week": 500,
    "price_per_month": 1800,
    "deposit_amount": 500,
    "is_deliverable": true,
    "delivery_radius_miles": 25,
    "weight_lbs": 1.5,
    "dimensions_inches": { "length": 5, "width": 4, "height": 3 },
    "image_urls": ["https://example.com/img/a7iv.jpg"],
    "attributes": { "brand": "Sony", "model": "A7 IV", "mount": "E-mount" },
    "status": "active"
  }' | jq
# Save the listing id from the response
```

### Get a listing

```bash
curl -s http://localhost:3000/api/listings/<LISTING_UUID> | jq
```

### Update a listing

```bash
curl -s -X PUT http://localhost:3000/api/listings/<LISTING_UUID> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"price_per_day": 90, "status": "active"}' | jq
```

### Delete a listing (soft)

```bash
curl -s -X DELETE http://localhost:3000/api/listings/<LISTING_UUID> \
  -H "Authorization: Bearer <TOKEN>" | jq
```

---

### Search and browse

#### Basic search

```bash
# All active listings
curl -s "http://localhost:3000/api/listings" | jq

# Full-text search
curl -s "http://localhost:3000/api/listings?q=sony+mirrorless" | jq

# Filter by category
curl -s "http://localhost:3000/api/listings?category=photography" | jq

# Filter by city + price range
curl -s "http://localhost:3000/api/listings?city=San+Francisco&min_price=20&max_price=100" | jq

# Deliverable items only, sorted by price ascending
curl -s "http://localhost:3000/api/listings?deliverable=true&sort=price_asc" | jq
```

#### Availability date filter (exclude booked listings)

```bash
# Only listings available for the full range June 1–7
curl -s "http://localhost:3000/api/listings?available_from=2025-06-01&available_to=2025-06-07" | jq
```

#### Combined filters with pagination

```bash
curl -s "http://localhost:3000/api/listings?category=audio&city=Austin&min_price=30&max_price=150&deliverable=true&sort=newest&page=1&limit=10" | jq
```

#### Category counts

```bash
curl -s http://localhost:3000/api/listings/categories | jq
```

---

### Store and user listing aggregation

```bash
# All active listings for a store
curl -s "http://localhost:3000/api/stores/<STORE_UUID>/listings" | jq

# Store member sees draft/paused too
curl -s "http://localhost:3000/api/stores/<STORE_UUID>/listings?status=draft" \
  -H "Authorization: Bearer <TOKEN>" | jq

# All active listings for a user
curl -s "http://localhost:3000/api/users/<USER_UUID>/listings" | jq

# Owner sees their own draft listings
curl -s "http://localhost:3000/api/users/<OWN_USER_UUID>/listings" \
  -H "Authorization: Bearer <TOKEN>" | jq
```

---

## Availability blocking walkthrough

```bash
# Step 1 — View current availability for the next 90 days
curl -s "http://localhost:3000/api/listings/<LISTING_UUID>/availability" | jq

# Or specify a custom window
curl -s "http://localhost:3000/api/listings/<LISTING_UUID>/availability?from=2025-07-01&to=2025-09-30" | jq

# Step 2 — Block dates (owner only; reason must be 'blocked' or 'maintenance')
curl -s -X POST "http://localhost:3000/api/listings/<LISTING_UUID>/availability/block" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "start": "2025-07-10",
    "end": "2025-07-15",
    "reason": "maintenance"
  }' | jq
# Save the availability id from the response

# Step 3 — View availability again to confirm the block appears
curl -s "http://localhost:3000/api/listings/<LISTING_UUID>/availability" | jq

# Step 4 — Remove the block
curl -s -X DELETE \
  "http://localhost:3000/api/listings/<LISTING_UUID>/availability/<AVAILABILITY_UUID>" \
  -H "Authorization: Bearer <TOKEN>" | jq

# Note: blocks with reason='rented' are system-generated and cannot be
# removed here — cancel the rental instead.
```

---

## Price calculation examples

The `calculateRentalPrice` utility (exported from `utils/priceUtils.js`) is used
internally. Here's how the logic works:

### Example 1 — Daily only (no discounts set)
```
listing: price_per_day = $50
duration: 5 days
→ 5 × $50 = $250
breakdown: "5 days"
```

### Example 2 — Weekly discount
```
listing: price_per_day = $50, price_per_week = $300
duration: 10 days
→ 1 week ($300) + 3 days ($150) = $450
breakdown: "1 week + 3 days"
```

### Example 3 — Monthly + weekly + daily (from spec)
```
listing: price_per_day = $50, price_per_week = $300, price_per_month = $1000
duration: 45 days
→ 1 month ($1000) + 2 weeks ($600) + 1 day ($50) = $1650
breakdown: "1 month + 2 weeks + 1 day"
```

### Example 4 — Monthly rate only (no weekly set)
```
listing: price_per_day = $50, price_per_month = $1000
duration: 35 days
→ 1 month ($1000) + 5 days ($250) = $1250
breakdown: "1 month + 5 days"
```

The utility will be used in Phase 5 (Rental Booking) to compute
`total_charged` before creating a rental record.

---

## Design decisions

### `group_name` column
The Phase 1 schema included a `group_name` column alongside `category`. In Phase 4,
`category` is the canonical field (using `user_interest` enum values). `group_name`
was made nullable and is not exposed in the API. It may be removed in a future
cleanup migration once confirmed no legacy data relies on it.

### DB column name mapping (API ↔ DB)

| API field | DB column |
|-----------|-----------|
| `image_urls` | `images` (TEXT[]) |
| `deposit_amount` | `security_deposit` |

### Image storage
Images are stored as a plain `TEXT[]` array of URLs. The client submits URLs
directly. S3 upload integration (presigned URLs, CDN delivery) is deferred to
Phase 9 — until then, any valid https:// URL is accepted.

### Draft/paused visibility
A listing in `draft` or `paused` status returns 404 to all callers who are not
the owner or a store member. This prevents information leakage about unfinished
listings without adding a separate "forbidden" signal.

### Full-text search
Uses PostgreSQL's built-in `to_tsvector` / `plainto_tsquery` with a GIN index
on `title || ' ' || description`. `plainto_tsquery` is chosen over `websearch_to_tsquery`
for broader Node 18 / PG 16 compatibility and because it handles plain search terms
(no need to teach users query syntax).

### Availability overlap query
The NOT-EXISTS pattern `NOT (end_date < $from OR start_date > $to)` is a standard
interval overlap check. It correctly identifies any block that touches the requested
date range from any direction.

### `rating` sort order
Currently falls back to `newest` since aggregate ratings come from the reviews table
(Phase 5). The placeholder is in place so the API contract is stable.

### Price discount validation
`price_per_week` must be `< price_per_day × 7` and `price_per_month` must be
`< price_per_day × 30`. This prevents accidentally setting a "discount" that costs
more than the daily rate. The validator only enforces this when both values are
present in the same request body — partial updates where only the discount rates
change (not price_per_day) are allowed without re-validating the cross-field rule.
