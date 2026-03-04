'use strict';

const { Router } = require('express');
const { body }          = require('express-validator');
const authenticate      = require('../middleware/authenticate');
const authorizeStore    = require('../middleware/authorizeStore');
const validate          = require('../middleware/validate');
const { createStoreRules, updateStoreRules } = require('../validators/storeValidators');
const ctrl              = require('../controllers/storeController');

const router = Router();

// ── Store CRUD ────────────────────────────────────────────────────

// POST /api/stores
router.post('/',
  authenticate,
  createStoreRules,
  validate,
  ctrl.createStore
);

// GET /api/stores/:id  — public
router.get('/:id',
  ctrl.getStore
);

// PUT /api/stores/:id  — manager or owner
router.put('/:id',
  authenticate,
  authorizeStore('manager'),
  updateStoreRules,
  validate,
  ctrl.updateStore
);

// DELETE /api/stores/:id  — owner only (soft delete)
router.delete('/:id',
  authenticate,
  authorizeStore('owner'),
  ctrl.deactivateStore
);

// ── Store staff ───────────────────────────────────────────────────

// GET /api/stores/:id/staff  — any store member
router.get('/:id/staff',
  authenticate,
  authorizeStore('staff'),
  ctrl.getStoreStaff
);

// POST /api/stores/:id/staff  — manager or owner
router.post('/:id/staff',
  authenticate,
  authorizeStore('manager'),
  [
    body('user_id').trim().notEmpty().isUUID().withMessage('Must be a valid UUID'),
    body('role').trim().notEmpty().withMessage('Role is required'),
  ],
  validate,
  ctrl.addStoreStaff
);

// PUT /api/stores/:id/staff/:userId  — owner only
router.put('/:id/staff/:userId',
  authenticate,
  authorizeStore('owner'),
  [body('role').trim().notEmpty().withMessage('Role is required')],
  validate,
  ctrl.updateStoreStaff
);

// DELETE /api/stores/:id/staff/:userId
// authenticate only — controller handles the nuanced permission logic
// (self-removal allowed regardless of role; managers can remove staff only)
router.delete('/:id/staff/:userId',
  authenticate,
  ctrl.removeStoreStaff
);

module.exports = router;
