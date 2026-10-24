import "server-only";

import type { CommentDTO } from "@/lib/types";
import { now } from "../clock";
import { forbidden, notFound } from "../errors";
import { getStore } from "../store";
import { loadDish, requireViewableDish } from "./access";
import { notify, retractNotification } from "./notifications";
import { C, iso, memberId } from "./records";
import { getUser, getUsersOrPlaceholder, type Viewer } from "./users";

async function actor(viewer: Viewer) {
  return (
    (await getUser(viewer.uid)) ?? {
      uid: viewer.uid,
      handle: "",
      displayName: viewer.name ?? "Someone",
      photoURL: viewer.image ?? "",
    }
  );
}

async function requireExisting(dishId: string) {
  const dish = await loadDish(dishId);
  if (!dish) throw notFound("Dish not found");
  return dish;
}

/** Idempotent: liking twice leaves one like. */
export async function setLike(
  viewer: Viewer,
  dishId: string,
  liked: boolean
): Promise<{ liked: boolean; likesCount: number }> {
  // Taking a like back must work even after losing access to the dish.
  const dish = liked ? await requireViewableDish(viewer.uid, dishId) : await requireExisting(dishId);
  const id = memberId(viewer.uid, dishId);

  const result = await getStore().runTransaction(async (tx) => {
    const [existing, fresh] = await Promise.all([
      tx.get(C.likes, id, { select: ["userId"] }),
      tx.get(C.dishes, dishId, { select: ["likesCount"] }),
    ]);
    if (!fresh) throw notFound("Dish not found");
    let count = Math.max(0, Number(fresh.data.likesCount) || 0);
    let changed = false;
    if (liked && !existing) {
      tx.create(C.likes, id, { userId: viewer.uid, dishId, createdAt: now() });
      count += 1;
      changed = true;
    } else if (!liked && existing) {
      tx.delete(C.likes, id);
      count = Math.max(0, count - 1);
      changed = true;
    }
    if (changed) tx.update(C.dishes, dishId, { likesCount: count });
    return { likesCount: count, changed };
  });

  if (result.changed) {
    if (liked) {
      await notify({
        type: "like",
        toUid: dish.creatorId,
        from: await actor(viewer),
        dishId,
        dishName: dish.name,
        dedupe: true,
      });
    } else {
      await retractNotification("like", viewer.uid, dishId, dish.creatorId);
    }
  }
  return { liked, likesCount: result.likesCount };
}

export async function setSaved(viewerUid: string, dishId: string, saved: boolean): Promise<void> {
  if (saved) await requireViewableDish(viewerUid, dishId);
  const batch = getStore().batch();
  const id = memberId(viewerUid, dishId);
  if (saved) batch.set(C.saved, id, { userId: viewerUid, dishId, createdAt: now() });
  else batch.delete(C.saved, id);
  await batch.commit();
}

export async function addComment(
  viewer: Viewer,
  dishId: string,
  text: string
): Promise<CommentDTO> {
  const dish = await requireViewableDish(viewer.uid, dishId);
  const store = getStore();
  const id = store.newId();
  const createdAt = now();
  const batch = store.batch();
  batch.create(C.comments, id, { dishId, userId: viewer.uid, text, createdAt });
  await batch.commit();

  const me = await actor(viewer);
  await notify({
    type: "comment",
    toUid: dish.creatorId,
    from: me,
    dishId,
    dishName: dish.name,
    preview: text.split("\n")[0],
  });
  return { id, user: me, text, createdAt: iso(createdAt) };
}

/** The author, or the dish's owner moderating their own dish. */
export async function deleteComment(viewerUid: string, commentId: string): Promise<void> {
  const store = getStore();
  const comment = await store.get(C.comments, commentId);
  if (!comment) throw notFound("Comment not found");
  const dish = await loadDish(String(comment.data.dishId ?? ""));
  if (comment.data.userId !== viewerUid && dish?.creatorId !== viewerUid) {
    throw forbidden("You can't delete this comment");
  }
  const batch = store.batch();
  batch.delete(C.comments, commentId);
  await batch.commit();
}

/** Used by dish detail pages that want more than the first window. */
export async function listComments(viewerUid: string, dishId: string): Promise<CommentDTO[]> {
  await requireViewableDish(viewerUid, dishId);
  const rows = await getStore().query(C.comments, {
    where: [{ field: "dishId", op: "==", value: dishId }],
    orderBy: [{ field: "createdAt", dir: "asc" }],
    limit: 200,
  });
  const users = await getUsersOrPlaceholder(rows.map((r) => String(r.data.userId ?? "")));
  return rows.map((r) => ({
    id: r.id,
    user: users.get(String(r.data.userId ?? "")) ?? null,
    text: String(r.data.text ?? ""),
    createdAt: iso((r.data.createdAt as Date | undefined) ?? null),
  }));
}
