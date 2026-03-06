"use client";

import { useState, useCallback, useEffect } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Keep first client render aligned with SSR, then hydrate from localStorage.
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(saved);
    }
  }, []);

  // Apply theme class to <html> and persist
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const openMobile   = useCallback(() => setMobileOpen(true),  []);
  const closeMobile  = useCallback(() => setMobileOpen(false), []);
  const toggleTheme  = useCallback(() => setTheme(t => t === "dark" ? "light" : "dark"), []);

  return (
    <>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={closeMobile} />
      <div className="app-main">
        <TopBar onMenuClick={openMobile} theme={theme} onThemeToggle={toggleTheme} />
        <main style={{ flex: 1, overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </>
  );
}
