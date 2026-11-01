import { describe, it, expect } from "vitest";
import {
  isSafeHttpUrl,
  getSafeHttpUrl,
  validateSaveFormatForPlatform,
  avatarUrlSchema,
  isSafeAvatarUrl,
  getSafeAvatarUrl,
} from "./lib/security";
import { getClientIp, getTrustedClientIp } from "./lib/ip";
import { submitScoreSchema } from "./app/actions/scores";
import { signSessionToken, validateSessionToken, verifySessionTokenFast } from "./lib/auth/session";
import { acquireScanLock, releaseScanLock, isScanActive } from "./lib/scanner";

describe("Filesystem Rescan Concurrency Lock (Mutex)", () => {
  it("enforces mutual exclusion when rescan is active", () => {
    // Ensure clean initial state
    releaseScanLock();
    expect(isScanActive()).toBe(false);

    // 1. Acquire initial lock
    const firstAcquire = acquireScanLock();
    expect(firstAcquire).toBe(true);
    expect(isScanActive()).toBe(true);

    // 2. Second concurrent acquire fails
    const secondAcquire = acquireScanLock();
    expect(secondAcquire).toBe(false);

    // 3. Releasing lock clears the guard
    releaseScanLock();
    expect(isScanActive()).toBe(false);

    // 4. Can acquire again after release
    expect(acquireScanLock()).toBe(true);
    releaseScanLock();
  });
});

describe("Stateful Session Revocation", () => {
  it("rejects mathematically valid HMAC tokens that are not present in auth_tokens", async () => {
    // 1. Sign a token with a random session ID not in the database
    const token = await signSessionToken({
      userId: "test-user-999",
      username: "ghost_user",
      role: "user",
      sessionId: "random-non-existent-session-token-id-12345",
    });

    // 2. Stateless HMAC check passes
    const fastCheck = await verifySessionTokenFast(token);
    expect(fastCheck.valid).toBe(true);

    // 3. Stateful database check fails because token is not active in auth_tokens
    const statefulCheck = await validateSessionToken(token);
    expect(statefulCheck).toBeNull();
  });
});

describe("submitScoreSchema validation", () => {
  it("rejects javascript: XSS payloads in proofUrl", () => {
    const res = submitScoreSchema.safeParse({
      gameId: "snes__Super Mario World",
      system: "snes",
      score: 100000,
      proofUrl: "javascript:alert(1)",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("Proof URL must be a valid HTTP or HTTPS web address.");
    }
  });

  it("accepts valid http/https URLs and empty proofUrl", () => {
    const resHttp = submitScoreSchema.safeParse({
      gameId: "snes__Super Mario World",
      system: "snes",
      score: 100000,
      proofUrl: "http://example.com/proof.png",
    });
    expect(resHttp.success).toBe(true);

    const resHttps = submitScoreSchema.safeParse({
      gameId: "snes__Super Mario World",
      system: "snes",
      score: 100000,
      proofUrl: "https://example.com/proof.png",
    });
    expect(resHttps.success).toBe(true);

    const resEmpty = submitScoreSchema.safeParse({
      gameId: "snes__Super Mario World",
      system: "snes",
      score: 100000,
      proofUrl: "",
    });
    expect(resEmpty.success).toBe(true);
  });
});

describe("Security URL Validation", () => {
  it("rejects dangerous URI schemes (XSS vectors)", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("JAVASCRIPT:alert(document.cookie)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeHttpUrl("blob:https://example.com/uuid")).toBe(false);
    expect(getSafeHttpUrl("javascript:alert(1)")).toBeNull();
  });

  it("accepts safe http and https protocols", () => {
    expect(isSafeHttpUrl("https://oldsmarchaos.com/proof.png")).toBe(true);
    expect(isSafeHttpUrl("http://oldsmarchaos.com/proof.png")).toBe(true);
    expect(getSafeHttpUrl("https://example.com/screenshot.jpg")).toBe("https://example.com/screenshot.jpg");
  });

  it("rejects malformed or empty inputs", () => {
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl("not-a-url")).toBe(false);
  });
});

describe("Client IP Extraction and Anti-Spoofing", () => {
  it("prioritizes cf-connecting-ip from Cloudflare edge", () => {
    const req = new Request("http://localhost", {
      headers: {
        "cf-connecting-ip": "203.0.113.50",
        "x-real-ip": "198.51.100.20",
        "x-forwarded-for": "10.0.0.1, 10.0.0.2",
      },
    });
    expect(getClientIp(req)).toBe("203.0.113.50");
    expect(getTrustedClientIp(req)).toBe("203.0.113.50");
  });

  it("uses x-real-ip when behind Nginx without Cloudflare", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-real-ip": "198.51.100.20",
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      },
    });
    expect(getClientIp(req)).toBe("198.51.100.20");
    expect(getTrustedClientIp(req)).toBe("198.51.100.20");
  });

  it("takes rightmost IP from x-forwarded-for to prevent client injection", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "1.1.1.1, 2.2.2.2, 198.51.100.99",
      },
    });
    expect(getClientIp(req)).toBe("198.51.100.99");
    expect(getTrustedClientIp(req)).toBe("198.51.100.99");
  });

  it("falls back to 127.0.0.1 when no proxy headers exist", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("127.0.0.1");
    expect(getTrustedClientIp(req)).toBe("127.0.0.1");
  });
});

