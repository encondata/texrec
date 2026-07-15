// Applies pending database migrations from server/migrations/*.sql, in order,
// tracked in a schema_migrations table. Idempotent — safe to run repeatedly.
// Fresh installs never run these: bootstrap.js marks all current migration
// files as already-applied (schema.sql already includes them).
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function main() {
  // wait for the database to accept connections
  for (let i = 0; i < 30; i++) {
    try { await pool.query('SELECT 1'); break; }
    catch (e) { if (i === 29) throw e; await new Promise(r => setTimeout(r, 2000)); }
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    : [];
  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const done = new Set(rows.map(r => r.filename));

  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`migrate: applying ${f} …`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
      await client.query('COMMIT');
      applied++;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      throw new Error(`migration ${f} failed: ${e.message}`);
    }
    client.release();
  }

  console.log(applied
    ? `migrate: applied ${applied} migration(s).`
    : 'migrate: database already up to date.');
  await pool.end();
}

main().catch(e => { console.error('migrate failed:', e.message); process.exit(1); });
