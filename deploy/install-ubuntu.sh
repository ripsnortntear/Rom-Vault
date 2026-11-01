#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="retro-gaming"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
PORT="39254"

echo "==> [1/4] Installing Node.js dependencies in ${APP_DIR}..."
cd "${APP_DIR}"
npm ci

echo "==> [2/4] Building production Next.js bundle (basePath: /roms)..."
npm run build

echo "==> [3/4] Installing systemd service (${SERVICE_FILE}) on port ${PORT}..."
sudo tee "${SERVICE_FILE}" > /dev/null <<EOF
[Unit]
Description=ROM Vault Retro Gaming Interface (Next.js on port ${PORT})
After=network.target

[Service]
Type=simple
User=${SUDO_USER:-$USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=STORAGE_ROOT=${STORAGE_ROOT:-/mnt/storage/oldsmarchaos.com/roms}
ExecStart=$(command -v npm) run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "==> [4/4] Enabling and starting ${SERVICE_NAME}.service..."
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

echo ""
echo "=================================================================="
echo " ROM Vault is running on http://127.0.0.1:${PORT}/roms"
echo " Service status: sudo systemctl status ${SERVICE_NAME}"
echo " Add deploy/nginx-roms.conf to your Nginx server block, then run:"
echo "   sudo nginx -t && sudo systemctl reload nginx"
echo "=================================================================="
