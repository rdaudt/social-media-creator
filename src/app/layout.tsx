export const dynamic = "force-dynamic";

import Link from "next/link";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <nav>
            <Link href="/chat">Chat</Link>
            <Link href="/admin/prompt-templates">Admin Templates</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}