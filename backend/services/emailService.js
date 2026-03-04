'use strict';

const nodemailer = require('nodemailer');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const FROM     = process.env.EMAIL_FROM || 'noreply@lendly.app';
const IS_DEV   = (process.env.NODE_ENV || 'development') !== 'production';

/**
 * Build a nodemailer transporter.
 *
 * Development: creates a one-time Ethereal test account automatically.
 *   The preview URL for every sent email is logged to the console so you
 *   can inspect it without a real inbox.
 *
 * Production: uses SMTP credentials from environment variables.
 */
async function createTransporter() {
  if (IS_DEV && !process.env.SMTP_USER) {
    // Auto-generate an Ethereal test account (no signup required)
    const testAccount = await nodemailer.createTestAccount();
    console.log('[email] Using Ethereal test account:', testAccount.user);
    return nodemailer.createTransport({
      host:   'smtp.ethereal.email',
      port:   587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// Lazily initialised — created once, reused for subsequent sends
let _transporter = null;
async function getTransporter() {
  if (!_transporter) _transporter = await createTransporter();
  return _transporter;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Send the email-verification link to a newly registered user.
 * @param {string} to            Recipient email address
 * @param {string} token         Plain-text verification token (UUID)
 */
async function sendVerificationEmail(to, token) {
  const link = `${BASE_URL}/api/auth/verify-email?token=${token}`;
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from:    `"Lendly" <${FROM}>`,
    to,
    subject: 'Verify your Lendly account',
    text: `Welcome to Lendly!\n\nPlease verify your email address by visiting:\n${link}\n\nThis link does not expire.\n\nIf you didn't create an account, you can safely ignore this email.`,
    html: `
      <p>Welcome to <strong>Lendly</strong>!</p>
      <p>Please verify your email address by clicking the button below:</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
          Verify Email
        </a>
      </p>
      <p>Or copy this link into your browser:<br/><a href="${link}">${link}</a></p>
      <p style="color:#888;font-size:12px;">If you didn't create a Lendly account, you can safely ignore this email.</p>
    `,
  });

  if (IS_DEV) {
    console.log('[email] Verification email preview:', nodemailer.getTestMessageUrl(info));
  }
}

/**
 * Send a password-reset link.
 * @param {string} to            Recipient email address
 * @param {string} token         Plain-text reset token (UUID)
 */
async function sendPasswordResetEmail(to, token) {
  // The reset link points to your frontend; the frontend POSTs the token
  // to /api/auth/reset-password.  We embed it as a query param so a simple
  // SPA can read it from the URL.
  const link = `${BASE_URL}/reset-password?token=${token}`;
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from:    `"Lendly" <${FROM}>`,
    to,
    subject: 'Reset your Lendly password',
    text: `You requested a password reset for your Lendly account.\n\nClick the link below to set a new password (expires in 1 hour):\n${link}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <p>You requested a <strong>password reset</strong> for your Lendly account.</p>
      <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
          Reset Password
        </a>
      </p>
      <p>Or copy this link into your browser:<br/><a href="${link}">${link}</a></p>
      <p style="color:#888;font-size:12px;">If you didn't request a password reset, you can safely ignore this email.</p>
    `,
  });

  if (IS_DEV) {
    console.log('[email] Password reset email preview:', nodemailer.getTestMessageUrl(info));
  }
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
