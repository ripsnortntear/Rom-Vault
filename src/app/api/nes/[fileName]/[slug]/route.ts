import fs from "fs";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { extractNesFromZip } from "@/lib/nesExtractor";
import { normalizeSystem, resolveSafeMediaPath } from "@/lib/paths";
import { getCorsHeaders, handleCorsPreflight } from "@/lib/cors";

interface NesRouteContext {
  params: Promise<{
    fileName: string;
    slug: string;
  }>;
}

function getNesCorsHeaders(request?: Request | NextRequest | null): Record<string, string> {
  return {
    ...getCorsHeaders(request, "GET, HEAD, OPTIONS", "*"),
    "Cross-Origin-Resource-Policy": "same-site",
  };
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return handleCorsPreflight(request, "GET, HEAD, OPTIONS", "*");
}

function resolveRomTarget(fileName: string, system: string): {
  isZip: boolean;
  zipName: string;
  directPath: string | null;
} {
  // Check if direct path exists as requested
  const direct = resolveSafeMediaPath("roms", fileName, system);
  if (direct && fs.existsSync(/*turbopackIgnore: true*/ direct)) {
    return {
      isZip: fileName.toLowerCase().endsWith(".zip"),
      zipName: fileName,
      directPath: direct,
    };
  }

  // If fileName has another extension (or none), check for .zip
  const withoutExt = fileName.replace(/\.[a-z0-9]+$/i, "");
  const zipCandidate = `${withoutExt}.zip`;
  const zipDirect = resolveSafeMediaPath("roms", zipCandidate, system);
  if (zipDirect && fs.existsSync(/*turbopackIgnore: true*/ zipDirect)) {
    return {
      isZip: true,
      zipName: zipCandidate,
      directPath: zipDirect,
    };
  }

  return { isZip: false, zipName: fileName, directPath: null };
}

function safeDecode(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

export async function HEAD(
  request: NextRequest,
  context: NesRouteContext
): Promise<NextResponse> {
  const corsHeaders = getNesCorsHeaders(request);
  try {
    const resolved = await context.params;
    const fileName = safeDecode(resolved.fileName);
    const slug = safeDecode(resolved.slug);
    const system = normalizeSystem(request.nextUrl.searchParams.get("system"));

    const target = resolveRomTarget(fileName, system);

    // If zip, extract uncompressed ROM buffer and report its actual size
    if (target.isZip) {
      const nesBuffer = extractNesFromZip(target.zipName, system);
      if (nesBuffer) {
        return new NextResponse(null, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/octet-stream",
            "Content-Length": nesBuffer.byteLength.toString(),
            "Content-Disposition": `inline; filename="${slug}"`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    if (target.directPath && fs.existsSync(/*turbopackIgnore: true*/ target.directPath)) {
      const stat = fs.statSync(/*turbopackIgnore: true*/ target.directPath);
      return new NextResponse(null, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/octet-stream",
          "Content-Length": stat.size.toString(),
          "Content-Disposition": `inline; filename="${slug}"`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    return new NextResponse(null, { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error("[api/nes HEAD] Error:", error);
    return new NextResponse(null, { status: 500, headers: corsHeaders });
  }
}

export async function GET(
  request: NextRequest,
  context: NesRouteContext
): Promise<NextResponse> {
  const corsHeaders = getNesCorsHeaders(request);
  try {
    const resolved = await context.params;
    const fileName = safeDecode(resolved.fileName);
    const slug = safeDecode(resolved.slug).replace(/"/g, "");
    const system = normalizeSystem(request.nextUrl.searchParams.get("system"));

    const target = resolveRomTarget(fileName, system);
    const rangeHeader = request.headers.get("range");

    // If zip archive, serve extracted uncompressed ROM buffer
    if (target.isZip) {
      const nesBuffer = extractNesFromZip(target.zipName, system);
      if (nesBuffer) {
        const totalSize = nesBuffer.byteLength;
        const commonHeaders: Record<string, string> = {
          ...corsHeaders,
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `inline; filename="${slug}"`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000, immutable",
        };

        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

          if (isNaN(start) || isNaN(end) || start >= totalSize || end >= totalSize || start > end) {
            return new NextResponse(null, {
              status: 416,
              headers: {
                ...commonHeaders,
                "Content-Range": `bytes */${totalSize}`,
              },
            });
          }

          const slice = nesBuffer.subarray(start, end + 1);
          return new NextResponse(new Uint8Array(slice), {
            status: 206,
            headers: {
              ...commonHeaders,
              "Content-Range": `bytes ${start}-${end}/${totalSize}`,
              "Content-Length": slice.byteLength.toString(),
            },
          });
        }

        return new NextResponse(new Uint8Array(nesBuffer), {
          status: 200,
          headers: {
            ...commonHeaders,
            "Content-Length": totalSize.toString(),
          },
        });
      }
    }

    // Direct ROM / disc file stream (e.g. .chd, .rvz, .iso)
    if (target.directPath && fs.existsSync(/*turbopackIgnore: true*/ target.directPath)) {
      const stat = fs.statSync(/*turbopackIgnore: true*/ target.directPath);
      const fileSize = stat.size;

      const commonHeaders: Record<string, string> = {
        ...corsHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `inline; filename="${slug}"`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Last-Modified": stat.mtime.toUTCString(),
      };

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
          return new NextResponse(null, {
            status: 416,
            headers: { ...commonHeaders, "Content-Range": `bytes */${fileSize}` },
          });
        }

        const chunkSize = end - start + 1;
        const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ target.directPath, { start, end });
        const webStream = Readable.toWeb(nodeStream) as ReadableStream;

        return new NextResponse(webStream, {
          status: 206,
          headers: {
            ...commonHeaders,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": chunkSize.toString(),
          },
        });
      }

      const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ target.directPath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;
      return new NextResponse(webStream, {
        status: 200,
        headers: {
          ...commonHeaders,
          "Content-Length": fileSize.toString(),
        },
      });
    }

    return NextResponse.json(
      { error: "Failed to extract or read ROM file" },
      { status: 404, headers: corsHeaders }
    );
  } catch (error) {
    console.error("[api/nes GET] Error serving ROM:", error);
    return NextResponse.json(
      { error: "Internal server error extracting ROM" },
      { status: 500, headers: corsHeaders }
    );
  }
}
