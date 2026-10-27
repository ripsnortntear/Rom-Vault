import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { findPs2WebBuild } from "@/lib/ps2Recomp";
import { getRomsDirectory, resolveSafeMediaPath } from "@/lib/paths";

interface RouteContext {
  params: Promise<{
    gameId: string;
    asset: string[];
  }>;
}

const ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: ISOLATION_HEADERS,
  });
}

function getAssetMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".wasm":
      return "application/wasm";
    case ".data":
      return "application/octet-stream";
    case ".iso":
    case ".bin":
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { gameId, asset } = await context.params;
    const decodedId = decodeURIComponent(gameId);
    const buildInfo = findPs2WebBuild(decodedId);

    if (!buildInfo) {
      return NextResponse.json(
        { error: "PS2 web build not found for this game." },
        { status: 404, headers: ISOLATION_HEADERS }
      );
    }

    const assetPath = asset && asset.length > 0 ? asset.join("/") : "index.html";

    // Handle disc image request (disc.iso)
    if (assetPath === "disc.iso") {
      let discPath = path.join(buildInfo.buildPath, "disc.iso");

      if (!fs.existsSync(/*turbopackIgnore: true*/ discPath)) {
        // Fall back to roms directory
        const romsDir = getRomsDirectory("ps2");
        const cleanBase = decodedId.includes("__") ? decodedId.split("__")[1] : decodedId;
        const potential = [
          cleanBase,
          `${cleanBase}.iso`,
          cleanBase.replace(/\.[a-z0-9]+$/i, ".iso"),
        ];

        for (const p of potential) {
          const testP = resolveSafeMediaPath("roms", p, "ps2");
          if (testP && fs.existsSync(/*turbopackIgnore: true*/ testP)) {
            discPath = testP;
            break;
          }
        }
      }

      if (!fs.existsSync(/*turbopackIgnore: true*/ discPath)) {
        return NextResponse.json(
          { error: "disc.iso not found" },
          { status: 404, headers: ISOLATION_HEADERS }
        );
      }

      const stat = fs.statSync(/*turbopackIgnore: true*/ discPath);
      const fileSize = stat.size;
      const range = request.headers.get("range");

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
          return new NextResponse(null, {
            status: 416,
            headers: {
              ...ISOLATION_HEADERS,
              "Content-Range": `bytes */${fileSize}`,
            },
          });
        }

        const chunksize = end - start + 1;
        const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ discPath, { start, end });
        const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

        return new NextResponse(webStream, {
          status: 206,
          headers: {
            ...ISOLATION_HEADERS,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunksize.toString(),
            "Content-Type": "application/octet-stream",
          },
        });
      }

      const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ discPath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
      return new NextResponse(webStream, {
        status: 200,
        headers: {
          ...ISOLATION_HEADERS,
          "Accept-Ranges": "bytes",
          "Content-Length": fileSize.toString(),
          "Content-Type": "application/octet-stream",
        },
      });
    }

    // Serve HTML or static build asset
    let targetFile = path.join(buildInfo.buildPath, assetPath);
    if (assetPath === "index.html" || assetPath === "ps2web.html" || !asset || asset.length === 0) {
      targetFile = buildInfo.htmlPath;
    }

    if (!fs.existsSync(/*turbopackIgnore: true*/ targetFile)) {
      return NextResponse.json(
        { error: `Asset not found: ${assetPath}` },
        { status: 404, headers: ISOLATION_HEADERS }
      );
    }

    const stat = fs.statSync(/*turbopackIgnore: true*/ targetFile);
    const mime = getAssetMimeType(targetFile);

    const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ targetFile);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        ...ISOLATION_HEADERS,
        "Content-Type": mime,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err) {
    console.error("[api/ps2-play] Error serving asset:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: ISOLATION_HEADERS }
    );
  }
}
