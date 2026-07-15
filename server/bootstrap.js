// Idempotent first-boot setup: creates the schema if the database is empty,
// and creates the first admin account (from BOOTSTRAP_ADMIN_* env vars) if no
// admin accounts exist. Safe to run on every container start — it never
// touches an already-initialized database.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('./db');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}

async function main() {
  // wait for postgres to accept connections (compose healthcheck usually covers this)
  for (let i = 0; i < 30; i++) {
    try { await pool.query('SELECT 1'); break; }
    catch (e) {
      if (i === 29) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const { rows: [t] } = await pool.query(
    `SELECT to_regclass('public.admin_users') IS NOT NULL AS ready`);
  if (!t.ready) {
    console.log('bootstrap: empty database — creating schema…');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    // schema.sql already includes every migration — record them as applied so
    // migrate.js never re-runs them against this fresh database
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const migDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migDir)) {
      for (const f of fs.readdirSync(migDir).filter(x => x.endsWith('.sql')).sort()) {
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
      }
    }
  } else {
    console.log('bootstrap: schema already present — skipping.');
  }

  const { rows: [{ count }] } = await pool.query('SELECT count(*)::int AS count FROM admin_users');
  if (count === 0) {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@texrec.com';
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'change-me-now';
    const name = process.env.BOOTSTRAP_ADMIN_NAME || 'TexRec Admin';
    await pool.query(
      `INSERT INTO admin_users (email, name, password_hash, role) VALUES ($1,$2,$3,'superadmin')`,
      [email.toLowerCase(), name, hashPassword(password)]);
    console.log(`bootstrap: created first super-admin account <${email}> — change the password after first login.`);
  }

  await pool.end();
  console.log('bootstrap: done.');
}

main().catch(e => { console.error('bootstrap failed:', e.message); process.exit(1); });
