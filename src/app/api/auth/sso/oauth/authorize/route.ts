import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { generateAuthCode } from "@/lib/auth/oauth-sso";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state") || "";

    if (!redirectUri) {
      return NextResponse.json({ error: "Missing redirect_uri" }, { status: 400 });
    }

    const session = await getCurrentSession();
    if (!session || !session.user) {
      // User is not logged in to OldsmarChaos: redirect to login with return path
      const currentUrl = req.url;
      const loginUrl = new URL("/roms/auth/login", req.url);
      loginUrl.searchParams.set("redirect", currentUrl);
      return NextResponse.redirect(loginUrl.toString());
    }

    // Lookup real email from MariaDB users table
    const userRows = await query<{ email: string }>(
      "SELECT email FROM users WHERE id = ? LIMIT 1",
      [session.user.id]
    );
    const realEmail = userRows[0]?.email || session.user.email;

    // Generate OAuth authorization code for logged in user
    const code = generateAuthCode({
      userId: session.user.id,
      username: session.user.username,
      email: realEmail,
    });

    const targetUrl = new URL(redirectUri);
    targetUrl.searchParams.set("code", code);
    if (state) {
      targetUrl.searchParams.set("state", state);
    }

    return NextResponse.redirect(targetUrl.toString());
  } catch (error: any) {
    console.error("[OAuth Authorize Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

