#!/bin/bash
set -e

# Deploy Studara API + Admin UI (this workspace) to the VPS behind api.radar-mr.com

SERVER_IP="5.189.153.144"
SSH_KEY="$HOME/.ssh/studara_deploy"
if [ ! -f "$SSH_KEY" ]; then
  SSH_KEY="$HOME/.ssh/tawjeeh_deploy"
fi
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ADMIN_UI_DIR="$WORKSPACE_ROOT/admin"
ECOSYSTEM_FILE="$BACKEND_DIR/deploy/ecosystem.config.cjs"

echo "=== Deploying Studara (API + Admin UI) to $SERVER_IP ==="
echo "Workspace root: $WORKSPACE_ROOT"
echo "Backend dir:    $BACKEND_DIR"
echo "Admin UI dir:   $ADMIN_UI_DIR"

# Build locally first
cd "$BACKEND_DIR"
npm install
npm run build

if [ -f "$ADMIN_UI_DIR/package.json" ]; then
  echo "=== Building admin UI (Vite) ==="
  cd "$ADMIN_UI_DIR"
  npm install
  npm run build
fi

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

# Sync ecosystem config so PM2 always knows correct cwd
if [ -f "$ECOSYSTEM_FILE" ]; then
  rsync -avz -e "ssh $SSH_OPTS" \
    "$ECOSYSTEM_FILE" \
    root@$SERVER_IP:/var/www/studara/api/ecosystem.config.cjs
fi

# Sync admin UI dist/
if [ -d "$ADMIN_UI_DIR/dist" ]; then
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

# Start/reload the API (PM2 must already be installed on the VPS)
if [ -f /var/www/studara/api/ecosystem.config.cjs ]; then
  pm2 startOrRestart /var/www/studara/api/ecosystem.config.cjs --update-env
else
  pm2 describe studara-api >/dev/null 2>&1 && pm2 reload studara-api --update-env || pm2 start dist/index.js --name studara-api
fi
pm2 save
ENDSSH

echo "=== Deploy done! API should be live on https://api.radar-mr.com/api/v1 ==="
echo "=== Admin UI should be served at https://api.radar-mr.com/admin (via Nginx) ==="

