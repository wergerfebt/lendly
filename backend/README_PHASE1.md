# Lendly Backend — Phase 1: Project Scaffolding & Database Schema

## Stack

| Layer      | Technology                      |
|------------|---------------------------------|
| Runtime    | Node.js (≥ 18)                  |
| Database   | PostgreSQL 16 (via Docker)      |
| DB client  | node-postgres (`pg`)            |
| Migrations | Custom runner (`scripts/migrate.js`) |
| Config     | dotenv                          |

---

## Directory layout

```
backend/
├── db/
│   └── index.js            ← pg Pool, query() helper, getClient()
├── migrations/
│   └── 001_initial_schema.sql
├── scripts/
│   └── migrate.js          ← migration runner
├── .env                    ← local dev secrets (gitignored)
├── .env.example            ← template to copy
├── .gitignore
├── docker-compose.yml      ← Postgres 16 service
└── package.json
```

---

## First-time setup

### 1 — Copy and fill in the environment file

```bash
cd backend
cp .env.example .env
# Open .env and confirm the values look right for local dev.
# Defaults work out of the box with Docker Compose.
```

### 2 — Install Node dependencies

```bash
npm install
```

### 3 — Start Postgres

```bash
npm run db:start
# Equivalent: docker compose up -d
# Data is persisted to the named volume: lendly_postgres_data
```

Wait a moment, then confirm it's healthy:

```bash
docker ps
# STATUS column should show: (healthy)
```

### 4 — Run migrations

```bash
npm run migrate
```

Expected output:

```
[migrate] 1 pending migration(s):

  ▶  001_initial_schema.sql … ✓

[migrate] All migrations applied successfully.
```

### 5 — Verify the schema

Open a psql shell:

```bash
npm run db:psql
```

Then run:

```sql
-- List all tables
\dt

-- Check columns on a specific table
\d listings

-- Confirm migrations log
SELECT * FROM schema_migrations;

-- Quick smoke test
SELECT id, email, created_at FROM users LIMIT 5;
```

Expected `\dt` output (8 application tables + tracking table):

```
 Schema |          Name          | Type  |  Owner
--------+------------------------+-------+---------
 public | cart_items             | table | lendly
 public | listing_availability   | table | lendly
 public | listings               | table | lendly
 public | rentals                | table | lendly
 public | reviews                | table | lendly
 public | schema_migrations      | table | lendly
 public | store_users            | table | lendly
 public | stores                 | table | lendly
 public | users                  | table | lendly
```

---

## npm scripts reference

| Script           | Description                                          |
|------------------|------------------------------------------------------|
| `npm run migrate`   | Apply all pending SQL migrations                  |
| `npm run db:start`  | `docker compose up -d` — start Postgres           |
| `npm run db:stop`   | `docker compose down` — stop Postgres             |
| `npm run db:reset`  | Stop + remove volume, then restart (wipes data!)  |
| `npm run db:psql`   | Open interactive psql shell in the container      |
| `npm run db:verify` | Print tables and schema_migrations log            |

---

## Schema overview

### ENUMs

| Type                 | Values                                                  |
|----------------------|---------------------------------------------------------|
| `user_interest`      | Home, Construction, Automotive, Photography, Audio, Commercial AV, Party & Event |
| `store_user_role`    | owner, admin, member                                    |
| `listing_status`     | draft, active, paused, deleted                          |
| `availability_reason`| rented, maintenance, blocked                            |
| `rental_status`      | pending, confirmed, active, completed, cancelled        |
| `delivery_method`    | same-day, next-day, pickup                              |
| `review_type`        | renter_to_owner, owner_to_renter                        |

### Tables

| Table                  | Purpose                                                   |
|------------------------|-----------------------------------------------------------|
| `users`                | Registered accounts (renters and/or owners)               |
| `stores`               | Optional multi-user storefronts                           |
| `store_users`          | Many-to-many: users ↔ stores with roles                   |
| `listings`             | Equipment items available to rent                         |
| `listing_availability` | Blocked date ranges (rented / maintenance / owner-blocked)|
| `rentals`              | Confirmed booking records with pricing snapshot           |
| `reviews`              | Bi-directional post-rental reviews (owner ↔ renter)      |
| `cart_items`           | Saved (pre-checkout) rental intents per user              |

### Key design decisions

- **UUID primary keys** — `gen_random_uuid()` (built-in since PG 13, no extension required)
- **`updated_at` trigger** — `set_updated_at()` function applied to users, stores, listings, rentals
- **Pricing snapshot in rentals** — `price_per_day`, `subtotal`, `total_charged` are copied at booking time so historical records are stable
- **`total_days` is a generated column** — computed from `end_date - start_date`, always consistent
- **JSONB for `attributes`** — allows category-specific metadata (e.g. lens mount, wattage) without schema changes
- **Back-fill FK** — `listing_availability.rental_id` references `rentals` via a deferred `ALTER TABLE` after the rentals table is created
- **One review per direction per rental** — enforced by `UNIQUE (rental_id, reviewer_id, review_type)`

---

## Stopping / resetting

```bash
# Stop Postgres (keeps data)
npm run db:stop

# Wipe everything and start fresh (DESTRUCTIVE)
npm run db:reset
npm run migrate
```
