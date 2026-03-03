import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "RevAgent — Revenue Intelligence",
  description: "Multi-agent AI system for SaaS revenue analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning style={{ margin: 0, display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-base)" }}>
        <Sidebar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <TopBar />
          <main style={{ flex: 1, overflowY: "auto" }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
