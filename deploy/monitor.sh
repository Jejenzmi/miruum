#!/usr/bin/env bash
# ─────────────────────────── Uptime monitor ───────────────────────────
# Checks the public health + key endpoints; on failure alerts via Telegram
# (set TG_BOT + TG_CHAT) and logs. Runs on the VPS via cron every 2 minutes.
# NOTE: a same-host monitor can't alert if the whole VPS/network is down —
# pair it with an EXTERNAL monitor (e.g. UptimeRobot, free) for infra-level
# outages. This one catches app/container crashes while the box is up, and the
# docker healthchecks auto-restart unhealthy containers.
#
# Cron:  */2 * * * * TG_BOT=xxx TG_CHAT=yyy /root/ota/deploy/monitor.sh
set -uo pipefail
LOG="/root/ota-uptime.log"
declare -a CHECKS=(
  "https://api.miruum.id/api/health|\"ok\":true"
  "https://miruum.id/|<"
)
UA="Mozilla/5.0 (compatible; MiruumMonitor/1.0)"
fail=""
for c in "${CHECKS[@]}"; do
  url="${c%%|*}"; needle="${c##*|}"
  # Capture the body first (no pipe) — piping to `grep -q` triggers SIGPIPE on
  # large pages under `set -o pipefail`, which would look like a false outage.
  body="$(curl -sf --max-time 15 -A "$UA" "$url" 2>/dev/null)" || { fail="$fail\n• $url (unreachable)"; continue; }
  case "$body" in
    *"$needle"*) : ;;                       # healthy
    *) fail="$fail\n• $url (bad response)" ;;
  esac
done

ts="$(date '+%Y-%m-%d %H:%M:%S')"
if [ -n "$fail" ]; then
  msg="🔴 Miruum DOWN ($ts):$fail"
  echo -e "$msg" >> "$LOG"
  if [ -n "${TG_BOT:-}" ] && [ -n "${TG_CHAT:-}" ]; then
    curl -s "https://api.telegram.org/bot${TG_BOT}/sendMessage" --data-urlencode "chat_id=${TG_CHAT}" --data-urlencode "text=$(echo -e "$msg")" >/dev/null || true
  fi
  exit 1
else
  # heartbeat once an hour (minute 00) so the log shows it's alive
  [ "$(date +%M)" = "00" ] && echo "🟢 ok $ts" >> "$LOG"
  exit 0
fi
