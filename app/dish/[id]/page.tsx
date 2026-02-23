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
  isLiked,
  getLikers,
  getUserByUid,
  createNotification,
  DishDoc,
  DishLogDoc,
  CommentDoc,
  UserDoc,
} from "@/lib/firestore";
import { compressImageToBase64 } from "@/lib/storage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Heart, ExternalLink, Send, ChevronLeft,
  Camera, Trash2, Lock, Globe, Plus, X,
} from "lucide-react";
import { eloToRating } from "@/lib/eloDisplay";
import { PairwiseComparison } from "@/components/PairwiseComparison";

export default function DishPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const tryFileRef = useRef<HTMLInputElement>(null);

  const [dish, setDish] = useState<DishDoc | null>(null);
  const [creator, setCreator] = useState<UserDoc | null>(null);
  const [taggedUsers, setTaggedUsers] = useState<UserDoc[]>([]);
  const [logs, setLogs] = useState<DishLogDoc[]>([]);
  const [logUsers, setLogUsers] = useState<Record<string, UserDoc>>({});
  const [comments, setComments] = useState<CommentDoc[]>([]);
  const [commentUsers, setCommentUsers] = useState<Record<string, UserDoc>>({});
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [likers, setLikers] = useState<UserDoc[]>([]);
  const [showLikersModal, setShowLikersModal] = useState(false);
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

      const [creatorData, likedData, commentsData, logsData] = await Promise.all([
        getUserByUid(d.creatorId),
        isLiked(user.uid, d.id),
        getComments(d.id),
        getDishLogs(d.id),
      ]);

      setCreator(creatorData);
      setLiked(likedData);
      setComments(commentsData);
      setLogs(logsData);

      // Fetch tagged users
      const tagged = await Promise.all(d.taggedUserIds.map((uid: string) => getUserByUid(uid)));
      setTaggedUsers(tagged.filter(Boolean) as UserDoc[]);

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
    if (nowLiked && dish.creatorId !== user.uid) {
      const fromUser = await getUserByUid(user.uid);
      await createNotification({
        toUid: dish.creatorId,
        fromUid: user.uid,
        fromDisplayName: fromUser?.displayName ?? "Someone",
        fromPhotoURL: fromUser?.photoURL ?? "",
        type: "like",
        dishId: dish.id,
        dishName: dish.name,
      });
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUid: dish.creatorId,
          title: "🍳 Cooked",
          body: `${fromUser?.displayName ?? "Someone"} liked "${dish.name}"`,
          url: `/dish/${dish.id}`,
        }),
      }).catch(() => {});
    }
  }

  async function handleOpenLikers() {
    if (!dish) return;
    const users = await getLikers(dish.id);
    setLikers(users);
    setShowLikersModal(true);
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !dish || !commentText.trim()) return;
    setSubmitting(true);
    const text = commentText.trim();
    await addComment(dish.id, user.uid, text);
    setCommentText("");
    const updated = await getComments(dish.id);
    setComments(updated);
    setSubmitting(false);
    setTimeout(() => commentsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    if (dish.creatorId !== user.uid) {
      const fromUser = await getUserByUid(user.uid);
      await createNotification({
        toUid: dish.creatorId,
        fromUid: user.uid,
        fromDisplayName: fromUser?.displayName ?? "Someone",
        fromPhotoURL: fromUser?.photoURL ?? "",
        type: "comment",
        dishId: dish.id,
        dishName: dish.name,
      });
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUid: dish.creatorId,
          title: "🍳 Cooked",
          body: `${fromUser?.displayName ?? "Someone"} commented on "${dish.name}"`,
          url: `/dish/${dish.id}`,
        }),
      }).catch(() => {});
    }
  }

  async function handleTry(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !user || !dish) return;
    setTryLoading(true);
    try {
      const photoURL = await compressImageToBase64(f);
      await createDishLog(dish.id, user.uid, photoURL);
      const [updatedLogs, personal] = await Promise.all([
        getDishLogs(dish.id),
        getPersonalDishes(user.uid),
      ]);
      setLogs(updatedLogs);
      const u = await getUserByUid(user.uid);
      if (u) setLogUsers((m) => ({ ...m, [user.uid]: u }));
      setDish((d) => d ? { ...d, coverPhotoURL: photoURL } : d);
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

  const score = dish.globalScore ?? 1200;
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
    <>
      {/* Likers modal */}
      {showLikersModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => setShowLikersModal(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-3">
              <h2 className="font-bold text-lg">
                {likesCount} like{likesCount !== 1 ? "s" : ""}
              </h2>
              <button onClick={() => setShowLikersModal(false)} className="p-1">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="px-5 pb-10 max-h-[60vh] overflow-y-auto">
              {likers.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">No likes yet</p>
              ) : (
                <div className="space-y-4">
                  {likers.map((u) => (
                    <Link key={u.uid} href={`/profile/${u.handle}`} onClick={() => setShowLikersModal(false)}>
                      <div className="flex items-center gap-3 active:opacity-70 transition-opacity">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={u.photoURL} />
                          <AvatarFallback className="bg-orange-100 text-orange-600 font-semibold">{u.displayName?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm">{u.displayName}</p>
                          <p className="text-xs text-gray-400">@{u.handle}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

          {/* Score badge */}
          <div className="absolute top-12 right-4 bg-orange-500 rounded-full h-12 w-12 flex items-center justify-center shadow-lg shadow-orange-200">
            <span className="text-white text-sm font-bold">{eloToRating(score)}</span>
          </div>

          {logs.length > 1 && (
            <div className="absolute bottom-3 right-3 bg-black/40 backdrop-blur-sm rounded-full px-2 py-1">
              <span className="text-white text-xs font-medium">{logs.length} photos</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-4 pt-4 space-y-4">
          {/* Title + owner controls */}
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-bold leading-tight flex-1">{dish.name}</h1>
            {isOwner && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handlePrivacyToggle}
                  className="p-2 rounded-full bg-gray-100 text-gray-500 active:bg-gray-200 transition-colors"
                  title={dish.isPrivate ? "Make public" : "Make private"}
                >
                  {dish.isPrivate ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="p-2 rounded-full bg-red-50 text-red-400 disabled:opacity-50 active:bg-red-100 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Owner + Tagged people */}
          <div className="space-y-2">
            {creator && (
              <div className="flex items-center gap-2">
                <Link href={`/profile/${creator.handle}`} className="flex items-center gap-2 group">
                  <Avatar className="h-8 w-8 ring-2 ring-white">
                    <AvatarImage src={creator.photoURL} />
                    <AvatarFallback className="bg-orange-100 text-orange-600 text-xs">{creator.displayName?.[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold group-hover:underline">{creator.displayName}</p>
                    <p className="text-[10px] text-gray-400">Creator</p>
                  </div>
                </Link>
              </div>
            )}
            {taggedUsers.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 shrink-0">Tagged:</span>
                {taggedUsers.map((u) => (
                  <Link key={u.uid} href={`/profile/${u.handle}`}>
                    <div className="flex items-center gap-1.5 bg-gray-100 rounded-full px-2.5 py-1 active:bg-gray-200 transition-colors">
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={u.photoURL} />
                        <AvatarFallback className="text-[8px]">{u.displayName?.[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">{u.displayName}</span>
                    </div>
                  </Link>
                ))}
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

          {/* Actions row */}
          <div className="flex items-center gap-4 py-1">
            {/* Like + count (count is tappable for modal) */}
            <button onClick={handleLike} className="flex items-center gap-1.5 group">
              <Heart className={`h-6 w-6 transition-all duration-150 ${liked ? "fill-red-500 text-red-500 scale-110" : "text-gray-400"}`} />
            </button>
            {likesCount > 0 ? (
              <button onClick={handleOpenLikers} className="text-sm font-semibold text-gray-700 -ml-2 hover:underline">
                {likesCount} like{likesCount !== 1 ? "s" : ""}
              </button>
            ) : null}

            {/* Try this dish */}
            {!alreadyLogged && !isOwner && (
              <button
                onClick={() => tryFileRef.current?.click()}
                disabled={tryLoading}
                className="ml-auto flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-4 py-2 active:bg-orange-100 transition-colors"
              >
                <Camera className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-semibold text-orange-600">
                  {tryLoading ? "Adding…" : "I've tried this"}
                </span>
              </button>
            )}

            {/* Add another photo */}
            {alreadyLogged && (
              <button
                onClick={() => tryFileRef.current?.click()}
                disabled={tryLoading}
                className="ml-auto flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 active:bg-gray-100 transition-colors"
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

          {dish.isPrivate && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Lock className="h-3 w-3" /> Private — only visible to you
            </div>
          )}

          <div className="h-px bg-gray-100" />

          {/* Comments */}
          <div id="comments" ref={commentsRef} className="space-y-3 pb-4">
            <h2 className="font-bold text-base">
              {comments.length > 0 ? `${comments.length} comment${comments.length !== 1 ? "s" : ""}` : "Comments"}
            </h2>

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
                  className="text-orange-500 disabled:opacity-30 active:scale-90 transition-transform"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
