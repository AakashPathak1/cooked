import "server-only";

import { getStore } from "../store";
import { deleteDishCascade } from "./dishes";
import { removeParticipants } from "./participation";
import { C, memberId } from "./records";
import { removeSubscription } from "./push";
import { getUserRecord } from "./users";

/**
 * Erase an account: the dishes they created go entirely (with everyone's
 * photos, comments and ratings on them); on other people's dishes they are
 * removed as a participant; their likes, saves, comments, notifications and
 * push devices are deleted; finally the handle claim and the user itself.
 * Safe to re-run after a partial failure.
 */
export async function deleteAccount(uid: string): Promise<void> {
  const store = getStore();
  const mine = (field: string) => [{ field, op: "==" as const, value: uid }];
  const idOnly = { select: ["userId"] };

  const [created, memberships, tagged, likes, saved, comments, notesTo, notesFrom, rated, user] =
    await Promise.all([
      store.query(C.dishes, { where: mine("creatorId"), select: ["creatorId"] }),
      store.query(C.userDishes, { where: mine("userId"), select: ["dishId", "role"] }),
      store.query(C.dishes, {
        where: [{ field: "taggedUserIds", op: "array-contains", value: uid }],
        select: ["taggedUserIds"],
      }),
      store.query(C.likes, { where: mine("userId"), select: ["dishId"] }),
      store.query(C.saved, { where: mine("userId"), ...idOnly }),
      store.query(C.comments, { where: mine("userId"), ...idOnly }),
      store.query(C.notifications, { where: mine("toUid"), select: ["toUid"] }),
      store.query(C.notifications, { where: mine("fromUid"), select: ["fromUid"] }),
      store.query(C.ratings, { where: mine("raterId"), select: ["raterId"] }),
      getUserRecord(uid),
    ]);

  const createdIds = new Set(created.map((d) => d.id));
  for (const dish of created) await deleteDishCascade(dish.id);

  // Participation (and pending tags) on other people's dishes.
  const others = new Set<string>();
  memberships.forEach((m) => {
    const id = String(m.data.dishId);
    if (!createdIds.has(id)) others.add(id);
  });
  tagged.forEach((d) => {
    if (!createdIds.has(d.id)) others.add(d.id);
  });
  for (const dishId of others) {
    try {
      await removeParticipants(dishId, [uid], (current) => current.filter((t) => t !== uid));
    } catch {
      // The dish may have vanished concurrently; nothing left to clean up.
    }
  }

  // Likes counted on surviving dishes must come back down.
  for (const like of likes) {
    const dishId = String(like.data.dishId);
    if (createdIds.has(dishId)) continue;
    await store.runTransaction(async (tx) => {
      const dish = await tx.get(C.dishes, dishId, { select: ["likesCount"] });
      tx.delete(C.likes, memberId(uid, dishId));
      if (dish) {
        tx.update(C.dishes, dishId, {
          likesCount: Math.max(0, (Number(dish.data.likesCount) || 0) - 1),
        });
      }
    });
  }

  const batch = store.batch();
  for (const r of saved) batch.delete(C.saved, r.id);
  for (const r of comments) batch.delete(C.comments, r.id);
  for (const r of notesTo) batch.delete(C.notifications, r.id);
  for (const r of notesFrom) batch.delete(C.notifications, r.id);
  for (const r of rated) batch.delete(C.ratings, r.id);
  for (const like of likes) batch.delete(C.likes, like.id);
  if (user?.handle) {
    const claim = await store.get(C.handles, user.handle);
    if (claim && claim.data.uid === uid) batch.delete(C.handles, user.handle);
  }
  batch.delete(C.users, uid);
  await batch.commit();

  await removeSubscription(uid);
}
