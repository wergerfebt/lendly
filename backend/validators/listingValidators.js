'use strict';

const { body, query } = require('express-validator');

const VALID_CATEGORIES = [
  'photography', 'videography', 'audio', 'instruments',
  'automotive', 'construction', 'outdoor', 'other',
];

const VALID_SORT_VALUES = ['price_asc', 'price_desc', 'newest', 'rating'];

// ── Shared helpers ────────────────────────────────────────────────

const titleRule = (required = true) => {
  const chain = body('title').trim();
  return required
    ? chain.isLength({ min: 3, max: 150 }).withMessage('Must be between 3 and 150 characters')
    : chain.optional().isLength({ min: 3, max: 150 }).withMessage('Must be between 3 and 150 characters');
};

const categoryRule = (required = true) => {
  const chain = body('category').trim();
  const validated = required
    ? chain.notEmpty().withMessage('Category is required')
    : chain.optional();
  return validated.isIn(VALID_CATEGORIES)
    .withMessage(`Must be one of: ${VALID_CATEGORIES.join(', ')}`);
};

const priceDiscountRules = [
  body('price_per_week')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('Must be a positive number')
    .custom((val, { req }) => {
      const ppd = parseFloat(req.body.price_per_day);
      if (!isNaN(ppd) && parseFloat(val) >= ppd * 7) {
        throw new Error('Weekly price must be less than price_per_day × 7');
      }
      return true;
    }),
  body('price_per_month')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('Must be a positive number')
    .custom((val, { req }) => {
      const ppd = parseFloat(req.body.price_per_day);
      if (!isNaN(ppd) && parseFloat(val) >= ppd * 30) {
        throw new Error('Monthly price must be less than price_per_day × 30');
      }
      return true;
    }),
];

// ── createListingRules ────────────────────────────────────────────

const createListingRules = [
  titleRule(true),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Must be 2000 characters or fewer'),

  categoryRule(true),

  body('price_per_day')
    .isFloat({ gt: 0 })
    .withMessage('Must be a positive number'),

  ...priceDiscountRules,

  body('deposit_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Must be >= 0'),

  body('weight_lbs')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Must be >= 0'),

  body('dimensions_inches')
    .optional()
    .isObject()
    .withMessage('Must be an object')
    .custom(val => {
      const { length, width, height } = val;
      if (
        typeof length !== 'number' || typeof width !== 'number' ||
        typeof height !== 'number'
      ) {
        throw new Error('dimensions_inches must have numeric length, width, and height');
      }
      return true;
    }),

  body('is_deliverable')
    .optional()
    .isBoolean()
    .withMessage('Must be a boolean'),

  body('delivery_radius_miles')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('Must be a positive number')
    .custom((val, { req }) => {
      if (req.body.is_deliverable === true || req.body.is_deliverable === 'true') {
        if (!val && val !== 0) {
          throw new Error('Required when is_deliverable is true');
        }
      }
      return true;
    }),

  body('image_urls')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Must be an array of at most 10 URLs')
    .custom(urls => {
      const urlPattern = /^https?:\/\/.+/;
      const invalid = urls.filter(u => !urlPattern.test(u));
      if (invalid.length > 0) throw new Error('Each item must be a valid URL');
      return true;
    }),

  body('attributes')
    .optional()
    .isObject()
    .withMessage('Must be a JSON object'),

  body('status')
    .optional()
    .isIn(['draft', 'active'])
    .withMessage('Must be "draft" or "active"'),
];

// ── updateListingRules ────────────────────────────────────────────
// Same as create but all fields optional; status can also be 'paused'.

const updateListingRules = [
  titleRule(false),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Must be 2000 characters or fewer'),

  categoryRule(false),

  body('price_per_day')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('Must be a positive number'),

  ...priceDiscountRules,

  body('deposit_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Must be >= 0'),

  body('weight_lbs')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Must be >= 0'),

  body('dimensions_inches')
    .optional()
    .isObject()
    .withMessage('Must be an object')
    .custom(val => {
      const { length, width, height } = val;
      if (
        typeof length !== 'number' || typeof width !== 'number' ||
        typeof height !== 'number'
      ) {
        throw new Error('Must have numeric length, width, and height');
      }
      return true;
    }),

  body('is_deliverable')
    .optional()
    .isBoolean()
    .withMessage('Must be a boolean'),

  body('delivery_radius_miles')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('Must be a positive number'),

  body('image_urls')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Must be an array of at most 10 URLs')
    .custom(urls => {
      const urlPattern = /^https?:\/\/.+/;
      const invalid = urls.filter(u => !urlPattern.test(u));
      if (invalid.length > 0) throw new Error('Each item must be a valid URL');
      return true;
    }),

  body('attributes')
    .optional()
    .isObject()
    .withMessage('Must be a JSON object'),

  body('status')
    .optional()
    .isIn(['draft', 'active', 'paused'])
    .withMessage('Must be "draft", "active", or "paused"'),
];

// ── blockAvailabilityRules ────────────────────────────────────────

const blockAvailabilityRules = [
  body('start')
    .trim()
    .notEmpty().withMessage('Start date is required')
    .isISO8601().withMessage('Must be a valid ISO date (YYYY-MM-DD)')
    .custom(val => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(val) < today) throw new Error('Start date must be today or in the future');
      return true;
    }),

  body('end')
    .trim()
    .notEmpty().withMessage('End date is required')
    .isISO8601().withMessage('Must be a valid ISO date (YYYY-MM-DD)')
    .custom((val, { req }) => {
      if (req.body.start && new Date(val) < new Date(req.body.start)) {
        throw new Error('End date must be on or after start date');
      }
      return true;
    }),

  body('reason')
    .trim()
    .isIn(['blocked', 'maintenance'])
    .withMessage('Must be "blocked" or "maintenance"'),
];

// ── searchListingsRules ───────────────────────────────────────────

const searchListingsRules = [
  query('min_price').optional().isFloat({ min: 0 }).withMessage('Must be >= 0'),
  query('max_price')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('Must be > 0')
    .custom((val, { req }) => {
      const min = parseFloat(req.query.min_price);
      if (!isNaN(min) && parseFloat(val) <= min) {
        throw new Error('max_price must be greater than min_price');
      }
      return true;
    }),
  query('available_from')
    .optional()
    .isISO8601()
    .withMessage('Must be a valid ISO date'),
  query('available_to')
    .optional()
    .isISO8601()
    .withMessage('Must be a valid ISO date')
    .custom((val, { req }) => {
      if (req.query.available_from && new Date(val) < new Date(req.query.available_from)) {
        throw new Error('available_to must be on or after available_from');
      }
      return true;
    }),
  query('page').optional().isInt({ min: 1 }).withMessage('Must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Must be between 1 and 50'),
  query('sort')
    .optional()
    .isIn(VALID_SORT_VALUES)
    .withMessage(`Must be one of: ${VALID_SORT_VALUES.join(', ')}`),
];

module.exports = {
  createListingRules,
  updateListingRules,
  blockAvailabilityRules,
  searchListingsRules,
  VALID_CATEGORIES,
};
