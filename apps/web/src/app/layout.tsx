import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARF-OS — Algorithmic Research Framework",
  description: "Multi-agent systematic trading strategy research OS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <nav className="border-b border-[var(--card-border)] bg-[var(--card)] px-6 py-3 flex items-center gap-6">
            <a href="/" className="text-lg font-bold text-[var(--accent)]">
              ARF-OS
            </a>
            <a href="/campaigns" className="text-sm text-[var(--muted-fg)] hover:text-[var(--foreground)]">
              Campaigns
            </a>
            <a href="/strategies" className="text-sm text-[var(--muted-fg)] hover:text-[var(--foreground)]">
              Strategies
            </a>
          </nav>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
