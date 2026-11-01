import { NextRequest, NextResponse } from "next/server";
import { GET as getAvatar, PUT as updateAvatar, POST as postAvatar } from "@/app/api/users/me/avatar/route";

export async function GET(): Promise<NextResponse> {
  return getAvatar();
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  return updateAvatar(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return postAvatar(req);
}
