"use client";

import { ArrowRight, Equal, SkipForward } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Cover } from "@/components/cover";
import { Shell } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { ScoreStamp } from "@/components/ui/score-stamp";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { errorMessage, request } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { pairKey } from "@/lib/pairing";
import { eloToScore } from "@/lib/score";
import type { DuelDish, DuelPair, RateResult } from "@/lib/types";

type Verdict = "a" | "b" | "tie";

interface Reveal {
  verdict: Verdict;
  after: Record<string, { before: number; after: number }>;
  next: DuelPair | null;
}

function Tile({
  dish,
  letter,
  reveal,
  disabled,
  onPick,
}: {
  dish: DuelDish;
  letter: "a" | "b";
  reveal: Reveal | null;
  disabled: boolean;
  onPick: () => void;
}) {
  const change = reveal?.after[dish.id];
  const won = reveal && (reveal.verdict === letter);
  const lost = reveal && reveal.verdict !== letter && reveal.verdict !== "tie";
  const delta = change ? eloToScore(change.after) - eloToScore(change.before) : 0;

  return (
    <button
      onClick={onPick}
      disabled={disabled}
      aria-label={`Choose ${dish.name}`}
      aria-keyshortcuts={letter === "a" ? "A 1" : "B 2"}
      className={cn(
        "group relative block w-full overflow-hidden rounded-3xl text-left outline-offset-4 transition-all duration-300",
        !reveal && !disabled && "active:scale-[0.985]",
        lost && "scale-[0.97] opacity-60",
        won && "ring-4 ring-brand ring-offset-4 ring-offset-bg"
      )}
    >
      <Cover src={dish.coverUrl} color={dish.coverColor} ratio="aspect-[3/2] md:aspect-[4/5]" priority />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
        <p className="font-display text-[22px] font-extrabold leading-tight tracking-tight text-white drop-shadow md:text-2xl">
          {dish.name}
        </p>
        {change && (
          <span className="flex shrink-0 flex-col items-center gap-1 animate-pop-in">
            <ScoreStamp elo={change.after} size="md" label="New score" />
            <span
              className={cn(
                "rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold tabular text-white",
                delta === 0 && "opacity-70"
              )}
            >
              {delta > 0 ? "+" : delta < 0 ? "−" : "±"}
              {Math.abs(delta).toFixed(1)}
            </span>
          </span>
        )}
      </div>
    </button>
  );
}

function Duel() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const focus = params.get("focus") ?? undefined;

  const [pair, setPair] = useState<DuelPair | null | undefined>(undefined); // undefined = loading
  const [exclude, setExclude] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [count, setCount] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(
    async (skip: string[]) => {
      setFailed(null);
      try {
        const qs = new URLSearchParams();
        if (focus) qs.set("focus", focus);
        if (skip.length) qs.set("exclude", skip.join(","));
        const res = await request<{ next: DuelPair | null }>(`/api/rate/next?${qs}`);
        setPair(res.next);
      } catch (err) {
        setFailed(errorMessage(err));
      }
    },
    [focus]
  );

  useEffect(() => {
    void load([]);
    return () => clearTimeout(timer.current);
  }, [load]);

  const choose = useCallback(
    async (verdict: Verdict) => {
      if (!pair || busy || reveal) return;
      setBusy(true);
      try {
        const res = await request<RateResult>("/api/rate", {
          method: "POST",
          body: { a: pair.a.id, b: pair.b.id, result: verdict, focusId: focus, exclude },
        });
        const after = Object.fromEntries(res.changes.map((c) => [c.dishId, { before: c.before, after: c.after }]));
        setReveal({ verdict, after, next: res.next });
        setExclude((cur) => [...cur, pairKey(pair.a.id, pair.b.id)].slice(-100));
        setCount((n) => n + 1);
        void mutate((k) => typeof k === "string" && (k.startsWith("/api/leaderboard") || k.startsWith("/api/profile")), undefined, { revalidate: true });
        timer.current = setTimeout(() => {
          setPair(res.next);
          setReveal(null);
        }, 1100);
      } catch (err) {
        toast({ message: errorMessage(err), tone: "error" });
      } finally {
        setBusy(false);
      }
    },
    [pair, busy, reveal, focus, exclude, mutate, toast]
  );

  async function skip() {
    if (!pair) return;
    const next = [...exclude, pairKey(pair.a.id, pair.b.id)].slice(-100);
    setExclude(next);
    setPair(undefined);
    await load(next);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "a" || e.key === "1" || e.key === "ArrowLeft") void choose("a");
      else if (e.key === "b" || e.key === "2" || e.key === "ArrowRight") void choose("b");
      else if (e.key === "t" || e.key === "=") void choose("tie");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose]);

  if (failed) {
    return (
      <Empty
        title="Couldn't load a matchup"
        body={failed}
        action={<Button onClick={() => load(exclude)}>Try again</Button>}
      />
    );
  }

  if (pair === undefined) {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-busy aria-label="Loading matchup">
        <Skeleton className="aspect-[3/2] rounded-3xl md:aspect-[4/5]" />
        <Skeleton className="aspect-[3/2] rounded-3xl md:aspect-[4/5]" />
      </div>
    );
  }

  if (pair === null) {
    return (
      <Empty
        title={count > 0 ? "That's every matchup" : "Add two dishes to start ranking"}
        body={
          count > 0
            ? `You compared ${count} ${count === 1 ? "pair" : "pairs"}. Your order is up to date. Cook something new and it will turn up here.`
            : "Rankings come from picking the better of two dishes. Add a few and come back."
        }
        action={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/upload">Add a dish</Link>
            </Button>
            {count > 0 && (
              <Button variant="soft" onClick={() => router.push("/me")}>
                See your list <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        }
      />
    );
  }

  const active = reveal ? null : pair;
  const shown = pair;
  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-tightest">Which was better?</h1>
          <p className="text-sm text-mute">Tap a dish, or press A / B on a keyboard.</p>
        </div>
        {count > 0 && <p className="tabular text-sm font-medium text-mute">{count} done</p>}
      </div>

      <div className="relative grid gap-3 md:grid-cols-2 md:gap-5" aria-live="polite">
        <Tile dish={shown.a} letter="a" reveal={reveal} disabled={!active || busy} onPick={() => choose("a")} />
        <Tile dish={shown.b} letter="b" reveal={reveal} disabled={!active || busy} onPick={() => choose("b")} />
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink font-display text-sm font-extrabold text-bg shadow-lg ring-4 ring-bg"
        >
          vs
        </span>
      </div>

      <div className="mt-5 flex justify-center gap-2">
        <Button variant="soft" onClick={() => choose("tie")} disabled={!active || busy}>
          <Equal className="h-4 w-4" aria-hidden /> Too close to call
        </Button>
        <Button variant="ghost" onClick={skip} disabled={!active || busy}>
          <SkipForward className="h-4 w-4" aria-hidden /> Skip
        </Button>
      </div>
    </div>
  );
}

export default function RankPage() {
  return (
    <Shell wide>
      <div className="mx-auto max-w-3xl">
        <Suspense>
          <Duel />
        </Suspense>
      </div>
    </Shell>
  );
}
