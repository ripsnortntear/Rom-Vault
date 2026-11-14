import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { query } from "@/lib/db";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getCurrentSession();

    if (!session || !session.user) {
      return new NextResponse(null, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requiredRole = searchParams.get("role") || "user";

    const headers = new Headers();
    headers.set("X-Forwarded-User", session.user.username);
    headers.set("Remote-User", session.user.username);
    headers.set("X-Auth-Role", session.user.role);
    headers.set("X-Auth-UserId", String(session.user.id));
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

    // Enforce role hierarchy: admin inherits all rights, user inherits public rights
    if (requiredRole === "admin" && session.user.role !== "admin") {
      return new NextResponse(null, { status: 403, headers });
    }

    // Enforce specific username restriction if requested (e.g. ?user=admin)
    const requiredUser = searchParams.get("user");
    if (requiredUser && session.user.username.toLowerCase() !== requiredUser.toLowerCase()) {
      return new NextResponse(null, { status: 403, headers });
    }

    // Enforce seedbox authorization: ONLY admins with an active seedbox or primary root admin (cfw34683)
    const requireSeedbox = searchParams.get("seedbox") === "true";
    if (requireSeedbox) {
      if (session.user.role !== "admin") {
        return new NextResponse(null, { status: 403, headers });
      }
      const isRootAdmin = session.user.username.toLowerCase() === "cfw34683";
      if (!isRootAdmin) {
        const seedboxRows = await query<{ id: string }>(
          "SELECT id FROM user_seedboxes WHERE user_id = ? AND status = 'active' LIMIT 1",
          [session.user.id]
        );
        if (seedboxRows.length === 0) {
          return new NextResponse(null, { status: 403, headers });
        }
      }
    }

    return new NextResponse(null, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[SSO Verify Error]", error);
    return new NextResponse(null, { status: 500 });
  }
}
