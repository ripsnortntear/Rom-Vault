import fs from "node:fs";
import path from "node:path";

// Ensure SESSION_SECRET is loaded from .env.local if not already in environment
if (!process.env.SESSION_SECRET) {
  try {
    const envFile = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...vals] = trimmed.split("=");
      if (key && vals.length) {
        process.env[key] = vals.join("=");
      }
    }
  } catch (err) {
    console.error("Warning: Could not read .env.local", err);
  }
}

// Now dynamically import the session signer & verifier after env is loaded
const sessionPath = "../src/lib/auth/session.ts";
const {
  signSessionToken,
  verifySessionTokenFast,
} = (await import(sessionPath)) as typeof import("../src/lib/auth/session");

async function runTests() {
  console.log("=== ROM Vault Session Token Signer & Verifier Smoke Test ===");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`, details || "");
      failed++;
    }
  }

  // 1. Sign a test payload for an admin user (userId: 1, role: "admin")
  const adminPayload = {
    userId: 1,
    username: "admin_tester",
    role: "admin" as const,
  };

  const validToken = await signSessionToken(adminPayload, 3600); // 1 hour TTL
  console.log(`Generated Token: ${validToken.slice(0, 32)}... (len: ${validToken.length})`);

  // Verify valid token
  const verifyResult = await verifySessionTokenFast(validToken);
  assert(
    verifyResult.valid === true &&
      verifyResult.payload.userId === 1 &&
      verifyResult.payload.username === "admin_tester" &&
      verifyResult.payload.role === "admin",
    "Test 1: Verify valid admin token returns valid: true with matching payload",
    verifyResult
  );

  // 2. Alter a single character in the payload; confirm valid: false, reason: "invalid_signature"
  const [base64Payload, signature] = validToken.split(".");
  // Corrupt one character in the payload
  const corruptedPayload =
    (base64Payload[0] === "a" ? "b" : "a") + base64Payload.slice(1);
  const corruptedToken = `${corruptedPayload}.${signature}`;

  const corruptResult = await verifySessionTokenFast(corruptedToken);
  assert(
    corruptResult.valid === false && corruptResult.reason === "invalid_signature",
    "Test 2: Altered payload character returns valid: false, reason: 'invalid_signature'",
    corruptResult
  );

  // 3. Generate a token with a negative TTL (ttlSeconds: -10); confirm valid: false, reason: "expired"
  const expiredToken = await signSessionToken(adminPayload, -10);
  const expiredResult = await verifySessionTokenFast(expiredToken);
  assert(
    expiredResult.valid === false && expiredResult.reason === "expired",
    "Test 3: Negative TTL token returns valid: false, reason: 'expired'",
    expiredResult
  );

  // 4. Malformed token check
  const malformedResult1 = await verifySessionTokenFast("invalid-token-no-dot");
  assert(
    malformedResult1.valid === false && malformedResult1.reason === "malformed",
    "Test 4a: Token without delimiter returns reason: 'malformed'",
    malformedResult1
  );

  const malformedResult2 = await verifySessionTokenFast("part1.part2.part3");
  assert(
    malformedResult2.valid === false && malformedResult2.reason === "malformed",
    "Test 4b: Token with too many parts returns reason: 'malformed'",
    malformedResult2
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution threw error:", err);
  process.exit(1);
});
