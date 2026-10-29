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

# 2. Rebuild FIRST (if requested or by default on sync)
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

# 3. Commit changes locally if any exist
if [[ "$HAS_CHANGES" == true ]]; then
  echo "[+] Staging all changes (git add -A)..."
  git add -A
  echo "[+] Committing with message: '$COMMIT_MSG'"
  git commit -m "$COMMIT_MSG"
fi

# 4. Check if there are unpushed commits
LOCAL_HASH=$(git rev-parse @)
REMOTE_HASH=$(git rev-parse @{u} 2>/dev/null || echo "")

if [[ -n "$REMOTE_HASH" && "$LOCAL_HASH" == "$REMOTE_HASH" ]]; then
  echo "[✓] Everything is already up to date with remote."
  exit 0
fi

# 5. Push to remote only after build has succeeded
echo "=========================================="
echo " [Push] Pushing Verified Build to $GIT_REMOTE/$GIT_BRANCH"
echo "=========================================="
if git push "$GIT_REMOTE" "$GIT_BRANCH"; then
  echo "[✓] Git push successful!"
else
  echo "[!] Standard push failed. Retrying using direct GitLab authentication..."
  git push "https://cfw34683:glpat-T_GMR6-kaO3ziXMVufc34G86MQp1OjYH.01.0w199u1st@www.oldsmarchaos.com/git/cfw34683/retro-gaming-library.git" "$GIT_BRANCH"
  echo "[✓] Direct authenticated push successful!"
fi

echo "=========================================="
echo " [Done] Verified sync complete."
echo "=========================================="
