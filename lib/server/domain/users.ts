import "server-only";

import type { UserLite } from "@/lib/types";
import { now } from "../clock";
import { unauthorized } from "../errors";
import { getStore, chunk } from "../store";
import {
  C,
  toUser,
  toUserLite,
  unknownUser,
  type UserRecord,
} from "./records";

export interface Viewer {
  uid: string;
  name: string | null;
  email: string | null;
  image: string | null;
  /** When this session was created (ms). Sessions older than an account deletion are refused. */
  signedInAt?: number;
}

const RESERVED_HANDLES = new Set([
  "me",
  "admin",
  "api",
  "signin",
  "settings",
  "cooked",
  "support",
  "help",
  "about",
  "privacy",
  "terms",
  "null",
  "undefined",
]);

const HANDLE_PATTERN = /^[a-z0-9_]{1,40}$/;
const MAX_HANDLE = 24;

function slug(input: string | null | undefined): string {
  return (input ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_HANDLE);
}

/**
 * Derive a base handle. Names with no Latin characters (「田中」, "علي") would
 * slug to nothing, so fall back to the email, then to digits from the uid.
 */
export function handleBase(
  name: string | null | undefined,
  email: string | null | undefined,
  uid: string
): string {
  const candidates = [slug(name), slug((email ?? "").split("@")[0])];
  for (const c of candidates) {
    if (c.length >= 3 && !RESERVED_HANDLES.has(c)) return c;
  }
  const digits = uid.replace(/\D/g, "").slice(-6) || Math.abs(hash(uid)).toString().slice(0, 6);
  return `cook_${digits}`;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** `base`, `base2`, `base3` … each trimmed so the whole thing stays short. */
export function handleCandidates(base: string, count = 24): string[] {
  const out = [base];
  for (let i = 2; i <= count; i++) {
    const suffix = String(i);
    out.push(`${base.slice(0, MAX_HANDLE - suffix.length)}${suffix}`);
  }
  return out;
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}

// ─── Creating / syncing the signed-in user ───────────────────────────────────

/**
 * Create the user document on first sign-in (claiming a unique handle in the
 * same transaction) and keep name / photo in sync with Google afterwards.
 * Email is deliberately not stored: nothing in the app needs it.
 */
export async function ensureUser(profile: Viewer): Promise<UserLite> {
  const store = getStore();
  const name = profile.name?.trim() || null;
  const image = profile.image?.trim() || null;

  const record = await store.runTransaction(async (tx): Promise<UserRecord> => {
    const existing = await tx.get(C.users, profile.uid);

    if (existing) {
      const user = toUser(existing);
      const claim = user.handle ? await tx.get(C.handles, user.handle) : null;

      const patch: Record<string, unknown> = {};
      if (name && name !== user.displayName) patch.displayName = name;
      if (image && image !== user.photoURL) patch.photoURL = image;

      // Backfill the uniqueness claim for accounts created before handles
      // were reserved. If someone else already holds it, leave things alone.
      if (user.handle && !claim) {
        tx.create(C.handles, user.handle, { uid: user.uid, createdAt: now() });
      }
      if (Object.keys(patch).length > 0) tx.update(C.users, user.uid, patch);

      return {
        ...user,
        displayName: (patch.displayName as string | undefined) ?? user.displayName,
        photoURL: (patch.photoURL as string | undefined) ?? user.photoURL,
      };
    }

    const base = handleBase(name, profile.email, profile.uid);
    const candidates = handleCandidates(base);
    const claims = await tx.getMany(C.handles, candidates);
    const free = claims.findIndex((c) => c === null);
    const handle =
      free >= 0
        ? candidates[free]
        : `${base.slice(0, 16)}_${Math.random().toString(36).slice(2, 8)}`;

    const createdAt = now();
    tx.create(C.users, profile.uid, {
      uid: profile.uid,
      handle,
      displayName: name ?? handle,
      photoURL: image ?? "",
      createdAt,
    });
    tx.create(C.handles, handle, { uid: profile.uid, createdAt });
    return {
      uid: profile.uid,
      handle,
      displayName: name ?? handle,
      photoURL: image ?? "",
      createdAt,
    };
  });

  return toUserLite(record);
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

export async function getUser(uid: string): Promise<UserLite | null> {
  const doc = await getStore().get(C.users, uid);
  return doc ? toUserLite(toUser(doc)) : null;
}

export async function getUserRecord(uid: string): Promise<UserRecord | null> {
  const doc = await getStore().get(C.users, uid);
  return doc ? toUser(doc) : null;
}

/** Batched lookup. Missing users are simply absent from the map. */
export async function getUsers(uids: Iterable<string>): Promise<Map<string, UserLite>> {
  const unique = [...new Set(uids)].filter(Boolean);
  const out = new Map<string, UserLite>();
  const store = getStore();
  for (const group of chunk(unique, 100)) {
    const docs = await store.getMany(C.users, group);
    for (const doc of docs) if (doc) out.set(doc.id, toUserLite(toUser(doc)));
  }
  return out;
}

/** Like `getUsers` but never leaves holes: deleted users get a placeholder. */
export async function getUsersOrPlaceholder(uids: Iterable<string>): Promise<Map<string, UserLite>> {
  const list = [...new Set(uids)];
  const found = await getUsers(list);
  for (const uid of list) if (!found.has(uid)) found.set(uid, unknownUser(uid));
  return found;
}

export async function getUserByHandle(rawHandle: string): Promise<UserRecord | null> {
  const handle = decodeURIComponent(rawHandle).toLowerCase().replace(/^@/, "");
  if (!isValidHandle(handle)) return null;
  const store = getStore();

  const claim = await store.get(C.handles, handle);
  if (claim && typeof claim.data.uid === "string") {
    const user = await store.get(C.users, claim.data.uid);
    if (user) return toUser(user);
  }

  // Accounts that predate handle claims.
  const rows = await store.query(C.users, {
    where: [{ field: "handle", op: "==", value: handle }],
    limit: 1,
  });
  return rows[0] ? toUser(rows[0]) : null;
}

const USER_LIST_CAP = 500;

/** Everyone, alphabetically. Capped; callers filter client-side. */
export async function listUsers(limit = USER_LIST_CAP): Promise<UserLite[]> {
  const rows = await getStore().query(C.users, {
    orderBy: [{ field: "displayName", dir: "asc" }],
    limit: Math.min(limit, USER_LIST_CAP),
    select: ["uid", "handle", "displayName", "photoURL"],
  });
  return rows
    .map((doc) => toUserLite(toUser(doc)))
    .filter((u) => u.handle)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
}

// ─── Cheap "has this uid been ensured recently" cache ────────────────────────

const ensured = new Map<string, number>();
const ENSURE_TTL_MS = 10 * 60_000;

/** `ensureUser`, but at most once per ten minutes per warm instance. */
export async function ensureUserCached(profile: Viewer): Promise<void> {
  const last = ensured.get(profile.uid);
  if (last && Date.now() - last < ENSURE_TTL_MS) return;
  const tombstone = await getStore().get(C.deletedUsers, profile.uid);
  const deletedAt = (tombstone?.data.deletedAt as Date | undefined)?.getTime();
  if (deletedAt && deletedAt > (profile.signedInAt ?? 0)) {
    throw unauthorized("This account was deleted. Sign in again to start fresh.");
  }
  await ensureUser(profile);
  ensured.set(profile.uid, Date.now());
}

export function clearEnsureCache(): void {
  ensured.clear();
}

export function forgetEnsured(uid: string): void {
  ensured.delete(uid);
}
