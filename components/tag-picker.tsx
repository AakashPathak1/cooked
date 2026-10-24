"use client";

import { Check, Search, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import type { UserLite } from "@/lib/types";

export function useCooks() {
  const { data, error, isLoading } = useSWR<{ users: UserLite[] }>("/api/users", { revalidateOnFocus: false });
  return { users: data?.users ?? [], error, loading: isLoading };
}

/** Chips of the chosen friends plus a button that opens the picker. */
export function TagPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { users, loading, error } = useCooks();
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(users.map((u) => [u.uid, u])), [users]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    return q ? users.filter((u) => u.displayName.toLowerCase().includes(q) || u.handle.includes(q)) : users;
  }, [users, query]);

  const toggle = (uid: string) =>
    onChange(value.includes(uid) ? value.filter((v) => v !== uid) : [...value, uid]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((uid) => {
          const u = byId.get(uid);
          return (
            <span key={uid} className="inline-flex items-center gap-1.5 rounded-full bg-sunk py-1 pl-1 pr-2 text-sm font-medium">
              <Avatar name={u?.displayName ?? "?"} src={u?.photoURL} size={22} />
              {u?.displayName ?? "Cook"}
              <button
                type="button"
                onClick={() => toggle(uid)}
                disabled={disabled}
                aria-label={`Remove ${u?.displayName ?? "cook"}`}
                className="rounded-full p-0.5 text-mute hover:bg-line hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
          <UserPlus className="h-4 w-4" aria-hidden />
          {value.length ? "Edit" : "Tag friends"}
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen} title="Tag friends" description="They'll be asked to add their own rating.">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            aria-label="Search cooks"
            className="pl-10"
          />
        </div>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-danger">Couldn&apos;t load cooks. Close this and try again.</p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-mute">
            {users.length === 0 ? "No one else has joined yet." : "No one matches that search."}
          </p>
        ) : (
          <ul className="-mx-2">
            {visible.map((u) => {
              const on = value.includes(u.uid);
              return (
                <li key={u.uid}>
                  <button
                    type="button"
                    onClick={() => toggle(u.uid)}
                    aria-pressed={on}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-sunk"
                  >
                    <Avatar name={u.displayName} src={u.photoURL} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{u.displayName}</span>
                      <span className="block truncate text-sm text-mute">@{u.handle}</span>
                    </span>
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border",
                        on ? "border-brand bg-brand text-brand-ink" : "border-line"
                      )}
                    >
                      {on && <Check className="h-4 w-4" strokeWidth={3} aria-hidden />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Button className="mt-4 w-full" onClick={() => setOpen(false)}>
          Done{value.length ? ` (${value.length})` : ""}
        </Button>
      </Sheet>
    </div>
  );
}
