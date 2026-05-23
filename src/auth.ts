import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";

type AppRole = "coach" | "admin";

let tenantColumnsPromise: Promise<Set<string>> | null = null;

async function getCoachTenantColumns(): Promise<Set<string>> {
  if (!tenantColumnsPromise) {
    tenantColumnsPromise = db.execute("PRAGMA table_info(coach_tenants)").then((res) => {
      const cols = new Set<string>();
      for (const row of res.rows) {
        const name = String((row as Record<string, unknown>).name ?? "").toLowerCase();
        if (name) cols.add(name);
      }
      return cols;
    }).catch(() => new Set<string>());
  }
  return tenantColumnsPromise;
}

async function getRoleByEmail(email: string | null | undefined): Promise<AppRole> {
  if (!email) return "coach";
  const normalized = email.trim().toLowerCase();
  if (!normalized) return "coach";

  const cols = await getCoachTenantColumns();
  if (cols.has("role")) {
    const res = await db.execute({
      sql: `SELECT role FROM coach_tenants WHERE lower(owner_email) = ? LIMIT 1`,
      args: [normalized]
    });
    const role = String((res.rows[0] as Record<string, unknown> | undefined)?.role ?? "").toLowerCase();
    return role === "admin" ? "admin" : "coach";
  }

  if (cols.has("is_admin")) {
    const res = await db.execute({
      sql: `SELECT is_admin FROM coach_tenants WHERE lower(owner_email) = ? LIMIT 1`,
      args: [normalized]
    });
    const value = Number((res.rows[0] as Record<string, unknown> | undefined)?.is_admin ?? 0);
    return value === 1 ? "admin" : "coach";
  }

  return "coach";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.AUTH_SESSION_SECRET,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "google") {
        token.sub = token.sub ?? account.providerAccountId;
      }
      const profileEmail = typeof profile?.email === "string" ? profile.email : null;
      const email = typeof token.email === "string" ? token.email : profileEmail;
      token.role = await getRoleByEmail(email);
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email ?? session.user.email;
        session.user.sub = typeof token.sub === "string" ? token.sub : "";
        session.user.role = token.role === "admin" ? "admin" : "coach";
      }
      return session;
    }
  }
});
