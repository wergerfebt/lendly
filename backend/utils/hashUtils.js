'use strict';

const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

/**
 * Hash a plaintext value (password, token, etc.).
 * @param {string} value
 * @returns {Promise<string>} bcrypt hash
 */
async function hash(value) {
  return bcrypt.hash(value, SALT_ROUNDS);
}

/**
 * Compare a plaintext value against a bcrypt hash.
 * @param {string} value
 * @param {string} hashed
 * @returns {Promise<boolean>}
 */
async function compare(value, hashed) {
  return bcrypt.compare(value, hashed);
}

module.exports = { hash, compare };
