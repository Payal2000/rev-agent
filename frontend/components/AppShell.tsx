"use client";

import { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const openMobile  = useCallback(() => setMobileOpen(true),  []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={closeMobile} />
      <div className="app-main">
        <TopBar onMenuClick={openMobile} />
        <main style={{ flex: 1, overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </>
  );
}