describe("Save State Platform Validation (SEC-06)", () => {
  it("validates PS1 saves require exactly 128 KB", () => {
    const validPs1 = Buffer.alloc(131072, 0);
    expect(validateSaveFormatForPlatform("psx", validPs1)).toBeNull();
    expect(validateSaveFormatForPlatform("ps1", validPs1)).toBeNull();

    const invalidSize = Buffer.alloc(65536, 0);
    expect(validateSaveFormatForPlatform("psx", invalidSize)).toContain("requires exactly 128 KB");

    const ps2OnPs1 = Buffer.alloc(131072, 0);
    ps2OnPs1.write("Sony PS2 Memory Card Format", 0);
    expect(validateSaveFormatForPlatform("ps1", ps2OnPs1)).toContain("PlayStation 2 memory card cannot be uploaded to PlayStation 1");
  });

  it("validates PS2 saves reject PS1 payloads", () => {
    const ps1OnPs2 = Buffer.alloc(131072, 0);
    ps1OnPs2.write("MC", 0);
    expect(validateSaveFormatForPlatform("ps2", ps1OnPs2)).toContain("PlayStation 1 memory card cannot be uploaded to PlayStation 2");

    const validPs2 = Buffer.alloc(8650752, 0xff);
    expect(validateSaveFormatForPlatform("ps2", validPs2)).toBeNull();
  });

  it("rejects PlayStation payloads on non-PlayStation platforms (e.g. SNES/NES)", () => {
    const ps1Save = Buffer.alloc(131072, 0);
    ps1Save.write("MC", 0);
    expect(validateSaveFormatForPlatform("snes", ps1Save)).toContain("PlayStation memory cards cannot be uploaded");

    const ps2Save = Buffer.alloc(131072, 0);
    ps2Save.write("Sony PS2 Memory Card Format", 0);
    expect(validateSaveFormatForPlatform("nes", ps2Save)).toContain("PlayStation memory cards cannot be uploaded");

    const oversizedSnes = Buffer.alloc(5 * 1024 * 1024, 0);
    expect(validateSaveFormatForPlatform("snes", oversizedSnes)).toContain("exceeds maximum allowable SRAM capacity");

    const validSnesSram = Buffer.alloc(32768, 0);
    expect(validateSaveFormatForPlatform("snes", validSnesSram)).toBeNull();
  });
});

describe("Avatar Protocol & Scheme Sanitization (SEC-07)", () => {
  it("accepts safe relative local asset paths", () => {
    expect(avatarUrlSchema.safeParse("/avatars/default.png").success).toBe(true);
    expect(avatarUrlSchema.safeParse("/images/profiles/user123.jpg").success).toBe(true);
    expect(avatarUrlSchema.safeParse("/roms/avatars/retro.png").success).toBe(true);
    expect(isSafeAvatarUrl("/avatars/default.png")).toBe(true);
  });

  it("accepts secure HTTPS URLs", () => {
    expect(avatarUrlSchema.safeParse("https://avatars.githubusercontent.com/u/12345").success).toBe(true);
    expect(avatarUrlSchema.safeParse("https://secure.gravatar.com/avatar/hash").success).toBe(true);
    expect(isSafeAvatarUrl("https://secure.gravatar.com/avatar/hash")).toBe(true);
  });

  it("accepts null and undefined (optional / nullable)", () => {
    expect(avatarUrlSchema.safeParse(null).success).toBe(true);
    expect(avatarUrlSchema.safeParse(undefined).success).toBe(true);
  });

  it("rejects dangerous pseudo-protocols (XSS vectors)", () => {
    expect(avatarUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(avatarUrlSchema.safeParse("data:text/html,<script>alert(1)</script>").success).toBe(false);
    expect(avatarUrlSchema.safeParse("vbscript:msgbox(1)").success).toBe(false);
    expect(avatarUrlSchema.safeParse("file:///etc/passwd").success).toBe(false);
    expect(avatarUrlSchema.safeParse("blob:https://example.com/uuid").success).toBe(false);
    expect(isSafeAvatarUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects unencrypted HTTP URLs", () => {
    expect(avatarUrlSchema.safeParse("http://insecure.example.com/avatar.png").success).toBe(false);
    expect(isSafeAvatarUrl("http://insecure.example.com/avatar.png")).toBe(false);
  });

  it("rejects directory traversal and protocol-relative local paths", () => {
    expect(avatarUrlSchema.safeParse("/avatars/../../etc/passwd").success).toBe(false);
    expect(avatarUrlSchema.safeParse("/images/../secrets/config.json").success).toBe(false);
    expect(avatarUrlSchema.safeParse("//malicious-site.com/avatar.png").success).toBe(false);
    expect(avatarUrlSchema.safeParse("/avatars\\evil.png").success).toBe(false);
    expect(isSafeAvatarUrl("/avatars/../../etc/passwd")).toBe(false);
  });

  it("provides defensive fallback via getSafeAvatarUrl", () => {
    expect(getSafeAvatarUrl("https://safe.com/pic.png")).toBe("https://safe.com/pic.png");
    expect(getSafeAvatarUrl("/avatars/custom.png")).toBe("/avatars/custom.png");
    expect(getSafeAvatarUrl("javascript:alert(1)")).toBe("/avatars/default.png");
    expect(getSafeAvatarUrl("http://insecure.com/pic.png")).toBe("/avatars/default.png");
    expect(getSafeAvatarUrl(null, null)).toBeNull();
    expect(getSafeAvatarUrl("javascript:alert(1)", null)).toBeNull();
  });
});


