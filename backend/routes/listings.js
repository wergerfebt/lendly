'use strict';

const { Router } = require('express');
const authenticate       = require('../middleware/authenticate');
const authorizeListing   = require('../middleware/authorizeListing');
const validate           = require('../middleware/validate');
const {
  createListingRules,
  updateListingRules,
  blockAvailabilityRules,
  searchListingsRules,
} = require('../validators/listingValidators');
const ctrl = require('../controllers/listingController');

const router = Router();

// ── Browse / search ───────────────────────────────────────────────

// GET /api/listings  — search with filters
router.get('/',
  searchListingsRules,
  validate,
  ctrl.searchListings
);

// GET /api/listings/categories  — category counts
// NOTE: must be declared before /:id to prevent "categories" being
//       treated as a UUID parameter.
router.get('/categories', ctrl.getCategories);

// ── Single listing CRUD ───────────────────────────────────────────

// POST /api/listings
router.post('/',
  authenticate,
  createListingRules,
  validate,
  ctrl.createListing
);

// GET /api/listings/:id  — public (visibility enforced in controller)
router.get('/:id',
  // authenticate is optional here — controller reads req.user if present
  (req, res, next) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      return authenticate(req, res, next);
    }
    next();
  },
  ctrl.getListing
);

// PUT /api/listings/:id
router.put('/:id',
  authenticate,
  authorizeListing,
  updateListingRules,
  validate,
  ctrl.updateListing
);

// DELETE /api/listings/:id
router.delete('/:id',
  authenticate,
  authorizeListing,
  ctrl.deleteListing
);

// ── Availability ──────────────────────────────────────────────────

// GET /api/listings/:id/availability
router.get('/:id/availability', ctrl.getAvailability);

// POST /api/listings/:id/availability/block
router.post('/:id/availability/block',
  authenticate,
  authorizeListing,
  blockAvailabilityRules,
  validate,
  ctrl.blockAvailability
);

// DELETE /api/listings/:id/availability/:availabilityId
router.delete('/:id/availability/:availabilityId',
  authenticate,
  authorizeListing,
  ctrl.deleteAvailabilityBlock
);

module.exports = router;
