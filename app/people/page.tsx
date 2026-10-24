"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { useCooks } from "@/components/tag-picker";
import { DishTile } from "@/components/dish-views";
import { PageTitle, Shell } from "@/components/nav";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { SearchResults, UserLite } from "@/lib/types";

function CookRow({ user }: { user: UserLite }) {
  return (
    <li>
      <Link href={`/profile/${user.handle}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-sunk">
        <Avatar name={user.displayName} src={user.photoURL} size={44} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">{user.displayName}</span>
          <span className="block truncate text-sm text-mute">@{user.handle}</span>
        </span>
      </Link>
    </li>
  );
}

export default function PeoplePage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);

  const { users, loading } = useCooks();
  const { data: results, isLoading: searching } = useSWR<SearchResults>(
    debounced ? `/api/search?q=${encodeURIComponent(debounced)}` : null,
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  return (
    <Shell>
      <PageTitle title="Find cooks" />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" aria-hidden />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search cooks and dishes"
          aria-label="Search cooks and dishes"
          className="pl-10"
          autoComplete="off"
        />
      </div>

      <div className="mt-6" aria-live="polite">
        {debounced ? (
          searching && !results ? (
            <Skeleton className="h-40" />
          ) : results && results.users.length + results.dishes.length === 0 ? (
            <Empty title="No matches" body={`Nothing matches “${debounced}”. Try part of a name.`} />
          ) : (
            results && (
              <div className="space-y-8">
                {results.users.length > 0 && (
                  <section>
                    <h2 className="mb-1 font-display text-xl font-bold">Cooks</h2>
                    <ul>{results.users.map((u) => <CookRow key={u.uid} user={u} />)}</ul>
                  </section>
                )}
                {results.dishes.length > 0 && (
                  <section>
                    <h2 className="mb-3 font-display text-xl font-bold">Dishes</h2>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
                      {results.dishes.map((d) => <DishTile key={d.id} dish={d} />)}
                    </div>
                  </section>
                )}
              </div>
            )
          )
        ) : loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : users.length === 0 ? (
          <Empty title="You're the first one here" body="Invite friends to sign in with Google and they'll show up here." />
        ) : (
          <section>
            <h2 className="mb-1 font-display text-xl font-bold">Everyone</h2>
            <ul>{users.map((u) => <CookRow key={u.uid} user={u} />)}</ul>
          </section>
        )}
      </div>
    </Shell>
  );
}
