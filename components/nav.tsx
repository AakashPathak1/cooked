"use client";

import { Bell, ChefHat, Home, Plus, Search, Swords, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/logo";
import { Avatar } from "@/components/ui/avatar";
import { buttonStyles } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";
import { cn } from "@/lib/cn";

const isActive = (path: string, href: string) =>
  href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold leading-none text-brand-ink">
      {count > 9 ? "9+" : count}
    </span>
  );
}

const tabs = [
  { href: "/", label: "Feed", Icon: Home },
  { href: "/leaderboard", label: "Top", Icon: Trophy },
  { href: "/rank", label: "Rank", Icon: Swords },
] as const;

export function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const path = usePathname() ?? "/";
  const { me, unread } = useMe();
  const profileHref = "/me";

  return (
    <div className="min-h-dvh md:pl-60">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-bg px-4 py-6 md:flex">
        <Link href="/" className="mb-8 px-2" aria-label="Cooked home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
          {[
            { href: "/", label: "Feed", Icon: Home },
            { href: "/leaderboard", label: "Top dishes", Icon: Trophy },
            { href: "/rank", label: "Rank your dishes", Icon: Swords },
            { href: "/people", label: "Find cooks", Icon: Users },
            { href: "/notifications", label: "Activity", Icon: Bell, badge: unread },
          ].map(({ href, label, Icon, badge }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(path, href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors hover:bg-sunk",
                isActive(path, href) ? "bg-sunk text-ink" : "text-mute"
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden />
                <Badge count={badge ?? 0} />
              </span>
              {label}
            </Link>
          ))}
          <Link href="/upload" className={cn(buttonStyles({ size: "lg" }), "mt-4")}>
            <ChefHat className="h-5 w-5" aria-hidden />
            Add a dish
          </Link>
        </nav>
        <Link
          href={profileHref}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sunk",
            isActive(path, "/me") && "bg-sunk"
          )}
        >
          <Avatar name={me?.displayName ?? ""} src={me?.photoURL} size={32} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{me?.displayName ?? "You"}</span>
        </Link>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 pt-safe backdrop-blur-md md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" aria-label="Cooked home">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/people" aria-label="Find cooks" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-sunk">
              <Search className="h-5 w-5" />
            </Link>
            <Link
              href="/notifications"
              aria-label={unread > 0 ? `Activity, ${unread} unread` : "Activity"}
              className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-sunk"
            >
              <span className="relative">
                <Bell className="h-5 w-5" />
                <Badge count={unread} />
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className={cn("mx-auto w-full px-4 pb-nav pt-5 md:px-8 md:pb-20 md:pt-8", wide ? "max-w-5xl" : "max-w-[620px]")}>
        {children}
      </main>

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-bg/97 pb-safe backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {tabs.slice(0, 2).map(({ href, label, Icon }) => (
            <TabLink key={href} href={href} label={label} active={isActive(path, href)}>
              <Icon className="h-[22px] w-[22px]" aria-hidden />
            </TabLink>
          ))}
          <li className="flex justify-center">
            <Link
              href="/upload"
              aria-label="Add a dish"
              className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-[0_6px_18px_-4px_hsl(var(--brand)/0.6)] transition-transform active:scale-95"
            >
              <Plus className="h-7 w-7" strokeWidth={2.4} aria-hidden />
            </Link>
          </li>
          <TabLink href="/rank" label="Rank" active={isActive(path, "/rank")}>
            <Swords className="h-[22px] w-[22px]" aria-hidden />
          </TabLink>
          <TabLink href={profileHref} label="You" active={isActive(path, "/me")}>
            <Avatar name={me?.displayName ?? ""} src={me?.photoURL} size={24} className={cn(isActive(path, "/me") && "ring-2 ring-ink ring-offset-2 ring-offset-bg")} />
          </TabLink>
        </ul>
      </nav>
    </div>
  );
}

function TabLink({ href, label, active, children }: { href: string; label: string; active: boolean; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn("flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-ink" : "text-mute")}
      >
        {children}
        {label}
      </Link>
    </li>
  );
}

/** Page heading used at the top of most screens. */
export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-tightest md:text-4xl">{title}</h1>
        {sub && <p className="mt-1 text-[15px] text-mute">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
