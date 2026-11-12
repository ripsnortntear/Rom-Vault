import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getJellyfinSsoSession } from "@/lib/jellyfin";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const ssoRes = await getJellyfinSsoSession(session.user.username);
    if (!ssoRes.success || !ssoRes.accessToken) {
      return NextResponse.json(
        { success: false, error: ssoRes.error || "Failed to generate Jellyfin session" },
        { status: 500 }
      );
    }

    const credentials = {
      Servers: [
        {
          Id: ssoRes.serverId || "0659c9d0372d4749b0b18b137f7c7d23",
          Name: "OldsmarChaos Media",
          DateLastAccessed: Date.now(),
          AccessToken: ssoRes.accessToken,
          UserId: ssoRes.userId,
          ManualAddress: "https://www.oldsmarchaos.com/jellyfin",
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
