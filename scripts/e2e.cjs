// End-to-end check against a dev server started in demo mode:
//   COOKED_E2E=1 NEXT_PUBLIC_COOKED_E2E=1 NEXTAUTH_SECRET=x NEXTAUTH_URL=http://localhost:3100 npx next dev -p 3100
const { chromium } = require("playwright");
const path = require("node:path");
const BASE = process.env.BASE ?? "http://localhost:3100";
const assert = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  -", m); };

async function login(browser, uid) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && page.errors.push(m.text()));
  await page.goto(BASE + "/signin");
  await page.waitForTimeout(1500);
  await page.click(`text=Demo: ${uid}`);
  await page.waitForURL(BASE + "/", { timeout: 60000 });
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();
  const { page: ann, ctx: annCtx } = await login(browser, "ann");

  // Feed shows public dishes only
  await ann.waitForSelector("article");
  const titles = await ann.$$eval("article h2", (n) => n.map((x) => x.textContent));
  assert(titles.includes("Spicy miso ramen") && !titles.includes("Chili oil toast"), "feed lists public dishes, hides private ones");

  // Like toggles optimistically and persists
  const likeBtn = ann.locator("article", { hasText: "Charred peach salad" }).getByRole("button", { name: /^Like$/ });
  await likeBtn.waitFor();
  const liked = ann.waitForResponse((r) => r.url().includes("/like") && r.request().method() === "PUT", { timeout: 60000 });
  await ann.locator("article", { hasText: "Charred peach salad" }).getByRole("button", { name: /^Like$/ }).click();
  await liked;
  await ann.reload();
  await ann.waitForSelector("article");
  const unlike = await ann.locator("article", { hasText: "Charred peach salad" }).getByRole("button", { name: "Unlike" }).count();
  assert(unlike === 1, "like persists across reload");

  // Pending tag: accept with a rating
  await ann.goto(BASE + "/dish/d2");
  await ann.getByText("tagged you").waitFor({ timeout: 60000 });
  await ann.getByText("Loved it").click();
  await ann.getByRole("button", { name: "Add to my dishes" }).click();
  await ann.getByText("Your score").waitFor();
  assert(true, "accepting a tag moves the dish into 'Your score' state");

  // Comment
  await ann.getByLabel("Add a comment").fill("Taking notes for next weekend");
  await ann.getByRole("button", { name: "Post comment" }).click();
  await ann.getByText("Taking notes for next weekend").waitFor();
  assert(true, "comment posts and appears");

  // Duel
  await ann.goto(BASE + "/rank");
  await ann.waitForSelector("button[aria-label^=Choose]", { timeout: 60000 });
  const first = ann.locator("button[aria-label^=Choose]").first();
  await first.click();
  await ann.getByRole("img", { name: /New score/ }).first().waitFor();
  assert(true, "duel reveals new scores");
  await ann.waitForSelector("button[aria-label^=Choose]:not([disabled])", { timeout: 5000 });
  assert(true, "next matchup loads after reveal");

  // Upload a dish
  await ann.goto(BASE + "/upload");
  await ann.setInputFiles('input[type=file]', path.join(__dirname, "demo", "soup.jpg"));
  await ann.getByAltText("Your photo").waitFor({ timeout: 20000 });
  await ann.getByLabel("What did you make?").fill("Test lentil stew");
  await ann.getByText("Pretty good").click();
  await ann.getByRole("button", { name: "Add dish" }).click();
  await ann.waitForURL(/\/dish\//, { timeout: 30000 });
  await ann.getByRole("heading", { name: "Test lentil stew" }).waitFor();
  const dishUrl = ann.url();
  assert(true, "uploading a dish creates it and opens its page");

  // Validation
  await ann.goto(BASE + "/upload");
  await ann.getByRole("button", { name: "Add dish" }).click();
  await ann.getByText("Add a photo of the dish.").waitFor();
  assert(await ann.getByText("Give your dish a name.").count() === 1, "empty form shows validation messages");

  // Bob can't see ann's private dish; sees public one
  const { page: bob, ctx: bobCtx } = await login(browser, "bob");
  await bob.goto(BASE + "/dish/d8");
  await bob.getByText("This dish isn't available").waitFor({ timeout: 60000 });
  assert(true, "private dish is hidden from others");
  await bob.goto(dishUrl);
  await bob.getByRole("heading", { name: "Test lentil stew" }).waitFor();
  await bob.getByRole("button", { name: "I made this too" }).waitFor();
  assert(true, "other users can open public dishes and offer 'I made this too'");

  // Owner deletes
  await ann.goto(dishUrl);
  await ann.getByRole("button", { name: "Manage dish" }).click();
  await ann.getByText("Delete dish").first().click();
  await ann.getByRole("button", { name: "Delete dish" }).click();
  await ann.waitForURL(BASE + "/", { timeout: 30000 });
  await bob.goto(dishUrl);
  await bob.getByText("This dish isn't available").waitFor();
  assert(true, "owner can delete a dish");

  // Profile
  await ann.goto(BASE + "/profile/bob");
  await ann.getByRole("heading", { name: "Bob Reyes" }).waitFor({ timeout: 30000 });
  assert(await ann.getByText("Chili oil toast").count() === 0, "profiles don't leak private dishes");

  // Activity page + settings
  await ann.goto(BASE + "/notifications");
  await ann.getByText(/commented on|on Spicy miso ramen/).first().waitFor({ timeout: 30000 });
  await ann.goto(BASE + "/settings");
  await ann.getByRole("heading", { name: "Settings" }).waitFor();
  assert(true, "activity and settings render");

  for (const [n, p] of [["ann", ann], ["bob", bob]]) assert(p.errors.length === 0, `${n}: no browser errors ${p.errors.join(" | ")}`);
  await annCtx.close(); await bobCtx.close(); await browser.close();
  console.log("\nE2E passed");
})().catch((e) => { console.error(e); process.exit(1); });
