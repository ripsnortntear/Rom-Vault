#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/var/www/html/roms"
SERVICE_NAME="retro-gaming.service"
GIT_REMOTE="origin"
GIT_BRANCH="main"

cd "$REPO_DIR"

echo "=========================================="
echo " [Sync] Checking Repository Status"
echo "=========================================="

HAS_CHANGES=false
if [[ -n $(git status --porcelain) ]]; then
  HAS_CHANGES=true
fi

# 1. Parse commit message and flags
COMMIT_MSG=""
REBUILD=false

for arg in "$@"; do
  if [[ "$arg" == "--rebuild" ]]; then
    REBUILD=true
  elif [[ -z "$COMMIT_MSG" ]]; then
    COMMIT_MSG="$arg"
  fi
done

if [[ -z "$COMMIT_MSG" ]]; then
  COMMIT_MSG="chore(sync): automated sync on $(date '+%Y-%m-%d %H:%M:%S')"
fi

# 2. Rebuild FIRST (if requested)
if [[ "$REBUILD" == true ]]; then
  echo "=========================================="
  echo " [Build] Testing Next.js Turbopack Build"
  echo "=========================================="
  npm run build
  echo "[✓] Build passed cleanly! Proceeding to commit and push..."

  echo "[+] Restarting $SERVICE_NAME..."
  sudo systemctl restart "$SERVICE_NAME"
  echo "[✓] $SERVICE_NAME successfully restarted!"
fi

# 3. Commit local changes if any exist
if [[ "$HAS_CHANGES" == true ]]; then
  echo "[+] Staging all changes (git add -A)..."
  git add -A
  echo "[+] Committing with message: '$COMMIT_MSG'"
  git commit -m "$COMMIT_MSG"
fi

# 4. Pull and rebase remote changes to avoid non-fast-forward rejects
echo "[+] Syncing upstream remote changes (git pull --rebase)..."
git pull --rebase "$GIT_REMOTE" "$GIT_BRANCH" || true

# 5. Check if local is already in sync with upstream
LOCAL_HASH=$(git rev-parse @)
REMOTE_HASH=$(git rev-parse @{u} 2>/dev/null || echo "")

if [[ -n "$REMOTE_HASH" && "$LOCAL_HASH" == "$REMOTE_HASH" ]]; then
  echo "[✓] Everything is already up to date with remote."
  exit 0
fi

# 6. Push to remote
echo "=========================================="
echo " [Push] Pushing Verified Build to $GIT_REMOTE/$GIT_BRANCH"
echo "=========================================="
if git push "$GIT_REMOTE" "$GIT_BRANCH"; then
  echo "[✓] Git push successful!"
elif [[ -n "${GIT_PUSH_URL:-}" ]]; then
  echo "[*] Standard push failed. Retrying using GIT_PUSH_URL from environment..."
  git push "$GIT_PUSH_URL" "$GIT_BRANCH"
  echo "[✓] Direct authenticated push successful!"
else
  echo "[!] Standard push failed. Please verify git credentials or set GIT_PUSH_URL in your environment."
  exit 1
fi

echo "=========================================="
echo " [Done] Verified sync complete."
echo "=========================================="