/**
 * Input validation shared by the API routes and (for fast feedback) the
 * client forms. Every untrusted string that reaches storage passes through
 * here.
 */
import { z } from "zod";
import { QUICK_RATING_KEYS } from "./elo";

export const LIMITS = {
  name: 80,
  notes: 1000,
  recipeLink: 500,
  comment: 500,
  tags: 30,
  /** ~700 KB of base64 for the full-size image. */
  photoChars: 700_000,
  /** ~100 KB of base64 for the thumbnail. */
  thumbChars: 100_000,
  photosPerUserPerDish: 6,
  photosPerDish: 30,
} as const;

const JPEG_PREFIX = "data:image/jpeg;base64,/9j/";
const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;

/** Only JPEG data URLs are accepted. They cannot carry script (unlike SVG). */
export function isJpegDataUrl(value: string, maxChars: number): boolean {
  if (value.length > maxChars || !value.startsWith(JPEG_PREFIX)) return false;
  return BASE64_BODY.test(value.slice("data:image/jpeg;base64,".length));
}

const jpegDataUrl = (maxChars: number) =>
  z
    .string()
    .refine((v) => isJpegDataUrl(v, maxChars), { message: "Photo must be a JPEG image of reasonable size" });

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullish()
  .transform((v) => v ?? null);

/** Empty string or an http(s) URL. Rejects `javascript:` and friends. */
const recipeLink = z
  .string()
  .trim()
  .max(LIMITS.recipeLink)
  .refine(
    (v) => {
      if (v === "") return true;
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Recipe link must be a web address starting with http:// or https://" }
  );

const quickRating = z.enum(QUICK_RATING_KEYS as [string, ...string[]]) as unknown as z.ZodType<
  "loved" | "good" | "okay" | "meh"
>;

export const photoInput = z.object({
  photo: jpegDataUrl(LIMITS.photoChars),
  thumb: jpegDataUrl(LIMITS.thumbChars),
  color: hexColor,
});

export const createDishSchema = photoInput.extend({
  name: z.string().trim().min(1, "Give your dish a name").max(LIMITS.name),
  notes: z.string().trim().max(LIMITS.notes).default(""),
  recipeLink: recipeLink.default(""),
  taggedUserIds: z.array(z.string().min(1).max(128)).max(LIMITS.tags).default([]),
  isPrivate: z.boolean().default(false),
  quickRating,
});

export const updateDishSchema = z
  .object({
    name: z.string().trim().min(1).max(LIMITS.name).optional(),
    notes: z.string().trim().max(LIMITS.notes).optional(),
    recipeLink: recipeLink.optional(),
    isPrivate: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const addPhotoSchema = photoInput.extend({
  notes: z.string().trim().max(LIMITS.notes).default(""),
});

export const tryDishSchema = photoInput.extend({
  notes: z.string().trim().max(LIMITS.notes).default(""),
  quickRating,
});

export const quickRatingSchema = z.object({ quickRating });

export const acceptTagSchema = z.object({ quickRating });

export const tagsSchema = z.object({
  userIds: z.array(z.string().min(1).max(128)).max(LIMITS.tags),
});

export const commentSchema = z.object({
  text: z.string().trim().min(1, "Write something first").max(LIMITS.comment),
});

export const coverSchema = z.object({ logId: z.string().min(1).max(128) });

export const rateSchema = z.object({
  a: z.string().min(1).max(128),
  b: z.string().min(1).max(128),
  result: z.enum(["a", "b", "tie"]),
  focusId: z.string().min(1).max(128).optional(),
  exclude: z.array(z.string().min(1).max(128)).max(50).default([]),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .refine((v) => v.startsWith("https://"), { message: "Push endpoints must be https" }),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000).optional(),
});

export const searchSchema = z.object({
  q: z.string().trim().max(60).default(""),
});

/** First human-readable message from a zod error. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${where}${issue.message}`;
}
