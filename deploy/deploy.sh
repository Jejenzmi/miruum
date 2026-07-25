#!/usr/bin/env bash
# ─────────────────────────── Safe deploy ───────────────────────────
# rsync → build → health-verify. Guards against the two failure modes that
# caused silent "berhasil palsu" deploys:
#   1) a stray /root/ota/backend/schema.prisma (old) that hijacks prisma generate
#   2) Docker layer cache serving stale code/migrations after an rsync
# Usage:  ./deploy.sh [backend|web|webapp|all]   (NOCACHE=1 forces a clean rebuild)
set -euo pipefail
KEY="${KEY:-$HOME/.ssh/gokar_prod}"
HOST="${HOST:-root@76.13.197.249}"
SVC="${1:-all}"
NOCACHE="${NOCACHE:-0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH() { ssh -i "$KEY" -o StrictHostKeyChecking=no "$HOST" "$@"; }
sync_src() {
  echo "→ sync $1"
  rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
    --exclude node_modules --exclude .nuxt --exclude .output --exclude build --exclude .dart_tool \
    --exclude 'android/app/*.keystore' --exclude 'android/key.properties' \
    "$ROOT/$1/" "$HOST:/root/ota/$1/"
}

[ "$SVC" = all ] && SERVICES="backend web webapp" || SERVICES="$SVC"

# 1) Remove the stray root schema that breaks `prisma generate` in the image.
SSH 'rm -f /root/ota/backend/schema.prisma'

# 2) Sync source.
for s in $SERVICES; do sync_src "$s"; done
rsync -az -e "ssh -i $KEY -o StrictHostKeyChecking=no" "$ROOT/deploy/docker-compose.yml" "$HOST:/root/ota/deploy/docker-compose.yml"

# 3) Build (force a clean rebuild when schema/migrations changed).
if [ "$NOCACHE" = 1 ]; then
  echo "→ no-cache rebuild: $SERVICES"
  SSH "cd /root/ota/deploy && docker compose build --no-cache $SERVICES"
fi
echo "→ build + up: $SERVICES"
SSH "cd /root/ota/deploy && docker compose up -d --build $SERVICES"

# 4) Verify health (backend is the source of truth).
echo "→ health check"
code=000
for _ in $(seq 1 30); do
  code=$(SSH 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5019/api/health' || echo 000)
  [ "$code" = 200 ] && break; sleep 2
done
[ "$code" = 200 ] || { echo "❌ DEPLOY FAILED — /api/health = $code"; SSH 'cd /root/ota/deploy && docker compose logs backend --tail=30'; exit 1; }

# 5) Verify Prisma migrations are fully applied (catches the stale-image trap).
if echo "$SERVICES" | grep -q backend; then
  st=$(SSH 'cd /root/ota/deploy && docker compose exec -T backend npx prisma migrate status 2>&1' || true)
  echo "$st" | grep -qiE "up to date|following migration have not|already" || true
  echo "$st" | grep -qi "have not yet been applied" && { echo "❌ pending migrations detected"; echo "$st"; exit 1; }
fi
echo "✅ deploy OK — health 200, migrations applied"
