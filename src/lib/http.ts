import { NextResponse } from "next/server";

export function authErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null;
  if (error.message === "unauthorized") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (error.message === "forbidden") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}
