import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/oauth-sso";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    let token = "";
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else {
      const url = new URL(req.url);
      token = url.searchParams.get("access_token") || "";
    }

    if (!token) {
      return NextResponse.json({ error: "Unauthorized", error_description: "Missing access token" }, { status: 401 });
    }

    const userPayload = verifyAccessToken(token);
    if (!userPayload) {
      return NextResponse.json({ error: "Unauthorized", error_description: "Token invalid or expired" }, { status: 401 });
    }

    return NextResponse.json({
      sub: userPayload.userId,
      id: userPayload.userId,
      username: userPayload.username,
      nickname: userPayload.username,
      name: userPayload.username,
      email: userPayload.email,
      email_verified: true,
    });
  } catch (error: any) {
    console.error("[OAuth User Error]:", error);
    return NextResponse.json({ error: "server_error", error_description: error.message }, { status: 500 });
  }
}
