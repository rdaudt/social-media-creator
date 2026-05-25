import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { requireCoachSessionUser } from "@/lib/auth";
import { bootstrapSchema, db, newId, nowIso } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";
import { putPermanentBlob } from "@/lib/blob";

function normalizeImageContentType(raw: string | null): "image/png" | "image/jpeg" | "image/webp" | null {
  const contentType = String(raw ?? "").split(";")[0].trim().toLowerCase();
  if (contentType === "image/png" || contentType === "image/jpeg" || contentType === "image/webp") return contentType;
  return null;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function assertOwnedClass(userSub: string, classId: string): Promise<boolean> {
  const owned = await db.execute({
    sql: `SELECT id FROM coach_hiit_classes WHERE id = ? AND coach_google_sub = ? LIMIT 1`,
    args: [classId, userSub]
  });
  return Boolean(owned.rows[0]);
}

export async function GET(req: Request) {
  try {
    await bootstrapSchema();
    const user = await requireCoachSessionUser();
    const classId = new URL(req.url).searchParams.get("classId") ?? "";
    if (!classId) return NextResponse.json({ error: "class_id_required" }, { status: 400 });

    const classOwned = await assertOwnedClass(user.sub, classId);
    if (!classOwned) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const res = await db.execute({
      sql: `SELECT id, class_id, blob_url, source_message_id, created_at
            FROM coach_hiit_class_media
            WHERE coach_google_sub = ? AND class_id = ?
            ORDER BY created_at DESC`,
      args: [user.sub, classId]
    });

    return NextResponse.json({
      media: res.rows.map((row) => ({
        id: String(row.id),
        classId: String(row.class_id),
        blobUrl: String(row.blob_url),
        createdAt: String(row.created_at),
        sourceMessageId: row.source_message_id == null ? null : String(row.source_message_id)
      }))
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await bootstrapSchema();
    const user = await requireCoachSessionUser();
    const body = await req.json().catch(() => ({}));
    const classId = typeof body.classId === "string" ? body.classId.trim() : "";
    const generatedImageUrl = typeof body.generatedImageUrl === "string" ? body.generatedImageUrl.trim() : "";
    const sourceMessageId = typeof body.sourceMessageId === "string" && body.sourceMessageId.trim() ? body.sourceMessageId.trim() : null;

    if (!classId || !generatedImageUrl) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const classOwned = await assertOwnedClass(user.sub, classId);
    if (!classOwned) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const sourceUrl = new URL(generatedImageUrl);
    const srcHeaders = new Headers();
    if (sourceUrl.hostname.endsWith(".blob.vercel-storage.com") && process.env.BLOB_READ_WRITE_TOKEN) {
      srcHeaders.set("Authorization", `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`);
    }

    const fetchRes = await fetch(sourceUrl.toString(), { headers: srcHeaders, cache: "no-store" });
    if (!fetchRes.ok) return NextResponse.json({ error: "source_fetch_failed" }, { status: 400 });

    const contentType = normalizeImageContentType(fetchRes.headers.get("content-type"));
    if (!contentType) return NextResponse.json({ error: "unsupported_source_type" }, { status: 400 });

    const digest = createHash("sha256").update(generatedImageUrl).digest("hex").slice(0, 24);
    const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
    const mediaId = `class_media_${digest}`;
    const permanentPath = `class-media/${sanitizeSegment(user.sub)}/${sanitizeSegment(classId)}/${mediaId}.${ext}`;

    const blob = await putPermanentBlob(permanentPath, Buffer.from(await fetchRes.arrayBuffer()), contentType);
    const existing = await db.execute({
      sql: `SELECT id, class_id, blob_url, source_message_id, created_at
            FROM coach_hiit_class_media
            WHERE class_id = ? AND blob_url = ?
            LIMIT 1`,
      args: [classId, blob.url]
    });

    if (existing.rows[0]) {
      const row = existing.rows[0];
      return NextResponse.json({
        media: {
          id: String(row.id),
          classId: String(row.class_id),
          blobUrl: String(row.blob_url),
          createdAt: String(row.created_at),
          sourceMessageId: row.source_message_id == null ? null : String(row.source_message_id)
        },
        idempotent: true
      });
    }

    const id = newId("classmedia");
    const createdAt = nowIso();
    await db.execute({
      sql: `INSERT INTO coach_hiit_class_media (id, coach_google_sub, class_id, blob_url, blob_pathname, source_message_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, user.sub, classId, blob.url, blob.pathname, sourceMessageId, createdAt]
    });

    return NextResponse.json({ media: { id, classId, blobUrl: blob.url, createdAt, sourceMessageId } }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
