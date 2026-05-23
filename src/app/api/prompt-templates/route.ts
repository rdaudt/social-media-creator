import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { bootstrapSchema, db } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  try {
    await bootstrapSchema();
    await getSessionUser();
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform");
    const format = searchParams.get("format");

    const where: string[] = ["is_active = 1"];
    const args: string[] = [];

    if (platform) { where.push("platform = ?"); args.push(platform); }
    if (format) { where.push("format = ?"); args.push(format); }

    const res = await db.execute({
      sql: `SELECT id, title, platform, format, prompt_text, default_options_json
            FROM prompt_templates WHERE ${where.join(" AND ")} ORDER BY updated_at DESC`,
      args
    });
    return NextResponse.json({ templates: res.rows });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
