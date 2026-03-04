'use strict';

const { query: db }           = require('../db/index');
const { VALID_CATEGORIES }    = require('../validators/listingValidators');

// ── Field mapping: API → DB ───────────────────────────────────────

const CREATE_API_TO_DB = {
  title:                 'title',
  description:           'description',
  category:              'category',
  price_per_day:         'price_per_day',
  price_per_week:        'price_per_week',
  price_per_month:       'price_per_month',
  deposit_amount:        'security_deposit',
  weight_lbs:            'weight_lbs',
  is_deliverable:        'is_deliverable',
  delivery_radius_miles: 'delivery_radius_miles',
  attributes:            'attributes',
  status:                'status',
};

const UPDATE_API_TO_DB = {
  ...CREATE_API_TO_DB,
  // image_urls handled separately (stored as `images` array)
  // dimensions_inches handled separately (stored as JSONB)
};

// ── Shared formatters ─────────────────────────────────────────────

function formatListing(row) {
  const ppd = parseFloat(row.price_per_day);
  const ppw = row.price_per_week  ? parseFloat(row.price_per_week)  : null;
  const ppm = row.price_per_month ? parseFloat(row.price_per_month) : null;

  return {
    id:                    row.id,
    owner_user_id:         row.owner_user_id,
    store_id:              row.store_id || null,
    title:                 row.title,
    description:           row.description || null,
    category:              row.category,
    price_per_day:         ppd,
    price_per_week:        ppw,
    price_per_month:       ppm,
    effective_price_per_week:  ppw  ?? round2(ppd * 7),
    effective_price_per_month: ppm  ?? round2(ppd * 30),
    savings_per_week:      round2((ppd * 7)  - (ppw  ?? ppd * 7)),
    savings_per_month:     round2((ppd * 30) - (ppm  ?? ppd * 30)),
    deposit_amount:        parseFloat(row.security_deposit || 0),
    is_deliverable:        row.is_deliverable || false,
    delivery_radius_miles: row.delivery_radius_miles ? parseFloat(row.delivery_radius_miles) : null,
    weight_lbs:            row.weight_lbs ? parseFloat(row.weight_lbs) : null,
    dimensions_inches:     row.dimensions_inches || null,
    image_urls:            row.images || [],
    attributes:            row.attributes || {},
    city:                  row.city    || null,
    state:                 row.state   || null,
    latitude:              row.latitude  ? parseFloat(row.latitude)  : null,
    longitude:             row.longitude ? parseFloat(row.longitude) : null,
    status:                row.status,
    created_at:            row.created_at,
    updated_at:            row.updated_at,
  };
}

function round2(n) { return Math.round(n * 100) / 100; }

function ownerFragment(row) {
  return {
    id:              row.owner_id,
    full_name:       row.owner_name,
    profile_icon_url: row.owner_icon || null,
    trust_rating:    null,
    location_city:   row.owner_city  || null,
    location_state:  row.owner_state || null,
  };
}

function storeFragment(row) {
  if (!row.s_id) return null;
  return {
    id:           row.s_id,
    name:         row.s_name,
    icon_url:     row.s_icon  || null,
    location_city:  row.s_city  || null,
    location_state: row.s_state || null,
  };
}

// ── Full listing query (for GET single + search) ──────────────────

const LISTING_SELECT = `
  l.*,
  u.id             AS owner_id,
  u.display_name   AS owner_name,
  u.avatar_url     AS owner_icon,
  u.city           AS owner_city,
  u.state          AS owner_state,
  s.id             AS s_id,
  s.name           AS s_name,
  s.logo_url       AS s_icon,
  s.city           AS s_city,
  s.state          AS s_state
`;

const LISTING_JOINS = `
  JOIN  users  u ON l.owner_user_id = u.id
  LEFT  JOIN stores s ON l.store_id = s.id
`;

// ── POST /api/listings ────────────────────────────────────────────

