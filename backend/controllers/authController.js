'use strict';

const { randomUUID }           = require('crypto');
const { query: db }            = require('../db/index');
const { hash, compare }        = require('../utils/hashUtils');
const { signAccessToken,
        signRefreshToken,
        verifyRefreshToken }   = require('../services/tokenService');
const { sendVerificationEmail,
        sendPasswordResetEmail } = require('../services/emailService');
const jwt                      = require('jsonwebtoken');

// ── Cookie config ─────────────────────────────────────────────────

const REFRESH_COOKIE = 'refreshToken';

function refreshCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires:  expiresAt,
  };
}

// ── Helpers ───────────────────────────────────────────────────────

/** Strip password_hash and internal fields before sending a user object. */
function safeUser(row) {
  return {
    id:              row.id,
    email:           row.email,
    full_name:       row.display_name,
    is_verified:     row.email_verified,
    profile_icon_url: row.avatar_url  || null,
    trust_rating:    null,            // populated in a future phase
    created_at:      row.created_at,
  };
}

// ── Register ──────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 */
async function register(req, res) {
  const { email, password, full_name, location_city, location_state } = req.body;

  try {
    // 1. Check for duplicate email
    const { rows: existing } = await db(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    // 2. Hash password
    const passwordHash = await hash(password);

    // 3. Generate email verification token
    const verificationToken = randomUUID();

    // 4. Insert user
    const { rows } = await db(
      `INSERT INTO users
         (email, password_hash, display_name, city, state,
          email_verified, email_verification_token)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6)
       RETURNING id, email, display_name, email_verified, created_at`,
      [email, passwordHash, full_name, location_city || null, location_state || null, verificationToken]
    );
    const user = rows[0];

    // 5. Send verification email (non-blocking — don't fail registration if email fails)
    sendVerificationEmail(email, verificationToken).catch(err => {
      console.error('[register] Failed to send verification email:', err.message);
    });

    return res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.',
      user: safeUser(user),
    });

  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
}

// ── Verify Email ──────────────────────────────────────────────────

/**
 * GET /api/auth/verify-email?token=...
 */
async function verifyEmail(req, res) {
  const { token } = req.query;

  try {
    const { rows } = await db(
      'SELECT id, email_verified FROM users WHERE email_verification_token = $1',
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Verification link is invalid or has already been used.' });
    }

    const user = rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'This email address has already been verified.' });
    }

    await db(
      'UPDATE users SET email_verified = TRUE, email_verification_token = NULL WHERE id = $1',
      [user.id]
    );

    return res.status(200).json({ message: 'Email verified successfully. You can now log in.' });

  } catch (err) {
    console.error('[verifyEmail]', err);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
}

// ── Login ─────────────────────────────────────────────────────────

const INVALID_CREDENTIALS_MSG = 'Invalid email or password.';

/**
 * POST /api/auth/login
 */
async function login(req, res) {
  const { email, password } = req.body;

  try {
    const { rows } = await db(
      `SELECT id, email, display_name, password_hash, email_verified,
              avatar_url, created_at
       FROM users WHERE email = $1`,
      [email]
    );

    // Generic message for both "not found" and "wrong password" cases
    if (rows.length === 0) {
      return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });
    }

    const user = rows[0];
    const passwordMatch = await compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });
    }

    if (!user.email_verified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.' });
    }

    // Issue tokens
    const accessToken               = signAccessToken(user);
    const { token: refreshToken,
            expiresAt: refreshExpiry } = signRefreshToken(user);

    // Store hashed refresh token
    const refreshHash = await hash(refreshToken);
    await db(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshHash, refreshExpiry]
    );

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(refreshExpiry));

    return res.status(200).json({
      accessToken,
      user: safeUser(user),
    });

  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

// ── Refresh ───────────────────────────────────────────────────────

/**
 * POST /api/auth/refresh
 */
