import { cookies, headers } from "next/headers";
import { SessionUser } from "@/types";

export async function getSessionUser(): Promise<SessionUser> {
  const cookieStore = await cookies();
  const sub = cookieStore.get("smc_sub")?.value ?? "dev-coach-sub";
  const email = cookieStore.get("smc_email")?.value ?? "coach@example.com";
  const roleCookie = cookieStore.get("smc_role")?.value;
  const roleHeader = (await headers()).get("x-smc-role");
  const role = roleCookie === "admin" || roleHeader === "admin" ? "admin" : "coach";
  return { sub, email, role };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user.role !== "admin") {
    throw new Error("forbidden");
  }
  return user;
}
