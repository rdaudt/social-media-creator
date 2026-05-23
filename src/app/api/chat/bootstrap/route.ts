import { NextResponse } from "next/server";
import { requireCoachSessionUser } from "@/lib/auth";
import { getCoachBootstrap } from "@/lib/context";
import { bootstrapSchema } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";

export async function GET() {
  try {
    await bootstrapSchema();
    const user = await requireCoachSessionUser();
    const payload = await getCoachBootstrap(user.email, user.sub);
    return NextResponse.json(payload);
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
