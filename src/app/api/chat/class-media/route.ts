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

function isAllowedBlobHost(hostname: string): boolean {
  return hostname.endsWith(".blob.vercel-storage.com");
}

type AccessibleClass = {
  id: string;
  coachGoogleSub: string | null;
  tenantId: string | null;
  tenantOwnerGoogleSub: string | null;
};

async function getTenantIdForUserEmail(userEmail: string): Promise<string | null> {
  const tenant = await db.execute({
    sql: `SELECT id FROM coach_tenants WHERE lower(owner_email) = ? LIMIT 1`,
    args: [userEmail.trim().toLowerCase()]
  });
  return tenant.rows[0]?.id == null ? null : String(tenant.rows[0].id);
}

async function getAccessibleClass(userSub: string, userEmail: string, classId: string): Promise<AccessibleClass | null> {
  const tenantId = await getTenantIdForUserEmail(userEmail);
  const res = await db.execute({
    sql: `SELECT c.id, c.coach_google_sub, c.tenant_id, t.owner_google_sub AS tenant_owner_google_sub
          FROM coach_hiit_classes c
          LEFT JOIN coach_tenants t ON t.id = c.tenant_id
          WHERE c.id = ?
            AND (c.coach_google_sub = ? OR (? IS NOT NULL AND c.tenant_id = ?))
          LIMIT 1`,
    args: [classId, userSub, tenantId, tenantId]
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    coachGoogleSub: row.coach_google_sub == null ? null : String(row.coach_google_sub),
    tenantId: row.tenant_id == null ? null : String(row.tenant_id),
    tenantOwnerGoogleSub: row.tenant_owner_google_sub == null ? null : String(row.tenant_owner_google_sub)
  };
}

function resolveBlobSourceUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);

  if (isAllowedBlobHost(parsed.hostname) && (parsed.protocol === "https:" || parsed.protocol === "http:")) {
    return parsed.toString();
  }

  if (parsed.pathname === "/api/blob") {
    const nested = parsed.searchParams.get("url");
    if (!nested) throw new Error("invalid_generated_image_url");
    const nestedUrl = new URL(nested);
    if (!isAllowedBlobHost(nestedUrl.hostname)) throw new Error("disallowed_generated_image_host");
    if (nestedUrl.protocol !== "https:" && nestedUrl.protocol !== "http:") throw new Error("invalid_generated_image_protocol");
    return nestedUrl.toString();
  }

  throw new Error("disallowed_generated_image_host");
}

export async function GET(req: Request) {
  try {
    await bootstrapSchema();
    const user = await requireCoachSessionUser();
    const classId = new URL(req.url).searchParams.get("classId") ?? "";
    if (!classId) return NextResponse.json({ error: "class_id_required" }, { status: 400 });

    const accessibleClass = await getAccessibleClass(user.sub, user.email, classId);
    if (!accessibleClass) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const res = await db.execute({
      sql: `SELECT id, class_id, blob_url, source_message_id, is_sharable, created_at
            FROM coach_hiit_class_media
            WHERE class_id = ?
            ORDER BY created_at DESC`,
      args: [classId]
    });

    return NextResponse.json({
      media: res.rows.map((row) => ({
        id: String(row.id),
        classId: String(row.class_id),
        blobUrl: String(row.blob_url),
        isSharable: Number(row.is_sharable ?? 0) === 1,
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

    const accessibleClass = await getAccessibleClass(user.sub, user.email, classId);
    if (!accessibleClass) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const resolvedBlobSource = resolveBlobSourceUrl(generatedImageUrl);
    const sourceUrl = new URL(resolvedBlobSource);
    const srcHeaders = new Headers();
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      srcHeaders.set("Authorization", `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`);
    }

    const fetchRes = await fetch(sourceUrl.toString(), { headers: srcHeaders, cache: "no-store" });
    if (!fetchRes.ok) return NextResponse.json({ error: "source_fetch_failed" }, { status: 400 });

    const contentType = normalizeImageContentType(fetchRes.headers.get("content-type"));
    if (!contentType) return NextResponse.json({ error: "unsupported_source_type" }, { status: 400 });

    const digest = createHash("sha256").update(resolvedBlobSource).digest("hex").slice(0, 24);
    const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
    const mediaId = `class_media_${digest}`;
    const mediaOwnerSub = accessibleClass.coachGoogleSub ?? accessibleClass.tenantOwnerGoogleSub ?? user.sub;
    const permanentPath = `class-media/${sanitizeSegment(mediaOwnerSub)}/${sanitizeSegment(classId)}/${mediaId}.${ext}`;

    const blob = await putPermanentBlob(permanentPath, Buffer.from(await fetchRes.arrayBuffer()), contentType);
    const existing = await db.execute({
      sql: `SELECT id, class_id, blob_url, source_message_id, is_sharable, created_at
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
          isSharable: Number(row.is_sharable ?? 0) === 1,
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
      args: [id, mediaOwnerSub, classId, blob.url, blob.pathname, sourceMessageId, createdAt]
    });

    return NextResponse.json({ media: { id, classId, blobUrl: blob.url, isSharable: false, createdAt, sourceMessageId } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (
      error.message === "invalid_generated_image_url" ||
      error.message === "disallowed_generated_image_host" ||
      error.message === "invalid_generated_image_protocol"
    )) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
