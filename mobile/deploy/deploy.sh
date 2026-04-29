#!/bin/bash
set -e
SERVER_IP="5.189.153.144"
SSH_KEY="$HOME/.ssh/studara_deploy"
if [ ! -f "$SSH_KEY" ]; then
  SSH_KEY="$HOME/.ssh/tawjeeh_deploy"
fi
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../../backend" && pwd)"
ADMIN_UI_DIR="$(cd "$SCRIPT_DIR/../../admin" && pwd)"
ECOSYSTEM_FILE="$SCRIPT_DIR/ecosystem.config.js"
API_ENV_FILE="$SCRIPT_DIR/api.env"

echo "=== Deploying Studara (backend + admin UI) to $SERVER_IP ==="
echo "Backend dir: $BACKEND_DIR"
echo "Admin UI dir: $ADMIN_UI_DIR"

# Build backend locally first
cd "$BACKEND_DIR"
npm install
npm run build

# Create app directory on server
ssh $SSH_OPTS root@$SERVER_IP "mkdir -p /var/www/studara/api /var/www/studara/admin"

# Sync API files
rsync -avz -e "ssh $SSH_OPTS" \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude .env.* \
  --exclude uploads \
  "$BACKEND_DIR/" \
  root@$SERVER_IP:/var/www/studara/api/

# Sync ecosystem config so PM2 always knows the correct cwd
if [ -f "$ECOSYSTEM_FILE" ]; then
  rsync -avz -e "ssh $SSH_OPTS" \
    "$ECOSYSTEM_FILE" \
    root@$SERVER_IP:/var/www/studara/api/ecosystem.config.js
fi

# Optional: sync deploy/api.env if you created it (api.env.example is NOT used)
if [ -f "$API_ENV_FILE" ]; then
  rsync -avz -e "ssh $SSH_OPTS" \
    "$API_ENV_FILE" \
    root@$SERVER_IP:/var/www/studara/api/deploy/api.env
fi

# Build admin UI locally (Vite) and sync dist/
if [ -f "$ADMIN_UI_DIR/package.json" ]; then
  cd "$ADMIN_UI_DIR"
  npm install
  npm run build
  rsync -avz -e "ssh $SSH_OPTS" \
    "$ADMIN_UI_DIR/dist/" \
    root@$SERVER_IP:/var/www/studara/admin/
fi

# On server: install deps, run migrations, start API
ssh $SSH_OPTS root@$SERVER_IP << 'ENDSSH'
cd /var/www/studara/api
npm install --production
# Run DB migrations using DATABASE_URL from .env
DB_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
for f in $(ls src/db/migrations/*.sql | sort); do
  echo "Running migration: $f"
  psql "$DB_URL" -f "$f" 2>/dev/null || true
done
# Delete legacy tawjeeh-api process if it still exists (old name before rename)
pm2 delete tawjeeh-api 2>/dev/null || true
# Start/reload studara-api using ecosystem.config.js — guarantees cwd=/var/www/studara/api
pm2 startOrRestart /var/www/studara/api/ecosystem.config.js --update-env
pm2 save
ENDSSH

echo "=== Deploy done! API: http://$SERVER_IP:3000 ==="
echo "=== Admin UI should be served at: https://api.radar-mr.com/admin ==="
