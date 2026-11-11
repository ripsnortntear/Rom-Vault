import { NextRequest, NextResponse } from "next/server";
import { scanGameLibrary, isScanActive } from "@/lib/scanner";
import { getCurrentSession } from "@/lib/auth/session";
import { checkRateLimit, recordRateLimitEvent, getTrustedClientIp } from "@/lib/auth/rate-limit";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";

    if (refresh) {
      const session = await getCurrentSession();
      if (!session?.user) {
        return NextResponse.json(
          { error: "Authentication required to refresh library." },
          { status: 401 }
        );
      }

      if (session.user.role !== "admin") {
        return NextResponse.json(
          { error: "Forbidden: Administrator role required to trigger library rescans." },
          { status: 403 }
        );
      }

      if (isScanActive()) {
        return NextResponse.json(
          { error: "A filesystem rescan is already in progress." },
          { status: 409 }
        );
      }

      const clientIp = getTrustedClientIp(request);
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

      const library = await scanGameLibrary(true);
      await recordRateLimitEvent("admin_rescan", `${session.user.id}:${clientIp}`);

      return NextResponse.json(library, {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    const session = await getCurrentSession().catch(() => null);
    const isAdmin = session?.user?.role === "admin";
    const library = await scanGameLibrary(false);

    const filteredGames = isAdmin
      ? library.games
      : library.games.filter((g) => !g.isDisabled);

    const filteredSystems = { ...library.stats.systems };
    if (!isAdmin) {
      delete filteredSystems["disabled"];
    }

    const payload = {
      games: filteredGames,
      stats: {
        ...library.stats,
        totalGames: filteredGames.length,
        systems: filteredSystems,
      },
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": isAdmin ? "no-store, no-cache" : "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error: any) {
    if (error?.name === "ScanConflictError") {
      return NextResponse.json(
        { error: "A filesystem rescan is already in progress." },
        { status: 409 }
      );
    }
    console.error("[api/games] Failed to load game library:", error);
    return NextResponse.json(
      { error: "Failed to scan ROM library" },
      { status: 500 }
    );
  }
}
