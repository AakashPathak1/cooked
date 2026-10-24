import "server-only";

import { createHash } from "node:crypto";
import { now } from "../clock";
import { notFound } from "../errors";
import { DELETE_FIELD, getStore } from "../store";
import { canViewDish, loadDish } from "./access";
import { C, toDish } from "./records";

export interface ImageBytes {
  bytes: Buffer;
  mime: "image/jpeg" | "image/png" | "image/webp";
  etag: string;
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/** Decode a stored data URL. Anything that isn't a plain raster image is rejected. */
export function decodeDataUrl(value: unknown): ImageBytes | null {
  if (typeof value !== "string") return null;
  const match = DATA_URL.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) return null;
  const etag = createHash("sha1").update(bytes).digest("base64url").slice(0, 20);
  return { bytes, mime: match[1] as ImageBytes["mime"], etag: `"${etag}"` };
}

/** One photo, with the same visibility rules as the dish it belongs to. */
export async function getPhotoBytes(
  viewerUid: string,
  logId: string,
  size: "thumb" | "full"
): Promise<ImageBytes> {
  if (!logId || logId.includes("/")) throw notFound();
  const log = await getStore().get(C.dishLogs, logId);
  if (!log) throw notFound();
  const dish = await loadDish(String(log.data.dishId ?? ""));
  if (!dish || !(await canViewDish(viewerUid, dish))) throw notFound();

  const raw = size === "thumb" ? (log.data.thumbURL ?? log.data.photoURL) : log.data.photoURL;
  const image = decodeDataUrl(raw) ?? decodeDataUrl(log.data.photoURL);
  if (!image) throw notFound();
  return image;
}

/** The dish's cover image (thumbnail-sized for new dishes). */
export async function getCoverBytes(viewerUid: string, dishId: string): Promise<ImageBytes> {
  if (!dishId || dishId.includes("/")) throw notFound();
  const store = getStore();
  const doc = await store.get(C.dishes, dishId); // full read: legacy covers live inline
  if (!doc) throw notFound();
  const dish = toDish(doc);
  if (!(await canViewDish(viewerUid, dish))) throw notFound();

  if (dish.coverLogId) {
    const log = await store.get(C.dishLogs, dish.coverLogId);
    const image = log && (decodeDataUrl(log.data.thumbURL) ?? decodeDataUrl(log.data.photoURL));
    if (image) return image;
  }
  const legacy = decodeDataUrl(doc.data.coverPhotoURL);
  if (legacy) return legacy;

  // Last resort: the newest photo that exists.
  const logs = await store.query(C.dishLogs, {
    where: [{ field: "dishId", op: "==", value: dishId }],
  });
  const newest = logs.sort(
    (a, b) =>
      ((b.data.createdAt as Date | undefined)?.getTime() ?? 0) -
      ((a.data.createdAt as Date | undefined)?.getTime() ?? 0)
  )[0];
  const image = newest && (decodeDataUrl(newest.data.thumbURL) ?? decodeDataUrl(newest.data.photoURL));
  if (!image) throw notFound();
  return image;
}

/**
 * After photos are removed, make sure the dish's cover still points at one
 * that exists. Also drops the legacy inline cover once an explicit one is set.
 */
export async function reconcileCover(dishId: string): Promise<void> {
  const store = getStore();
  const [dish, logs] = await Promise.all([
    store.get(C.dishes, dishId, { select: ["coverLogId"] }),
    store.query(C.dishLogs, {
      where: [{ field: "dishId", op: "==", value: dishId }],
      select: ["createdAt", "color"],
    }),
  ]);
  if (!dish) return;
  const current = typeof dish.data.coverLogId === "string" ? dish.data.coverLogId : null;
  if (current && logs.some((l) => l.id === current)) return;

  const newest = [...logs].sort(
    (a, b) =>
      ((b.data.createdAt as Date | undefined)?.getTime() ?? 0) -
      ((a.data.createdAt as Date | undefined)?.getTime() ?? 0)
  )[0];

  const batch = store.batch();
  batch.update(C.dishes, dishId, {
    coverLogId: newest?.id ?? null,
    coverColor: (newest?.data.color as string | undefined) ?? null,
    coverVersion: now().getTime(),
    ...(newest ? { coverPhotoURL: DELETE_FIELD } : {}),
  });
  await batch.commit();
}
