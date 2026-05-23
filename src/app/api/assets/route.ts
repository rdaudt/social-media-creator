import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { bootstrapSchema, db } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";

export async function GET() {
  try {
    await bootstrapSchema();
    const user = await getSessionUser();
    const res = await db.execute({
      sql: `SELECT id, title, blob_url, created_at FROM assets WHERE owner_google_sub = ? ORDER BY created_at DESC LIMIT 200`,
      args: [user.sub]
    });
    return NextResponse.json({ assets: res.rows });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
