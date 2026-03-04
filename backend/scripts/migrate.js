#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   scripts/migrate.js — Custom SQL migration runner.

   Behaviour
     1. Connects to the database defined by DATABASE_URL in .env
     2. Creates the schema_migrations tracking table if absent
     3. Reads every *.sql file from /migrations, sorted by filename
     4. Skips files already recorded in schema_migrations
     5. Applies each pending file inside its own transaction
     6. Records the filename on success, rolls back + exits on failure

   Usage
     node scripts/migrate.js            (run pending migrations)
     npm run migrate                    (same, via package.json script)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const fs   = require('fs');
const path = require('path');

// Load .env relative to the backend root (one level up from /scripts)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Pool } = require('pg');

// ── Constants ─────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

// ── DB pool ───────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.error('[migrate] ✗ DATABASE_URL is not set. Copy .env.example → .env and fill it in.');
  process.exit(1);
}

const pool = new Pool({
  connectionString:        process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});

// ── Helpers ───────────────────────────────────────────────────────

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(client) {
  const { rows } = await client.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(rows.map(r => r.filename));
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`[migrate] ✗ Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();               // lexicographic → 001_…, 002_…, 003_…
}

// ── Main ──────────────────────────────────────────────────────────

async function run() {
  const client = await pool.connect();

  try {
    await ensureTrackingTable(client);

    const applied = await getApplied(client);
    const files   = getMigrationFiles();
    const pending = files.filter(f => !applied.has(f));

    if (pending.length === 0) {
      console.log('[migrate] Nothing to run — all migrations already applied.');
      return;
    }

    console.log(`[migrate] ${pending.length} pending migration(s):\n`);

    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql      = fs.readFileSync(filePath, 'utf8');

      process.stdout.write(`  ▶  ${file} … `);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log('✓');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('✗');
        console.error(`\n[migrate] Migration failed: ${file}`);
        console.error(err.message);
        process.exit(1);
      }
    }

    console.log('\n[migrate] All migrations applied successfully.');

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('[migrate] Unexpected error:', err.message);
  process.exit(1);
});
