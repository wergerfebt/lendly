'use strict';

const { body } = require('express-validator');

const VALID_INTERESTS = [
  'photography', 'videography', 'audio', 'instruments',
  'automotive', 'construction', 'outdoor', 'other',
];

/**
 * Validators for PUT /api/users/me
 * All fields are optional — only provided fields are validated.
 */
const updateUserRules = [
  body('full_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Must be between 2 and 100 characters'),

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

  body('profile_icon_url')
    .optional()
    .trim()
    .isURL()
    .withMessage('Must be a valid URL'),

  body('interests')
    .optional()
    .isArray()
    .withMessage('Must be an array')
    .custom(values => {
      const invalid = values.filter(v => !VALID_INTERESTS.includes(v));
      if (invalid.length > 0) {
        throw new Error(`Invalid interest value(s): ${invalid.join(', ')}. ` +
          `Allowed: ${VALID_INTERESTS.join(', ')}`);
      }
      return true;
    }),
];

module.exports = { updateUserRules };