async function createListing(req, res) {
  const {
    store_id, title, description, category,
    price_per_day, price_per_week, price_per_month,
    deposit_amount, weight_lbs, dimensions_inches,
    is_deliverable, delivery_radius_miles,
    image_urls, attributes, status,
  } = req.body;

  try {
    // If store_id provided, verify caller is a store member (any role)
    if (store_id) {
      const { rows: memberRows } = await db(
        'SELECT id FROM store_users WHERE store_id = $1 AND user_id = $2',
        [store_id, req.user.id]
      );
      if (memberRows.length === 0) {
        return res.status(403).json({ error: 'Insufficient permissions.' });
      }
    }

    const { rows } = await db(
      `INSERT INTO listings
         (owner_user_id, store_id, title, description, category,
          price_per_day, price_per_week, price_per_month,
          security_deposit, weight_lbs, dimensions_inches,
          is_deliverable, delivery_radius_miles,
          images, attributes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        req.user.id,
        store_id              || null,
        title,
        description           || null,
        category,
        price_per_day,
        price_per_week        || null,
        price_per_month       || null,
        deposit_amount        ?? 0,
        weight_lbs            || null,
        dimensions_inches     ? JSON.stringify(dimensions_inches) : null,
        is_deliverable        ?? false,
        delivery_radius_miles || null,
        image_urls            ? `{${image_urls.map(u => `"${u}"`).join(',')}}` : '{}',
        attributes            ? JSON.stringify(attributes) : '{}',
        status                || 'draft',
      ]
    );

    return res.status(201).json({ listing: formatListing(rows[0]) });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found.' });
    console.error('[createListing]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── GET /api/listings/:id ─────────────────────────────────────────

async function getListing(req, res) {
  try {
    const { rows } = await db(
      `SELECT ${LISTING_SELECT} FROM listings l ${LISTING_JOINS} WHERE l.id = $1`,
      [req.params.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Resource not found.' });

    const row = rows[0];

    if (row.status === 'deleted') return res.status(404).json({ error: 'Resource not found.' });

    // Non-public statuses — only owner or store member may view
    if (row.status === 'draft' || row.status === 'paused') {
      const callerId   = req.user?.id;
      const isOwner    = callerId === row.owner_user_id;
      let   isStoreMbr = false;

      if (!isOwner && row.store_id && callerId) {
        const { rows: m } = await db(
          'SELECT id FROM store_users WHERE store_id = $1 AND user_id = $2',
          [row.store_id, callerId]
        );
        isStoreMbr = m.length > 0;
      }

      if (!isOwner && !isStoreMbr) {
        return res.status(404).json({ error: 'Resource not found.' });
      }
    }

    // Upcoming unavailability (next 90 days)
    const { rows: avail } = await db(
      `SELECT id, start_date AS start, end_date AS end, reason
       FROM listing_availability
       WHERE listing_id = $1
         AND start_date >= CURRENT_DATE
         AND start_date <= CURRENT_DATE + INTERVAL '90 days'
       ORDER BY start_date`,
      [row.id]
    );

    return res.json({
      ...formatListing(row),
      owner:              ownerFragment(row),
      store:              storeFragment(row),
      unavailable_ranges: avail,
    });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found.' });
    console.error('[getListing]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── PUT /api/listings/:id ─────────────────────────────────────────
// authorizeListing already ran — req.listing and req.listingRole set.

async function updateListing(req, res) {
  try {
    const body = req.body;

    // Build dynamic SET clause
    const updates = {};

    for (const [apiKey, dbCol] of Object.entries(UPDATE_API_TO_DB)) {
      if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
        updates[dbCol] = body[apiKey];
      }
    }

    // image_urls → images array
    if (Object.prototype.hasOwnProperty.call(body, 'image_urls')) {
      updates['images'] = body.image_urls && body.image_urls.length > 0
        ? `{${body.image_urls.map(u => `"${u}"`).join(',')}}`
        : '{}';
    }

    // dimensions_inches → JSONB
    if (Object.prototype.hasOwnProperty.call(body, 'dimensions_inches')) {
      updates['dimensions_inches'] = body.dimensions_inches
        ? JSON.stringify(body.dimensions_inches)
        : null;
    }

    // attributes → JSONB
    if (updates['attributes']) {
      updates['attributes'] = JSON.stringify(updates['attributes']);
    }

    if (Object.keys(updates).length === 0) {
      // Nothing to update — return current state
      const { rows } = await db(
        `SELECT ${LISTING_SELECT} FROM listings l ${LISTING_JOINS} WHERE l.id = $1`,
        [req.listing.id]
      );
      return res.json({ ...formatListing(rows[0]), owner: ownerFragment(rows[0]), store: storeFragment(rows[0]) });
    }

    const keys       = Object.keys(updates);
    const values     = Object.values(updates);
    const setClauses = keys.map((col, i) => `${col} = $${i + 2}`).join(', ');

    const { rows } = await db(
      `UPDATE listings SET ${setClauses}, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.listing.id, ...values]
    );

    // Re-fetch with joins for full response
    const { rows: full } = await db(
      `SELECT ${LISTING_SELECT} FROM listings l ${LISTING_JOINS} WHERE l.id = $1`,
      [req.listing.id]
    );

    return res.json({ ...formatListing(full[0]), owner: ownerFragment(full[0]), store: storeFragment(full[0]) });
  } catch (err) {
    console.error('[updateListing]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── DELETE /api/listings/:id ──────────────────────────────────────
// authorizeListing already ran.

async function deleteListing(req, res) {
  try {
    // Check for active rentals
    const { rows: activeRentals } = await db(
      `SELECT COUNT(*) AS count FROM rentals
       WHERE listing_id = $1
         AND status IN ('pending','confirmed','active')`,
      [req.listing.id]
    );

    const activeCount = parseInt(activeRentals[0].count, 10);
    if (activeCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete listing with active rentals.',
        active_rental_count: activeCount,
      });
    }

    await db(
      "UPDATE listings SET status = 'deleted', updated_at = NOW() WHERE id = $1",
      [req.listing.id]
    );

    return res.json({ message: 'Listing deleted.' });
  } catch (err) {
    console.error('[deleteListing]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── GET /api/listings — search & browse ──────────────────────────

const ORDER_MAP = {
  price_asc:  'l.price_per_day ASC',
  price_desc: 'l.price_per_day DESC',
  newest:     'l.created_at DESC',
  rating:     'l.created_at DESC', // aggregate from reviews in Phase 5
};

async function searchListings(req, res) {
  const {
    q, category, city, state,
    min_price, max_price,
    deliverable,
    available_from, available_to,
    store_id, owner_id,
    sort = 'newest',
  } = req.query;

  const page   = Math.max(1,  parseInt(req.query.page  || '1',  10));
  const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const offset = (page - 1) * limit;

  const conditions = ["l.status = 'active'"];
  const params     = [];
  let   idx        = 1;

  if (q) {
    conditions.push(
      `to_tsvector('english', l.title || ' ' || COALESCE(l.description,'')) ` +
      `@@ plainto_tsquery('english', $${idx})`
    );
    params.push(q); idx++;
  }

  if (category) {
    conditions.push(`l.category = $${idx}`);
    params.push(category); idx++;
  }

  if (city) {
    conditions.push(`LOWER(l.city) = LOWER($${idx})`);
    params.push(city); idx++;
  }

  if (state) {
    conditions.push(`LOWER(l.state) = LOWER($${idx})`);
    params.push(state); idx++;
  }

  if (min_price !== undefined && min_price !== '') {
    conditions.push(`l.price_per_day >= $${idx}`);
    params.push(parseFloat(min_price)); idx++;
  }

  if (max_price !== undefined && max_price !== '') {
    conditions.push(`l.price_per_day <= $${idx}`);
    params.push(parseFloat(max_price)); idx++;
  }

  if (deliverable === 'true') {
    conditions.push('l.is_deliverable = TRUE');
  }

  if (store_id) {
    conditions.push(`l.store_id = $${idx}`);
    params.push(store_id); idx++;
  }

  if (owner_id) {
    conditions.push(`l.owner_user_id = $${idx}`);
    params.push(owner_id); idx++;
  }

  if (available_from && available_to) {
    conditions.push(
      `l.id NOT IN (
         SELECT listing_id FROM listing_availability
         WHERE NOT (end_date < $${idx}::date OR start_date > $${idx + 1}::date)
       )`
    );
    params.push(available_from, available_to); idx += 2;
  } else if (available_from) {
    conditions.push(
      `l.id NOT IN (
         SELECT listing_id FROM listing_availability
         WHERE end_date >= $${idx}::date
       )`
    );
    params.push(available_from); idx++;
  } else if (available_to) {
    conditions.push(
      `l.id NOT IN (
         SELECT listing_id FROM listing_availability
         WHERE start_date <= $${idx}::date
       )`
    );
    params.push(available_to); idx++;
  }

  const orderBy    = ORDER_MAP[sort] || ORDER_MAP.newest;
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  try {
    const searchParams = [...params, limit, offset];

    const [listingsResult, countResult] = await Promise.all([
      db(
        `SELECT ${LISTING_SELECT}
         FROM listings l ${LISTING_JOINS}
         ${whereClause}
         ORDER BY ${orderBy}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        searchParams
      ),
      db(
        `SELECT COUNT(*) AS total FROM listings l ${whereClause}`,
        params
      ),
    ]);

    const total      = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);

    const listings = listingsResult.rows.map(row => ({
      ...formatListing(row),
      owner: ownerFragment(row),
      store: storeFragment(row),
    }));

    return res.json({
      listings,
      pagination: { page, limit, total_count: total, total_pages: totalPages },
      filters_applied: {
        q:              q              || null,
        category:       category       || null,
        city:           city           || null,
        state:          state          || null,
        min_price:      min_price      ? parseFloat(min_price)  : null,
        max_price:      max_price      ? parseFloat(max_price)  : null,
        deliverable:    deliverable === 'true' ? true : null,
        available_from: available_from || null,
        available_to:   available_to   || null,
        sort,
      },
    });
  } catch (err) {
    console.error('[searchListings]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── GET /api/listings/categories ─────────────────────────────────

async function getCategories(req, res) {
  try {
    const { rows } = await db(
      `SELECT category, COUNT(*) AS active_listing_count
       FROM listings
       WHERE status = 'active'
       GROUP BY category
       ORDER BY COUNT(*) DESC`
    );

    // Include all valid categories, even those with 0 listings
    const countsMap = new Map(rows.map(r => [r.category, parseInt(r.active_listing_count, 10)]));
    const categories = VALID_CATEGORIES.map(cat => ({
      category:             cat,
      active_listing_count: countsMap.get(cat) || 0,
    }));

    return res.json({ categories });
  } catch (err) {
    console.error('[getCategories]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── GET /api/stores/:id/listings ──────────────────────────────────

async function getStoreListings(req, res) {
  const storeId = req.params.id;
  const page    = Math.max(1,  parseInt(req.query.page  || '1',  10));
  const limit   = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const offset  = (page - 1) * limit;

  try {
    // Verify store exists
    const { rows: storeRows } = await db(
      'SELECT id FROM stores WHERE id = $1',
      [storeId]
    );
    if (storeRows.length === 0) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    // Determine which statuses this caller may see
    let allowedStatuses = ['active'];

    if (req.user) {
      const { rows: memberRows } = await db(
        'SELECT id FROM store_users WHERE store_id = $1 AND user_id = $2',
        [storeId, req.user.id]
      );
      if (memberRows.length > 0) {
        allowedStatuses = ['active', 'paused', 'draft'];
      }
    }

    const statusParam  = req.query.status;
    const filterStatus = allowedStatuses.includes(statusParam) ? statusParam : null;

    const conditions = [`l.store_id = $1`, `l.status != 'deleted'`];
    const params     = [storeId];
    let   idx        = 2;

    if (filterStatus) {
      conditions.push(`l.status = $${idx}`);
      params.push(filterStatus); idx++;
    } else {
      // Default: only show what the caller is allowed to see
      const placeholders = allowedStatuses.map((_, i) => `$${idx + i}`).join(',');
      conditions.push(`l.status IN (${placeholders})`);
      params.push(...allowedStatuses);
      idx += allowedStatuses.length;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [listingsResult, countResult] = await Promise.all([
      db(
        `SELECT ${LISTING_SELECT} FROM listings l ${LISTING_JOINS}
         ${where} ORDER BY l.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      db(`SELECT COUNT(*) AS total FROM listings l ${where}`, params),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    return res.json({
      listings:   listingsResult.rows.map(row => ({ ...formatListing(row), owner: ownerFragment(row), store: storeFragment(row) })),
      pagination: { page, limit, total_count: total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found.' });
    console.error('[getStoreListings]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── GET /api/users/:id/listings ───────────────────────────────────

async function getUserListings(req, res) {
  const targetUserId = req.params.id;
  const page         = Math.max(1,  parseInt(req.query.page  || '1',  10));
  const limit        = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const offset       = (page - 1) * limit;

  const isOwn = req.user?.id === targetUserId;

  // Status filter
  const allowedStatuses = isOwn ? ['active', 'draft', 'paused'] : ['active'];
  const conditions      = [
    `l.owner_user_id = $1`,
    `l.status IN (${allowedStatuses.map((_, i) => `$${i + 2}`).join(',')})`,
  ];
  const params = [targetUserId, ...allowedStatuses];
  const idx    = params.length + 1;

  try {
    const [listingsResult, countResult] = await Promise.all([
      db(
        `SELECT ${LISTING_SELECT} FROM listings l ${LISTING_JOINS}
         WHERE ${conditions.join(' AND ')}
         ORDER BY l.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      db(
        `SELECT COUNT(*) AS total FROM listings l WHERE ${conditions.join(' AND ')}`,
        params
      ),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    return res.json({
      listings:   listingsResult.rows.map(row => ({ ...formatListing(row), owner: ownerFragment(row), store: storeFragment(row) })),
      pagination: { page, limit, total_count: total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found.' });
    console.error('[getUserListings]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── GET /api/listings/:id/availability ───────────────────────────

async function getAvailability(req, res) {
  const listingId = req.params.id;

  try {
    // Verify listing exists and is not deleted
    const { rows: lRows } = await db(
      "SELECT id FROM listings WHERE id = $1 AND status != 'deleted'",
      [listingId]
    );
    if (lRows.length === 0) return res.status(404).json({ error: 'Resource not found.' });

    const fromDate = req.query.from || new Date().toISOString().slice(0, 10);
    const toDate   = req.query.to   ||
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { rows } = await db(
      `SELECT id, start_date AS start, end_date AS end, reason
       FROM listing_availability
       WHERE listing_id = $1
         AND start_date >= $2::date
         AND end_date   <= $3::date
       ORDER BY start_date`,
      [listingId, fromDate, toDate]
    );

    return res.json({ listing_id: listingId, unavailable_ranges: rows });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found.' });
    console.error('[getAvailability]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── POST /api/listings/:id/availability/block ─────────────────────
// authorizeListing already ran.

async function blockAvailability(req, res) {
  const { start, end, reason } = req.body;
  const listingId = req.listing.id;

  try {
    // Check for overlapping blocks
    const { rows: conflicts } = await db(
      `SELECT id, start_date AS start, end_date AS end, reason
       FROM listing_availability
       WHERE listing_id = $1
         AND NOT (end_date < $2::date OR start_date > $3::date)
       LIMIT 1`,
      [listingId, start, end]
    );

    if (conflicts.length > 0) {
      return res.status(409).json({
        error:             'Date range overlaps with existing block.',
        conflicting_range: conflicts[0],
      });
    }

    const { rows } = await db(
      `INSERT INTO listing_availability (listing_id, start_date, end_date, reason)
       VALUES ($1, $2::date, $3::date, $4)
       RETURNING id, start_date AS start, end_date AS end, reason`,
      [listingId, start, end, reason]
    );

    return res.status(201).json({ availability: rows[0] });
  } catch (err) {
    console.error('[blockAvailability]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// ── DELETE /api/listings/:id/availability/:availabilityId ─────────
// authorizeListing already ran.

async function deleteAvailabilityBlock(req, res) {
  const { availabilityId } = req.params;
  const listingId          = req.listing.id;

  try {
    const { rows } = await db(
      'SELECT id, reason FROM listing_availability WHERE id = $1 AND listing_id = $2',
      [availabilityId, listingId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Resource not found.' });

    if (rows[0].reason === 'rented') {
      return res.status(403).json({
        error: 'Cannot remove a system-generated rental block. Cancel the rental instead.',
      });
    }

    await db('DELETE FROM listing_availability WHERE id = $1', [availabilityId]);

    return res.json({ message: 'Date block removed.' });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found.' });
    console.error('[deleteAvailabilityBlock]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

module.exports = {
  createListing,
  getListing,
  updateListing,
  deleteListing,
  searchListings,
  getCategories,
  getStoreListings,
  getUserListings,
  getAvailability,
  blockAvailability,
  deleteAvailabilityBlock,
};
