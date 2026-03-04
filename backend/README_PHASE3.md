# Lendly Backend — Phase 3: User Profiles & Store Management

## What was added

| File | Purpose |
|------|---------|
| `migrations/005_phase3_schema_updates.sql` | Updates enums + adds store columns |
| `validators/userValidators.js`  | express-validator chains for user routes |
| `validators/storeValidators.js` | express-validator chains for store routes |
| `middleware/authorizeStore.js`  | Store-role authorization factory |
| `controllers/userController.js` | User profile + rental history logic |
| `controllers/storeController.js`| Store CRUD + staff management logic |
| `routes/users.js`               | User route definitions |
| `routes/stores.js`              | Store route definitions |

### Schema changes (migration 005)

| Change | Before (Phase 1) | After (Phase 3) |
|--------|-----------------|-----------------|
| `store_user_role` ENUM | `owner, admin, member` | `owner, manager, staff` |
| `user_interest` ENUM | `'Photography', 'Audio'`, etc. (display labels) | `'photography', 'audio'`, etc. (lowercase API values) |
| `stores.contact_email` | didn't exist | `TEXT` column added |
| `stores.store_hours` | didn't exist | `JSONB NOT NULL DEFAULT '{}'` added |

### Field name mapping (API ↔ DB)

Some API field names differ from the underlying DB column names. These are
mapped transparently in the controllers — callers only ever see the API names.

| API field | DB column (users) |
|-----------|------------------|
| `full_name` | `display_name` |
| `profile_icon_url` | `avatar_url` |
| `location_city` | `city` |
| `location_state` | `state` |
| `location_lat` | `latitude` |
| `location_lng` | `longitude` |

| API field | DB column (stores) |
|-----------|-------------------|
| `icon_url` | `logo_url` |
| `contact_phone` | `phone` |
| `location_address` | `address_line1` |

---

## Running migration 005

```bash
cd backend
npm run migrate
```

Expected output:

```
[migrate] 1 pending migration(s):

  ▶  005_phase3_schema_updates.sql … ✓

[migrate] All migrations applied successfully.
```

---

## Authorization matrix

| Action | Owner | Manager | Staff | Unauthenticated |
|--------|-------|---------|-------|-----------------|
| View store (public) | ✓ | ✓ | ✓ | ✓ |
| Create store | ✓ (becomes owner) | — | — | ✗ |
| Edit store details | ✓ | ✓ | ✗ | ✗ |
| Deactivate store | ✓ | ✗ | ✗ | ✗ |
| View staff list | ✓ | ✓ | ✓ | ✗ |
| Add staff member | ✓ | ✓\* | ✗ | ✗ |
| Add manager | ✓ | ✗ | ✗ | ✗ |
| Change staff role | ✓ | ✗ | ✗ | ✗ |
| Remove staff | ✓ | ✓\* | ✗ | ✗ |
| Remove manager | ✓ | ✗ | ✗ | ✗ |
| Remove self | ✓† | ✓ | ✓ | ✗ |

\* Managers can only add/remove users with the `staff` role — not other managers.
† An owner cannot leave a store if they are the sole owner. They must either
transfer ownership (out of scope, see Design Decisions) or deactivate the store first.

---

## Endpoint reference and curl examples

> All examples assume the server is running on `http://localhost:3000`.
> Replace `<TOKEN>` with the `accessToken` from `POST /api/auth/login`.
> Replace UUIDs with real values from your database.

### User endpoints

#### GET /api/users/me — own full profile

```bash
curl -s http://localhost:3000/api/users/me \
  -H "Authorization: Bearer <TOKEN>" | jq
```

#### PUT /api/users/me — update own profile (partial)

```bash
curl -s -X PUT http://localhost:3000/api/users/me \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Jane Smith",
    "location_city": "Austin",
    "location_state": "TX",
    "interests": ["photography", "audio"]
  }' | jq
```

#### GET /api/users/:id — public profile

```bash
curl -s http://localhost:3000/api/users/<USER_UUID> | jq
```

#### GET /api/users/me/rentals — rental history

```bash
# As renter, page 1
curl -s "http://localhost:3000/api/users/me/rentals?role=renter&page=1&limit=10" \
  -H "Authorization: Bearer <TOKEN>" | jq

# As owner, filter by status
curl -s "http://localhost:3000/api/users/me/rentals?role=owner&status=completed" \
  -H "Authorization: Bearer <TOKEN>" | jq
```

---

### Store endpoints

#### POST /api/stores — create a store

```bash
curl -s -X POST http://localhost:3000/api/stores \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Gear House SF",
    "description": "Professional camera and audio gear for rent.",
    "contact_email": "hello@gearhouse.com",
    "location_city": "San Francisco",
    "location_state": "CA",
    "store_hours": {
      "mon": "9am-6pm",
      "tue": "9am-6pm",
      "wed": "9am-6pm",
      "thu": "9am-6pm",
      "fri": "9am-6pm",
      "sat": "10am-4pm",
      "sun": null
    }
  }' | jq
# Save the store id from the response
```

#### GET /api/stores/:id — public store profile

