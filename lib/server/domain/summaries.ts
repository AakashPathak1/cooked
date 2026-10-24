import "server-only";

import type { DishSummary, DishViewerState, Role } from "@/lib/types";
import { getStore } from "../store";
import { C, coverUrl, iso, memberId, toMember, type DishRecord } from "./records";
import { getUsersOrPlaceholder } from "./users";

export interface PersonalContext {
  elo: number;
  role: Role;
}

export interface ViewerFlags {
  liked: Set<string>;
  saved: Set<string>;
  roles: Map<string, Role>;
}

/** One batched round trip per collection for the viewer's own state. */
export async function loadViewerFlags(viewerUid: string, dishIds: string[]): Promise<ViewerFlags> {
  const store = getStore();
  const ids = dishIds.map((id) => memberId(viewerUid, id));
  const [likes, saved, members] = await Promise.all([
    store.getMany(C.likes, ids, { select: ["userId"] }),
    store.getMany(C.saved, ids, { select: ["userId"] }),
    store.getMany(C.userDishes, ids),
  ]);
  const liked = new Set<string>();
  const savedSet = new Set<string>();
  const roles = new Map<string, Role>();
  dishIds.forEach((dishId, i) => {
    if (likes[i]) liked.add(dishId);
    if (saved[i]) savedSet.add(dishId);
    const m = members[i];
    if (m) roles.set(dishId, toMember(m).role);
  });
  return { liked, saved: savedSet, roles };
}

export function viewerStateFor(
  viewerUid: string,
  dish: DishRecord,
  flags: ViewerFlags
): DishViewerState {
  const role = flags.roles.get(dish.id) ?? null;
  return {
    liked: flags.liked.has(dish.id),
    saved: flags.saved.has(dish.id),
    role,
    pendingTag: !role && dish.creatorId !== viewerUid && dish.taggedUserIds.includes(viewerUid),
  };
}

/**
 * Turn dish records into card data for the viewer. `personal` supplies the
 * rating/role of whoever's list this is (the profile owner), when relevant.
 */
export async function summarize(
  viewerUid: string,
  dishes: DishRecord[],
  personal?: Map<string, PersonalContext>
): Promise<DishSummary[]> {
  if (dishes.length === 0) return [];
  const [creators, flags] = await Promise.all([
    getUsersOrPlaceholder(dishes.map((d) => d.creatorId)),
    loadViewerFlags(
      viewerUid,
      dishes.map((d) => d.id)
    ),
  ]);

  return dishes.map((dish): DishSummary => {
    const ctx = personal?.get(dish.id);
    return {
      id: dish.id,
      name: dish.name,
      creator: creators.get(dish.creatorId)!,
      coverUrl: coverUrl(dish),
      coverColor: dish.coverColor,
      elo: dish.globalScore,
      personalElo: ctx?.elo ?? null,
      role: ctx?.role ?? null,
      likesCount: dish.likesCount,
      isPrivate: dish.isPrivate,
      taggedCount: dish.taggedUserIds.length,
      createdAt: iso(dish.createdAt),
      viewer: viewerStateFor(viewerUid, dish, flags),
    };
  });
}
