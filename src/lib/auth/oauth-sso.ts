import crypto from "crypto";

const OAUTH_CLIENT_ID = "oldsmar-gitlab-client";
const OAUTH_CLIENT_SECRET = process.env.AUTH_SECRET || "8f999568411cf7ebb0f322eb7812060fc58a3af75f36660d3f88c083f9def131";

export interface SsoUserPayload {
  userId: string;
  username: string;
  email: string;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString();
}

function signPayload(payload: any, secret: string): string {
  const data = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyPayload<T>(token: string, secret: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const parsed = JSON.parse(base64UrlDecode(data));
    if (parsed.exp && parsed.exp < Date.now()) {
      return null;
    }
    return parsed as T;
  } catch (e) {
    return null;
  }
}

export function generateAuthCode(user: SsoUserPayload): string {
  return signPayload(
    {
      ...user,
      type: "code",
      exp: Date.now() + 5 * 60 * 1000, // 5 minutes validity
    },
    OAUTH_CLIENT_SECRET
  );
}

export function verifyAuthCode(code: string): SsoUserPayload | null {
  const payload = verifyPayload<SsoUserPayload & { type: string }>(code, OAUTH_CLIENT_SECRET);
  if (!payload || payload.type !== "code") return null;
  return {
    userId: payload.userId,
    username: payload.username,
    email: payload.email,
  };
}

export function generateAccessToken(user: SsoUserPayload): string {
  return signPayload(
    {
      ...user,
      type: "token",
      exp: Date.now() + 14 * 24 * 60 * 60 * 1000, // 14 days validity
    },
    OAUTH_CLIENT_SECRET
  );
}

export function verifyAccessToken(token: string): SsoUserPayload | null {
  const payload = verifyPayload<SsoUserPayload & { type: string }>(token, OAUTH_CLIENT_SECRET);
  if (!payload || payload.type !== "token") return null;
  return {
    userId: payload.userId,
    username: payload.username,
    email: payload.email,
  };
}

export function validateClient(clientId?: string | null, clientSecret?: string | null): boolean {
  if (clientId && clientId !== OAUTH_CLIENT_ID) return false;
  if (clientSecret && clientSecret !== OAUTH_CLIENT_SECRET) return false;
  return true;
}
