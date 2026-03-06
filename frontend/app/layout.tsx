import type { Metadata } from "next";
import "./globals.css";
import LayoutShell from "@/components/LayoutShell";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "RevAgent — Revenue Intelligence",
  description: "Multi-agent AI system for SaaS revenue analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark')}else if(!t){/* default is light, no class needed */}}catch(e){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <TooltipProvider>
          <LayoutShell>{children}</LayoutShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
