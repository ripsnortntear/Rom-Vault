import { NextRequest, NextResponse } from "next/server";

export const ALLOWED_ORIGINS = new Set([
  "https://oldsmarchaos.com",
  "https://www.oldsmarchaos.com",
  ...(process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
    ? [
        "http://localhost:3000",
        "http://localhost:39254",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:39254",
      ]
    : []),
]);

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin.trim().toLowerCase());
}

export function getCorsHeaders(
  request?: Request | NextRequest | null,
  allowedMethods = "GET, POST, PUT, DELETE, OPTIONS",
  allowedHeaders = "Content-Type, Authorization, Range, X-Requested-With"
): Record<string, string> {
  const origin = request?.headers.get("origin")?.trim().toLowerCase();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": allowedMethods,
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  } else {
    // Default to primary trusted origin
    headers["Access-Control-Allow-Origin"] = "https://oldsmarchaos.com";
  }

  return headers;
}

export function applyCorsHeaders(
  request: Request | NextRequest,
  response: NextResponse
): NextResponse {
  const origin = request.headers.get("origin")?.trim().toLowerCase();
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export function handleCorsPreflight(
  request?: Request | NextRequest | null,
  allowedMethods = "GET, POST, PUT, DELETE, OPTIONS",
  allowedHeaders = "Content-Type, Authorization, Range, X-Requested-With"
): NextResponse {
  const origin = request?.headers.get("origin")?.trim().toLowerCase();
  const headers = new Headers({
    "Access-Control-Allow-Methods": allowedMethods,
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Max-Age": "86400",
  });

  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  } else {
    headers.set("Access-Control-Allow-Origin", "https://oldsmarchaos.com");
  }

  return new NextResponse(null, {
    status: 204,
    headers,
  });
}
