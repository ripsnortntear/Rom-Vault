import { NextRequest } from "next/server";

/**
 * Safely extracts the trusted client IP address, preventing X-Forwarded-For spoofing.
 *
 * Proxy trust hierarchy:
 * 1. Cloudflare edge header (cf-connecting-ip)
 * 2. Trusted local Nginx reverse proxy header (x-real-ip = $remote_addr)
 * 3. Rightmost entry of X-Forwarded-For (the IP appended by the trusted reverse proxy)
 * 4. Fallback: 127.0.0.1
 */
export function getTrustedClientIp(request: Request | NextRequest): string {
  // 1. If traffic passes through Cloudflare, cf-connecting-ip is set by the edge
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) {
    return cfIp.trim();
  }

  // 2. If fronted by an internal trusted Nginx reverse proxy passing X-Real-IP ($remote_addr)
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp && xRealIp.trim()) {
    return xRealIp.trim();
  }

  // 3. If reading X-Forwarded-For behind Nginx, extract the rightmost non-internal/proxy hop
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
    if (ips.length > 0) {
      return ips[ips.length - 1];
    }
  }

  return "127.0.0.1";
}

export const getClientIp = getTrustedClientIp;
