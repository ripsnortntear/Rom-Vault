/**
 * Safely resolves post-authentication redirects for ROM Vault Single-Sign-On.
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

  // Safe absolute URLs for authorized domains
  try {
    const url = new URL(decoded);
    const appHost = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : null;
    const envAllowed = process.env.ALLOWED_HOSTS ? process.env.ALLOWED_HOSTS.split(",").map(h => h.trim().toLowerCase()) : [];
    const allowedHosts = [
      ...(appHost ? [appHost] : []),
      ...envAllowed,
      "your-domain.example.com",
      "localhost",
      "127.0.0.1",
    ];
    if (allowedHosts.includes(url.hostname)) {
      return url.pathname + url.search + url.hash;
    }
  } catch {
    // Malformed absolute URL
  }

  return "/";
}
