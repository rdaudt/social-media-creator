import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { bootstrapSchema, db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await bootstrapSchema();
  const user = await getSessionUser();
  const { id } = await params;

  const own = await db.execute({
    sql: `SELECT id FROM chat_sessions WHERE id = ? AND owner_google_sub = ? LIMIT 1`,
    args: [id, user.sub]
  });
  if (!own.rows[0]) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const res = await db.execute({
    sql: `SELECT id, role, content, attachments_json, generation_metadata_json, parent_message_id, created_at
          FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC`,
    args: [id]
  });
  return NextResponse.json({ messages: res.rows });
}