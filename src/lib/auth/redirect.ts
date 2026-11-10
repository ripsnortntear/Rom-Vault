/**
 * Safely resolves post-authentication redirects for OldsmarChaos Single-Sign-On.
 * Defaults to portal home ("/") rather than scoped sub-apps unless explicitly requested.
 */
export function getSafeRedirectUrl(param: string | null | undefined): string {
  if (!param) return "/";

  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    // If percent-decoding fails, use raw param
  }

  // Prevent redirect loops back to auth pages
  if (!decoded || decoded.includes("/auth")) {
    return "/";
  }

  // Safe relative paths (e.g. "/", "/charm", "/operations", "/roms")
  // Note: rejects "//" which browsers interpret as protocol-relative URLs
  if (decoded.startsWith("/") && !decoded.startsWith("//")) {
    return decoded;
  }

  // Safe absolute URLs for authorized OldsmarChaos domains
  try {
    const url = new URL(decoded);
    const allowedHosts = ["oldsmarchaos.com", "www.oldsmarchaos.com", "localhost", "127.0.0.1"];
    if (allowedHosts.includes(url.hostname)) {
      return url.pathname + url.search + url.hash;
    }
  } catch {
    // Malformed absolute URL
  }

  return "/";
}
