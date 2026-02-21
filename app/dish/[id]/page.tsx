"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  getDish,
  getDishLogs,
  createDishLog,
  deleteDish,
  updateDishPrivacy,
  getPersonalDishes,
  getComments,
  addComment,
  toggleLike,
  toggleSave,
  isLiked,
  isSaved,
  getUserByUid,
  DishDoc,
  DishLogDoc,
  CommentDoc,
  UserDoc,
} from "@/lib/firestore";
import { compressImageToBase64 } from "@/lib/storage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Heart, Bookmark, ExternalLink, Send, ChevronLeft,
  Camera, Trash2, Lock, Globe, Plus, X,
} from "lucide-react";
import { eloTier, eloToRating } from "@/lib/eloDisplay";
import { PairwiseComparison } from "@/components/PairwiseComparison";

export default function DishPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const tryFileRef = useRef<HTMLInputElement>(null);

  const [dish, setDish] = useState<DishDoc | null>(null);
  const [creator, setCreator] = useState<UserDoc | null>(null);
  const [logs, setLogs] = useState<DishLogDoc[]>([]);
  const [logUsers, setLogUsers] = useState<Record<string, UserDoc>>({});
  const [comments, setComments] = useState<CommentDoc[]>([]);
  const [commentUsers, setCommentUsers] = useState<Record<string, UserDoc>>({});
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [tryLoading, setTryLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [rankingDishes, setRankingDishes] = useState<DishDoc[]>([]);
  const [showRanking, setShowRanking] = useState(false);
  const commentsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  useEffect(() => {
    if (!id || !user) return;
    async function load() {
      if (!user) return;
      const d = await getDish(id as string);
      if (!d) { setFetching(false); return; }
      setDish(d);
      setLikesCount(d.likesCount ?? 0);

      const [creatorData, likedData, savedData, commentsData, logsData] = await Promise.all([
        getUserByUid(d.creatorId),
        isLiked(user.uid, d.id),
        isSaved(user.uid, d.id),
        getComments(d.id),
        getDishLogs(d.id),
      ]);

      setCreator(creatorData);
      setLiked(likedData);
      setSaved(savedData);
      setComments(commentsData);
      setLogs(logsData);

      // Fetch comment + log users
      const allUids = Array.from(new Set([
        ...commentsData.map((c) => c.userId),
        ...logsData.map((l) => l.userId),
      ]));
      const userMap: Record<string, UserDoc> = {};
      await Promise.all(
        allUids.map(async (uid) => {
          const u = await getUserByUid(uid);
          if (u) userMap[uid] = u;
        })
      );
      setCommentUsers(userMap);
      setLogUsers(userMap);
      setFetching(false);
    }
    load();
  }, [id, user]);

  async function handleLike() {
    if (!user || !dish) return;
    const nowLiked = await toggleLike(user.uid, dish.id);
    setLiked(nowLiked);
    setLikesCount((c) => (nowLiked ? c + 1 : c - 1));
  }

  async function handleSave() {
    if (!user || !dish) return;
    setSaved(await toggleSave(user.uid, dish.id));
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !dish || !commentText.trim()) return;
    setSubmitting(true);
    await addComment(dish.id, user.uid, commentText.trim());
    setCommentText("");
    const updated = await getComments(dish.id);
    setComments(updated);
    setSubmitting(false);
    setTimeout(() => commentsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  async function handleTry(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !user || !dish) return;
    setTryLoading(true);
    try {
      const photoURL = await compressImageToBase64(f);
      await createDishLog(dish.id, user.uid, photoURL);
      // Refresh logs
      const [updatedLogs, personal] = await Promise.all([
        getDishLogs(dish.id),
        getPersonalDishes(user.uid),
      ]);
      setLogs(updatedLogs);
      const u = await getUserByUid(user.uid);
      if (u) setLogUsers((m) => ({ ...m, [user.uid]: u }));
      setDish((d) => d ? { ...d, coverPhotoURL: photoURL } : d);
      // Trigger ranking if enough dishes
      if (personal.length >= 2) {
        setRankingDishes(personal);
        setShowRanking(true);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to add your photo. Please try again.");
    } finally {
      setTryLoading(false);
      e.target.value = "";
    }
  }

  async function handleDelete() {
    if (!user || !dish) return;
    if (!confirm("Delete this dish? This cannot be undone.")) return;
    setDeleteLoading(true);
    try {
      await deleteDish(dish.id, user.uid);
      router.replace("/");
    } catch (err) {
      console.error(err);
      alert("Failed to delete. Please try again.");
      setDeleteLoading(false);
    }
  }

  async function handlePrivacyToggle() {
    if (!user || !dish) return;
    const next = !dish.isPrivate;
    await updateDishPrivacy(dish.id, user.uid, next);
    setDish((d) => d ? { ...d, isPrivate: next } : d);
  }

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!dish) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-400">Dish not found.</p>
      </div>
    );
  }

  const tier = eloTier(dish.globalScore ?? 1200);
  const rating = eloToRating(dish.globalScore ?? 1200);
  const isOwner = user?.uid === dish.creatorId;
  const alreadyLogged = logs.some((l) => l.userId === user?.uid);

  // Ranking overlay
  if (showRanking) {
    return (
      <div className="min-h-screen bg-white">
        <div className="sticky top-0 bg-white/90 backdrop-blur-sm z-40 px-4 pt-12 pb-3 border-b border-gray-100 flex items-center gap-3">
          <button onClick={() => setShowRanking(false)} className="p-1">
            <X className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-lg font-bold">How does it rank?</h1>
            <p className="text-xs text-gray-400">Compare against your other dishes</p>
          </div>
        </div>
        <div className="px-4 pt-4 pb-8">
          <PairwiseComparison
            dishes={rankingDishes}
            highlightDishId={dish.id}
            onComplete={() => setShowRanking(false)}
            completeLabel="Done"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-nav">
      {/* Photo scroll */}
      <div className="relative">
        {logs.length > 0 ? (
          <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
            {logs.map((log) => {
              const uploader = logUsers[log.userId];
              return (
                <div key={log.id} className="relative shrink-0 w-full aspect-square bg-gray-100 snap-start">
                  <img src={log.photoURL} alt={dish.name} className="w-full h-full object-cover" />
                  {/* Uploader avatar */}
                  {uploader && (
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-2 py-1">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={uploader.photoURL} />
                        <AvatarFallback className="text-[8px]">{uploader.displayName?.[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-white text-xs font-medium">{uploader.displayName}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="aspect-square bg-gray-100 flex items-center justify-center text-7xl">🍽️</div>
        )}

        {/* Back */}
        <button
          onClick={() => router.back()}
          className="absolute top-12 left-4 bg-black/40 backdrop-blur-sm rounded-full p-2"
        >
          <ChevronLeft className="h-5 w-5 text-white" />
        </button>

        {/* Tier badge */}
        <div className={`absolute top-12 right-4 ${tier.color} rounded-full h-12 w-12 flex flex-col items-center justify-center shadow-lg`}>
          <span className="text-white text-xs font-bold leading-none">{tier.label}</span>
          <span className="text-white text-[10px] leading-none opacity-90">{rating}</span>
        </div>

        {/* Photo count indicator */}
        {logs.length > 1 && (
          <div className="absolute bottom-3 right-3 bg-black/40 backdrop-blur-sm rounded-full px-2 py-1">
            <span className="text-white text-xs font-medium">{logs.length} photos</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pt-4 space-y-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h1 className="text-2xl font-bold leading-tight">{dish.name}</h1>
            {creator && (
              <Link href={`/profile/${creator.handle}`} className="flex items-center gap-2 mt-1.5">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={creator.photoURL} />
                  <AvatarFallback className="text-[10px]">{creator.displayName?.[0]}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-gray-500">{creator.displayName}</span>
              </Link>
            )}
          </div>
          {/* Owner controls */}
          {isOwner && (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrivacyToggle}
                className="p-2 rounded-full bg-gray-100 text-gray-500"
                title={dish.isPrivate ? "Make public" : "Make private"}
              >
                {dish.isPrivate ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="p-2 rounded-full bg-red-50 text-red-400 disabled:opacity-50"
                title="Delete dish"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {dish.notes && (
          <p className="text-gray-600 text-sm leading-relaxed">{dish.notes}</p>
        )}

        {dish.recipeLink && (
          <a
            href={dish.recipeLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-orange-500 font-medium"
          >
            <ExternalLink className="h-4 w-4" /> View recipe
          </a>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 py-1">
          <button onClick={handleLike} className="flex items-center gap-1.5">
            <Heart className={`h-6 w-6 ${liked ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
            {likesCount > 0 && <span className="text-sm text-gray-600">{likesCount}</span>}
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5">
            <Bookmark className={`h-6 w-6 ${saved ? "fill-orange-500 text-orange-500" : "text-gray-400"}`} />
          </button>

          {/* Try this dish */}
          {!alreadyLogged && !isOwner && (
            <button
              onClick={() => tryFileRef.current?.click()}
              disabled={tryLoading}
              className="ml-auto flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-4 py-2"
            >
              <Camera className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-semibold text-orange-600">
                {tryLoading ? "Adding…" : "I've tried this"}
              </span>
            </button>
          )}

          {/* Add another photo (owner or already tried) */}
          {alreadyLogged && (
            <button
              onClick={() => tryFileRef.current?.click()}
              disabled={tryLoading}
              className="ml-auto flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-4 py-2"
            >
              <Plus className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-600">
                {tryLoading ? "Adding…" : "Add photo"}
              </span>
            </button>
          )}

          <input
            ref={tryFileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleTry}
          />
        </div>

        {/* Privacy badge */}
        {dish.isPrivate && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Lock className="h-3 w-3" /> Private — only visible to you
          </div>
        )}

        <div className="h-px bg-gray-100" />

        {/* Comments */}
        <div id="comments" ref={commentsRef} className="space-y-3 pb-4">
          <h2 className="font-bold text-base">Comments {comments.length > 0 && `(${comments.length})`}</h2>

          {comments.length === 0 && (
            <p className="text-sm text-gray-400">No comments yet. Be the first!</p>
          )}

          {comments.map((comment) => {
            const commentUser = commentUsers[comment.userId];
            return (
              <div key={comment.id} className="flex gap-2.5">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={commentUser?.photoURL} />
                  <AvatarFallback className="text-[10px]">{commentUser?.displayName?.[0] ?? "?"}</AvatarFallback>
                </Avatar>
                <div className="bg-gray-50 rounded-2xl rounded-tl-none px-3 py-2 flex-1">
                  <span className="text-xs font-semibold text-gray-700">{commentUser?.displayName ?? "User"} </span>
                  <span className="text-sm text-gray-700">{comment.text}</span>
                </div>
              </div>
            );
          })}

          {/* Comment input */}
          <form onSubmit={handleComment} className="flex gap-2 items-end pt-1">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={user?.photoURL ?? ""} />
              <AvatarFallback className="text-[10px]">{user?.displayName?.[0] ?? "?"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 flex gap-2 bg-gray-100 rounded-2xl px-3 py-2 items-center">
              <input
                type="text"
                placeholder="Add a comment…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
              />
              <button
                type="submit"
                disabled={submitting || !commentText.trim()}
                className="text-orange-500 disabled:opacity-30"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
