"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trophy, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function BottomNav() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const tabs = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/leaderboard", icon: Trophy, label: "Board" },
    { href: "/me", icon: User, label: "Me" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 pb-safe">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-4">
        {tabs.map((tab) => (
          <NavTab key={tab.href} {...tab} active={pathname === tab.href} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({
  href, icon: Icon, label, active,
}: {
  href: string; icon: React.ElementType; label: string; active: boolean;
}) {
  return (
    <Link href={href} className="flex flex-col items-center gap-0.5 w-20 py-1">
      <Icon
        className={`h-6 w-6 transition-colors ${active ? "text-orange-500" : "text-gray-400"}`}
        strokeWidth={active ? 2.5 : 2}
      />
      <span className={`text-[10px] font-medium ${active ? "text-orange-500" : "text-gray-400"}`}>
        {label}
      </span>
    </Link>
  );
}
