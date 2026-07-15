#!/usr/bin/env bash
#
# Update TexRec to the latest code AND apply any pending database migrations.
# Use this when a release includes schema changes; otherwise ./update.sh is fine.
#
# Migrations are idempotent and tracked in the schema_migrations table, so this
# is always safe to run — it applies only what's missing. Data is preserved.
set -euo pipefail
cd "$(dirname "$0")"

if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else echo "Docker Compose not found." >&2; exit 1; fi

echo "→ Pulling latest code…"
git pull --ff-only

echo "→ Rebuilding & restarting (database volumes are preserved)…"
$DC up -d --build

echo "→ Applying database migrations…"
$DC exec -T app node server/migrate.js

echo "→ Restarting app on the migrated schema…"
$DC restart app

echo "✓ Updated with migrations. Your data is preserved."
