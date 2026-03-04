'use strict';

const { verifyAccessToken } = require('../services/tokenService');
const jwt = require('jsonwebtoken');

/**
 * JWT authentication middleware.
 *
 * Reads the Authorization header (Bearer <token>), verifies the access token,
 * and attaches `req.user = { id, email }` for downstream handlers.
 *
 * On failure returns:
 *   401 { error: "No token provided" }          — header missing / malformed
 *   401 { error: "Token expired" }              — valid signature but expired
 *   401 { error: "Invalid token" }              — any other verification failure
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = authenticate;
