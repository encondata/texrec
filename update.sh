#!/usr/bin/env bash
#
# Update TexRec to the latest code — NO database migrations.
# Use ./update_full.sh instead when a release includes schema changes.
#
# Data (database + uploaded files) lives in Docker named volumes and is
# preserved: this only rebuilds and restarts the app.
set -euo pipefail
cd "$(dirname "$0")"

if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else echo "Docker Compose not found." >&2; exit 1; fi

echo "→ Pulling latest code…"
git pull --ff-only

echo "→ Rebuilding & restarting (database volumes are preserved)…"
$DC up -d --build

echo "✓ Updated. Your data is untouched."
echo "  If this release includes schema changes, run ./update_full.sh instead."
