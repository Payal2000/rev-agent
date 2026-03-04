import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "RevAgent — Revenue Intelligence",
  description: "Multi-agent AI system for SaaS revenue analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning style={{ margin: 0, display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-base)" }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
