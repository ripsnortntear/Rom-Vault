import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getFilebotAuthCookie } from "@/lib/filebot";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();

    // 1. Not logged in to OldsmarChaos SSO -> redirect to login page
    if (!session || !session.user) {
      const loginUrl = new URL("/roms/auth/login", "https://www.oldsmarchaos.com");
      loginUrl.searchParams.set("redirect", "https://www.oldsmarchaos.com/filebot/");
      return NextResponse.redirect(loginUrl, 302);
    }

    // 2. Logged in, but NOT an admin -> redirect back to referer or home
    if (session.user.role !== "admin") {
      const referer = req.headers.get("referer");
      let target = "https://www.oldsmarchaos.com/";
      if (referer && referer.includes("oldsmarchaos.com") && !referer.includes("/filebot")) {
        target = referer;
      }
      return NextResponse.redirect(target, 302);
    }

    // 3. Admin user verified -> auto-login to FileBot and set auth cookie
    const authToken = await getFilebotAuthCookie();
    if (!authToken) {
      console.error("[FileBot SSO Login]: Failed to obtain auth cookie token from FileBot container.");
      const errorUrl = new URL("/roms/auth/login", "https://www.oldsmarchaos.com");
      errorUrl.searchParams.set("redirect", "https://www.oldsmarchaos.com/filebot/");
      errorUrl.searchParams.set("error", "filebot_auth_failed");
      return NextResponse.redirect(errorUrl, 302);
    }

    const redirectUrl = new URL("https://www.oldsmarchaos.com/filebot/");
    const response = NextResponse.redirect(redirectUrl, 302);

    response.cookies.set({
      name: "auth",
      value: authToken,
      path: "/filebot/",
      maxAge: 31536000, // 1 year
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });

    return response;
  } catch (err) {
    console.error("[FileBot SSO Login Route Error]:", err);
    return NextResponse.redirect("https://www.oldsmarchaos.com/", 302);
  }
}
