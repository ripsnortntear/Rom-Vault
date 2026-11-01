#!/usr/bin/env bash
# ==============================================================================
# ROM Vault - Manual Library Rescan CLI Tool
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Extract admin secret from .env.local or process environment
AUTH_SECRET="${AUTH_SECRET:-}"
if [ -z "${AUTH_SECRET}" ] && [ -f "${ROOT_DIR}/.env.local" ]; then
  AUTH_SECRET=$(grep -E "^(AUTH_SECRET|SESSION_SECRET)=" "${ROOT_DIR}/.env.local" | head -n 1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r')
fi

if [ -z "${AUTH_SECRET}" ]; then
  echo "[-] Error: Could not resolve AUTH_SECRET or SESSION_SECRET from .env.local" >&2
  exit 1
fi

PORT="${PORT:-39254}"
URL="http://127.0.0.1:${PORT}/roms/api/admin/scan"

echo "[*] Triggering manual filesystem scan at ${URL}..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${URL}" \
  -H "Authorization: Bearer ${AUTH_SECRET}" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "${RESPONSE}" | tail -n1)
BODY=$(echo "${RESPONSE}" | sed '$d')

if [ "${HTTP_CODE}" -eq 200 ]; then
  echo "[✓] Scan completed successfully (HTTP 200)!"
  if command -v jq >/dev/null 2>&1; then
    echo "${BODY}" | jq '{message, stats}'
  else
    echo "${BODY}"
  fi
else
  echo "[-] Scan failed with HTTP status ${HTTP_CODE}:" >&2
  echo "${BODY}" >&2
  exit 1
fi