async function refresh(req, res) {
  const incomingToken = req.cookies?.[REFRESH_COOKIE];

  if (!incomingToken) {
    return res.status(401).json({ error: 'No refresh token provided.' });
  }

  try {
    // 1. Verify JWT signature + expiry
    let payload;
    try {
      payload = verifyRefreshToken(incomingToken);
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE);
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const userId = payload.sub;

    // 2. Find a matching hashed token in the DB for this user
    const { rows } = await db(
      'SELECT id, token_hash FROM refresh_tokens WHERE user_id = $1 AND expires_at > NOW()',
      [userId]
    );

    // Compare the incoming token against every stored hash for this user
    let matchRow = null;
    for (const row of rows) {
      if (await compare(incomingToken, row.token_hash)) {
        matchRow = row;
        break;
      }
    }

    if (!matchRow) {
      // Token was rotated already or explicitly revoked — possible theft
      res.clearCookie(REFRESH_COOKIE);
      return res.status(401).json({ error: 'Refresh token not recognised. Please log in again.' });
    }

    // 3. Delete old token (rotation — one-time use)
    await db('DELETE FROM refresh_tokens WHERE id = $1', [matchRow.id]);

    // 4. Fetch user for new token payload
    const { rows: userRows } = await db(
      'SELECT id, email FROM users WHERE id = $1',
      [userId]
    );
    if (userRows.length === 0) {
      return res.status(401).json({ error: 'User not found.' });
    }
    const user = userRows[0];

    // 5. Issue new token pair
    const newAccessToken                  = signAccessToken(user);
    const { token: newRefreshToken,
            expiresAt: newRefreshExpiry } = signRefreshToken(user);

    const newRefreshHash = await hash(newRefreshToken);
    await db(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, newRefreshHash, newRefreshExpiry]
    );

    res.cookie(REFRESH_COOKIE, newRefreshToken, refreshCookieOptions(newRefreshExpiry));

    return res.status(200).json({ accessToken: newAccessToken });

  } catch (err) {
    console.error('[refresh]', err);
    return res.status(500).json({ error: 'Token refresh failed. Please log in again.' });
  }
}

// ── Logout ────────────────────────────────────────────────────────

/**
 * POST /api/auth/logout
 */
async function logout(req, res) {
  const incomingToken = req.cookies?.[REFRESH_COOKIE];

  if (incomingToken) {
    try {
      // Best-effort: verify to get userId, then scan for the matching hash
      const payload = verifyRefreshToken(incomingToken);
      const { rows } = await db(
        'SELECT id, token_hash FROM refresh_tokens WHERE user_id = $1',
        [payload.sub]
      );
      for (const row of rows) {
        if (await compare(incomingToken, row.token_hash)) {
          await db('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
          break;
        }
      }
    } catch {
      // Token already expired or invalid — still clear the cookie
    }
  }

  res.clearCookie(REFRESH_COOKIE);
  return res.status(200).json({ message: 'Logged out successfully.' });
}

// ── Forgot Password ───────────────────────────────────────────────

const FORGOT_PASSWORD_MSG = 'If an account exists with that email, a reset link has been sent.';

/**
 * POST /api/auth/forgot-password
 */
async function forgotPassword(req, res) {
  const { email } = req.body;

  // Always return the same message to prevent user enumeration
  try {
    const { rows } = await db(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (rows.length > 0) {
      const userId = rows[0].id;

      // Delete any existing reset tokens for this user before creating a new one
      await db('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

      const plainToken  = randomUUID();
      const tokenHash   = await hash(plainToken);
      const expiresAt   = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [userId, tokenHash, expiresAt]
      );

      sendPasswordResetEmail(email, plainToken).catch(err => {
        console.error('[forgotPassword] Failed to send reset email:', err.message);
      });
    }

    return res.status(200).json({ message: FORGOT_PASSWORD_MSG });

  } catch (err) {
    console.error('[forgotPassword]', err);
    // Still return the generic message — never reveal internal errors here
    return res.status(200).json({ message: FORGOT_PASSWORD_MSG });
  }
}

// ── Reset Password ────────────────────────────────────────────────

/**
 * POST /api/auth/reset-password
 */
async function resetPassword(req, res) {
  const { token, password } = req.body;

  try {
    // 1. Find all non-expired reset tokens and compare
    const { rows } = await db(
      'SELECT id, user_id, token_hash FROM password_reset_tokens WHERE expires_at > NOW()',
      []
    );

    let matchRow = null;
    for (const row of rows) {
      if (await compare(token, row.token_hash)) {
        matchRow = row;
        break;
      }
    }

    if (!matchRow) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
    }

    const userId = matchRow.user_id;

    // 2. Hash new password and update user
    const newHash = await hash(password);
    await db('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

    // 3. Delete all reset tokens for this user
    await db('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

    // 4. Invalidate all refresh tokens (all active sessions)
    await db('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    return res.status(200).json({ message: 'Password reset successful. Please log in.' });

  } catch (err) {
    console.error('[resetPassword]', err);
    return res.status(500).json({ error: 'Password reset failed. Please try again.' });
  }
}

// ── Exports ───────────────────────────────────────────────────────

module.exports = {
  register,
  verifyEmail,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
};
