import bcrypt from "bcryptjs";
import crypto from "crypto";

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt with cost factor 12.
 */
export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  return bcrypt.hash(plainText, salt);
}

/**
 * Verify a plain-text password against a stored bcrypt hash.
 */
export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plainText, hash);
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure random token (64 hex characters / 256 bits).
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash a token with SHA-256 for secure database storage.
 * Protects database dumps from exposing active session/verification tokens.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a UUID v4.
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Validate username syntax:
 * - 3 to 30 characters
 * - Only letters, numbers, underscores, and hyphens
 * - Cannot start or end with a hyphen or underscore
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || typeof username !== "string") {
    return { valid: false, error: "Username is required." };
  }
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 30) {
    return { valid: false, error: "Username must be between 3 and 30 characters." };
  }
  const regex = /^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$/;
  if (!regex.test(trimmed)) {
    return {
      valid: false,
      error: "Username can only contain alphanumeric characters, hyphens, and underscores, and cannot start or end with a symbol.",
    };
  }
  return { valid: true };
}

/**
 * Validate email format using RFC 5322 regex.
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Email address is required." };
  }
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254) {
    return { valid: false, error: "Email address is too long." };
  }
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!regex.test(trimmed)) {
    return { valid: false, error: "Please enter a valid email address." };
  }
  return { valid: true };
}

/**
 * Validate password complexity:
 * - At least 8 characters long (max 128)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
export function validatePasswordComplexity(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Password is required." };
  }
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long." };
  }
  if (password.length > 128) {
    return { valid: false, error: "Password cannot exceed 128 characters." };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter (A-Z)." };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter (a-z)." };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one number (0-9)." };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    return { valid: false, error: "Password must contain at least one special character." };
  }
  return { valid: true };
}
