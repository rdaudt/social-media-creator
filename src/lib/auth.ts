import { SessionUser } from "@/types";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

type TestBypassSessionUser = SessionUser & { coachMember?: boolean };

const E2E_SESSION_COOKIE = "e2e_session_user";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getTestBypassSessionUser(): Promise<TestBypassSessionUser | null> {
  if (process.env.E2E_AUTH_BYPASS !== "1") return null;
  const cookieStore = await cookies();
  const raw = cookieStore.get(E2E_SESSION_COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<TestBypassSessionUser>;
    if (!parsed.sub || !parsed.email) return null;
    return {
      sub: String(parsed.sub),
      email: normalizeEmail(String(parsed.email)),
      role: parsed.role === "admin" ? "admin" : "coach",
      coachMember: typeof parsed.coachMember === "boolean" ? parsed.coachMember : undefined
    };
  } catch {
    return null;
  }
}

async function isCoachMemberByEmail(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const res = await db.execute({
    sql: `SELECT 1 FROM coach_tenants WHERE lower(owner_email) = ? LIMIT 1`,
    args: [normalized]
  });
  return Boolean(res.rows[0]);
}

export async function getSessionUser(): Promise<SessionUser> {
  const testBypassUser = await getTestBypassSessionUser();
  if (testBypassUser) {
    return { sub: testBypassUser.sub, email: testBypassUser.email, role: testBypassUser.role };
  }

  const session = await auth();
  const user = session?.user;
  if (!user?.sub || !user?.email) {
    throw new Error("unauthorized");
  }
  const role = user.role === "admin" ? "admin" : "coach";
  return { sub: user.sub, email: normalizeEmail(user.email), role };
}

export async function requireCoachSessionUser(): Promise<SessionUser> {
  const testBypassUser = await getTestBypassSessionUser();
  if (testBypassUser) {
    if (testBypassUser.coachMember === false) {
      throw new Error("forbidden");
    }
    return { sub: testBypassUser.sub, email: testBypassUser.email, role: testBypassUser.role };
  }

  const user = await getSessionUser();
  const isMember = await isCoachMemberByEmail(user.email);
  if (!isMember) {
    throw new Error("forbidden");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireCoachSessionUser();
  if (user.role !== "admin") {
    throw new Error("forbidden");
  }
  return user;
}
