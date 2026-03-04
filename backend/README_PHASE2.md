# Lendly Backend — Phase 2: Authentication

## What was added

| File | Purpose |
|------|---------|
| `migrations/002_auth_user_columns.sql` | Adds `email_verified` + `email_verification_token` to users |
| `migrations/003_refresh_tokens.sql`    | Stores bcrypt-hashed refresh tokens (one per session) |
| `migrations/004_password_reset_tokens.sql` | Stores bcrypt-hashed password-reset tokens |
| `controllers/authController.js` | All auth business logic |
| `routes/auth.js`                | Route definitions + validators + rate limiters |
| `middleware/authenticate.js`    | JWT Bearer token verification middleware |
| `middleware/validate.js`        | express-validator error-handler middleware |
| `services/tokenService.js`      | JWT sign / verify helpers |
| `services/emailService.js`      | Nodemailer wrappers; auto-uses Ethereal in development |
| `utils/hashUtils.js`            | bcrypt hash / compare helpers |
| `server.js`                     | Express entry point |

---

## Running the new migrations

Make sure Postgres is running first (`npm run db:start`), then:

```bash
cd backend
npm run migrate
```

Expected output:

```
[migrate] 3 pending migration(s):

  ▶  002_auth_user_columns.sql … ✓
  ▶  003_refresh_tokens.sql … ✓
  ▶  004_password_reset_tokens.sql … ✓

[migrate] All migrations applied successfully.
```

Verify the new tables:

```bash
npm run db:psql
```

```sql
\dt
-- Should now include: refresh_tokens, password_reset_tokens
-- users table should have email_verified column:
\d users
```

---

## Starting the server

```bash
npm start           # production
npm run dev         # development (auto-restarts on file changes, Node 18+)
```

Server starts on `http://localhost:3000` by default.

---

## Setting up Ethereal Email (local development)

No setup required. When `SMTP_USER` is empty in `.env`, the email service
automatically creates a free Ethereal test account on first send and logs
the preview URL to the console:

```
[email] Using Ethereal test account: abc123@ethereal.email
[email] Verification email preview: https://ethereal.email/message/...
```

Open that URL in a browser to inspect the full email. The Ethereal account
is ephemeral — a new one is created each time the server restarts.

To use a persistent Ethereal account:
1. Visit https://ethereal.email and click "Create Account"
2. Copy the credentials into `.env`:
   ```
   SMTP_USER=your.ethereal@ethereal.email
   SMTP_PASS=your_ethereal_password
   ```

---

## Endpoint reference and curl examples

> All examples assume the server is running on `http://localhost:3000`.

### Register

```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "password": "Secure123",
    "full_name": "Jane Smith",
    "location_city": "San Francisco",
    "location_state": "CA"
  }' | jq
```

Watch the server console for the Ethereal preview URL, then open it to
click the verification link.

---

### Verify Email

The link in the email hits this endpoint directly:

```bash
curl -s "http://localhost:3000/api/auth/verify-email?token=<UUID_FROM_EMAIL>" | jq
```

---

### Login

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "jane@example.com",
    "password": "Secure123"
  }' | jq
```

`-c cookies.txt` saves the httpOnly refresh token cookie for subsequent calls.
The response body contains the `accessToken` — save it for protected requests.

---

### Refresh Access Token

```bash
curl -s -X POST http://localhost:3000/api/auth/refresh \
  -b cookies.txt \
  -c cookies.txt | jq
```

Returns a new `accessToken`. The refresh token cookie is rotated automatically.

---

### Logout

```bash
curl -s -X POST http://localhost:3000/api/auth/logout \
  -b cookies.txt \
  -c cookies.txt | jq
```

---

### Forgot Password

```bash
curl -s -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@example.com"}' | jq
```

Always returns 200 regardless of whether the email exists. Check server
console for the Ethereal preview URL.

---

### Reset Password

```bash
curl -s -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<UUID_FROM_EMAIL>",
    "password": "NewSecure456"
  }' | jq
```

---

### Using the authenticate middleware on a protected route

```bash
curl -s http://localhost:3000/api/some-protected-route \
  -H "Authorization: Bearer <accessToken>"
```

---

## Token rotation strategy

```
LOGIN
  │
  ├─ Issues ACCESS TOKEN  (short-lived: 15 min, stored in memory/JS)
  └─ Issues REFRESH TOKEN (long-lived: 7 days, httpOnly cookie)
       │
       └─ Stored as bcrypt HASH in refresh_tokens table

REFRESH (when access token expires)
  │
  ├─ Client sends refresh token cookie
  ├─ Server verifies JWT signature
  ├─ Server scans refresh_tokens for a row whose hash matches → found
  ├─ OLD row is DELETED (one-time use — rotation)
  ├─ NEW access + refresh tokens issued
  └─ NEW refresh token hash stored; new cookie set

LOGOUT
  └─ Matching row deleted from refresh_tokens; cookie cleared

PASSWORD RESET
  └─ ALL refresh_tokens rows for the user deleted
     (forces re-login on all devices)

THEFT DETECTION
  If a rotated (already-used) refresh token is presented:
  └─ No matching hash found → 401 returned, cookie cleared
     (Attacker cannot silently extend a stolen session)
```

### Why bcrypt for token hashes?

Refresh and password-reset tokens are UUIDs (128-bit random values), which
means a leaked database alone is not sufficient to impersonate a user —
the attacker would still need to brute-force the bcrypt hash. This mirrors
the same defense-in-depth principle applied to passwords.

---

## Security checklist

- [x] `password_hash` never returned in any response
- [x] Login and forgot-password use identical responses to prevent user enumeration
- [x] Refresh tokens are single-use (rotated on every call)
- [x] Refresh tokens stored as bcrypt hashes, never plaintext
- [x] Password-reset tokens stored as bcrypt hashes, never plaintext
- [x] Refresh token delivered via `httpOnly; Secure; SameSite=Strict` cookie
- [x] Rate limiting on login (10/15 min), register (5/hr), forgot-password (5/hr)
- [x] Input validation on all POST bodies via express-validator
- [x] Password reset invalidates all active sessions
