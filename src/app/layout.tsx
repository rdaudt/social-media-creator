export const dynamic = "force-dynamic";

import Link from "next/link";
import { Barlow_Condensed, DM_Sans } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { auth, signOut } from "@/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Social Media Creator",
  description: "Create branded social media graphics from HIIT class data.",
  applicationName: "Social Media Creator",
  appleWebApp: {
    capable: true,
    title: "Social Media Creator",
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a"
};

const displayFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display"
});

const bodyFont = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body"
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  const session = await auth();

  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <header className="topbar">
          <nav>
            <span className="brand">Social Media Creator</span>
            <Link className="nav-link" href="/chat">Media Creation</Link>
            <Link className="nav-link" href="/admin/prompt-templates">Admin Templates</Link>
            {session?.user ? (
              <form action={signOutAction} style={{ display: "inline" }}>
                <button type="submit">Sign Out ({session.user.email})</button>
              </form>
            ) : (
              <Link className="nav-link" href="/signin">Sign In</Link>
            )}
          </nav>
        </header>
        <main className="container page">{children}</main>
      </body>
    </html>
  );
}
