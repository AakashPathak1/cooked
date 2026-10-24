"use client";

import { Grid2x2, Layers, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { DishTile } from "@/components/dish-views";
import { Shell } from "@/components/nav";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Empty, ErrorState } from "@/components/ui/empty";
import { ScoreStamp } from "@/components/ui/score-stamp";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { TIER_ORDER, eloTier } from "@/lib/score";
import type { DishSummary, ProfileDTO } from "@/lib/types";

type Tab = "dishes" | "tags" | "saved";

function Grid({ dishes, personal }: { dishes: DishSummary[]; personal?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
      {dishes.map((d, i) => (
        <DishTile key={d.id} dish={d} personal={personal} rank={personal ? i + 1 : undefined} />
      ))}
    </div>
  );
}

function Tiers({ dishes }: { dishes: DishSummary[] }) {
  const byTier = new Map(TIER_ORDER.map((t) => [t, [] as DishSummary[]]));
  for (const d of dishes) byTier.get(eloTier(d.personalElo ?? d.elo))!.push(d);
  return (
    <div className="space-y-3">
      {TIER_ORDER.map((tier) => {
        const list = byTier.get(tier)!;
        if (list.length === 0) return null;
        const elo = { S: 1420, A: 1330, B: 1230, C: 1130, D: 1040 }[tier];
        return (
          <div key={tier} className="flex gap-3 rounded-2xl bg-sunk p-3">
            <div className="flex w-10 shrink-0 flex-col items-center gap-1 pt-1">
              <ScoreStamp elo={elo} size="sm" className="!px-0" />
              <span className="font-display text-sm font-extrabold" aria-label={`Tier ${tier}`}>
                {tier}
              </span>
            </div>
            <ul className="flex flex-wrap gap-2">
              {list.map((d) => (
                <li key={d.id} className="w-[76px]">
                  <DishTile dish={d} personal />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function ProfileView({ handle }: { handle: string | undefined }) {
  const { data, error, mutate } = useSWR<ProfileDTO>(handle ? `/api/profile/${encodeURIComponent(handle)}` : null);
  const [tab, setTab] = useState<Tab>("dishes");
  const [view, setView] = useState<"grid" | "tiers">("grid");

  if (error instanceof ApiError && error.status === 404) {
    return (
      <Shell>
        <Empty title="No cook by that name" body="Check the handle, or look for them from Find cooks." action={<Button asChild><Link href="/people">Find cooks</Link></Button>} />
      </Shell>
    );
  }
  if (error) {
    return (
      <Shell>
        <ErrorState message={error.message} onRetry={() => mutate()} />
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <div className="flex items-center gap-4" aria-busy>
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      </Shell>
    );
  }

  const { user, stats, isSelf } = data;
  const tabs: { id: Tab; label: string; count: number; show: boolean }[] = [
    { id: "dishes", label: "Dishes", count: data.dishes.length, show: true },
    { id: "tags", label: "To answer", count: data.pendingTags.length, show: isSelf },
    { id: "saved", label: "Saved", count: data.saved.length, show: isSelf },
  ];
  const visibleTabs = tabs.filter((t) => t.show);
  const list = tab === "dishes" ? data.dishes : tab === "tags" ? data.pendingTags : data.saved;

  return (
    <Shell>
      <header className="flex items-start gap-4">
        <Avatar name={user.displayName} src={user.photoURL} size={80} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[28px] font-extrabold leading-tight tracking-tightest">{user.displayName}</h1>
          <p className="text-[15px] text-mute">@{user.handle}</p>
          <p className="mt-2 text-sm text-mute">
            {plural(stats.dishes, "dish", "dishes")}
            {stats.collabs > 0 && <> · {plural(stats.collabs, "shared dish", "shared dishes")}</>}
          </p>
        </div>
        {stats.averageElo !== null && <ScoreStamp elo={stats.averageElo} size="md" label="Average score" />}
        {isSelf && (
          <Button asChild variant="ghost" size="icon" aria-label="Settings">
            <Link href="/settings">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>
        )}
      </header>

      <div className="mt-7 flex items-center justify-between gap-3">
        {visibleTabs.length > 1 ? (
          <div role="tablist" aria-label="Profile sections" className="flex min-w-0 gap-0.5 overflow-x-auto rounded-full bg-sunk p-1 scrollbar-none">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  tab === t.id ? "bg-surface text-ink shadow-sm" : "text-mute hover:text-ink"
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={cn("ml-1.5 tabular", t.id === "tags" && tab !== t.id ? "rounded-full bg-brand px-1.5 text-xs font-bold text-brand-ink" : "text-mute")}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="font-display text-xl font-bold">Dishes, best first</h2>
        )}
        {tab === "dishes" && data.dishes.length > 0 && (
          <div className="flex gap-1" role="group" aria-label="View">
            <Button variant={view === "grid" ? "soft" : "ghost"} size="iconSm" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
              <Grid2x2 className="h-4 w-4" />
            </Button>
            <Button variant={view === "tiers" ? "soft" : "ghost"} size="iconSm" aria-label="Tier list" aria-pressed={view === "tiers"} onClick={() => setView("tiers")}>
              <Layers className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-5" role="tabpanel">
        {list.length === 0 ? (
          <Empty
            title={tab === "dishes" ? (isSelf ? "No dishes yet" : "Nothing shared yet") : tab === "tags" ? "Nothing waiting on you" : "Nothing saved"}
            body={
              tab === "dishes"
                ? isSelf
                  ? "Add a dish and it starts your ranking."
                  : "Public dishes will show up here."
                : tab === "tags"
                  ? "When a friend tags you in a dish, it lands here."
                  : "Tap the bookmark on any dish to keep it here."
            }
            action={tab === "dishes" && isSelf ? <Button asChild><Link href="/upload">Add a dish</Link></Button> : undefined}
          />
        ) : tab === "dishes" && view === "tiers" ? (
          <Tiers dishes={list} />
        ) : (
          <Grid dishes={list} personal={tab === "dishes"} />
        )}
      </div>
    </Shell>
  );
}
