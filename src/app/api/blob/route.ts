import { NextResponse } from "next/server";
import { requireCoachSessionUser } from "@/lib/auth";
import { authErrorResponse } from "@/lib/http";

function isAllowedBlobHost(hostname: string): boolean {
  return hostname.endsWith(".blob.vercel-storage.com");
}

export async function GET(req: Request) {
  try {
    await requireCoachSessionUser();

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

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "blob_token_missing" }, { status: 500 });
    }

    const upstream = await fetch(parsed.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "blob_fetch_failed", status: upstream.status }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=60"
      }
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
