#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rotate-jwt.sh — Graceful JWT secret rotation (zero-downtime)
#
# Usage:
#   bash /opt/studara/deploy/rotate-jwt.sh
#
# Schedule (cron — runs every 90 days at 03:00):
#   0 3 1 */3 * /opt/studara/deploy/rotate-jwt.sh >> /var/log/studara-jwt-rotate.log 2>&1
#
# How it works:
#   1. Generates a new 64-byte hex JWT_SECRET
#   2. Saves the current JWT_SECRET as JWT_SECRET_OLD  (graceful transition window)
#   3. Injects both into api.env
#   4. Reloads PM2 without killing existing workers (zero-downtime)
#   5. After the next rotation, JWT_SECRET_OLD is replaced → tokens from 2 cycles ago expire
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/studara/deploy/api.env}"
PM2_APP="${PM2_APP:-studara-api}"
LOG_TAG="[jwt-rotate $(date '+%Y-%m-%d %H:%M:%S')]"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "$LOG_TAG ERROR: env file not found at $ENV_FILE" >&2
  exit 1
fi

# ── 1. Read current secret ────────────────────────────────────────────────────
CURRENT_SECRET=$(grep -E '^JWT_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')

if [[ -z "$CURRENT_SECRET" ]]; then
  echo "$LOG_TAG ERROR: JWT_SECRET not found in $ENV_FILE" >&2
  exit 1
fi

# ── 2. Generate new secret ────────────────────────────────────────────────────
NEW_SECRET=$(openssl rand -hex 64)

echo "$LOG_TAG New secret generated (first 8 chars): ${NEW_SECRET:0:8}…"

# ── 3. Backup env file ────────────────────────────────────────────────────────
cp "$ENV_FILE" "${ENV_FILE}.bak.$(date '+%Y%m%d%H%M%S')"

# ── 4. Update api.env ─────────────────────────────────────────────────────────
# Remove old JWT_SECRET and JWT_SECRET_OLD lines, then append fresh values
TMPFILE=$(mktemp)
grep -vE '^(JWT_SECRET|JWT_SECRET_OLD)=' "$ENV_FILE" > "$TMPFILE"
{
  echo "JWT_SECRET=${NEW_SECRET}"
  echo "JWT_SECRET_OLD=${CURRENT_SECRET}"
} >> "$TMPFILE"
mv "$TMPFILE" "$ENV_FILE"

echo "$LOG_TAG api.env updated — JWT_SECRET rotated, old secret preserved as JWT_SECRET_OLD"

# ── 5. Reload PM2 without downtime ───────────────────────────────────────────
if command -v pm2 &>/dev/null; then
  pm2 reload "$PM2_APP" --update-env
  echo "$LOG_TAG PM2 '$PM2_APP' reloaded with new environment"
else
  echo "$LOG_TAG WARNING: pm2 not found. Restart the API manually to apply the new secret."
fi

# ── 6. Clean up backups older than 180 days ──────────────────────────────────
find "$(dirname "$ENV_FILE")" -name "api.env.bak.*" -mtime +180 -delete 2>/dev/null || true

echo "$LOG_TAG JWT rotation complete ✓"
