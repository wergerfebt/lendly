'use strict';

const { validationResult } = require('express-validator');

/**
 * express-validator error-handler middleware.
 *
 * Place this after your array of `check()`/`body()` validators in a route.
 * If any validator failed it returns 400 with structured field-level errors:
 *
 *   {
 *     errors: [
 *       { field: "email",    message: "Must be a valid email address" },
 *       { field: "password", message: "Must be at least 8 characters" }
 *     ]
 *   }
 *
 * If validation passes, calls next() to continue to the controller.
 */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array().map(e => ({
    field:   e.path,
    message: e.msg,
  }));

  return res.status(400).json({ errors });
}

module.exports = validate;
