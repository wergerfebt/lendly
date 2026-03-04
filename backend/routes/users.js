'use strict';

const { Router } = require('express');
const authenticate       = require('../middleware/authenticate');
const validate           = require('../middleware/validate');
const { updateUserRules } = require('../validators/userValidators');
const ctrl               = require('../controllers/userController');
const listingCtrl        = require('../controllers/listingController');

const router = Router();

// GET  /api/users/me          — own full profile
router.get('/me',          authenticate, ctrl.getMe);

// GET  /api/users/me/rentals  — own rental history (paginated)
// NOTE: must be defined before /:id so Express doesn't treat 'me' as an id
router.get('/me/rentals',  authenticate, ctrl.getMyRentals);

// PUT  /api/users/me          — update own profile
router.put('/me',          authenticate, updateUserRules, validate, ctrl.updateMe);

// GET  /api/users/:id         — public profile of any user
router.get('/:id',         ctrl.getUserById);

// GET  /api/users/:id/listings — public listings for a user
// (owner sees draft+paused too when authenticated as themselves)
router.get('/:id/listings',
  (req, res, next) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      return authenticate(req, res, next);
    }
    next();
  },
  listingCtrl.getUserListings
);

module.exports = router;
