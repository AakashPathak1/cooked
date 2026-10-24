import type { Role, UserLite } from "@/lib/types";
import { DEFAULT_RATING } from "@/lib/elo";
import type { StoredDoc } from "../store/types";

/** Firestore collection names. */
export const C = {
  users: "users",
  handles: "handles",
  /** One per deleted account; stops stale sessions from re-creating the profile. */
  deletedUsers: "deletedUsers",
  dishes: "dishes",
  dishLogs: "dishLogs",
  userDishes: "userDishes",
  userDishElos: "userDishElos",
  ratings: "ratings",
  likes: "likes",
  saved: "saved",
  comments: "comments",
  notifications: "notifications",
  pushSubscriptions: "pushSubscriptions",
} as const;

/** Composite document id used by per-user-per-dish collections. */
export const memberId = (uid: string, dishId: string) => `${uid}_${dishId}`;

/**
 * Dish fields that are cheap to read. Legacy documents also carry the cover
 * image inline as `coverPhotoURL` (hundreds of KB of base64), so every
 * ordinary read projects it away.
 */
export const DISH_FIELDS = [
  "creatorId",
  "name",
  "notes",
  "recipeLink",
  "taggedUserIds",
  "likesCount",
  "createdAt",
  "updatedAt",
  "isPrivate",
  "globalScore",
  "coverLogId",
  "coverVersion",
  "coverColor",
] as const;

/** Log fields excluding the base64 image payloads. */
export const LOG_FIELDS = ["dishId", "userId", "color", "notes", "createdAt"] as const;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const date = (v: unknown): Date | null => (v instanceof Date ? v : null);

// ─── Users ───────────────────────────────────────────────────────────────────

export interface UserRecord {
  uid: string;
  handle: string;
  displayName: string;
  photoURL: string;
  createdAt: Date | null;
}

export function toUser(doc: StoredDoc): UserRecord {
  const d = doc.data;
  const handle = str(d.handle);
  return {
    uid: doc.id,
    handle,
    displayName: str(d.displayName) || handle,
    photoURL: str(d.photoURL),
    createdAt: date(d.createdAt),
  };
}

export function toUserLite(user: UserRecord): UserLite {
  return {
    uid: user.uid,
    handle: user.handle,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

/** Stand-in shown where an author has since deleted their account. */
export function unknownUser(uid: string): UserLite {
  return { uid, handle: "", displayName: "Deleted user", photoURL: "" };
}

// ─── Dishes ──────────────────────────────────────────────────────────────────

export interface DishRecord {
  id: string;
  creatorId: string;
  name: string;
  notes: string;
  recipeLink: string;
  taggedUserIds: string[];
  likesCount: number;
  createdAt: Date | null;
  isPrivate: boolean;
  /** Average of every participant's personal rating. */
  globalScore: number;
  /** Photo to use as the cover. Legacy dishes carry the image inline instead. */
  coverLogId: string | null;
  /** Bumped whenever the cover changes; used as a cache-busting key. */
  coverVersion: number;
  coverColor: string | null;
}

export function toDish(doc: StoredDoc): DishRecord {
  const d = doc.data;
  const createdAt = date(d.createdAt);
  return {
    id: doc.id,
    creatorId: str(d.creatorId),
    name: str(d.name),
    notes: str(d.notes),
    recipeLink: str(d.recipeLink),
    taggedUserIds: Array.isArray(d.taggedUserIds)
      ? d.taggedUserIds.filter((v): v is string => typeof v === "string")
      : [],
    likesCount: Math.max(0, num(d.likesCount, 0)),
    createdAt,
    isPrivate: d.isPrivate === true,
    globalScore: num(d.globalScore, DEFAULT_RATING),
    coverLogId: typeof d.coverLogId === "string" && d.coverLogId ? d.coverLogId : null,
    coverVersion: num(d.coverVersion, createdAt?.getTime() ?? 0),
    coverColor: typeof d.coverColor === "string" ? d.coverColor : null,
  };
}

export const coverUrl = (dish: Pick<DishRecord, "id" | "coverVersion">) =>
  `/api/dishes/${dish.id}/cover?v=${dish.coverVersion}`;

// ─── Photos ──────────────────────────────────────────────────────────────────

export interface LogRecord {
  id: string;
  dishId: string;
  userId: string;
  color: string | null;
  notes: string;
  createdAt: Date | null;
}

export function toLog(doc: StoredDoc): LogRecord {
  const d = doc.data;
  return {
    id: doc.id,
    dishId: str(d.dishId),
    userId: str(d.userId),
    color: typeof d.color === "string" ? d.color : null,
    notes: str(d.notes),
    createdAt: date(d.createdAt),
  };
}

export const photoUrl = (logId: string, size: "thumb" | "full", version = 0) =>
  `/api/photos/${logId}?s=${size}&v=${version}`;

// ─── Membership & ratings ────────────────────────────────────────────────────

export interface MemberRecord {
  userId: string;
  dishId: string;
  role: Role;
}

export function toMember(doc: StoredDoc): MemberRecord {
  const d = doc.data;
  const role = d.role === "creator" || d.role === "tagged" || d.role === "tried" ? d.role : "tried";
  return { userId: str(d.userId), dishId: str(d.dishId), role };
}

export interface EloRecord {
  userId: string;
  dishId: string;
  elo: number;
  /** Duels this dish has been through for this user. */
  n: number;
}

export function toElo(doc: StoredDoc): EloRecord {
  const d = doc.data;
  return {
    userId: str(d.userId),
    dishId: str(d.dishId),
    elo: num(d.elo, DEFAULT_RATING),
    n: Math.max(0, num(d.n, 0)),
  };
}

export const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
