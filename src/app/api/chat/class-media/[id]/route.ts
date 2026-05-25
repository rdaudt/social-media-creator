import { NextResponse } from "next/server";
import { requireCoachSessionUser } from "@/lib/auth";
import { deleteBlobByUrl } from "@/lib/blob";
import { bootstrapSchema, db } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await bootstrapSchema();
    const user = await requireCoachSessionUser();
    const { id } = await params;

    const rowRes = await db.execute({
      sql: `SELECT m.id, m.class_id, m.blob_url
            FROM coach_hiit_class_media m
            WHERE m.id = ?
              AND m.coach_google_sub = ?
              AND EXISTS (
                SELECT 1 FROM coach_hiit_classes c
                WHERE c.id = m.class_id AND c.coach_google_sub = ?
              )
            LIMIT 1`,
      args: [id, user.sub, user.sub]
    });

    const row = rowRes.rows[0];
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await db.execute({
      sql: `DELETE FROM coach_hiit_class_media WHERE id = ? AND coach_google_sub = ?`,
      args: [id, user.sub]
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
