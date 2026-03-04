'use strict';

const { query: db } = require('../db/index');

// ── Field mapping: API ↔ DB ───────────────────────────────────────
// The users table uses PostgreSQL column names that differ from the
// API field names. We map here rather than aliasing every query.

const API_TO_DB = {
  full_name:        'display_name',
  location_city:    'city',
  location_state:   'state',
  location_lat:     'latitude',
  location_lng:     'longitude',
  profile_icon_url: 'avatar_url',
  interests:        'interests',
};

// Fields that clients must NOT be able to set via PUT /me.
// We strip these silently rather than returning a 400 so that
// API consumers aren't broken if they accidentally send extra fields
// (e.g. mirroring the GET response back as a PUT body).
const PROTECTED_FIELDS = new Set([
  'id', 'email', 'password', 'password_hash',
  'trust_rating', 'is_verified', 'email_verified',
  'email_verification_token', 'id_verified',
  'created_at', 'updated_at',
]);

// ── Shared query helpers ──────────────────────────────────────────

async function fetchUserById(id) {
  const { rows } = await db(
    `SELECT id, email, display_name, avatar_url, email_verified,
            city, state, latitude, longitude, interests, created_at
     FROM users
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function fetchUserStores(userId) {
  const { rows } = await db(
    `SELECT su.store_id, s.name AS store_name, s.logo_url AS store_icon_url, su.role
     FROM store_users su
     JOIN stores s ON su.store_id = s.id
     WHERE su.user_id = $1 AND s.is_active = TRUE
     ORDER BY su.joined_at`,
    [userId]
  );
  return rows;
}

function formatUser(row, stores = [], isOwn = false) {
  const base = {
    id:               row.id,
    full_name:        row.display_name,
    profile_icon_url: row.avatar_url || null,
    is_verified:      row.email_verified,
    trust_rating:     null,   // computed from reviews — Phase 5
    rating_count:     0,      // computed from reviews — Phase 5
    location_city:    row.city  || null,
    location_state:   row.state || null,
    interests:        row.interests || [],
    created_at:       row.created_at,
    stores,
  };

  if (isOwn) {
    // Only the authenticated user sees their own email and precise location
    return {
      ...base,
      email:        row.email,
      location_lat: row.latitude  ? parseFloat(row.latitude)  : null,
      location_lng: row.longitude ? parseFloat(row.longitude) : null,
    };
  }

  return base;
}

// ── GET /api/users/me ─────────────────────────────────────────────

async function getMe(req, res) {
  try {
    const user = await fetchUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Resource not found.' });

    const stores = await fetchUserStores(req.user.id);
    return res.json(formatUser(user, stores, true));
  } catch (err) {
    console.error('[getMe]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── PUT /api/users/me ─────────────────────────────────────────────

async function updateMe(req, res) {
  try {
    // 1. Strip protected fields silently
    const body = { ...req.body };
    for (const key of PROTECTED_FIELDS) delete body[key];

    // 2. Map API field names to DB column names, skipping unknown fields
    const updates = {};
    for (const [apiKey, dbCol] of Object.entries(API_TO_DB)) {
      if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
        updates[dbCol] = body[apiKey];
      }
    }

    // 3. If nothing to update, just return current profile
    if (Object.keys(updates).length === 0) {
      const user   = await fetchUserById(req.user.id);
      const stores = await fetchUserStores(req.user.id);
      return res.json(formatUser(user, stores, true));
    }

    // 4. Build parameterised SET clause
    const keys   = Object.keys(updates);
    const values = Object.values(updates);
    const setClauses = keys.map((col, i) => `${col} = $${i + 2}`).join(', ');

    const { rows } = await db(
      `UPDATE users
       SET ${setClauses}, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, display_name, avatar_url, email_verified,
                 city, state, latitude, longitude, interests, created_at`,
      [req.user.id, ...values]
    );

    const stores = await fetchUserStores(req.user.id);
    return res.json(formatUser(rows[0], stores, true));
  } catch (err) {
    console.error('[updateMe]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── GET /api/users/:id ────────────────────────────────────────────

async function getUserById(req, res) {
  try {
    const user = await fetchUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Resource not found.' });

    const stores = await fetchUserStores(req.params.id);
    return res.json(formatUser(user, stores, false));
  } catch (err) {
    // Catch invalid UUID format from PostgreSQL
    if (err.code === '22P02') {
      return res.status(404).json({ error: 'Resource not found.' });
    }
    console.error('[getUserById]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── GET /api/users/me/rentals ─────────────────────────────────────

const VALID_STATUSES = new Set([
  'pending', 'confirmed', 'active', 'completed', 'cancelled',
]);

async function getMyRentals(req, res) {
  try {
    const role   = req.query.role   || 'renter';
    const page   = Math.max(1,   parseInt(req.query.page  || '1',  10));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const status = req.query.status || null;

    if (!['renter', 'owner'].includes(role)) {
      return res.status(400).json({
        error: 'Validation failed',
        fields: { role: 'Must be "renter" or "owner"' },
      });
    }

    if (status && !VALID_STATUSES.has(status)) {
      return res.status(400).json({
        error: 'Validation failed',
        fields: { status: `Must be one of: ${[...VALID_STATUSES].join(', ')}` },
      });
    }

    const userCol       = role === 'renter' ? 'r.renter_user_id' : 'r.owner_user_id';
    const otherUserCol  = role === 'renter' ? 'r.owner_user_id'  : 'r.renter_user_id';

    const whereStatus = status ? `AND r.status = $2::rental_status` : '';
    const statusParam = status ? [status] : [];

    const baseParams = [req.user.id, ...statusParam];
    const paginationOffset = baseParams.length + 1;
    const paginationLimit  = paginationOffset + 1;

    const rentalsSql = `
      SELECT
        r.id, r.listing_id, r.start_date, r.end_date,
        r.price_per_day, r.total_days, r.subtotal, r.total_charged,
        r.delivery_method, r.status, r.created_at,
        l.title   AS listing_title,
        l.images[1] AS listing_image,
        ou.id             AS other_party_id,
        ou.display_name   AS other_party_name,
        ou.avatar_url     AS other_party_icon
      FROM rentals r
      JOIN listings l ON r.listing_id = l.id
      JOIN users    ou ON ${otherUserCol} = ou.id
      WHERE ${userCol} = $1
        ${whereStatus}
      ORDER BY r.created_at DESC
      LIMIT $${paginationLimit} OFFSET $${paginationOffset}
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM rentals r
      WHERE ${userCol} = $1
        ${whereStatus}
    `;

    const [rentalsResult, countResult] = await Promise.all([
      db(rentalsSql,  [...baseParams, limit, offset]),
      db(countSql,     baseParams),
    ]);

    const total      = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);

    return res.json({
      rentals: rentalsResult.rows,
      pagination: { page, limit, total_count: total, total_pages: totalPages },
    });
  } catch (err) {
    console.error('[getMyRentals]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

module.exports = { getMe, updateMe, getUserById, getMyRentals };
