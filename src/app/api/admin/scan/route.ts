import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { scanGameLibrary, isScanActive, getCachedGameIds } from "@/lib/scanner";
import { announceGameRelease } from "@/lib/shoutbox";
import { checkRateLimit, recordRateLimitEvent, getTrustedClientIp } from "@/lib/auth/rate-limit";

async function handleScan(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const isCliAdmin = Boolean(
    authHeader &&
      ((process.env.AUTH_SECRET && authHeader === `Bearer ${process.env.AUTH_SECRET}`) ||
        (process.env.SESSION_SECRET && authHeader === `Bearer ${process.env.SESSION_SECRET}`))
  );

  let session = await getCurrentSession();

  if (!session?.user && isCliAdmin) {
    session = {
      user: {
        id: "1",
        username: "system_admin",
        role: "admin",
        email: "admin@oldsmarchaos.com",
        account_status: "active",
        displayName: "System Admin",
        avatarUrl: null,
        quotaDaily: null,
        quotaUsedToday: 0,
      },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  }

  // 1. Deny unauthenticated callers
  if (!session?.user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  // 2. Deny non-admin users
  if (session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: Administrator privileges required." },
      { status: 403 }
    );
  }

  // 3. Mutex / Concurrency Lock Check
  if (isScanActive()) {
    return NextResponse.json(
      { error: "A filesystem rescan is already in progress." },
      { status: 409 }
    );
  }

  // 4. Rate limiting: max 1 execution per 5 minutes (300 seconds) per admin user (skipped for CLI admin)
  const clientIp = getTrustedClientIp(request);
  if (!isCliAdmin) {
    const rateCheck = await checkRateLimit({
      action: "admin_rescan",
      identifier: `${session.user.id}:${clientIp}`,
      maxAttempts: 1,
      windowSeconds: 300,
    });

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `A library rescan was recently executed. Please wait ${Math.ceil(
            rateCheck.retryAfterSeconds / 60
          )} minute(s) before rescanning again.`,
        },
        { status: 429 }
      );
    }
  }

  try {
    const priorIds = getCachedGameIds();
    const library = await scanGameLibrary(true);
    if (!isCliAdmin) {
      await recordRateLimitEvent("admin_rescan", `${session.user.id}:${clientIp}`);
    }

    // Auto-announce newly discovered games in the shoutbox (up to 5)
    if (priorIds.size > 0) {
      const newlyDiscovered = library.games.filter((g) => !priorIds.has(g.id));
      for (const newGame of newlyDiscovered.slice(0, 5)) {
        await announceGameRelease({
          id: newGame.id,
          title: newGame.displayTitle,
          system: newGame.system,
        }).catch((err) => {
          console.warn("[admin/scan] Failed to announce game release in shoutbox:", err);
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Library scan completed successfully.",
      stats: library.stats,
    });
  } catch (err: any) {
    if (err?.name === "ScanConflictError") {
      return NextResponse.json(
        { error: "A filesystem rescan is already in progress." },
        { status: 409 }
      );
    }
    console.error("[api/admin/scan] Scan failed:", err);
    return NextResponse.json(
      { error: "An error occurred during the filesystem rescan." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleScan(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleScan(request);
}
