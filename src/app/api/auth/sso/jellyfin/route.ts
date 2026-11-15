import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getJellyfinSsoSession } from "@/lib/jellyfin";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const deviceId = req.nextUrl.searchParams.get("deviceId") || undefined;
    const ssoRes = await getJellyfinSsoSession(session.user.username, deviceId);
    if (!ssoRes.success || !ssoRes.accessToken) {
      return NextResponse.json(
        { success: false, error: ssoRes.error || "Failed to generate Jellyfin session" },
        { status: 500 }
      );
    }

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "your-domain.example.com";
    const protocol = req.headers.get("x-forwarded-proto") || "https";
    const jellyfinAddress = process.env.JELLYFIN_PUBLIC_URL || `${protocol}://${host}/jellyfin`;

    const credentials = {
      Servers: [
        {
          Id: ssoRes.serverId || "0659c9d0372d4749b0b18b137f7c7d23",
          Name: process.env.JELLYFIN_SERVER_NAME || "Media Server",
          DateLastAccessed: Date.now(),
          AccessToken: ssoRes.accessToken,
          UserId: ssoRes.userId,
          ManualAddress: jellyfinAddress,
          LocalAddress: jellyfinAddress,
          RemoteAddress: jellyfinAddress,
          manualAddressOnly: true,
          LastConnectionMode: 1,
        },
      ],
    };

    return NextResponse.json({
      success: true,
      username: session.user.username,
      credentials,
    });
  } catch (error: any) {
    console.error("[api/auth/sso/jellyfin GET] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
