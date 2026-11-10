import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeSession } from "@/lib/auth/session-db";
import { clearSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token =
      cookieStore.get(SESSION_COOKIE_NAME)?.value ||
      cookieStore.get("session_token")?.value ||
      cookieStore.get("rom_vault_session")?.value;

    if (token) {
      await revokeSession(token);
    }

    await clearSessionCookie();

    return NextResponse.json({ success: true, message: "Logged out successfully." });
  } catch (error: any) {
    console.error("[Logout Error]", error);
    await clearSessionCookie().catch(() => {});
    return NextResponse.json({ success: true });
  }
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token =
      cookieStore.get(SESSION_COOKIE_NAME)?.value ||
      cookieStore.get("session_token")?.value ||
      cookieStore.get("rom_vault_session")?.value;

    if (token) {
      await revokeSession(token);
    }
    await clearSessionCookie();
  } catch (error: any) {
    console.error("[Logout GET Error]", error);
    await clearSessionCookie().catch(() => {});
  }

  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "www.oldsmarchaos.com";
  const { searchParams } = new URL(req.url);
  const redirectParam = searchParams.get("redirect") || "/roms/auth/login";
  const target = redirectParam.startsWith("/") ? redirectParam : "/roms/auth/login";
  return NextResponse.redirect(`${proto}://${host}${target}`);
}
