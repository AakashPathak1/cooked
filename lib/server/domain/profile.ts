import "server-only";

import type { DishSummary, ProfileDTO } from "@/lib/types";
import { notFound } from "../errors";
import { getStore, chunk } from "../store";
import {
  C,
  DISH_FIELDS,
  iso,
  toDish,
  toElo,
  toMember,
  type DishRecord,
} from "./records";
import { summarize, type PersonalContext } from "./summaries";
import { getUserByHandle } from "./users";

async function loadDishes(ids: string[]): Promise<DishRecord[]> {
  const store = getStore();
  const out: DishRecord[] = [];
  for (const group of chunk([...new Set(ids)], 100)) {
    const docs = await store.getMany(C.dishes, group, { select: [...DISH_FIELDS] });
    for (const d of docs) if (d) out.push(toDish(d));
  }
  return out;
}

/** A person's own ranked dishes, best first. Public ones only for other people. */
export async function getPersonalDishes(
  viewerUid: string,
  subjectUid: string
): Promise<{ dishes: DishSummary[]; collabs: number; averageElo: number | null }> {
  const store = getStore();
  const [members, elos] = await Promise.all([
    store.query(C.userDishes, { where: [{ field: "userId", op: "==", value: subjectUid }] }),
    store.query(C.userDishElos, { where: [{ field: "userId", op: "==", value: subjectUid }] }),
  ]);
  const roles = new Map(members.map(toMember).map((m) => [m.dishId, m.role]));
  const eloOf = new Map(elos.map(toElo).map((e) => [e.dishId, e.elo]));

  let dishes = await loadDishes([...roles.keys()]);
  const self = viewerUid === subjectUid;
  if (!self) dishes = dishes.filter((d) => !d.isPrivate);

  const personal = new Map<string, PersonalContext>();
  for (const d of dishes) {
    personal.set(d.id, { elo: eloOf.get(d.id) ?? d.globalScore, role: roles.get(d.id)! });
  }
  dishes.sort((a, b) => personal.get(b.id)!.elo - personal.get(a.id)!.elo);

  const collabs = dishes.filter(
    (d) => personal.get(d.id)!.role !== "creator" || d.taggedUserIds.length > 0
  ).length;
  const averageElo = dishes.length
    ? dishes.reduce((sum, d) => sum + personal.get(d.id)!.elo, 0) / dishes.length
    : null;

  return { dishes: await summarize(viewerUid, dishes, personal), collabs, averageElo };
}

/** Dishes the person was tagged in but hasn't answered yet. */
export async function getPendingTags(uid: string): Promise<DishSummary[]> {
  const store = getStore();
  const rows = await store.query(C.dishes, {
    where: [{ field: "taggedUserIds", op: "array-contains", value: uid }],
    select: [...DISH_FIELDS],
  });
  const dishes = rows.map(toDish).filter((d) => d.creatorId !== uid);
  if (dishes.length === 0) return [];
  const joined = await store.getMany(
    C.userDishes,
    dishes.map((d) => `${uid}_${d.id}`),
    { select: ["userId"] }
  );
  const pending = dishes
    .filter((_, i) => !joined[i])
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  return summarize(uid, pending);
}

export async function getSaved(uid: string): Promise<DishSummary[]> {
  const store = getStore();
  const rows = await store.query(C.saved, { where: [{ field: "userId", op: "==", value: uid }] });
  const at = new Map(
    rows.map((r) => [String(r.data.dishId), (r.data.createdAt as Date | undefined)?.getTime() ?? 0])
  );
  const dishes = (await loadDishes([...at.keys()])).filter(
    // A saved dish may since have been made private by someone else.
    (d) => !d.isPrivate || d.creatorId === uid || d.taggedUserIds.includes(uid)
  );
  dishes.sort((a, b) => (at.get(b.id) ?? 0) - (at.get(a.id) ?? 0));
  return summarize(uid, dishes);
}

export async function getProfile(viewerUid: string, handle: string): Promise<ProfileDTO> {
  const user = await getUserByHandle(handle);
  if (!user) throw notFound("Cook not found");
  const self = user.uid === viewerUid;

  const [personal, pendingTags, saved] = await Promise.all([
    getPersonalDishes(viewerUid, user.uid),
    self ? getPendingTags(user.uid) : Promise.resolve([]),
    self ? getSaved(user.uid) : Promise.resolve([]),
  ]);

  return {
    user: {
      uid: user.uid,
      handle: user.handle,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: iso(user.createdAt),
    },
    isSelf: self,
    stats: {
      dishes: personal.dishes.length,
      collabs: personal.collabs,
      averageElo: personal.averageElo,
    },
    dishes: personal.dishes,
    pendingTags,
    saved,
  };
}
