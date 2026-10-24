import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/server/store/memory";
import { AlreadyExistsError, DELETE_FIELD, NotFoundError } from "@/lib/server/store/types";

let store: MemoryStore;

async function seed(col: string, rows: Record<string, Record<string, unknown>>) {
  const batch = store.batch();
  for (const [id, data] of Object.entries(rows)) batch.set(col, id, data);
  await batch.commit();
}

beforeEach(() => {
  store = new MemoryStore();
});

describe("basic reads and writes", () => {
  it("round-trips documents without sharing references", async () => {
    const original = { name: "ramen", tags: ["a"], when: new Date("2026-01-01T00:00:00Z") };
    await store.batch().commit();
    const b = store.batch();
    b.set("dishes", "d1", original);
    await b.commit();
    original.tags.push("mutated");

    const got = await store.get("dishes", "d1");
    expect(got?.data.tags).toEqual(["a"]);
    (got!.data.tags as string[]).push("also mutated");
    expect((await store.get("dishes", "d1"))?.data.tags).toEqual(["a"]);
    expect((got!.data.when as Date).getTime()).toBe(new Date("2026-01-01T00:00:00Z").getTime());
  });

  it("returns null for missing docs and preserves order in getMany", async () => {
    await seed("c", { a: { n: 1 }, b: { n: 2 } });
    const rows = await store.getMany("c", ["b", "zzz", "a"]);
    expect(rows.map((r) => r?.id ?? null)).toEqual(["b", null, "a"]);
  });

  it("create() refuses to overwrite", async () => {
    const b1 = store.batch();
    b1.create("c", "a", { n: 1 });
    await b1.commit();
    const b2 = store.batch();
    b2.create("c", "a", { n: 2 });
    await expect(b2.commit()).rejects.toBeInstanceOf(AlreadyExistsError);
    expect((await store.get("c", "a"))?.data.n).toBe(1);
  });

  it("update() requires the doc, merges fields and supports DELETE_FIELD", async () => {
    await seed("c", { a: { n: 1, email: "x@y.z", keep: true } });
    const b = store.batch();
    b.update("c", "a", { n: 2, email: DELETE_FIELD, ignored: undefined });
    await b.commit();
    expect((await store.get("c", "a"))?.data).toEqual({ n: 2, keep: true });

    const missing = store.batch();
    missing.update("c", "nope", { n: 1 });
    await expect(missing.commit()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a failing batch applies nothing", async () => {
    await seed("c", { exists: { n: 1 } });
    const b = store.batch();
    b.set("c", "new", { n: 9 });
    b.update("c", "ghost", { n: 1 });
    await expect(b.commit()).rejects.toBeInstanceOf(NotFoundError);
    expect(await store.get("c", "new")).toBeNull();
  });
});

describe("queries", () => {
  beforeEach(async () => {
    await seed("dishes", {
      a: { isPrivate: false, score: 1300, tags: ["u1"], createdAt: new Date("2026-01-03") },
      b: { isPrivate: false, score: 1200, tags: ["u2"], createdAt: new Date("2026-01-02") },
      c: { isPrivate: true, score: 1400, tags: ["u1", "u2"], createdAt: new Date("2026-01-01") },
      d: { isPrivate: false, score: 1200, tags: [], createdAt: new Date("2026-01-04") },
      legacy: { isPrivate: false, score: 1250 }, // no createdAt
    });
  });

  it("filters with ==, in and array-contains", async () => {
    const pub = await store.query("dishes", { where: [{ field: "isPrivate", op: "==", value: false }] });
    expect(pub.map((d) => d.id).sort()).toEqual(["a", "b", "d", "legacy"]);

    const inQ = await store.query("dishes", { where: [{ field: "__id__", op: "in", value: ["a", "c", "x"] }] });
    expect(inQ.map((d) => d.id).sort()).toEqual(["a", "c"]);

    const arr = await store.query("dishes", { where: [{ field: "tags", op: "array-contains", value: "u1" }] });
    expect(arr.map((d) => d.id).sort()).toEqual(["a", "c"]);
  });

  it("orders by a Date field and EXCLUDES docs missing that field (like Firestore)", async () => {
    const rows = await store.query("dishes", { orderBy: [{ field: "createdAt", dir: "desc" }] });
    expect(rows.map((d) => d.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("breaks ties on document id in the direction of the last ordering", async () => {
    const desc = await store.query("dishes", {
      where: [{ field: "isPrivate", op: "==", value: false }],
      orderBy: [{ field: "score", dir: "desc" }],
    });
    // score 1300, 1250, then the 1200 tie: b and d in DESCENDING id order
    expect(desc.map((d) => d.id)).toEqual(["a", "legacy", "d", "b"]);

    const asc = await store.query("dishes", {
      where: [{ field: "isPrivate", op: "==", value: false }],
      orderBy: [{ field: "score", dir: "asc" }],
    });
    expect(asc.map((d) => d.id)).toEqual(["b", "d", "legacy", "a"]);
  });

  it("paginates with a full cursor without skipping or repeating ties", async () => {
    const seen: string[] = [];
    let cursor: unknown[] | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = await store.query("dishes", {
        where: [{ field: "isPrivate", op: "==", value: false }],
        orderBy: [{ field: "score", dir: "desc" }],
        limit: 1,
        startAfter: cursor,
      });
      if (page.length === 0) break;
      seen.push(page[0].id);
      cursor = [page[0].data.score, page[0].id];
    }
    expect(seen).toEqual(["a", "legacy", "d", "b"]);
  });

  it("applies limit and count", async () => {
    const two = await store.query("dishes", { orderBy: [{ field: "score", dir: "desc" }], limit: 2 });
    expect(two.map((d) => d.id)).toEqual(["c", "a"]);
    expect(await store.count("dishes", [{ field: "isPrivate", op: "==", value: true }])).toBe(1);
    expect(await store.count("dishes")).toBe(5);
  });

  it("handles comparison operators on Dates", async () => {
    const recent = await store.query("dishes", {
      where: [{ field: "createdAt", op: ">=", value: new Date("2026-01-03") }],
    });
    expect(recent.map((d) => d.id).sort()).toEqual(["a", "d"]);
  });
});

describe("transactions", () => {
  it("applies writes atomically on success", async () => {
    await seed("c", { a: { n: 1 } });
    await store.runTransaction(async (tx) => {
      const a = await tx.get("c", "a");
      tx.update("c", "a", { n: (a!.data.n as number) + 1 });
      tx.set("c", "b", { n: 10 });
    });
    expect((await store.get("c", "a"))?.data.n).toBe(2);
    expect((await store.get("c", "b"))?.data.n).toBe(10);
  });

  it("discards writes when the callback throws", async () => {
    await seed("c", { a: { n: 1 } });
    await expect(
      store.runTransaction(async (tx) => {
        tx.update("c", "a", { n: 99 });
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect((await store.get("c", "a"))?.data.n).toBe(1);
  });

  it("enforces Firestore's reads-before-writes rule", async () => {
    await seed("c", { a: { n: 1 } });
    await expect(
      store.runTransaction(async (tx) => {
        tx.set("c", "x", { n: 1 });
        await tx.get("c", "a");
      })
    ).rejects.toThrow(/all reads to be executed before all writes/);
  });

  it("serialises concurrent read-modify-write transactions (no lost updates)", async () => {
    await seed("counter", { c: { n: 0 } });
    const bump = () =>
      store.runTransaction(async (tx) => {
        const cur = (await tx.get("counter", "c"))!.data.n as number;
        await new Promise((r) => setTimeout(r, Math.random() * 3));
        tx.update("counter", "c", { n: cur + 1 });
      });
    await Promise.all(Array.from({ length: 25 }, bump));
    expect((await store.get("counter", "c"))?.data.n).toBe(25);
  });
});

describe("field projection", () => {
  it("returns only selected fields from get, getMany and query", async () => {
    await seed("dishes", { a: { name: "x", coverPhotoURL: "BIG", n: 1 } });
    expect((await store.get("dishes", "a", { select: ["name"] }))?.data).toEqual({ name: "x" });
    expect((await store.getMany("dishes", ["a"], { select: ["n"] }))[0]?.data).toEqual({ n: 1 });
    const rows = await store.query("dishes", { select: ["name", "n"] });
    expect(rows[0].data).toEqual({ name: "x", n: 1 });
  });
});

describe("composite index emulation", () => {
  const indexes = [
    { collectionGroup: "comments", fields: [{ fieldPath: "dishId", order: "ASCENDING" as const }, { fieldPath: "createdAt", order: "DESCENDING" as const }] },
  ];

  it("rejects an equality + orderBy query with no matching composite index", async () => {
    const s = new MemoryStore(indexes);
    await expect(
      s.query("comments", { where: [{ field: "dishId", op: "==", value: "d" }], orderBy: [{ field: "createdAt", dir: "asc" }] })
    ).rejects.toThrow(/requires an index/);
    await expect(
      s.query("comments", { where: [{ field: "dishId", op: "==", value: "d" }], orderBy: [{ field: "createdAt", dir: "desc" }] })
    ).resolves.toEqual([]);
  });

  it("serves single-field and equality-only queries without a composite index", async () => {
    const s = new MemoryStore([]);
    await expect(s.query("x", { orderBy: [{ field: "a", dir: "desc" }] })).resolves.toEqual([]);
    await expect(s.query("x", { where: [{ field: "a", op: "==", value: 1 }, { field: "b", op: "==", value: 2 }] })).resolves.toEqual([]);
  });
});

describe("ids the Firestore SDK would reject", () => {
  it("are treated as missing documents rather than throwing", async () => {
    await seed("c", { a: { n: 1 } });
    const rows = await store.getMany("c", ["", "..", "a/b", "__x__", "a"]);
    expect(rows.map((r) => r?.id ?? null)).toEqual([null, null, null, null, "a"]);
  });
});
