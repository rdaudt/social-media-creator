import { NextResponse } from "next/server";
import { bootstrapSchema } from "@/lib/db";

export async function GET() {
  await bootstrapSchema();
  return NextResponse.json({ ok: true, status: "healthy", at: new Date().toISOString() });
}
