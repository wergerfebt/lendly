'use strict';

const { query: db } = require('../db/index');

// ── Slug helper ───────────────────────────────────────────────────

async function generateUniqueSlug(name) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  let slug    = base;
  let attempt = 0;

  while (true) {
    const { rows } = await db('SELECT id FROM stores WHERE slug = $1', [slug]);
    if (rows.length === 0) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

// ── API → DB field mapping ────────────────────────────────────────
// The stores table uses generic column names; we expose descriptive
// API names and map them here for both reads and writes.

const UPDATABLE_API_TO_DB = {
  name:             'name',
  description:      'description',
  icon_url:         'logo_url',
  contact_email:    'contact_email',
  contact_phone:    'phone',
  location_address: 'address_line1',
  location_city:    'city',
  location_state:   'state',
  location_lat:     'latitude',
  location_lng:     'longitude',
  store_hours:      'store_hours',
  is_active:        'is_active',
};

function formatStore(row) {
  return {
    id:               row.id,
    name:             row.name,
    description:      row.description       || null,
    icon_url:         row.logo_url          || null,
    contact_email:    row.contact_email     || null,
    contact_phone:    row.phone             || null,
    location_address: row.address_line1     || null,
    location_city:    row.city              || null,
    location_state:   row.state             || null,
    location_lat:     row.latitude  ? parseFloat(row.latitude)  : null,
    location_lng:     row.longitude ? parseFloat(row.longitude) : null,
    store_hours:      row.store_hours       || {},
    is_active:        row.is_active,
    created_at:       row.created_at,
    updated_at:       row.updated_at,
  };
}

// ── POST /api/stores ──────────────────────────────────────────────

async function createStore(req, res) {
  const {
    name, description, icon_url, contact_email, contact_phone,
    location_address, location_city, location_state,
    location_lat, location_lng, store_hours,
  } = req.body;

  try {
    const slug = await generateUniqueSlug(name);

    const { rows } = await db(
      `INSERT INTO stores
         (name, slug, description, logo_url, contact_email, phone,
          address_line1, city, state, latitude, longitude, store_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        name,
        slug,
        description      || null,
        icon_url         || null,
        contact_email    || null,
        contact_phone    || null,
        location_address || null,
        location_city    || null,
        location_state   || null,
        location_lat     || null,
        location_lng     || null,
        store_hours      ? JSON.stringify(store_hours) : '{}',
      ]
    );

    const store = rows[0];

    // Automatically make the creator the owner
    await db(
      'INSERT INTO store_users (store_id, user_id, role) VALUES ($1, $2, $3)',
      [store.id, req.user.id, 'owner']
    );

    return res.status(201).json({ store: formatStore(store), your_role: 'owner' });
  } catch (err) {
    console.error('[createStore]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── GET /api/stores/:id ───────────────────────────────────────────

async function getStore(req, res) {
  try {
    const { rows: storeRows } = await db(
      'SELECT * FROM stores WHERE id = $1',
      [req.params.id]
    );

    if (storeRows.length === 0) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    const store = storeRows[0];

    const [staffResult, countResult] = await Promise.all([
      db(
        `SELECT su.user_id, u.display_name AS full_name, u.avatar_url AS profile_icon_url,
                su.role, su.joined_at AS created_at
         FROM store_users su
         JOIN users u ON su.user_id = u.id
         WHERE su.store_id = $1
         ORDER BY CASE su.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
                  su.joined_at`,
        [store.id]
      ),
      db(
        `SELECT COUNT(*) AS count
         FROM listings
         WHERE store_id = $1 AND status = 'active'`,
        [store.id]
      ),
    ]);

    return res.json({
      ...formatStore(store),
      active_listing_count: parseInt(countResult.rows[0].count, 10),
      staff: staffResult.rows,
    });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found.' });
    console.error('[getStore]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── PUT /api/stores/:id ───────────────────────────────────────────
// authorizeStore('manager') already ran — req.storeRole is set.

async function updateStore(req, res) {
  try {
    const updates = {};
    for (const [apiKey, dbCol] of Object.entries(UPDATABLE_API_TO_DB)) {
      if (Object.prototype.hasOwnProperty.call(req.body, apiKey)) {
        updates[dbCol] = apiKey === 'store_hours'
          ? JSON.stringify(req.body[apiKey])
          : req.body[apiKey];
      }
    }

    if (Object.keys(updates).length === 0) {
      const { rows } = await db('SELECT * FROM stores WHERE id = $1', [req.params.id]);
      return res.json(formatStore(rows[0]));
    }

    const keys       = Object.keys(updates);
    const values     = Object.values(updates);
    const setClauses = keys.map((col, i) => `${col} = $${i + 2}`).join(', ');

    const { rows } = await db(
      `UPDATE stores SET ${setClauses}, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );

    return res.json(formatStore(rows[0]));
  } catch (err) {
    console.error('[updateStore]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── DELETE /api/stores/:id (soft) ─────────────────────────────────
// authorizeStore('owner') already ran.

async function deactivateStore(req, res) {
  try {
    await db(
      'UPDATE stores SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );
    return res.json({ message: 'Store deactivated successfully.' });
  } catch (err) {
    console.error('[deactivateStore]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── GET /api/stores/:id/staff ─────────────────────────────────────
// authorizeStore('staff') already ran.

async function getStoreStaff(req, res) {
  try {
    const { rows } = await db(
      `SELECT su.user_id, u.display_name AS full_name, u.avatar_url AS profile_icon_url,
              su.role, su.joined_at AS created_at
       FROM store_users su
       JOIN users u ON su.user_id = u.id
       WHERE su.store_id = $1
       ORDER BY CASE su.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
                su.joined_at`,
      [req.params.id]
    );
    return res.json({ staff: rows });
  } catch (err) {
    console.error('[getStoreStaff]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── POST /api/stores/:id/staff ────────────────────────────────────
// authorizeStore('manager') already ran — req.storeRole is set.

async function addStoreStaff(req, res) {
  const { user_id, role } = req.body;
  const storeId           = req.params.id;
  const requestorRole     = req.storeRole;

  // Managers can only add 'staff'; only owners can add 'manager'
  if (role === 'manager' && requestorRole !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions.' });
  }
  if (role === 'owner') {
    return res.status(403).json({
      error: 'Cannot assign the owner role through this endpoint.',
    });
  }
  if (!['manager', 'staff'].includes(role)) {
    return res.status(400).json({
      error: 'Validation failed',
      fields: { role: 'Must be "manager" or "staff"' },
    });
  }

  try {
    // Verify target user exists
    const { rows: userRows } = await db(
      'SELECT id, display_name, avatar_url FROM users WHERE id = $1',
      [user_id]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    // Check not already a member
    const { rows: existing } = await db(
      'SELECT id FROM store_users WHERE store_id = $1 AND user_id = $2',
      [storeId, user_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'User is already a member of this store.' });
    }

    await db(
      'INSERT INTO store_users (store_id, user_id, role) VALUES ($1, $2, $3)',
      [storeId, user_id, role]
    );

    return res.status(201).json({
      message: 'Staff member added.',
      staff_member: {
        user_id,
        full_name:        userRows[0].display_name,
        profile_icon_url: userRows[0].avatar_url || null,
        role,
      },
    });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found.' });
    console.error('[addStoreStaff]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── PUT /api/stores/:id/staff/:userId ─────────────────────────────
// authorizeStore('owner') already ran.

async function updateStoreStaff(req, res) {
  const { role }        = req.body;
  const storeId         = req.params.id;
  const targetUserId    = req.params.userId;
  const requestorUserId = req.user.id;

  if (!['manager', 'staff'].includes(role)) {
    return res.status(400).json({
      error: 'Validation failed',
      fields: { role: 'Must be "manager" or "staff"' },
    });
  }

  // Owner cannot change their own role through this endpoint
  if (targetUserId === requestorUserId) {
    return res.status(400).json({
      error: 'You cannot change your own role. Transfer ownership separately.',
    });
  }

  try {
    const { rows } = await db(
      'SELECT id, role FROM store_users WHERE store_id = $1 AND user_id = $2',
      [storeId, targetUserId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    // Cannot change an owner's role through this endpoint (ownership transfer is out of scope)
    if (rows[0].role === 'owner') {
      return res.status(403).json({
        error: 'Cannot change role of another owner. Ownership transfer is not supported through this endpoint.',
      });
    }

    await db(
      'UPDATE store_users SET role = $1 WHERE store_id = $2 AND user_id = $3',
      [role, storeId, targetUserId]
    );

    return res.json({ message: 'Role updated.', user_id: targetUserId, new_role: role });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found.' });
    console.error('[updateStoreStaff]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── DELETE /api/stores/:id/staff/:userId ──────────────────────────
// authenticate only — authorization logic is handled here because
// self-removal is allowed regardless of role, which can't be cleanly
// expressed with a single authorizeStore minimum level.

async function removeStoreStaff(req, res) {
  const storeId         = req.params.id;
  const targetUserId    = req.params.userId;
  const requestorUserId = req.user.id;
  const isSelfRemoval   = targetUserId === requestorUserId;

  try {
    // Fetch requestor's membership
    const { rows: requestorRows } = await db(
      'SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2',
      [storeId, requestorUserId]
    );

    if (requestorRows.length === 0) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    const requestorRole = requestorRows[0].role;

    // Fetch target's membership
    const { rows: targetRows } = await db(
      'SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2',
      [storeId, targetUserId]
    );

    if (targetRows.length === 0) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    const targetRole = targetRows[0].role;

    // Self-removal: allowed for any role, but sole owner cannot leave
    if (isSelfRemoval) {
      if (targetRole === 'owner') {
        const { rows: ownerCount } = await db(
          `SELECT COUNT(*) AS count FROM store_users
           WHERE store_id = $1 AND role = 'owner'`,
          [storeId]
        );
        if (parseInt(ownerCount[0].count, 10) <= 1) {
          return res.status(400).json({
            error: 'Cannot leave store — you are the only owner. Transfer ownership or deactivate the store first.',
          });
        }
      }
    } else {
      // Removing someone else — check permissions
      const ROLE_RANK = { staff: 1, manager: 2, owner: 3 };

      if (requestorRole === 'staff') {
        return res.status(403).json({ error: 'Insufficient permissions.' });
      }

      if (requestorRole === 'manager') {
        // Managers can only remove staff
        if (ROLE_RANK[targetRole] >= ROLE_RANK['manager']) {
          return res.status(403).json({ error: 'Insufficient permissions.' });
        }
      }

      // Owners cannot remove other owners through this endpoint
      if (requestorRole === 'owner' && targetRole === 'owner') {
        return res.status(403).json({
          error: 'Cannot remove another owner. Ownership transfer is not supported through this endpoint.',
        });
      }
    }

    await db(
      'DELETE FROM store_users WHERE store_id = $1 AND user_id = $2',
      [storeId, targetUserId]
    );

    return res.json({ message: 'Staff member removed.' });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found.' });
    console.error('[removeStoreStaff]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

module.exports = {
  createStore,
  getStore,
  updateStore,
  deactivateStore,
  getStoreStaff,
  addStoreStaff,
  updateStoreStaff,
  removeStoreStaff,
};
