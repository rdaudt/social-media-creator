import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { bootstrapSchema, db, newId, nowIso } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";

export async function GET() {
  try {
    await bootstrapSchema();
    const user = await getSessionUser();
    const res = await db.execute({
      sql: `SELECT id, title, created_at, updated_at FROM chat_sessions
            WHERE owner_google_sub = ? ORDER BY updated_at DESC LIMIT 100`,
      args: [user.sub]
    });
    return NextResponse.json({ sessions: res.rows });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
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
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
