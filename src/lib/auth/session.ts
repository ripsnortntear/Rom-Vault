import "server-only";

async function getCookieStore() {
  const { cookies } = await import("next/headers");
  return await cookies();
}
import type { AuthSession } from "@/types/auth";

export const SESSION_COOKIE_NAME = process.env.AUTH_SESSION_COOKIE_NAME || "rom_vault_session";

// Validate session secret on startup
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be set and at least 32 characters long");
}

export interface SessionPayload {
  userId: number | string;
  username: string;
  role: "admin" | "user";
  sessionId?: string; // Optional DB session tracking ID
  exp: number; // Epoch timestamp in milliseconds
  iat: number; // Epoch timestamp in milliseconds
}

export type SessionVerifyResult =
  | { valid: true; payload: SessionPayload }
  | { valid: false; reason: "expired" | "invalid_signature" | "malformed" };

// In-memory CryptoKey cache across hot invocations
let cachedKey: CryptoKey | null = null;

/**
 * Retrieve cached CryptoKey instance or import from SESSION_SECRET.
 */
export async function getSigningKey(): Promise<CryptoKey> {
  if (cachedKey) {
    return cachedKey;
  }
  const encoder = new TextEncoder();
  cachedKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return cachedKey;
}

/**
 * Sign a session payload using HMAC-SHA256 with URL-safe base64 encoding without padding.
 * Default TTL: 7 days (60 * 60 * 24 * 7 seconds).
 */
export async function signSessionToken(
  payload: Omit<SessionPayload, "iat" | "exp">,
  ttlSeconds: number = 60 * 60 * 24 * 7
): Promise<string> {
  const key = await getSigningKey();
  const now = Date.now();
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds * 1000,
  };

  const jsonString = JSON.stringify(fullPayload);
  const base64urlPayload = Buffer.from(jsonString, "utf8").toString("base64url");
  const payloadBytes = new TextEncoder().encode(base64urlPayload);

  const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);
  const base64urlSignature = Buffer.from(signature).toString("base64url");

  return `${base64urlPayload}.${base64urlSignature}`;
}

/**
 * Fast-path in-memory cryptographic verification of a session token without database lookup.
 */
export async function verifySessionTokenFast(token: string): Promise<SessionVerifyResult> {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "malformed" };
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: "malformed" };
  }

  const [base64urlPayload, base64urlSignature] = parts;

  try {
    const key = await getSigningKey();
    const payloadBytes = new TextEncoder().encode(base64urlPayload);
    const signatureBytes = Buffer.from(base64urlSignature, "base64url");

    const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, payloadBytes);
    if (!isValid) {
      return { valid: false, reason: "invalid_signature" };
    }

    const jsonString = Buffer.from(base64urlPayload, "base64url").toString("utf8");
    const payload = JSON.parse(jsonString) as SessionPayload;

    if (!payload || typeof payload !== "object" || typeof payload.exp !== "number") {
      return { valid: false, reason: "malformed" };
    }

    if (Date.now() > payload.exp) {
      return { valid: false, reason: "expired" };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "malformed" };
  }
}

/**
 * Safe cookie extraction helper parsing session token from raw cookie string or Next.js cookies map.
 */
export async function getSessionFromCookie(
  cookieInput: string | null | undefined | { get: (name: string) => { value: string } | undefined }
): Promise<SessionPayload | null> {
  if (!cookieInput) return null;

  let token: string | undefined;

  if (typeof cookieInput === "object" && typeof cookieInput.get === "function") {
    token =
      cookieInput.get("session_token")?.value ||
      cookieInput.get(SESSION_COOKIE_NAME)?.value ||
      cookieInput.get("rom_vault_session")?.value;
  } else if (typeof cookieInput === "string") {
    const cookiesArr = cookieInput.split(";");
    for (const c of cookiesArr) {
      const [rawName, ...valParts] = c.trim().split("=");
      const val = valParts.join("=");
      if (
        rawName === "session_token" ||
        rawName === SESSION_COOKIE_NAME ||
        rawName === "rom_vault_session"
      ) {
        token = decodeURIComponent(val);
        break;
      }
    }
  }

  if (!token) return null;

  const result = await verifySessionTokenFast(token);
  if (result.valid) {
    return result.payload;
  }
  return null;
}

/**
 * Zero-DB session validator returning standard AuthSession interface.
 */
export async function validateSession(rawOrSignedToken: string): Promise<AuthSession | null> {
  const result = await verifySessionTokenFast(rawOrSignedToken);
  if (!result.valid) return null;

  return {
    user: {
      id: String(result.payload.userId),
      username: result.payload.username,
      email: `${result.payload.username}@local.vault`,
      role: result.payload.role,
      account_status: "active",
      displayName: result.payload.username,
      avatarUrl: null,
      quotaDaily: result.payload.role === "admin" ? null : 50,
      quotaUsedToday: 0,
    },
    expiresAt: new Date(result.payload.exp).toISOString(),
  };
}

/**
 * Get current session from Next.js cookies (zero DB overhead).
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await getCookieStore();
    const payload = await getSessionFromCookie(cookieStore);
    if (!payload) {
      return null;
    }
    return {
      user: {
        id: String(payload.userId),
        username: payload.username,
        email: `${payload.username}@local.vault`,
        role: payload.role,
        account_status: "active",
        displayName: payload.username,
        avatarUrl: null,
        quotaDaily: payload.role === "admin" ? null : 50,
        quotaUsedToday: 0,
      },
      expiresAt: new Date(payload.exp).toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Set HTTP-only session cookie (cryptographically signed HMAC).
 */
export async function setSessionCookie(
  tokenOrSigned: string,
  expiresAt?: Date,
  userInfo?: { userId: string | number; role: "admin" | "user"; username?: string }
): Promise<string> {
  const cookieStore = await getCookieStore();
  const isHttps = process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false;

  let tokenToSet: string;
  let expires: Date;

  if (tokenOrSigned.includes(".")) {
    tokenToSet = tokenOrSigned;
    const verified = await verifySessionTokenFast(tokenToSet);
    expires = verified.valid
      ? new Date(verified.payload.exp)
      : (expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  } else if (userInfo) {
    tokenToSet = await signSessionToken({
      userId: userInfo.userId,
      username: userInfo.username || String(userInfo.userId),
      role: userInfo.role,
      sessionId: tokenOrSigned,
    });
    expires = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  } else {
    tokenToSet = await signSessionToken({
      userId: tokenOrSigned,
      username: "user",
      role: "user",
      sessionId: tokenOrSigned,
    });
    expires = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  const cookieOptions = {
    httpOnly: true,
    secure: isHttps || process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/roms",
    expires,
  };

  cookieStore.set(SESSION_COOKIE_NAME, tokenToSet, cookieOptions);
  cookieStore.set("session_token", tokenToSet, cookieOptions);

  return tokenToSet;
}

/**
 * Delete session cookies.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await getCookieStore();
  const isHttps = process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false;
  const cookieOptions = {
    httpOnly: true,
    secure: isHttps || process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/roms",
    expires: new Date(0),
    maxAge: 0,
  };

  cookieStore.set(SESSION_COOKIE_NAME, "", cookieOptions);
  cookieStore.set("session_token", "", cookieOptions);
  cookieStore.set("rom_vault_session", "", cookieOptions);
}
