'use strict';

const { query: db } = require('../db/index');

// Higher number = more authority
const ROLE_RANK = { staff: 1, manager: 2, owner: 3 };

/**
 * Factory that returns an Express middleware enforcing store-level
 * authorization.
 *
 * Usage:
 *   router.put('/:id', authenticate, authorizeStore('manager'), handler)
 *
 * On success: attaches req.storeRole = 'owner' | 'manager' | 'staff'
 *             and calls next().
 *
 * On failure: returns 403 { error: "Insufficient permissions." }
 *
 * @param {'staff'|'manager'|'owner'} minimumRole  Lowest role that may proceed
 */
function authorizeStore(minimumRole) {
  const minRank = ROLE_RANK[minimumRole];
  if (minRank === undefined) {
    throw new Error(`authorizeStore: invalid minimumRole "${minimumRole}"`);
  }

  return async function (req, res, next) {
    const storeId = req.params.id;
    const userId  = req.user.id;

    try {
      const { rows } = await db(
        'SELECT role FROM store_users WHERE store_id = $1 AND user_id = $2',
        [storeId, userId]
      );

      if (rows.length === 0) {
        return res.status(403).json({ error: 'Insufficient permissions.' });
      }

      const userRole = rows[0].role;
      if (ROLE_RANK[userRole] < minRank) {
        return res.status(403).json({ error: 'Insufficient permissions.' });
      }

      req.storeRole = userRole;
      next();
    } catch (err) {
      console.error('[authorizeStore]', err);
      return res.status(500).json({ error: 'An unexpected error occurred.' });
    }
  };
}

module.exports = authorizeStore;
