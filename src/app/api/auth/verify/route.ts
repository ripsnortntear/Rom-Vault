import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";

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

    return new NextResponse(null, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[SSO Verify Error]", error);
    return new NextResponse(null, { status: 500 });
  }
}
