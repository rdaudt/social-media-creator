import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireCoachSessionUser } from "@/lib/auth";
import { verifySignedBlobAccessUrl } from "@/lib/blob";
import { authErrorResponse } from "@/lib/http";

function isAllowedBlobHost(hostname: string): boolean {
  return hostname.endsWith(".blob.vercel-storage.com");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUrl = searchParams.get("url");
    if (!rawUrl) {
      return NextResponse.json({ error: "missing_url" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: "invalid_url" }, { status: 400 });
    }

    if (!isAllowedBlobHost(parsed.hostname)) {
      return NextResponse.json({ error: "disallowed_host" }, { status: 400 });
    }

    const isSigned = verifySignedBlobAccessUrl(parsed.toString(), searchParams.get("exp"), searchParams.get("sig"));
    if (!isSigned) {
      await requireCoachSessionUser();
    }

    const blob = await get(parsed.toString(), {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return NextResponse.json({ error: "blob_fetch_failed", status: blob?.statusCode ?? 404 }, { status: 502 });
    }

    return new NextResponse(blob.stream, {
      status: 200,
      headers: {
        "content-type": blob.blob.contentType ?? "application/octet-stream",
        "cache-control": isSigned ? "public, max-age=60" : "private, max-age=60",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