```bash
curl -s http://localhost:3000/api/stores/<STORE_UUID> | jq
```

#### PUT /api/stores/:id — update store (owner or manager)

```bash
curl -s -X PUT http://localhost:3000/api/stores/<STORE_UUID> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"description": "Updated description."}' | jq
```

#### DELETE /api/stores/:id — deactivate store (owner only)

```bash
curl -s -X DELETE http://localhost:3000/api/stores/<STORE_UUID> \
  -H "Authorization: Bearer <TOKEN>" | jq
```

> **Note:** Deactivation sets `is_active = false` and hides the store from
> public responses. It does NOT cancel active rentals for this store's listings.
> Existing rental records are unaffected and remain in the database.

---

### Store staff endpoints

#### GET /api/stores/:id/staff — list staff (any store member)

```bash
curl -s http://localhost:3000/api/stores/<STORE_UUID>/staff \
  -H "Authorization: Bearer <TOKEN>" | jq
```

#### POST /api/stores/:id/staff — add a staff member

```bash
curl -s -X POST http://localhost:3000/api/stores/<STORE_UUID>/staff \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "<TARGET_USER_UUID>",
    "role": "staff"
  }' | jq

# Only the store owner can assign the 'manager' role:
# -d '{"user_id": "<UUID>", "role": "manager"}'
```

#### PUT /api/stores/:id/staff/:userId — change a staff member's role (owner only)

```bash
curl -s -X PUT http://localhost:3000/api/stores/<STORE_UUID>/staff/<TARGET_USER_UUID> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"role": "manager"}' | jq
```

#### DELETE /api/stores/:id/staff/:userId — remove a staff member

```bash
# Owner removing a staff member
curl -s -X DELETE http://localhost:3000/api/stores/<STORE_UUID>/staff/<TARGET_USER_UUID> \
  -H "Authorization: Bearer <TOKEN>" | jq

# A user leaving their own store
curl -s -X DELETE http://localhost:3000/api/stores/<STORE_UUID>/staff/<OWN_USER_UUID> \
  -H "Authorization: Bearer <TOKEN>" | jq
```

---

## End-to-end store staff flow

This walks through the full store staff lifecycle from scratch:

```bash
# 1. Register and verify two users (User A = future owner, User B = future staff)
#    Follow the Phase 2 README for register + verify-email steps.

# 2. Log in as User A and save the token
TOKEN_A=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"usera@example.com","password":"SecurePass1"}' \
  | jq -r '.accessToken')

# 3. Get User B's ID
USER_B_ID=$(curl -s http://localhost:3000/api/users/<USER_B_UUID> | jq -r '.id')

# 4. User A creates a store (automatically becomes owner)
STORE_ID=$(curl -s -X POST http://localhost:3000/api/stores \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Rental Shop"}' \
  | jq -r '.store.id')

# 5. User A adds User B as staff
curl -s -X POST http://localhost:3000/api/stores/$STORE_ID/staff \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\": \"$USER_B_ID\", \"role\": \"staff\"}" | jq

# 6. User A promotes User B to manager
curl -s -X PUT http://localhost:3000/api/stores/$STORE_ID/staff/$USER_B_ID \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"role": "manager"}' | jq

# 7. Log in as User B, verify they can edit the store
TOKEN_B=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"userb@example.com","password":"SecurePass1"}' \
  | jq -r '.accessToken')

curl -s -X PUT http://localhost:3000/api/stores/$STORE_ID \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"description": "Manager updated this."}' | jq

# 8. User B leaves the store (self-removal)
USER_B_UUID="<USER_B_UUID>"
curl -s -X DELETE http://localhost:3000/api/stores/$STORE_ID/staff/$USER_B_UUID \
  -H "Authorization: Bearer $TOKEN_B" | jq
```

---

## Design decisions

### Protected fields on PUT /api/users/me
Fields like `email`, `password`, `trust_rating`, and `is_verified` are silently
stripped rather than returning a 400. This means clients can mirror the GET
response body directly back as a PUT body without needing to sanitise it.
A 400 would require extra client-side work for no security gain — these fields
are simply ignored.

### Ownership transfer
Transferring the `owner` role to another user is explicitly out of scope for
Phase 3. It requires a confirmation flow (to prevent accidental transfers) that
will be built in a dedicated settings phase. Currently the only way to "give
up" ownership is to deactivate the store.

### Store soft-delete
`DELETE /api/stores/:id` sets `is_active = false` rather than hard-deleting
the row. This preserves all associated rental history and listings. Active
rentals for this store's listings are **not** automatically cancelled —
operators must handle existing bookings manually before deactivating.

### trust_rating and rating_count
Both fields are returned as `null` / `0` in Phase 3. They will be computed
from the `reviews` table as aggregates in Phase 5 (Reviews).

### Slug auto-generation
Stores are given a URL-safe slug auto-generated from the store name
(e.g. "Gear House SF" → "gear-house-sf"). If that slug is already taken,
a numeric suffix is appended ("gear-house-sf-1", "gear-house-sf-2", etc.).
The slug is not exposed as an editable API field to prevent breaking external
links once a store is published.
