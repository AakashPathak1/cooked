import { beforeEach, describe, expect, it } from "vitest";
import { QUICK_RATINGS } from "@/lib/elo";
import { pickPair } from "@/lib/pairing";
import { resetRateLimits } from "@/lib/server/ratelimit";
import { setStore } from "@/lib/server/store";
import { MemoryStore } from "@/lib/server/store/memory";
import { HttpError } from "@/lib/server/errors";
import { deleteAccount } from "@/lib/server/domain/account";
import {
  createDish,
  deleteDish,
  getDishDetail,
  getFeed,
  getLeaderboard,
} from "@/lib/server/domain/dishes";
import { listNotifications } from "@/lib/server/domain/notifications";
import {
  acceptTag,
  addPhoto,
  leaveDish,
  removePhoto,
  setTags,
  tryDish,
} from "@/lib/server/domain/participation";
import { decodeDataUrl, getCoverBytes, getPhotoBytes } from "@/lib/server/domain/photos";
import { getProfile } from "@/lib/server/domain/profile";
import { recordDuel } from "@/lib/server/domain/ratings";
import { search } from "@/lib/server/domain/search";
import { addComment, deleteComment, setLike } from "@/lib/server/domain/social";
import { ensureUser, clearEnsureCache, getUserByHandle, listUsers, type Viewer } from "@/lib/server/domain/users";
import { setPushTransport } from "@/lib/server/domain/push";
import indexConfig from "@/firestore.indexes.json";

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const photo = { photo: JPEG, thumb: JPEG, color: "#aa5533" };

let store: MemoryStore;
const person = (uid: string, name: string): Viewer => ({
  uid,
  name,
  email: `${uid}@example.com`,
  image: null,
});
const ann = person("ann", "Ann Lee");
const bob = person("bob", "Bob Ray");
const cy = person("cy", "Cy Fox");

const dishInput = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  notes: "",
  recipeLink: "",
  taggedUserIds: [] as string[],
  isPrivate: false,
  quickRating: "good" as const,
  ...photo,
  ...extra,
});

async function rejects(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toSatisfy((e) => e instanceof HttpError && e.status === status);
}

beforeEach(async () => {
  store = new MemoryStore(indexConfig.indexes);
  setStore(store);
  resetRateLimits();
  clearEnsureCache();
  setPushTransport(async () => {});
  for (const v of [ann, bob, cy]) await ensureUser(v);
});

describe("users", () => {
  it("assigns unique handles", async () => {
    const a = await ensureUser(person("x1", "Dana Cook"));
    const b = await ensureUser(person("x2", "Dana Cook"));
    expect(a.handle).toBe("dana_cook");
    expect(b.handle).toBe("dana_cook2");
  });
  it("is idempotent and syncs the name", async () => {
    const again = await ensureUser({ ...ann, name: "Annie Lee" });
    expect(again.handle).toBe("ann_lee");
    expect(again.displayName).toBe("Annie Lee");
  });
});

