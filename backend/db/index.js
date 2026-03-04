/* ═══════════════════════════════════════════════════════
   db/index.js — PostgreSQL connection pool
   Reads DATABASE_URL from environment (via .env) and
   exports a query helper and raw pool for transactions.
   ═══════════════════════════════════════════════════════ */

'use strict';

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill in the values.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max:                    10,    // max simultaneous connections
  idleTimeoutMillis:   30000,    // close idle connections after 30 s
  connectionTimeoutMillis: 2000, // fail fast if Postgres is unreachable
});

// Surface pool errors so they don't silently kill the process
pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client:', err.message);
  process.exit(1);
});

/**
 * Run a parameterised SQL query.
 *
 * @param {string}  text   - SQL with $1, $2 … placeholders
 * @param {Array}   params - Values to bind
 * @returns {Promise<import('pg').QueryResult>}
 *
 * @example
 * const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Acquire a dedicated client from the pool for multi-statement transactions.
 * Always call client.release() in a finally block when done.
 *
 * @returns {Promise<import('pg').PoolClient>}
 *
 * @example
 * const client = await getClient();
 * try {
 *   await client.query('BEGIN');
 *   await client.query('INSERT INTO ...');
 *   await client.query('COMMIT');
 * } catch (err) {
 *   await client.query('ROLLBACK');
 *   throw err;
 * } finally {
 *   client.release();
 * }
 */
async function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getClient };
