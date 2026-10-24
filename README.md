# Cooked

Photograph what you cook, rank it against everything else you've made, and compare notes with friends.

- **Add a dish** with a photo, a first-impression rating, optional notes, recipe link and tagged friends. Photos are resized on the device before upload.
- **Rank** by picking the better of two dishes. Each person keeps their own ELO-based order (ties supported); a dish's group score is the average of everyone's.
- **Cook together.** Tagged friends are asked for their own rating; anyone can add their version of a public dish.
- **Feed, top dishes, profiles** (grid or tier list), likes, saves, comments, search, activity and optional web-push notifications.
- Installable as a PWA. Light and dark themes follow the system.

## Architecture

The server is the only thing that talks to the database.

```
Browser ──fetch──▶ /api/* route handlers ──▶ lib/server/domain/* ──▶ Store (Firestore Admin | in-memory)
                    auth, same-origin check,       authorization, privacy,
                    zod validation, rate limits    transactions, scoring
```

- `lib/server/store` – a narrow document-store interface with a Firestore Admin implementation and an in-memory one that mimics Firestore's semantics (used by tests and demo mode).
- `lib/server/domain` – every rule lives here: who can see a dish, how scores are recomputed, cascading deletes, notifications.
- `app/api` – thin wrappers (`lib/server/http.ts`) adding session auth, CSRF-style origin checks, body-size limits, validation and uniform JSON errors.
- Photos are stored as JPEG data URLs in Firestore, but are **served as images** from `/api/photos/[id]` and `/api/dishes/[id]/cover` with per-viewer authorization and long-lived, versioned caching. Feeds never carry base64.
- `firestore.rules` denies all client access; the Firebase client SDK is no longer used.
- `lib/elo.ts`, `lib/score.ts`, `lib/pairing.ts` – pure scoring and matchmaking logic with unit tests.

### Scoring

K = 32, start 1200, bounded to 900–1700. Display score is `(elo − 1000) / 400 × 10` clamped to 0–10; tiers are S ≥ 1400, A ≥ 1300, B ≥ 1200, C ≥ 1100, otherwise D. The first-impression rating seeds a dish at 1360 / 1280 / 1200 / 1100.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Required: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, and Firebase Admin credentials (`FIREBASE_SERVICE_ACCOUNT_KEY`). `GET /api/health` reports which settings are present (never their values).

### Try it without any accounts

```bash
COOKED_E2E=1 NEXT_PUBLIC_COOKED_E2E=1 NEXTAUTH_SECRET=dev npm run dev
```

This starts on a seeded in-memory store with one-click sign-in as Ann, Bob or Cy. It is disabled in production builds.

## Quality gates

```bash
npm run check        # typecheck + lint + unit/domain/API tests
./scripts/e2e.sh     # headless-browser walkthrough of the main flows (needs Playwright's Chromium)
```

CI runs typecheck, lint, tests and a build on every pull request, and the deploy workflow runs the same checks before shipping.

## Upgrading an existing deployment

This release changes how data is accessed, so deploy in this order:

1. **Add `FIREBASE_SERVICE_ACCOUNT_KEY`** to your hosting environment (Vercel → Settings → Environment Variables).
2. **Deploy the indexes first:** `firebase deploy --only firestore:indexes` and wait until they finish building (a new one covers notifications ordered by time).
3. **Deploy the app.**
4. **Then lock the database:** `firebase deploy --only firestore:rules`. Until this step the old open rules are still in force, so do not skip it.

Existing data keeps working with no migration: user ids are unchanged (the Google `sub`), legacy dishes with an inline `coverPhotoURL` are still served (and migrate to the new cover fields the next time their photos change), and handle reservations are backfilled the first time each person signs in. The old `pushSubscriptions/{uid}` documents are superseded by per-device documents; people simply re-enable notifications once in Settings.

Removed: the unauthenticated `/api/notify` and `/api/admin/fix-user-dishes` endpoints, and the open-write Firestore rules.
