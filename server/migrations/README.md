# Database migrations

Incremental schema changes for **existing** databases. Fresh installs get the
full current schema from `server/schema.sql`, and `bootstrap.js` marks every
file in this folder as already-applied — so migrations only ever run against
databases created *before* the change.

## Rules
- Name files with a zero-padded ordinal prefix: `001_add_x.sql`, `002_….sql`.
- Write them **idempotently** (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT
  EXISTS`, guarded `DO $$ … $$`), so re-running is always safe.
- Keep `server/schema.sql` (the full current schema) in sync, so fresh installs
  match a fully-migrated database.

## Applying
- `./update_full.sh` from the deploy folder (pulls code + runs migrations), or
- directly: `docker compose exec -T app node server/migrate.js`

Applied files are recorded in the `schema_migrations` table.
