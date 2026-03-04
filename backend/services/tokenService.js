'use strict';

const jwt = require('jsonwebtoken');

const ACCESS_SECRET  = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;
const ACCESS_EXPIRY  = process.env.ACCESS_TOKEN_EXPIRES_IN  || '15m';
const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

/**
 * Sign a short-lived access token.
 * Payload: { sub: userId, email }
 * @param {{ id: string, email: string }} user
 * @returns {string}
 */
function signAccessToken(user) {
  if (!ACCESS_SECRET) throw new Error('ACCESS_TOKEN_SECRET is not set');
  return jwt.sign(
    { sub: user.id, email: user.email },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
}

/**
 * Sign a long-lived refresh token.
 * Payload: { sub: userId }
 * @param {{ id: string }} user
 * @returns {{ token: string, expiresAt: Date }}
 */
function signRefreshToken(user) {
  if (!REFRESH_SECRET) throw new Error('REFRESH_TOKEN_SECRET is not set');
  const token = jwt.sign(
    { sub: user.id },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRY }
  );
  // Decode to get the exact expiry so we can store it in the DB
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * Verify an access token.
 * @param {string} token
 * @returns {{ sub: string, email: string }} decoded payload
 * @throws jwt.TokenExpiredError | jwt.JsonWebTokenError
 */
function verifyAccessToken(token) {
  if (!ACCESS_SECRET) throw new Error('ACCESS_TOKEN_SECRET is not set');
  return jwt.verify(token, ACCESS_SECRET);
}

/**
 * Verify a refresh token.
 * @param {string} token
 * @returns {{ sub: string }} decoded payload
 * @throws jwt.TokenExpiredError | jwt.JsonWebTokenError
 */
function verifyRefreshToken(token) {
  if (!REFRESH_SECRET) throw new Error('REFRESH_TOKEN_SECRET is not set');
  return jwt.verify(token, REFRESH_SECRET);
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
