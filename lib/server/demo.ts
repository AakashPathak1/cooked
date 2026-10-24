import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { QUICK_RATINGS } from "@/lib/elo";
import { MemoryStore } from "./store/memory";
import indexConfig from "@/firestore.indexes.json";

const img = (name: string, thumb = false) =>
  `data:image/jpeg;base64,${readFileSync(
    path.join(process.cwd(), "scripts/demo", thumb ? `${name}.thumb.jpg` : `${name}.jpg`)
  ).toString("base64")}`;

const DAY = 86_400_000;

/** A small, believable data set: three friends, a handful of dishes, some activity. */
export function createDemoStore(): MemoryStore {
  const store = new MemoryStore(indexConfig.indexes);
  const t0 = Date.now();
  const b = store.batch();

  const users = [
    { uid: "ann", handle: "ann", name: "Ann Park" },
    { uid: "bob", handle: "bob", name: "Bob Reyes" },
    { uid: "cy", handle: "cy", name: "Cy Okafor" },
    { uid: "dee", handle: "dee", name: "Dee Lindqvist" },
  ];
  for (const u of users) {
    b.set("users", u.uid, { uid: u.uid, handle: u.handle, displayName: u.name, photoURL: "", createdAt: new Date(t0 - 40 * DAY) });
    b.set("handles", u.handle, { uid: u.uid, createdAt: new Date(t0 - 40 * DAY) });
  }

  type Seed = {
    id: string; name: string; by: string; img: string; tags?: string[]; joined?: Record<string, keyof typeof QUICK_RATINGS>;
    rating: keyof typeof QUICK_RATINGS; ago: number; priv?: boolean; notes?: string; link?: string; likes?: string[];
  };
  const seeds: Seed[] = [
    { id: "d1", name: "Spicy miso ramen", by: "ann", img: "ramen", tags: ["bob"], joined: { bob: "good" }, rating: "loved", ago: 0.2, notes: "Doubled the miso and finished with chili crisp. Broth took four hours and was worth it.", link: "https://www.seriouseats.com/", likes: ["bob", "cy"] },
    { id: "d2", name: "Al pastor tacos", by: "bob", img: "tacos", tags: ["ann"], rating: "good", ago: 1, notes: "Pineapple on the grill makes it.", likes: ["ann"] },
    { id: "d3", name: "Charred peach salad", by: "cy", img: "salad", rating: "okay", ago: 2 },
    { id: "d4", name: "Brown butter gnocchi", by: "ann", img: "pasta", rating: "good", ago: 3, joined: {} },
    { id: "d5", name: "Coconut chickpea curry", by: "dee", img: "curry", rating: "loved", ago: 4, likes: ["ann", "bob", "cy"] },
    { id: "d6", name: "Buttermilk pancakes", by: "ann", img: "pancakes", rating: "meh", ago: 6 },
    { id: "d7", name: "Roasted tomato soup", by: "bob", img: "soup", rating: "good", ago: 8 },
    { id: "d8", name: "Chili oil toast", by: "ann", img: "toast", rating: "okay", ago: 9, priv: true, notes: "Just for me." },
  ];

  for (const s of seeds) {
    const created = new Date(t0 - s.ago * DAY);
    const tagged = s.tags ?? [];
    const elos: Record<string, number> = { [s.by]: QUICK_RATINGS[s.rating] };
    for (const [uid, r] of Object.entries(s.joined ?? {})) elos[uid] = QUICK_RATINGS[r];
    const values = Object.values(elos);
    b.set("dishes", s.id, {
      creatorId: s.by, name: s.name, notes: s.notes ?? "", recipeLink: s.link ?? "", taggedUserIds: tagged,
      likesCount: (s.likes ?? []).length, isPrivate: Boolean(s.priv),
      globalScore: Math.round(values.reduce((a, c) => a + c, 0) / values.length),
      coverLogId: `${s.id}_l`, coverVersion: created.getTime(), coverColor: "#3a322d", createdAt: created, updatedAt: created,
    });
    b.set("dishLogs", `${s.id}_l`, { dishId: s.id, userId: s.by, photoURL: img(s.img), thumbURL: img(s.img, true), color: "#3a322d", notes: "", createdAt: created });
    for (const [uid, elo] of Object.entries(elos)) {
      b.set("userDishes", `${uid}_${s.id}`, { userId: uid, dishId: s.id, role: uid === s.by ? "creator" : "tagged" });
      b.set("userDishElos", `${uid}_${s.id}`, { userId: uid, dishId: s.id, elo, n: 0 });
    }
    for (const uid of s.likes ?? []) b.set("likes", `${uid}_${s.id}`, { userId: uid, dishId: s.id, createdAt: created });
  }

  b.set("comments", "c1", { dishId: "d1", userId: "bob", text: "Fought the urge to drink the broth straight from the pot.", createdAt: new Date(t0 - 0.15 * DAY) });
  b.set("comments", "c2", { dishId: "d1", userId: "cy", text: "Recipe please?", createdAt: new Date(t0 - 0.1 * DAY) });
  b.set("notifications", "n1", { toUid: "ann", fromUid: "bob", fromDisplayName: "Bob Reyes", fromPhotoURL: "", type: "comment", dishId: "d1", dishName: "Spicy miso ramen", preview: "Fought the urge to drink the broth straight from the pot.", read: false, createdAt: new Date(t0 - 0.15 * DAY) });
  b.set("notifications", "n2", { toUid: "ann", fromUid: "bob", fromDisplayName: "Bob Reyes", fromPhotoURL: "", type: "tag", dishId: "d2", dishName: "Al pastor tacos", read: false, createdAt: new Date(t0 - 1 * DAY) });
  b.set("notifications", "n3", { toUid: "ann", fromUid: "cy", fromDisplayName: "Cy Okafor", fromPhotoURL: "", type: "like", dishId: "d1", dishName: "Spicy miso ramen", read: true, createdAt: new Date(t0 - 0.12 * DAY) });
  void b.commit(); // MemoryStore applies batches synchronously
  return store;
}
