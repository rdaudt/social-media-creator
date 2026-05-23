import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { bootstrapSchema, db, nowIso } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";
import { templateSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await bootstrapSchema();
    await requireAdmin();
    const { id } = await params;
    const parsed = templateSchema.partial().safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;
    const now = nowIso();

    await db.execute({
      sql: `UPDATE prompt_templates
            SET title = COALESCE(?, title),
                platform = COALESCE(?, platform),
                format = COALESCE(?, format),
                prompt_text = COALESCE(?, prompt_text),
                default_options_json = COALESCE(?, default_options_json),
                is_active = COALESCE(?, is_active),
                updated_at = ?
            WHERE id = ?`,
      args: [
        body.title ?? null,
        body.platform ?? null,
        body.format ?? null,
        body.promptText ?? null,
        body.defaultOptions ? JSON.stringify(body.defaultOptions) : null,
        typeof body.isActive === "boolean" ? (body.isActive ? 1 : 0) : null,
        now,
        id
      ]
    });

    return NextResponse.json({ id, updatedAt: now });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await bootstrapSchema();
    await requireAdmin();
    const { id } = await params;
    await db.execute({ sql: `DELETE FROM prompt_templates WHERE id = ?`, args: [id] });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
