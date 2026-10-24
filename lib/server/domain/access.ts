import "server-only";

import { forbidden, notFound } from "../errors";
import { getStore } from "../store";
import {
  C,
  DISH_FIELDS,
  memberId,
  toDish,
  toMember,
  type DishRecord,
  type MemberRecord,
} from "./records";

/** Read a dish without its heavyweight legacy image field. */
export async function loadDish(dishId: string): Promise<DishRecord | null> {
  if (!dishId || dishId.includes("/")) return null;
  const doc = await getStore().get(C.dishes, dishId, { select: [...DISH_FIELDS] });
  return doc ? toDish(doc) : null;
}

export async function getMembership(uid: string, dishId: string): Promise<MemberRecord | null> {
  const doc = await getStore().get(C.userDishes, memberId(uid, dishId));
  return doc ? toMember(doc) : null;
}

/**
 * Public dishes are visible to every signed-in user. Private dishes are
 * visible to the creator, anyone they tagged, and anyone already in the
 * dish's ranking pool.
 */
export async function canViewDish(uid: string, dish: DishRecord): Promise<boolean> {
  if (!dish.isPrivate) return true;
  if (dish.creatorId === uid || dish.taggedUserIds.includes(uid)) return true;
  return (await getMembership(uid, dish.id)) !== null;
}

/** 404 for both "missing" and "not allowed", so private dishes don't leak. */
export async function requireViewableDish(uid: string, dishId: string): Promise<DishRecord> {
  const dish = await loadDish(dishId);
  if (!dish || !(await canViewDish(uid, dish))) throw notFound("Dish not found");
  return dish;
}

export async function requireOwnedDish(uid: string, dishId: string): Promise<DishRecord> {
  const dish = await requireViewableDish(uid, dishId);
  if (dish.creatorId !== uid) throw forbidden("Only the person who posted this dish can do that");
  return dish;
}
