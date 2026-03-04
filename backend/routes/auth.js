'use strict';

const { Router }      = require('express');
const rateLimit       = require('express-rate-limit');
const { body, query } = require('express-validator');
const validate        = require('../middleware/validate');
const ctrl            = require('../controllers/authController');

const router = Router();

// ── Rate limiters ─────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max:      5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many registration attempts. Please try again in an hour.' },
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max:      5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Please try again in an hour.' },
});

// ── Validators ────────────────────────────────────────────────────

const registerRules = [
  body('email')
    .trim().isEmail().withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Must contain at least one number'),
  body('full_name')
    .trim().notEmpty().withMessage('Full name is required')
    .isLength({ max: 100 }).withMessage('Full name must be 100 characters or fewer'),
  body('location_city')
    .optional().trim().isLength({ max: 100 }),
  body('location_state')
    .optional().trim().isLength({ max: 100 }),
];

const loginRules = [
  body('email').trim().notEmpty().withMessage('Email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const resetPasswordRules = [
  body('token').trim().notEmpty().withMessage('Token is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Must contain at least one number'),
];

// ── Routes ────────────────────────────────────────────────────────

// POST /api/auth/register
router.post('/register', registerLimiter, registerRules, validate, ctrl.register);

// GET  /api/auth/verify-email?token=...
router.get(
  '/verify-email',
  [query('token').trim().notEmpty().withMessage('Token is required')],
  validate,
  ctrl.verifyEmail
);

// POST /api/auth/login
router.post('/login', loginLimiter, loginRules, validate, ctrl.login);

// POST /api/auth/refresh
router.post('/refresh', ctrl.refresh);

// POST /api/auth/logout
router.post('/logout', ctrl.logout);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  forgotLimiter,
  [body('email').trim().isEmail().withMessage('Must be a valid email address').normalizeEmail()],
  validate,
  ctrl.forgotPassword
);

// POST /api/auth/reset-password
router.post('/reset-password', resetPasswordRules, validate, ctrl.resetPassword);

module.exports = router;
