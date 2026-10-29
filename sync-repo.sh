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

# Check if there are any working tree changes or untracked files
if [[ -z $(git status --porcelain) ]]; then
  echo "[*] Working directory is clean. Checking for unpushed commits..."
  LOCAL_HASH=$(git rev-parse @)
  REMOTE_HASH=$(git rev-parse @{u} 2>/dev/null || echo "")

  if [[ -n "$REMOTE_HASH" && "$LOCAL_HASH" == "$REMOTE_HASH" ]]; then
    echo "[✓] Everything is already committed and up to date with remote."
    exit 0
  fi
else
  # Stage all files
  echo "[+] Staging all changes (git add -A)..."
  git add -A

  # Build commit message
  if [[ $# -gt 0 ]]; then
    COMMIT_MSG="$*"
  else
    COMMIT_MSG="chore(sync): automated sync on $(date '+%Y-%m-%d %H:%M:%S')"
  fi

  echo "[+] Committing with message: '$COMMIT_MSG'"
  git commit -m "$COMMIT_MSG"
fi

# Push to remote branch
echo "[+] Pushing changes to $GIT_REMOTE/$GIT_BRANCH..."
if git push "$GIT_REMOTE" "$GIT_BRANCH"; then
  echo "[✓] Git push successful!"
else
  echo "[!] Standard push failed. Retrying using direct GitLab authentication..."
  git push "https://cfw34683:glpat-T_GMR6-kaO3ziXMVufc34G86MQp1OjYH.01.0w199u1st@www.oldsmarchaos.com/git/cfw34683/retro-gaming-library.git" "$GIT_BRANCH"
  echo "[✓] Direct authenticated push successful!"
fi

# Optional build and service reload
if [[ "${1:-}" == "--rebuild" || "${2:-}" == "--rebuild" ]]; then
  echo "=========================================="
  echo " [Build] Building Next.js & Restarting"
  echo "=========================================="
  npm run build
  sudo systemctl restart "$SERVICE_NAME"
  echo "[✓] $SERVICE_NAME successfully restarted!"
fi

echo "=========================================="
echo " [Done] Sync complete."
echo "=========================================="