describe("dishes & privacy", () => {
  it("hides private dishes from non-participants", async () => {
    const { id } = await createDish(ann, dishInput("Secret stew", { isPrivate: true }));
    await rejects(getDishDetail("bob", id), 404);
    await rejects(getPhotoBytes("bob", store.dump("dishLogs")[0].id, "full"), 404);
    await rejects(getCoverBytes("bob", id), 404);
    expect((await getFeed("bob")).items).toHaveLength(0);
    expect((await getDishDetail("ann", id)).name).toBe("Secret stew");
  });

  it("lets tagged people view a private dish", async () => {
    const { id } = await createDish(ann, dishInput("Pie", { isPrivate: true, taggedUserIds: ["bob"] }));
    expect((await getDishDetail("bob", id)).viewer.pendingTag).toBe(true);
    await rejects(getDishDetail("cy", id), 404);
  });

  it("only the owner can delete, and deletion cascades", async () => {
    const { id } = await createDish(ann, dishInput("Tacos"));
    await addComment(bob, id, "yum");
    await setLike(bob, id, true);
    await rejects(deleteDish("bob", id), 403);
    await deleteDish("ann", id);
    for (const col of ["dishes", "dishLogs", "userDishes", "userDishElos", "comments", "likes"]) {
      expect(store.dump(col)).toHaveLength(0);
    }
  });

  it("serves JPEG bytes for covers and photos", async () => {
    const { id } = await createDish(ann, dishInput("Toast"));
    const cover = await getCoverBytes("bob", id);
    expect(cover.mime).toBe("image/jpeg");
    expect(cover.bytes.length).toBeGreaterThan(0);
  });

  it("tolerates legacy dishes with an inline cover and no new fields", async () => {
    const b = store.batch();
    b.set("dishes", "legacy", {
      creatorId: "ann",
      name: "Old dish",
      taggedUserIds: [],
      likesCount: 0,
      createdAt: new Date("2024-01-01"),
      isPrivate: false,
      globalScore: 1200,
      coverPhotoURL: JPEG,
    });
    b.set("dishLogs", "l1", { dishId: "legacy", userId: "ann", photoURL: JPEG, createdAt: new Date("2024-01-01") });
    b.set("userDishes", "ann_legacy", { userId: "ann", dishId: "legacy", role: "creator" });
    await b.commit();
    const detail = await getDishDetail("bob", "legacy");
    expect(detail.photos).toHaveLength(1);
    expect((await getCoverBytes("bob", "legacy")).mime).toBe("image/jpeg");
    expect((await getFeed("bob")).items.map((d) => d.id)).toContain("legacy");
  });
});

describe("tagging flow & global score", () => {
  it("accept adds the rating to the average; leave removes it", async () => {
    const { id } = await createDish(ann, dishInput("Curry", { taggedUserIds: ["bob"], quickRating: "loved" }));
    expect((await listNotifications("bob")).map((n) => n.type)).toEqual(["tag"]);

    await acceptTag(bob, id, "meh");
    const avg = (QUICK_RATINGS.loved + QUICK_RATINGS.meh) / 2;
    expect((await getDishDetail("ann", id)).elo).toBeCloseTo(avg);
    expect((await listNotifications("ann")).map((n) => n.type)).toContain("accepted");

    await rejects(acceptTag(bob, id, "good"), 409);
    await leaveDish("bob", id);
    expect((await getDishDetail("ann", id)).elo).toBeCloseTo(QUICK_RATINGS.loved);
  });

  it("untagged users cannot accept", async () => {
    const { id } = await createDish(ann, dishInput("Curry"));
    await rejects(acceptTag(cy, id, "good"), 400);
  });

  it("trying a public dish joins the pool with a photo", async () => {
    const { id } = await createDish(ann, dishInput("Pad thai"));
    await tryDish(cy, id, { ...photo, notes: "mine", quickRating: "okay" });
    const d = await getDishDetail("ann", id);
    expect(d.photos).toHaveLength(2);
    expect(d.participants.find((p) => p.user.uid === "cy")?.role).toBe("tried");
    await rejects(tryDish(cy, id, { ...photo, notes: "", quickRating: "okay" }), 409);
    await rejects(tryDish(ann, id, { ...photo, notes: "", quickRating: "okay" }), 400);
  });

  it("untagging removes the person's rating and photos", async () => {
    const { id } = await createDish(ann, dishInput("Soup", { taggedUserIds: ["bob"] }));
    await acceptTag(bob, id, "loved");
    await addPhoto(bob, id, { ...photo, notes: "" });
    await setTags(ann, id, []);
    const d = await getDishDetail("ann", id);
    expect(d.photos).toHaveLength(1);
    expect(d.participants).toHaveLength(1);
    expect(d.elo).toBeCloseTo(QUICK_RATINGS.good);
  });
});

