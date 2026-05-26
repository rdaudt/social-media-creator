import { NextResponse } from "next/server";
import { requireCoachSessionUser } from "@/lib/auth";
import { deleteBlobByUrl } from "@/lib/blob";
import { bootstrapSchema, db } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";

async function getTenantIdForUserEmail(userEmail: string): Promise<string | null> {
  const tenant = await db.execute({
    sql: `SELECT id FROM coach_tenants WHERE lower(owner_email) = ? LIMIT 1`,
    args: [userEmail.trim().toLowerCase()]
  });
  return tenant.rows[0]?.id == null ? null : String(tenant.rows[0].id);
}

function accessibleClassExistsSql(): string {
  return `EXISTS (
    SELECT 1 FROM coach_hiit_classes c
    WHERE c.id = m.class_id
      AND (c.coach_google_sub = ? OR (? IS NOT NULL AND c.tenant_id = ?))
  )`;
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await bootstrapSchema();
    const user = await requireCoachSessionUser();
    const { id } = await params;
    const tenantId = await getTenantIdForUserEmail(user.email);

    const rowRes = await db.execute({
      sql: `SELECT m.id, m.class_id, m.blob_url
            FROM coach_hiit_class_media m
            WHERE m.id = ?
              AND ${accessibleClassExistsSql()}
            LIMIT 1`,
      args: [id, user.sub, tenantId, tenantId]
    });

    const row = rowRes.rows[0];
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await db.execute({
      sql: `DELETE FROM coach_hiit_class_media WHERE id = ?`,
      args: [id]
    });

    try {
      await deleteBlobByUrl(String(row.blob_url));
      return NextResponse.json({ ok: true });
    } catch (blobError) {
      console.error("[class-media.delete] blob_delete_failed", blobError);
      return NextResponse.json({ ok: true, blobDeleteError: true }, { status: 200 });
    }
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await bootstrapSchema();
    const user = await requireCoachSessionUser();
    const { id } = await params;
    const tenantId = await getTenantIdForUserEmail(user.email);
    const body = await req.json().catch(() => ({}));
    if (typeof body.isSharable !== "boolean") {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const rowRes = await db.execute({
      sql: `SELECT m.id, m.class_id, m.blob_url, m.source_message_id, m.created_at
            FROM coach_hiit_class_media m
            WHERE m.id = ?
              AND ${accessibleClassExistsSql()}
            LIMIT 1`,
      args: [id, user.sub, tenantId, tenantId]
    });
    const row = rowRes.rows[0];
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await db.execute({
      sql: `UPDATE coach_hiit_class_media
            SET is_sharable = ?
            WHERE id = ?`,
      args: [body.isSharable ? 1 : 0, id]
    });

    return NextResponse.json({
      media: {
        id: String(row.id),
        classId: String(row.class_id),
        blobUrl: String(row.blob_url),
        isSharable: body.isSharable,
        createdAt: String(row.created_at),
        sourceMessageId: row.source_message_id == null ? null : String(row.source_message_id)
      }
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
