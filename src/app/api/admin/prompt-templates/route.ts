import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { bootstrapSchema, db, newId, nowIso } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";
import { templateSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    await bootstrapSchema();
    const admin = await requireAdmin();
    const parsed = templateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;
    const now = nowIso();
    const id = newId("tpl");
    const templateFamilyId = id;
    await db.execute({
      sql: `INSERT INTO prompt_templates
            (id, title, platform, format, template_family_id, template_version, prompt_text, default_options_json, is_active, created_by_admin_sub, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      args: [id, body.title, body.platform, body.format, templateFamilyId, body.promptText, JSON.stringify(body.defaultOptions ?? {}), body.isActive === false ? 0 : 1, admin.sub, now, now]
    });
    return NextResponse.json({ id, templateFamilyId, templateVersion: 1 }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
