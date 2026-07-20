#!/usr/bin/env bash
# Miruum deploy pipeline — safe, repeatable deploys (replaces ad-hoc rsync).
#
#   ./scripts/deploy.sh [backend|web|all]   # default: all
#
# Gates each deploy on a local type-check/build, syncs, rebuilds the container,
# runs versioned migrations (backend), and verifies health — aborts on failure.
set -euo pipefail

VPS="${MIRUUM_VPS:-root@76.13.197.249}"
KEY="${MIRUUM_KEY:-$HOME/.ssh/gokar_prod}"
REMOTE="${MIRUUM_REMOTE:-/root/ota}"
HEALTH_URL="${MIRUUM_HEALTH:-https://api.miruum.id/api/health}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=no)
TARGET="${1:-all}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

log() { printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }
sync() { rsync -az -e "${SSH[*]}" --exclude node_modules --exclude dist --exclude build "$ROOT/$1/" "$VPS:$REMOTE/$1/"; }

if [[ "$TARGET" == "backend" || "$TARGET" == "all" ]]; then
  log "backend: type-check + build (gate)"
  ( cd "$ROOT/backend" && npm run build >/dev/null )
  log "backend: sync → rebuild → migrate deploy"
  sync backend
  "${SSH[@]}" "$VPS" "cd $REMOTE/deploy && docker compose up -d --build backend && sleep 6"
fi

if [[ "$TARGET" == "web" || "$TARGET" == "all" ]]; then
  log "web: syntax check (gate)"
  node --check "$ROOT/web/src/server.js"
  log "web: sync → rebuild"
  sync web
  "${SSH[@]}" "$VPS" "cd $REMOTE/deploy && docker compose up -d --build web"
fi

log "health check"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$HEALTH_URL" || true)"
if [[ "$code" == "200" ]]; then
  echo "✅ deploy OK — $HEALTH_URL healthy"
else
  echo "❌ health check failed (HTTP $code)"
  echo "   Rollback: on the VPS, redeploy the previous image or 'docker compose restart backend'."
  exit 1
fi
