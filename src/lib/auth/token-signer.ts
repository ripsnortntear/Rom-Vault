const AUTH_SECRET = process.env.AUTH_SECRET || "rom_vault_default_secret_key_8f999568411cf7ebb0f322eb7812060f";

let cachedKeyPromise: Promise<CryptoKey> | null = null;

function getHmacKey(): Promise<CryptoKey> {
  if (!cachedKeyPromise) {
    const enc = new TextEncoder();
    cachedKeyPromise = crypto.subtle.importKey(
      "raw",
      enc.encode(AUTH_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
  }
  return cachedKeyPromise;
}

export interface VerifiedSessionData {
  token: string;
  userId?: string;
  role?: "admin" | "user";
}

// In-memory LRU verification cache for ultra-fast Range requests (e.g. ROM chunk streaming)
const VERIFICATION_CACHE = new Map<string, { data: VerifiedSessionData; exp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Sign a token using HMAC-SHA256 (compatible with Edge and Node.js runtimes).
 */
export async function signSessionValue(
  tokenOrPayload: string | { userId: string; role: "admin" | "user"; token: string }
): Promise<string> {
  const payloadStr =
    typeof tokenOrPayload === "string"
      ? tokenOrPayload
      : `${tokenOrPayload.userId}:${tokenOrPayload.role}:${tokenOrPayload.token}`;

  const enc = new TextEncoder();
  const key = await getHmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payloadStr));
  const hexSignature = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${payloadStr}.${hexSignature}`;
}

/**
 * Verify and extract structured session data from a signed session value.
 * Utilizes in-memory CryptoKey caching and LRU memory caching to eliminate HMAC latency.
 */
export async function verifySessionTokenFast(
  signedValue: string
): Promise<VerifiedSessionData | null> {
  if (!signedValue || typeof signedValue !== "string") {
    return null;
  }

  // Fast cache hit
  const now = Date.now();
  const cached = VERIFICATION_CACHE.get(signedValue);
  if (cached && cached.exp > now) {
    return cached.data;
  }

  const parts = signedValue.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payload, signatureHex] = parts;
  if (!payload || !signatureHex) {
    return null;
  }

  try {
    const enc = new TextEncoder();
    const key = await getHmacKey();

    const sigBytes = new Uint8Array(
      signatureHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payload));
    if (!isValid) {
      return null;
    }

    let result: VerifiedSessionData;
    if (payload.includes(":")) {
      const [userId, role, token] = payload.split(":");
      result = {
        token: token || payload,
        userId: userId || undefined,
        role: (role === "admin" ? "admin" : "user"),
      };
    } else {
      result = { token: payload };
    }

    // Maintain reasonable cache size
    if (VERIFICATION_CACHE.size > 5000) {
      VERIFICATION_CACHE.clear();
    }
    VERIFICATION_CACHE.set(signedValue, { data: result, exp: now + CACHE_TTL_MS });

    return result;
  } catch {
    return null;
  }
}

/**
 * Verify and extract a token from a signed session value.
 */
export async function verifySignedSessionValue(signedValue: string): Promise<string | null> {
  const res = await verifySessionTokenFast(signedValue);
  return res ? res.token : null;
}
