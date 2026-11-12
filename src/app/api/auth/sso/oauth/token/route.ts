import { NextRequest, NextResponse } from "next/server";
import { verifyAuthCode, generateAccessToken, validateClient } from "@/lib/auth/oauth-sso";

export async function POST(req: NextRequest) {
  try {
    let clientId: string | null = null;
    let clientSecret: string | null = null;
    let code: string | null = null;

    // Check Basic Authorization header
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Basic ")) {
      const creds = Buffer.from(authHeader.slice(6), "base64").toString("utf8").split(":");
      clientId = creds[0] || null;
      clientSecret = creds[1] || null;
    }

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      code = params.get("code");
      if (!clientId) clientId = params.get("client_id");
      if (!clientSecret) clientSecret = params.get("client_secret");
    } else {
      const json = await req.json().catch(() => ({}));
      code = json.code || null;
      if (!clientId) clientId = json.client_id || null;
      if (!clientSecret) clientSecret = json.client_secret || null;
    }

    if (!validateClient(clientId, clientSecret)) {
      return NextResponse.json({ error: "invalid_client" }, { status: 401 });
    }

    if (!code) {
      return NextResponse.json({ error: "invalid_request", error_description: "Missing code" }, { status: 400 });
    }

    const userPayload = verifyAuthCode(code);
    if (!userPayload) {
      return NextResponse.json({ error: "invalid_grant", error_description: "Code expired or invalid" }, { status: 400 });
    }

    const accessToken = generateAccessToken(userPayload);

    return NextResponse.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 14 * 24 * 3600,
    });
  } catch (error: any) {
    console.error("[OAuth Token Error]:", error);
    return NextResponse.json({ error: "server_error", error_description: error.message }, { status: 500 });
  }
}
