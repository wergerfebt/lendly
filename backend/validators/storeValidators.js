'use strict';

const { body } = require('express-validator');

const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function storeHoursValidator() {
  return body('store_hours')
    .optional()
    .custom(value => {
      if (typeof value !== 'object' || Array.isArray(value) || value === null) {
        throw new Error('Must be an object');
      }
      const invalidKeys = Object.keys(value).filter(k => !VALID_DAYS.includes(k));
      if (invalidKeys.length > 0) {
        throw new Error(`Invalid day key(s): ${invalidKeys.join(', ')}. ` +
          `Allowed keys: ${VALID_DAYS.join(', ')}`);
      }
      return true;
    });
}

/** Validators for POST /api/stores */
const createStoreRules = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Must be between 2 and 100 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Must be 1000 characters or fewer'),

  body('icon_url')
    .optional()
    .trim()
    .isURL()
    .withMessage('Must be a valid URL'),

  body('contact_email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('contact_phone')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Must be 30 characters or fewer'),

  body('location_address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Must be 200 characters or fewer'),

  body('location_city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Must be 100 characters or fewer'),

  body('location_state')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Must be 100 characters or fewer'),

  body('location_lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Must be a number between -90 and 90'),

  body('location_lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Must be a number between -180 and 180'),

  storeHoursValidator(),
];

/** Validators for PUT /api/stores/:id — same rules, all optional */
const updateStoreRules = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Must be between 2 and 100 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Must be 1000 characters or fewer'),

  body('icon_url')
    .optional()
    .trim()
    .isURL()
    .withMessage('Must be a valid URL'),

  body('contact_email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('contact_phone')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Must be 30 characters or fewer'),

  body('location_address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Must be 200 characters or fewer'),

  body('location_city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Must be 100 characters or fewer'),

  body('location_state')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Must be 100 characters or fewer'),

  body('location_lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Must be a number between -90 and 90'),

  body('location_lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Must be a number between -180 and 180'),

  storeHoursValidator(),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('Must be a boolean'),
];

module.exports = { createStoreRules, updateStoreRules };