describe("photos", () => {
  it("refuses to remove the last photo and enforces ownership", async () => {
    const { id } = await createDish(ann, dishInput("Salad"));
    const only = store.dump("dishLogs")[0].id;
    await rejects(removePhoto("ann", id, only), 400);
    await tryDish(bob, id, { ...photo, notes: "", quickRating: "good" });
    const bobs = store.dump("dishLogs").find((l) => l.data.userId === "bob")!.id;
    await rejects(removePhoto("cy", id, bobs), 403);
    await removePhoto("ann", id, bobs); // owner may moderate
    expect(store.dump("dishLogs")).toHaveLength(1);
  });

  it("keeps the cover pointing at a surviving photo", async () => {
    const { id } = await createDish(ann, dishInput("Salad"));
    const first = store.dump("dishLogs")[0].id;
    const { id: second } = await addPhoto(ann, id, { ...photo, notes: "" });
    expect(store.peek("dishes", id)!.coverLogId).toBe(second);
    await removePhoto("ann", id, second);
    expect(store.peek("dishes", id)!.coverLogId).toBe(first);
  });

  it("rejects non-members adding photos", async () => {
    const { id } = await createDish(ann, dishInput("Salad"));
    await rejects(addPhoto(cy, id, { ...photo, notes: "" }), 403);
  });
});

describe("social", () => {
  it("likes are idempotent and counted once", async () => {
    const { id } = await createDish(ann, dishInput("Bagel"));
    await setLike(bob, id, true);
    const r = await setLike(bob, id, true);
    expect(r.likesCount).toBe(1);
    expect((await listNotifications("ann")).filter((n) => n.type === "like")).toHaveLength(1);
    expect((await setLike(bob, id, false)).likesCount).toBe(0);
    expect((await listNotifications("ann")).filter((n) => n.type === "like")).toHaveLength(0);
    expect((await setLike(bob, id, false)).likesCount).toBe(0);
  });

  it("self-likes do not notify", async () => {
    const { id } = await createDish(ann, dishInput("Bagel"));
    await setLike(ann, id, true);
    expect(await listNotifications("ann")).toHaveLength(0);
  });

  it("comments: author or dish owner may delete", async () => {
    const { id } = await createDish(ann, dishInput("Bagel"));
    const c1 = await addComment(bob, id, "nice");
    const c2 = await addComment(bob, id, "again");
    await rejects(deleteComment("cy", c1.id), 403);
    await deleteComment("bob", c1.id);
    await deleteComment("ann", c2.id);
    expect(store.dump("comments")).toHaveLength(0);
  });

  it("cannot comment on or like a private dish you can't see", async () => {
    const { id } = await createDish(ann, dishInput("Hidden", { isPrivate: true }));
    await rejects(addComment(bob, id, "hi"), 404);
    await rejects(setLike(bob, id, true), 404);
  });
});

