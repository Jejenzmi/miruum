#!/usr/bin/env bash
# Miruum — local dev helper. Runs backend (tsx watch) + Flutter web (Chrome).
# Requires a local PostgreSQL reachable via $DATABASE_URL.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/miruum?schema=public}"
export JWT_SECRET="${JWT_SECRET:-miruum-dev-secret}"
export PORT="${PORT:-5013}"

echo "▶ Backend deps…"
( cd "$ROOT/backend" && npm install --silent && npx prisma db push --skip-generate && npm run seed && npm run dev ) &
BACK=$!

echo "▶ Flutter web (API → http://localhost:$PORT/api)…"
( cd "$ROOT/app" && flutter pub get && flutter run -d chrome --dart-define=API_BASE="http://localhost:$PORT/api" )

kill $BACK 2>/dev/null || true
