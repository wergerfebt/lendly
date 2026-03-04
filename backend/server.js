'use strict';

require('dotenv').config();

const express      = require('express');
const cookieParser = require('cookie-parser');
const cors         = require('cors');

const authRouter   = require('./routes/auth');
const usersRouter  = require('./routes/users');
const storesRouter = require('./routes/stores');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Core middleware ───────────────────────────────────────────────

app.use(express.json());
app.use(cookieParser());

app.use(cors({
  // In production, replace with your actual frontend origin(s).
  origin:      process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,   // required for httpOnly cookie to be sent cross-origin
}));

// ── Routes ────────────────────────────────────────────────────────

app.use('/api/auth',   authRouter);
app.use('/api/users',  usersRouter);
app.use('/api/stores', storesRouter);

// Health check — useful for Docker and load-balancer probes
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Global error handler ──────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

// ── Start ─────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[server] Lendly API listening on http://localhost:${PORT}`);
  });
}

// Export for future integration tests
module.exports = app;
