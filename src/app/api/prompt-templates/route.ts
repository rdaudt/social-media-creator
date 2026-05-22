import { NextResponse } from "next/server";
import { bootstrapSchema, db } from "@/lib/db";

export async function GET(req: Request) {
  await bootstrapSchema();
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
}