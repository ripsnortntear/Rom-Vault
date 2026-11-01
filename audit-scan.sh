#!/usr/bin/env bash
# ==============================================================================
# ROM Vault Platform - Automated Static Security Scanner
# Target: /var/www/html/roms
# Focus: Residual Vulnerabilities (SQLi, Command Injection, Traversal, Auth Bypass)
# ==============================================================================

set -euo pipefail

TARGET_DIR="/var/www/html/roms"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

TOTAL_FINDINGS=0

banner() {
  echo -e "${CYAN}================================================================${NC}"
  echo -e "${CYAN}  ROM Vault Platform Static Security Audit Scanner               ${NC}"
  echo -e "${CYAN}  Directory: ${TARGET_DIR}                                      ${NC}"
  echo -e "${CYAN}================================================================${NC}\n"
}

check_rule() {
  local title="$1"
  local severity="$2"
  local pattern="$3"
  local file_pattern="$4"
  local exclude_pattern="${5:-}"

  echo -e "${YELLOW}[*] Testing: ${title} (${severity})${NC}"

  local matches=""
  if [ -n "$exclude_pattern" ]; then
    matches=$(grep -EnI -r "$pattern" "$TARGET_DIR" --include="$file_pattern" --exclude-dir="node_modules" --exclude-dir=".next" --exclude-dir=".git" 2>/dev/null | grep -vE "$exclude_pattern" || true)
  else
    matches=$(grep -EnI -r "$pattern" "$TARGET_DIR" --include="$file_pattern" --exclude-dir="node_modules" --exclude-dir=".next" --exclude-dir=".git" 2>/dev/null || true)
  fi

  if [ -n "$matches" ]; then
    echo -e "${RED}[!] POTENTIAL VULNERABILITY FOUND:${NC}"
    echo "$matches" | head -n 15
    local count
    count=$(echo "$matches" | wc -l)
    if [ "$count" -gt 15 ]; then
      echo -e "${RED}    ...and $((count - 15)) more matching lines.${NC}"
    fi
    echo ""
    TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
  else
    echo -e "${GREEN}[+] OK: No patterns matched.${NC}\n"
  fi
}

if [ ! -d "$TARGET_DIR" ]; then
  echo -e "${RED}[-] Error: Target directory ${TARGET_DIR} not found.${NC}"
  exit 1
fi

banner

# ------------------------------------------------------------------------------
# 1. Unsanitized Header Access Controls (SEC-01 Regression Check)
# ------------------------------------------------------------------------------
check_rule \
  'Client-Injected Auth Headers (x-user-id / x-user-role)' \
  'CRITICAL' \
  'headers\.get\(["'\''"](x-user-id|x-user-role)["'\''"]\)' \
  '*.ts'

# ------------------------------------------------------------------------------
# 2. SQL String Interpolation / Concatenation
# ------------------------------------------------------------------------------
check_rule \
  'SQL Query String Interpolation (`SELECT ... ${var}`)' \
  'CRITICAL' \
  '(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE).*`.*\$' \
  '*.ts' \
  '(`.*WHERE id = \?`|logger|console\.log)'

check_rule \
  'SQL Query Concatenation (query("SELECT ... " + var))' \
  'CRITICAL' \
  'db\.(query|execute)\(.*(\+|concat).*' \
  '*.ts'

# ------------------------------------------------------------------------------
# 3. Arbitrary Command Execution (chdman, dd, shell spawns)
# ------------------------------------------------------------------------------
check_rule \
  'Command Injection / Shell Execution via child_process' \
  'HIGH' \
  '(exec|execSync|spawn|spawnSync)\(`[^`]*\$' \
  '*.ts'

# ------------------------------------------------------------------------------
# 4. Path Traversal & Insecure Direct File Operations
# ------------------------------------------------------------------------------
check_rule \
  'Direct fs ReadStream / ReadFile with Request Parameters' \
  'HIGH' \
  '(createReadStream|readFileSync|readFile)\([^)]*(params|query|body|req\.)' \
  '*.ts'

check_rule \
  'path.join / path.resolve without Traversal Neutralization' \
  'MEDIUM' \
  'path\.(join|resolve)\([^)]*(\.\.|\$\{params|\$\{id)' \
  '*.ts'

# ------------------------------------------------------------------------------
# 5. Dangerous Insecure URI Pseudo-Protocols (SEC-02 Regression Check)
# ------------------------------------------------------------------------------
check_rule \
  'Permissive Zod URL Validation without Protocol Refinement' \
  'MEDIUM' \
  'z\.string\(\)\.url\(\)' \
  '*.ts' \
  '(refine|protocol ===)'

check_rule \
  'Direct Dynamic Anchor Tag Href Binding' \
  'HIGH' \
  '<a[[:space:]]+[^>]*href=\{[^}]*(proofUrl|avatarUrl|url|link)[^}]*\}' \
  '*.tsx' \
  '(safeProofUrl|safeAvatarSrc)'

# ------------------------------------------------------------------------------
# 6. Stateless Token Verification Callers (SEC-03 Regression Check)
# ------------------------------------------------------------------------------
check_rule \
  'verifySessionTokenFast without Accompanying DB Check' \
  'MEDIUM' \
  'verifySessionTokenFast\(' \
  '*.ts' \
  '(session\.ts|validateSessionToken)'

# ------------------------------------------------------------------------------
# 7. Unverified Client IP Ingestion (SEC-04 Regression Check)
# ------------------------------------------------------------------------------
check_rule \
  'Direct Ingestion of Raw x-forwarded-for Header' \
  'HIGH' \
  'headers\.get\(["'\''"]x-forwarded-for["'\''"]\)' \
  '*.ts' \
  '(getTrustedClientIp|ip\.ts)'

# ------------------------------------------------------------------------------
# 8. Overly Permissive Global CORS Configurations (SEC-08 Regression Check)
# ------------------------------------------------------------------------------
check_rule \
  'Wildcard Access-Control-Allow-Origin' \
  'LOW' \
  'Access-Control-Allow-Origin["'\''"][[:space:]]*,[[:space:]]*["'\''"]\*["'\''"]' \
  '*.ts'

# ------------------------------------------------------------------------------
# Summary Output
# ------------------------------------------------------------------------------
echo -e "${CYAN}----------------------------------------------------------------${NC}"
if [ "$TOTAL_FINDINGS" -eq 0 ]; then
  echo -e "${GREEN}[+] Scan Complete: 0 vulnerability patterns detected.${NC}"
else
  echo -e "${RED}[!] Scan Complete: ${TOTAL_FINDINGS} check(s) flagged potential issues.${NC}"
  echo -e "${YELLOW}    Review flagged occurrences manually to verify mitigations.${NC}"
fi
echo -e "${CYAN}----------------------------------------------------------------${NC}"

exit "$TOTAL_FINDINGS"
