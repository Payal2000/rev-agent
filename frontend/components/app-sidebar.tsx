"use client"

import * as React from "react"
import {
  IconAlertTriangle,
  IconBell,
  IconChartBar,
  IconChartLine,
  IconDashboard,
  IconHelp,
  IconMessageChatbot,
  IconSettings,
  IconTrendingUp,
} from "@tabler/icons-react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "Payal Nagaonkar",
    email: "payal@revagent.ai",
    avatar: "",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: IconDashboard,
    },
    {
      title: "Chat",
      url: "/chat",
      icon: IconMessageChatbot,
    },
    {
      title: "Insights",
      url: "/insights",
      icon: IconAlertTriangle,
    },
    {
      title: "Forecasts",
      url: "/forecasts",
      icon: IconChartLine,
    },
    {
      title: "Approvals",
      url: "/approvals",
      icon: IconBell,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: IconSettings,
    },
    {
      title: "Get Help",
      url: "#",
      icon: IconHelp,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="pb-0 pt-5">
        <div className="flex items-center justify-between px-3 pb-1">
          <a href="/dashboard" className="flex items-center gap-2.5 hover:no-underline">
            <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm">
              <IconTrendingUp className="size-4 text-white" />
            </span>
            <span className="text-[15px] font-black tracking-widest uppercase text-foreground">RevAgent</span>
          </a>
          <SidebarTrigger className="text-muted-foreground hover:text-foreground hover:bg-black/5" />
        </div>
        <div className="mx-3 mt-4 border-b border-sidebar-border" />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
