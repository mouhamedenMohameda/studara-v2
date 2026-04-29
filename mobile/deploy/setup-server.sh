#!/bin/bash
set -e

echo "=== 1. System update ==="
apt-get update -y && apt-get upgrade -y

echo "=== 2. Install Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "=== 3. Install PostgreSQL ==="
apt-get install -y postgresql postgresql-contrib

echo "=== 4. Install nginx ==="
apt-get install -y nginx

echo "=== 5. Install PM2 ==="
npm install -g pm2

echo "=== 6. Install git ==="
apt-get install -y git

echo "=== 7. Setup PostgreSQL ==="
sudo -u postgres psql -c "CREATE USER studara WITH PASSWORD 'Studara@2026';"
sudo -u postgres psql -c "CREATE DATABASE studara OWNER studara;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE studara TO studara;"

echo "=== Done! ==="
node -v && npm -v && psql --version && nginx -v
