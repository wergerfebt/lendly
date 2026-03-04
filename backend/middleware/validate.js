'use strict';

const { validationResult } = require('express-validator');

/**
 * express-validator error-handler middleware.
 *
 * Place this after your array of `check()`/`body()` validators in a route.
 * If any validator failed it returns 400 with structured field-level errors:
 *
 *   {
 *     error: "Validation failed",
 *     fields: {
 *       "email":    "Must be a valid email address",
 *       "password": "Must be at least 8 characters"
 *     }
 *   }
 *
 * Only the first error per field is reported. If validation passes, calls next().
 */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  // Collect first error message per field
  const fields = {};
  for (const e of result.array()) {
    if (!fields[e.path]) fields[e.path] = e.msg;
  }

  return res.status(400).json({ error: 'Validation failed', fields });
}

module.exports = validate;