describe("duels", () => {
  async function pool() {
    const a = (await createDish(ann, dishInput("A", { quickRating: "okay" }))).id;
    const b = (await createDish(ann, dishInput("B", { quickRating: "okay" }))).id;
    const c = (await createDish(ann, dishInput("C", { quickRating: "okay" }))).id;
    return { a, b, c };
  }

  it("moves ratings, bumps n, updates the global score and suggests a next pair", async () => {
    const { a, b } = await pool();
    const res = await recordDuel("ann", { a, b, result: "a", exclude: [] });
    const ch = Object.fromEntries(res.changes.map((c) => [c.dishId, c]));
    expect(ch[a].after).toBeGreaterThan(ch[a].before);
    expect(ch[b].after).toBeLessThan(ch[b].before);
    expect(store.peek("userDishElos", `ann_${a}`)!.n).toBe(1);
    expect(store.peek("dishes", a)!.globalScore).toBeCloseTo(ch[a].after);
    expect(res.next).not.toBeNull();
    expect(store.dump("ratings")).toHaveLength(1);
  });

  it("ties on equal ratings change nothing; on unequal ratings they pull together", async () => {
    const { a, b } = await pool();
    const eq = await recordDuel("ann", { a, b, result: "tie", exclude: [] });
    expect(eq.changes.every((c) => c.after === c.before)).toBe(true);
    await recordDuel("ann", { a, b, result: "a", exclude: [] });
    const t = await recordDuel("ann", { a, b, result: "tie", exclude: [] });
    const ch = Object.fromEntries(t.changes.map((c) => [c.dishId, c]));
    expect(ch[a].after).toBeLessThan(ch[a].before);
    expect(ch[b].after).toBeGreaterThan(ch[b].before);
  });

  it("only compares dishes you have, and not a dish with itself", async () => {
    const { a, b } = await pool();
    await rejects(recordDuel("bob", { a, b, result: "a", exclude: [] }), 403);
    await rejects(recordDuel("ann", { a, b: a, result: "a", exclude: [] }), 400);
  });

  it("pickPair avoids excluded pairs and prefers least-compared dishes", () => {
    const items = [
      { id: "a", elo: 1200, n: 0 },
      { id: "b", elo: 1210, n: 5 },
      { id: "c", elo: 1500, n: 5 },
    ];
    const [x, y] = pickPair(items, { rng: () => 0.1 })!;
    expect([x.id, y.id].sort()).toEqual(["a", "b"]);
    const next = pickPair(items, { exclude: ["a|b"], rng: () => 0.1 })!;
    expect([next[0].id, next[1].id].sort()).toEqual(["a", "c"]);
    expect(pickPair(items, { exclude: ["a|b", "a|c", "b|c"] })).toBeNull();
    expect(pickPair([items[0]])).toBeNull();
  });
});

describe("feed, leaderboard, profile, search", () => {
  it("paginates the feed without skipping or repeating", async () => {
    for (let i = 0; i < 30; i++) {
      await createDish(ann, dishInput(`Dish ${i}`));
      await new Promise((r) => setTimeout(r, 1));
    }
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await getFeed("bob", cursor);
      page.items.forEach((d) => {
        expect(seen.has(d.id)).toBe(false);
        seen.add(d.id);
      });
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(seen.size).toBe(30);
  });

  it("ranks the leaderboard by global score", async () => {
    await createDish(ann, dishInput("Low", { quickRating: "meh" }));
    await createDish(ann, dishInput("High", { quickRating: "loved" }));
    const page = await getLeaderboard("bob");
    expect(page.items.map((d) => d.name)).toEqual(["High", "Low"]);
  });

  it("profiles show others only public dishes, and pending tags to the owner only", async () => {
    await createDish(ann, dishInput("Public"));
    await createDish(ann, dishInput("Private", { isPrivate: true }));
    await createDish(bob, dishInput("Tagged you", { taggedUserIds: ["ann"] }));
    const asBob = await getProfile("bob", "ann_lee");
    expect(asBob.dishes.map((d) => d.name)).toEqual(["Public"]);
    expect(asBob.pendingTags).toEqual([]);
    const asAnn = await getProfile("ann", "ann_lee");
    expect(asAnn.dishes).toHaveLength(2);
    expect(asAnn.pendingTags.map((d) => d.name)).toEqual(["Tagged you"]);
    await rejects(getProfile("ann", "nobody_here"), 404);
  });

  it("search matches cooks and public dishes only", async () => {
    await createDish(ann, dishInput("Spicy ramen"));
    await createDish(ann, dishInput("Secret ramen", { isPrivate: true }));
    const r = await search("bob", "RAMEN");
    expect(r.dishes.map((d) => d.name)).toEqual(["Spicy ramen"]);
    expect((await search("bob", "cy")).users.map((u) => u.uid)).toContain("cy");
  });
});

