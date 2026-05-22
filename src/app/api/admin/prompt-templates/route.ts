import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { bootstrapSchema, db, newId, nowIso } from "@/lib/db";
import { templateSchema } from "@/lib/validation";

export async function POST(req: Request) {
  await bootstrapSchema();
  const admin = await requireAdmin();
  const parsed = templateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const now = nowIso();
  const id = newId("tpl");
  await db.execute({
    sql: `INSERT INTO prompt_templates
          (id, title, platform, format, prompt_text, default_options_json, is_active, created_by_admin_sub, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, body.title, body.platform, body.format, body.promptText, JSON.stringify(body.defaultOptions ?? {}), body.isActive === false ? 0 : 1, admin.sub, now, now]
  });
  return NextResponse.json({ id }, { status: 201 });
}
