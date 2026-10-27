import { NextRequest, NextResponse } from "next/server";
import { verifySessionTokenFast } from "@/lib/auth/token-signer";

const SESSION_COOKIE_NAME = process.env.AUTH_SESSION_COOKIE_NAME || "rom_vault_session";

// Public paths that do not require authentication
const PUBLIC_PREFIXES = [
  "/auth",
  "/api/auth",
  "/_next",
  "/favicon.ico",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Handle redundant /roms/ prefix if triggered by legacy or external reverse-proxy paths
  if (pathname.startsWith("/roms/")) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.pathname = pathname.replace(/^\/roms/, "");
    return NextResponse.redirect(cleanUrl);
  }

  // 2. Allow public authentication routes and static assets
  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isPublic) {
    return NextResponse.next();
  }

  // 3. Fast-path HMAC-SHA256 session verification without hitting the database
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  let sessionData: { token: string; userId?: string; role?: "admin" | "user" } | null = null;

  if (sessionCookie?.value) {
    sessionData = await verifySessionTokenFast(sessionCookie.value);
  }

  // 4. Block or redirect unauthenticated requests
  if (!sessionData) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required to access the ROM Vault library." },
        { status: 401 }
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    let returnPath = pathname + (request.nextUrl.search || "");
    if (returnPath.startsWith("/roms/")) {
      returnPath = returnPath.replace(/^\/roms/, "");
    }
    if (returnPath && returnPath !== "/" && !returnPath.startsWith("/auth")) {
      loginUrl.searchParams.set("redirect", returnPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 5. Build sanitized request headers with user context & pass-through streaming headers
  const requestHeaders = new Headers(request.headers);
  if (sessionData.userId) {
    requestHeaders.set("x-user-id", sessionData.userId);
  }
  if (sessionData.role) {
    requestHeaders.set("x-user-role", sessionData.role);
  }
  requestHeaders.set("x-session-token", sessionData.token);

  // Preserve critical HTTP Range headers explicitly
  const range = request.headers.get("range");
  if (range) {
    requestHeaders.set("range", range);
  }
  const acceptRanges = request.headers.get("accept-ranges");
  if (acceptRanges) {
    requestHeaders.set("accept-ranges", acceptRanges);
  }
  const ifRange = request.headers.get("if-range");
  if (ifRange) {
    requestHeaders.set("if-range", ifRange);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
