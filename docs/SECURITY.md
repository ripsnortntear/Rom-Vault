# ROM Vault — Security Controls & Hardening Guide

> [!IMPORTANT]
> **Notice on Generalized Placeholders**:
> All domain names, IP addresses, and example tokens in this documentation are generalized templates.

---

## 1. Threat Model & Defensive Mitigations

ROM Vault implements layered security controls across the presentation, application, proxy, and data layers:

### A. Authentication & Session Security (SEC-01 & SEC-03)
- **HMAC-SHA256 Token Signatures**: Session tokens are cryptographically signed using Web Crypto API and secret keys with a minimum length of 32 characters.
- **Stateful Revocation Enforcement**: Calling logout immediately deletes the token record from MariaDB's `auth_tokens` table. `validateSessionToken()` queries active database state, invalidating revoked or suspended sessions immediately.
- **Anti-Spoofing Identity Guarantees**: Raw incoming request headers (such as `x-user-id` or `x-user-role`) are never trusted for authentication; identity resolves strictly from server-validated sessions.

### B. Trusted Proxy IP Extraction (SEC-04)
- Client IP addresses are resolved through a hierarchy that prevents spoofing:
  1. `CF-Connecting-IP` (validated edge header if running behind Cloudflare).
  2. `X-Real-IP` (configured by upstream Nginx).
  3. Rightmost entry from `X-Forwarded-For` to neutralize client-injected prefixes.
  4. Fallback to `127.0.0.1` in local environments.

### C. Mutex-Guarded Filesystem Operations (SEC-05)
- Admin filesystem rescan endpoints are guarded by an in-memory atomic lock (`acquireScanLock`), rejecting overlapping scan triggers with `409 Conflict` to prevent disk I/O exhaustion.

### D. Strict Memory Card & Save State Isolation (SEC-06 & SEC-09)
- Save uploads strictly validate that the payload structure matches the target gaming platform:
  - PS1 memory cards must match 131,072 bytes.
  - PS2 memory cards must match 8,650,752 bytes.
  - Non-PlayStation SRAM saves cannot accept Sony memory card binaries.
- All sync and download operations enforce ownership checks against `session.user.id`.
- Path traversal sequences (`..`, `/`, `\`, and null bytes) are stripped and rejected.

### E. Protocol Whitelisting & Input Sanitization (SEC-02 & SEC-07)
- User avatars and score proof links are validated with Zod schemas enforcing strict `http:` and `https:` URL protocols. Dangerous pseudo-protocols (`javascript:`, `data:`, `vbscript:`, `file:`) are rejected.
- Local avatar assets are restricted to safe relative paths (e.g. `/avatars/default.png`), blocking directory traversal.

### F. CORS Origin Hardening (SEC-08)
- Overly permissive wildcard CORS (`*`) has been replaced with strict origin whitelisting:
  - Dynamic matching against authorized domains (`https://your-domain.example.com`).
  - Strict preflight handling (`OPTIONS` returning `204 No Content` with configured origins and credentials).

---

## 2. Automated Security Testing

The codebase includes automated security test suites and static code analysis:

```bash
# 1. Hermetic Vitest Security Suite (30+ test cases covering SEC-01 through SEC-12)
npm test

# 2. Automated Static Security Audit Scanner
./audit-scan.sh
```

Both tools must complete with 0 failures and 0 vulnerability warnings before code is merged into production.
