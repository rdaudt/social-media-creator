import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { bootstrapSchema, db, newId, nowIso } from "@/lib/db";

export async function GET() {
  await bootstrapSchema();
  const user = await getSessionUser();
  const res = await db.execute({
    sql: `SELECT id, title, created_at, updated_at FROM chat_sessions
          WHERE owner_google_sub = ? ORDER BY updated_at DESC LIMIT 100`,
    args: [user.sub]
  });
  return NextResponse.json({ sessions: res.rows });
}

export async function POST(req: Request) {
  await bootstrapSchema();
  const user = await getSessionUser();
  const body = await req.json().catch(() => ({}));
  const id = newId("chat");
  const title = typeof body.title === "string" && body.title.trim() ? body.title : "New chat";
  const now = nowIso();
  await db.execute({
    sql: `INSERT INTO chat_sessions (id, owner_google_sub, title, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, user.sub, title, now, now]
  });
  return NextResponse.json({ id, title, createdAt: now, updatedAt: now }, { status: 201 });
}