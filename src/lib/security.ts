/**
 * Application security utilities for URL validation and scheme sanitization.
 */

/**
 * Validate that a URL uses safe HTTP/HTTPS protocols
 * and prevents script execution (e.g. javascript:, data:, vbscript:).
 */
export function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Reject dangerous URI schemes
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Returns a sanitized HTTP/HTTPS URL, or null if the URL is invalid or unsafe.
 */
export function getSafeHttpUrl(url: string | null | undefined): string | null {
  if (!isSafeHttpUrl(url)) return null;
  return url!.trim();
}
