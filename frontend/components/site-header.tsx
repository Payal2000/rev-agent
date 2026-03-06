"use client"

import { Search } from "lucide-react"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"

function FloatingSidebarTrigger() {
  const { open } = useSidebar()
  if (open) return null
  return (
    <div className="absolute left-3 z-50">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground hover:bg-black/5" />
    </div>
  )
}

export function SiteHeader() {
  return (
    <header className="relative flex h-(--header-height) shrink-0 items-center transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <FloatingSidebarTrigger />

      {/* Search bar — left-aligned */}
      <div className="flex flex-1 justify-start pl-4 pr-4">
        <div className="flex items-center gap-2 w-full max-w-sm rounded-full border border-black/10 bg-white/80 px-4 py-2 shadow-sm text-muted-foreground">
          <Search size={14} className="shrink-0 text-muted-foreground/60" />
          <span className="flex-1 text-xs">Search or type a command</span>
          <kbd className="text-xs text-muted-foreground/50 font-mono">⌘ F</kbd>
        </div>
      </div>

      {/* Right — bell only */}
      <div className="absolute right-0 flex items-center pr-5">
        <button className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-black/5 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
      </div>
    </header>
  )
}
