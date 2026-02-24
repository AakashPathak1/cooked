"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, User, Plus, Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { getUnreadNotificationCount } from "@/lib/firestore";

export function BottomNav() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    getUnreadNotificationCount(user.uid).then(setUnread);
    const id = setInterval(() => getUnreadNotificationCount(user.uid).then(setUnread), 30_000);
    return () => clearInterval(id);
  }, [user]);

  if (!user) return null;

  const handle = user.displayName?.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") ?? "me";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-100 pb-safe">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-4">
        <NavTab href="/" icon={Home} label="Home" active={pathname === "/"} />
        <NavTab href="/people" icon={Users} label="People" active={pathname === "/people"} />

        {/* Center upload button */}
        <Link href="/upload" className="flex flex-col items-center -mt-3">
          <div className="w-14 h-14 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-200 active:scale-90 transition-transform">
            <Plus className="h-7 w-7 text-white" strokeWidth={2.5} />
          </div>
        </Link>

        <NavTab
          href="/notifications"
          icon={Bell}
          label="Activity"
          active={pathname === "/notifications"}
          unread={unread}
        />
        <NavTab
          href={`/profile/${handle}`}
          icon={User}
          label="Me"
          active={pathname.startsWith("/profile/")}
        />
      </div>
    </nav>
  );
}

function NavTab({
  href, icon: Icon, label, active, unread = 0,
}: {
  href: string; icon: React.ElementType; label: string; active: boolean; unread?: number;
}) {
  return (
    <Link href={href} className="relative flex flex-col items-center gap-0.5 w-14 py-1">
      <div className="relative">
        <div className={`p-1.5 rounded-2xl transition-all duration-200 ${active ? "bg-orange-50" : ""}`}>
          <Icon
            className={`h-5 w-5 transition-all duration-200 ${
              active ? "text-orange-500 scale-110" : "text-gray-400"
            }`}
            strokeWidth={active ? 2.5 : 2}
          />
        </div>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 badge-enter">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </div>
      <span className={`text-[10px] font-medium transition-colors duration-200 ${active ? "text-orange-500" : "text-gray-400"}`}>
        {label}
      </span>
      {active && (
        <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-orange-500 dot-enter" />
      )}
    </Link>
  );
}
