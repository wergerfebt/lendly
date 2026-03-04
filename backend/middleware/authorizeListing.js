'use strict';

const { query: db } = require('../db/index');

/**
 * Listing authorization middleware.
 *
 * Fetches the listing and checks whether req.user is permitted to
 * write to it (owner, or store manager/owner if it belongs to a store).
 *
 * On success:
 *   req.listing    = the full listing row
 *   req.listingRole = 'owner' | 'store_manager'
 *   calls next()
 *
 * On failure:
 *   404  if listing not found or soft-deleted
 *   403  if authenticated user has no write access
 */
async function authorizeListing(req, res, next) {
  const listingId = req.params.id;
  const userId    = req.user.id;

  try {
    const { rows } = await db(
      'SELECT * FROM listings WHERE id = $1',
      [listingId]
    );

    if (rows.length === 0 || rows[0].status === 'deleted') {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    const listing = rows[0];

    // Direct owner — always authorized
    if (listing.owner_user_id === userId) {
      req.listing     = listing;
      req.listingRole = 'owner';
      return next();
    }

    // Store member at manager or owner level
    if (listing.store_id) {
      const { rows: memberRows } = await db(
        `SELECT role FROM store_users
         WHERE store_id = $1 AND user_id = $2 AND role IN ('manager','owner')`,
        [listing.store_id, userId]
      );

      if (memberRows.length > 0) {
        req.listing     = listing;
        req.listingRole = 'store_manager';
        return next();
      }
    }

    return res.status(403).json({ error: 'Insufficient permissions.' });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found.' });
    console.error('[authorizeListing]', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

module.exports = authorizeListing;
