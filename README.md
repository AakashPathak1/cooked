# Cooked

A social app for ranking dishes you've made or tried. Upload a photo, compare it against your other dishes in head-to-head matchups, and build a personal ELO-based tier list over time.

## How it works

- **Upload a dish** — photo, name, optional notes and recipe link
- **ELO ranking** — right after uploading, you compare the new dish against your existing ones head-to-head. Pick the one you prefer, scores update automatically
- **Personal scores** — each person has their own ELO ranking for every dish they've been involved with (created, tagged in, or tried)
- **Global score** — the average of all personal scores for a dish, shown on the leaderboard
- **Try a dish** — on any dish page, add your own photo and it enters your personal ranking pool
- **Privacy** — dishes are public by default; owners can flip them private

## Stack

- Next.js 14 (App Router)
- Firebase Firestore + Google Auth
- Vercel

## Data model

| Collection | Purpose |
|---|---|
| `dishes` | Dish metadata — `globalScore`, `coverPhotoURL`, `isPrivate` |
| `dishLogs` | One per photo per user — multiple people can log the same dish |
| `userDishes` | Each user's relationship to a dish: `creator`, `tagged`, or `tried` |
| `userDishElos` | Personal ELO per user per dish |
| `comments`, `likes`, `saved` | Social interactions |

## Dev

```bash
npm install
npm run dev
```

Requires `.env.local` with Firebase config and NextAuth secret.
