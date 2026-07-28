"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  History,
  Settings,
  LogOut,
  Code2,
  ChevronRight,
  Bug,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Sync History",
    href: "/dashboard/history",
    icon: History,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
  {
    label: "Debug",
    href: "/dashboard/debug",
    icon: Bug,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="w-72 min-h-screen border-r border-border/50 bg-sidebar flex flex-col animate-slide-in-left">
      {/* Logo */}
      <div className="px-6 h-16 flex items-center gap-2 border-b border-border/50">
        <Code2 className="w-6 h-6 text-primary" />
        <span className="text-lg font-bold tracking-tight">CodeSync</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <item.icon className={cn("w-4.5 h-4.5", isActive && "text-primary")} />
              {item.label}
              {item.href === "/dashboard/debug" && !isActive && (
                <span className="ml-auto text-[9px] font-bold px-1 py-0.5 rounded bg-muted text-muted-foreground/70 uppercase tracking-wide">
                  dev
                </span>
              )}
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-primary/50" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="px-3 py-4 border-t border-border/50 space-y-2">
        {session?.user && (
          <div className="flex items-center gap-3 px-3 py-2">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                className="w-8 h-8 rounded-full ring-2 ring-border"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                {session.user.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {session.user.name || "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {session.user.githubUsername
                  ? `@${session.user.githubUsername}`
                  : session.user.email}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
        >
          <LogOut className="w-4.5 h-4.5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
