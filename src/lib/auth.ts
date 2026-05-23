import { SessionUser } from "@/types";
import { auth } from "@/auth";

export async function getSessionUser(): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.sub || !user?.email) {
    throw new Error("unauthorized");
  }
  const role = user.role === "admin" ? "admin" : "coach";
  return { sub: user.sub, email: user.email, role };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user.role !== "admin") {
    throw new Error("forbidden");
  }
  return user;
}
