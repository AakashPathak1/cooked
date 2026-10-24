import "server-only";

import type { SearchResults } from "@/lib/types";
import { getStore } from "../store";
import { C, DISH_FIELDS, toDish } from "./records";
import { summarize } from "./summaries";
import { listUsers } from "./users";

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Substring search over cooks and public dishes. Firestore has no text search,
 * so this scans the newest public dishes; fine at this scale and cheap because
 * only the small fields are read.
 */
export async function search(viewerUid: string, raw: string): Promise<SearchResults> {
  const q = norm(raw.trim());
  if (!q) return { users: [], dishes: [] };

  const [users, rows] = await Promise.all([
    listUsers(),
    getStore().query(C.dishes, {
      where: [{ field: "isPrivate", op: "==", value: false }],
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit: 400,
      select: [...DISH_FIELDS],
    }),
  ]);

  const matchedUsers = users
    .filter((u) => norm(u.displayName).includes(q) || u.handle.includes(q.replace(/^@/, "")))
    .slice(0, 8);
  const matchedDishes = rows
    .map(toDish)
    .filter((d) => norm(d.name).includes(q))
    .slice(0, 20);

  return { users: matchedUsers, dishes: await summarize(viewerUid, matchedDishes) };
}
