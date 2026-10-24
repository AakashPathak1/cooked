/**
 * Data-transfer types shared by server and client. Everything here is plain
 * JSON: timestamps are ISO strings, images are URLs (never inline base64).
 */

import type { QuickRating } from "./elo";

export type Role = "creator" | "tagged" | "tried";

export type NotificationType = "like" | "comment" | "tag" | "accepted" | "tried";

export interface UserLite {
  uid: string;
  handle: string;
  displayName: string;
  photoURL: string;
}

/** What the signed-in viewer personally has going on with a dish. */
export interface DishViewerState {
  liked: boolean;
  saved: boolean;
  /** Set once the viewer is in the dish's ranking pool. */
  role: Role | null;
  /** Tagged but hasn't accepted or declined yet. */
  pendingTag: boolean;
}

/** Compact dish representation for feeds, grids and lists. */
export interface DishSummary {
  id: string;
  name: string;
  creator: UserLite;
  coverUrl: string | null;
  coverColor: string | null;
  /** Global rating (average of every participant's personal rating). */
  elo: number;
  /** The relevant person's own rating, when the list is a personal one. */
  personalElo: number | null;
  /** The relevant person's role, when the list is a personal one. */
  role: Role | null;
  likesCount: number;
  isPrivate: boolean;
  taggedCount: number;
  createdAt: string | null;
  viewer: DishViewerState;
}

export interface PhotoDTO {
  id: string;
  uploader: UserLite | null;
  url: string;
  thumbUrl: string;
  color: string | null;
  notes: string;
  createdAt: string | null;
  isCover: boolean;
}

export interface CommentDTO {
  id: string;
  user: UserLite | null;
  text: string;
  createdAt: string | null;
}

export interface ParticipantDTO {
  user: UserLite;
  role: Role;
  /** Their personal rating once they are in the pool, otherwise null. */
  elo: number | null;
  status: "accepted" | "pending";
}

export interface DishDetail {
  id: string;
  name: string;
  notes: string;
  recipeLink: string;
  isPrivate: boolean;
  createdAt: string | null;
  creator: UserLite;
  /** Global rating. */
  elo: number;
  likesCount: number;
  photos: PhotoDTO[];
  comments: CommentDTO[];
  commentsTruncated: boolean;
  participants: ParticipantDTO[];
  viewer: DishViewerState & {
    isOwner: boolean;
    personalElo: number | null;
    /** 1-based position among the viewer's own dishes, by personal rating. */
    personalRank: { position: number; total: number } | null;
    canTry: boolean;
  };
}

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  from: UserLite;
  dishId: string;
  dishName: string;
  read: boolean;
  createdAt: string | null;
  /** First line of the comment, for `comment` notifications. */
  preview?: string;
}

export interface ProfileStats {
  dishes: number;
  collabs: number;
  /** Mean of the subject's personal ratings, or null with no dishes. */
  averageElo: number | null;
}

export interface ProfileDTO {
  user: UserLite & { createdAt: string | null };
  isSelf: boolean;
  stats: ProfileStats;
  /** Personal dishes. Others only ever see public ones. */
  dishes: DishSummary[];
  /** Self only: dishes the viewer was tagged in but hasn't answered. */
  pendingTags: DishSummary[];
  /** Self only. */
  saved: DishSummary[];
}

/** One side of a head-to-head duel. */
export interface DuelDish {
  id: string;
  name: string;
  coverUrl: string | null;
  coverColor: string | null;
  personalElo: number;
}

export interface DuelPair {
  a: DuelDish;
  b: DuelDish;
}

export interface RateResult {
  /** Rating changes for the two dishes just compared. */
  changes: { dishId: string; before: number; after: number }[];
  /** The next suggested pair, or null when there is nothing left to compare. */
  next: DuelPair | null;
}

export interface SearchResults {
  users: UserLite[];
  dishes: DishSummary[];
}

export interface PhotoInput {
  /** Full-size JPEG data URL. */
  photo: string;
  /** Small JPEG data URL used in grids and feeds. */
  thumb: string;
  /** Dominant colour as `#rrggbb`, used as a loading placeholder. */
  color?: string | null;
}

export interface CreateDishInput extends PhotoInput {
  name: string;
  notes: string;
  recipeLink: string;
  taggedUserIds: string[];
  isPrivate: boolean;
  quickRating: QuickRating;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