describe("account deletion", () => {
  it("removes the user's data and leaves others' dishes consistent", async () => {
    const mine = (await createDish(ann, dishInput("Mine", { taggedUserIds: ["bob"] }))).id;
    const bobs = (await createDish(bob, dishInput("Bob's", { quickRating: "loved" }))).id;
    await tryDish(ann, bobs, { ...photo, notes: "", quickRating: "meh" });
    await setLike(ann, bobs, true);
    await addComment(ann, bobs, "hello");
    await acceptTag(bob, mine, "good");

    await deleteAccount("ann");

    expect(store.peek("users", "ann")).toBeUndefined();
    expect(store.peek("handles", "ann_lee")).toBeUndefined();
    expect(store.peek("dishes", mine)).toBeUndefined();
    const after = await getDishDetail("bob", bobs);
    expect(after.likesCount).toBe(0);
    expect(after.comments).toHaveLength(0);
    expect(after.photos).toHaveLength(1);
    expect(after.elo).toBeCloseTo(QUICK_RATINGS.loved);
  });
});

describe("review regressions", () => {
  it("a session that predates account deletion cannot re-create the profile", async () => {
    const { ensureUserCached } = await import("@/lib/server/domain/users");
    const old = { ...ann, signedInAt: Date.now() - 60_000 };
    await deleteAccount("ann");
    await rejects(ensureUserCached(old), 401);
    expect(store.peek("users", "ann")).toBeUndefined();
    // Signing in again afterwards works.
    await ensureUserCached({ ...ann, signedInAt: Date.now() + 1000 });
    expect(store.peek("users", "ann")).toBeDefined();
  });

  it("tag picker semantics: tried users are not tags, and un-tagging others leaves them alone", async () => {
    const { id } = await createDish(ann, dishInput("Pie", { taggedUserIds: ["bob"] }));
    await tryDish(cy, id, { ...photo, notes: "", quickRating: "good" });
    await setTags(ann, id, ["bob"]); // what the fixed picker sends
    const d = await getDishDetail("ann", id);
    expect(d.participants.map((p) => p.user.uid).sort()).toEqual(["ann", "bob", "cy"]);
  });

  it("can take back a like after losing access to a private dish", async () => {
    const { id } = await createDish(ann, dishInput("Stew", { taggedUserIds: ["bob"] }));
    await acceptTag(bob, id, "good");
    await setLike(bob, id, true);
    await setTags(ann, id, []); // bob loses access
    await setLike(bob, id, false);
    expect(store.peek("dishes", id)!.likesCount).toBe(0);
  });

  it("only real push services are accepted", async () => {
    const { isKnownPushService } = await import("@/lib/schemas");
    expect(isKnownPushService("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isKnownPushService("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isKnownPushService("https://web.push.apple.com/abc")).toBe(true);
    expect(isKnownPushService("https://169.254.169.254/latest")).toBe(false);
    expect(isKnownPushService("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isKnownPushService("http://fcm.googleapis.com/x")).toBe(false);
  });

  it("rate accepts long sessions of excluded pairs", async () => {
    const { rateSchema } = await import("@/lib/schemas");
    const exclude = Array.from({ length: 300 }, (_, i) => `a${i}|b${i}`);
    expect(rateSchema.safeParse({ a: "x", b: "y", result: "a", exclude }).success).toBe(true);
    expect(rateSchema.safeParse({ a: "x/../y", b: "y", result: "a" }).success).toBe(false);
  });
});

describe("legacy data tolerance", () => {
  it("lists users who have no displayName and survives a malformed handle in the URL", async () => {
    const b = store.batch();
    b.set("users", "legacy", { uid: "legacy", handle: "oldtimer", photoURL: "" });
    await b.commit();
    const list = await listUsers();
    expect(list.map((u) => u.handle)).toContain("oldtimer");
    expect(await getUserByHandle("%E0%A4%A")).toBeNull();
  });

  it("accepts image/jpg data URLs and base64 with line breaks", () => {
    const img = decodeDataUrl("data:image/jpg;base64,/9j/4AAQ\nSkZJRg==");
    expect(img?.mime).toBe("image/jpeg");
  });
});
