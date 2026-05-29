export const dynamic = "force-dynamic";

import Link from "next/link";
import { Barlow_Condensed, DM_Sans } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { auth, signOut } from "@/auth";
import AccountMenu from "@/components/AccountMenu";
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
          <div className="topbar-inner">
            <span className="brand">COACH SOCIAL MEDIA STUDIO</span>
            {session?.user ? (
              <AccountMenu
                name={session.user.name}
                email={session.user.email}
                image={session.user.image}
                signOutAction={signOutAction}
              />
            ) : (
              <Link className="nav-link" href="/signin">Sign In</Link>
            )}
          </div>
        </header>
        <main className="container page">{children}</main>
      </body>
    </html>
  );
}
