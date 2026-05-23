export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth, signOut } from "@/auth";
import "./globals.css";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  const session = await auth();

  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <nav>
            <Link href="/chat">Chat</Link>
            <Link href="/admin/prompt-templates">Admin Templates</Link>
            {session?.user ? (
              <form action={signOutAction} style={{ display: "inline" }}>
                <button type="submit">Sign Out ({session.user.email})</button>
              </form>
            ) : (
              <Link href="/signin">Sign In</Link>
            )}
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
