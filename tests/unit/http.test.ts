import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let current: { uid: string; name: string; email: null; image: null } | null = null;
vi.mock("@/lib/server/auth", () => ({
  requireViewer: async () => {
    if (!current) {
      const { unauthorized } = await import("@/lib/server/errors");
      throw unauthorized();
    }
    return current;
  },
  getViewer: async () => current,
  authOptions: {},
  isDemoMode: () => false,
}));

import { resetRateLimits } from "@/lib/server/ratelimit";
import { setStore } from "@/lib/server/store";
import { MemoryStore } from "@/lib/server/store/memory";
import { ensureUser, clearEnsureCache } from "@/lib/server/domain/users";
import { setPushTransport } from "@/lib/server/domain/push";
import { POST as createDish } from "@/app/api/dishes/route";
import { GET as getDish, DELETE as deleteDish } from "@/app/api/dishes/[id]/route";
import { PUT as putLike } from "@/app/api/dishes/[id]/like/route";
import { POST as postComment } from "@/app/api/dishes/[id]/comments/route";
import { GET as getCover } from "@/app/api/dishes/[id]/cover/route";
import { GET as getFeed } from "@/app/api/feed/route";
import { DELETE as deleteAccount } from "@/app/api/account/route";
import indexConfig from "@/firestore.indexes.json";

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const base = "http://localhost:3000";

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${base}${path}`, {
    method,
    headers: { host: "localhost:3000", "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const newDish = { name: "Ramen", photo: JPEG, thumb: JPEG, quickRating: "good" };

beforeEach(async () => {
  setStore(new MemoryStore(indexConfig.indexes));
  resetRateLimits();
  clearEnsureCache();
  setPushTransport(async () => {});
  current = { uid: "ann", name: "Ann Lee", email: null, image: null };
  await ensureUser({ uid: "ann", name: "Ann Lee", email: null, image: null });
  await ensureUser({ uid: "bob", name: "Bob Ray", email: null, image: null });
});

describe("api wrapper", () => {
  it("returns 401 JSON without a session", async () => {
    current = null;
    const res = await getFeed(req("GET", "/api/feed"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  it("creates a dish, then serves it, its cover and the feed", async () => {
    const created = await createDish(req("POST", "/api/dishes", newDish));
    expect(created.status).toBe(200);
    const { id } = await created.json();

    const detail = await getDish(req("GET", `/api/dishes/${id}`), { params: { id } });
    expect((await detail.json()).name).toBe("Ramen");

    const cover = await getCover(req("GET", `/api/dishes/${id}/cover`), { params: { id } });
    expect(cover.headers.get("content-type")).toBe("image/jpeg");
    expect(cover.headers.get("cache-control")).toContain("immutable");
    const etag = cover.headers.get("etag")!;
    const again = await getCover(req("GET", `/api/dishes/${id}/cover`, undefined, { "if-none-match": etag }), {
      params: { id },
    });
    expect(again.status).toBe(304);

    const feed = await (await getFeed(req("GET", "/api/feed"))).json();
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].coverUrl).toContain(`/api/dishes/${id}/cover?v=`);
  });

  it("rejects invalid bodies with a readable 400", async () => {
    const bad = await createDish(req("POST", "/api/dishes", { ...newDish, name: "  " }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.message).toMatch(/name/i);
    const notJpeg = await createDish(req("POST", "/api/dishes", { ...newDish, photo: "data:image/svg+xml;base64,PHN2Zz4=" }));
    expect(notJpeg.status).toBe(400);
    const badLink = await createDish(req("POST", "/api/dishes", { ...newDish, recipeLink: "javascript:alert(1)" }));
    expect(badLink.status).toBe(400);
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    const malformed = new NextRequest(`${base}/api/dishes/x/comments`, {
      method: "POST",
      headers: { host: "localhost:3000" },
      body: "{nope",
    });
    expect((await postComment(malformed, { params: { id: "x" } })).status).toBe(400);
    const big = await postComment(req("POST", "/api/dishes/x/comments", { text: "a".repeat(40_000) }), {
      params: { id: "x" },
    });
    expect(big.status).toBe(413);
  });

  it("blocks cross-site writes", async () => {
    const res = await createDish(req("POST", "/api/dishes", newDish, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    const sameOrigin = await createDish(req("POST", "/api/dishes", newDish, { origin: "http://localhost:3000" }));
    expect(sameOrigin.status).toBe(200);
    const fetchMeta = await createDish(req("POST", "/api/dishes", newDish, { "sec-fetch-site": "cross-site" }));
    expect(fetchMeta.status).toBe(403);
  });

  it("maps missing/forbidden dishes to 404/403 and rate limits comments", async () => {
    const { id } = await (await createDish(req("POST", "/api/dishes", newDish))).json();
    current = { uid: "bob", name: "Bob Ray", email: null, image: null };
    expect((await deleteDish(req("DELETE", `/api/dishes/${id}`), { params: { id } })).status).toBe(403);
    expect((await getDish(req("GET", "/api/dishes/nope"), { params: { id: "nope" } })).status).toBe(404);
    expect((await putLike(req("PUT", `/api/dishes/${id}/like`, { liked: true }), { params: { id } })).status).toBe(200);

    let last = 200;
    for (let i = 0; i < 25; i++) {
      last = (await postComment(req("POST", `/api/dishes/${id}/comments`, { text: `hi ${i}` }), { params: { id } })).status;
    }
    expect(last).toBe(429);
  });

  it("account deletion needs the handle typed", async () => {
    const wrong = await deleteAccount(req("DELETE", "/api/account", { confirm: "someone" }));
    expect(wrong.status).toBe(400);
    const ok = await deleteAccount(req("DELETE", "/api/account", { confirm: "@Ann_Lee" }));
    expect(ok.status).toBe(200);
  });
});
