import { NextRequest, NextResponse } from "next/server";
import { verifySessionTokenFast, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Public paths that do not require authentication
const PUBLIC_PREFIXES = [
  "/auth",
  "/api/auth",
  "/scores",
  "/emulatorjs",
  "/_next",
  "/favicon.ico",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public authentication routes, static assets, and preflight CORS requests
  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => pathname.startsWith(prefix) || pathname.startsWith(`/roms${prefix}`)
  );
  if (isPublic || request.method === "OPTIONS") {
    return NextResponse.next();
  }

  // 2. Identify administrative protected paths
  const isAdminPath = pathname.startsWith("/admin") || pathname.startsWith("/roms/admin");

  // Helper to construct Stage 1 307 login redirect preserving target path
  const buildLoginRedirect = (shouldClearCookies = false) => {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";

    // Normalize attempted target path ensuring /roms base path is preserved
    const targetPath = pathname.startsWith("/roms")
      ? pathname
      : `/roms${pathname === "/" ? "" : pathname}`;
    const returnPath = targetPath + (request.nextUrl.search || "");

    if (returnPath && returnPath !== "/roms" && !returnPath.startsWith("/roms/auth")) {
      loginUrl.searchParams.set("redirect", returnPath);
    }

    const response = NextResponse.redirect(loginUrl, 307);
    if (shouldClearCookies) {
      response.cookies.delete("session_token");
      response.cookies.delete(SESSION_COOKIE_NAME);
      response.cookies.delete("rom_vault_session");
    }
    return response;
  };

  // 3. Stage 1: Authentication Check (Login Redirect)
  // Check session cookie across supported parameter names
  const sessionCookie =
    request.cookies.get("session_token") ||
    request.cookies.get(SESSION_COOKIE_NAME) ||
    request.cookies.get("rom_vault_session");

  const rawToken = sessionCookie?.value;

  // If cookie is missing or empty -> redirect to login
  if (!rawToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required to access the ROM Vault library." },
        { status: 401 }
      );
    }
    return buildLoginRedirect(false);
  }

  // Cryptographically validate the session token via fast HMAC verification
  const verifyResult = await verifySessionTokenFast(rawToken);

  // If signature verification fails (corrupted, tampered, or expired) -> clear cookie & redirect
  if (!verifyResult.valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Invalid or expired session token." },
        { status: 401 }
      );
    }
    return buildLoginRedirect(true);
  }

  const sessionData = verifyResult.payload;

  // 4. Stage 2: Authorization Check (Role Enforcement)
  // Reaching this point guarantees the user has a cryptographically verified identity
  if (isAdminPath) {
    if (sessionData.role !== "admin") {
      return new NextResponse(
        JSON.stringify({
          error: "Forbidden",
          message: "Administrator privileges required to access this resource.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // 5. Stage 3: Downstream Context Pass-Through
  const requestHeaders = new Headers(request.headers);
  if (sessionData.userId) {
    requestHeaders.set("x-user-id", String(sessionData.userId));
  }
  if (sessionData.role) {
    requestHeaders.set("x-user-role", sessionData.role);
  }
  if (sessionData.username) {
    requestHeaders.set("x-user-username", sessionData.username);
  }
  requestHeaders.set("x-session-token", sessionData.sessionId || rawToken);

  // Ensure downstream Server Components read the session under all alias cookie names
  const existingCookieHeader = request.headers.get("cookie") || "";
  if (!existingCookieHeader.includes("rom_vault_session=") && rawToken) {
    requestHeaders.set(
      "cookie",
      existingCookieHeader
        ? `${existingCookieHeader}; rom_vault_session=${rawToken}`
        : `rom_vault_session=${rawToken}`
    );
  }

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
