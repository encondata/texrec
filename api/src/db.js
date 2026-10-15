import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// DATE columns come back as 'yyyy-mm-dd' strings, not JS Dates shifted into UTC
pg.types.setTypeParser(1082, (v) => v);

// connection settings come from the standard PG* env vars
export const pool = new pg.Pool({ max: 10 });

export const query = (text, params) => pool.query(text, params);

// run fn inside a transaction with a dedicated client
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

// apply src/migrations/*.sql in name order, once each
export async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    await tx(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`applied migration ${file}`);
  }
}
