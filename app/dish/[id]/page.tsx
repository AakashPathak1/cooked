"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  getDish,
  getDishLogs,
  deleteDishLog,
  deleteDish,
  updateDish,
  updateDishPrivacy,
  updateDishTags,
  updateCreatorPhoto,
  acceptTag,
  getPersonalDishes,
  getAllUsers,
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
  Trash2, Lock, Globe, X, Pencil, Check, Search,
  PenLine, RotateCcw, ImageIcon,
} from "lucide-react";
import { eloToRating, scoreColor } from "@/lib/eloDisplay";
import { QUICK_RATING_OPTIONS, QUICK_RATINGS, QuickRating } from "@/lib/elo";
import { PairwiseComparison } from "@/components/PairwiseComparison";

export default function DishPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();

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
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [rankingDishes, setRankingDishes] = useState<DishDoc[]>([]);
  const [showRanking, setShowRanking] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const photoScrollRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);

  // Tag editor state
  const [editingTags, setEditingTags] = useState(false);
  const [allUsers, setAllUsers] = useState<UserDoc[]>([]);
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  // Accept tag state
  const [isTagPending, setIsTagPending] = useState(false);
  const [showQuickRate, setShowQuickRate] = useState(false);
  const [selectedQuickRate, setSelectedQuickRate] = useState<QuickRating | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Edit dish state (owner only)
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editRecipeLink, setEditRecipeLink] = useState("");
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const editFileRef = useRef<HTMLInputElement>(null);

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
      const resolvedTagged = tagged.filter(Boolean) as UserDoc[];
      setTaggedUsers(resolvedTagged);

      // Check if current user is tagged but hasn't accepted yet
      if (d.taggedUserIds.includes(user.uid) && d.creatorId !== user.uid) {
        const { getDoc, doc } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        const udSnap = await getDoc(doc(db, "userDishes", `${user.uid}_${d.id}`));
        setIsTagPending(!udSnap.exists());
      }

      // Fetch log users
      const allUids = Array.from(new Set([
        ...commentsData.map((c) => c.userId),
        ...logsData.map((l) => l.userId),
      ]));
      const userMap: Record<string, UserDoc> = {};
      await Promise.all(allUids.map(async (uid) => {
        const u = await getUserByUid(uid);
        if (u) userMap[uid] = u;
      }));
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
    const { users, total } = await getLikers(dish.id);
    setLikers(users);
    setLikesCount(total);
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
    // Ensure new commenter is in commentUsers
    const u = await getUserByUid(user.uid);
    if (u) setCommentUsers((m) => ({ ...m, [user.uid]: u }));
  }

  async function handleDeleteLog(logId: string) {
    if (!user || !dish) return;
    if (!confirm("Remove this photo?")) return;
    try {
      await deleteDishLog(logId, dish.id, user.uid);
      const updatedLogs = await getDishLogs(dish.id);
      const newCover = updatedLogs[updatedLogs.length - 1]?.photoURL ?? "";
      setLogs(updatedLogs);
      setDish((d) => d ? { ...d, coverPhotoURL: newCover } : d);
    } catch (err) {
      console.error(err);
      alert("Failed to remove photo.");
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

  // ── Accept tag ──────────────────────────────────────────────────────────────
  async function handleAcceptTag() {
    if (!user || !dish || !selectedQuickRate) return;
    setAccepting(true);
    setShowQuickRate(false);
    try {
      const initialElo = QUICK_RATINGS[selectedQuickRate];
      await acceptTag(user.uid, dish.id, initialElo);
      setIsTagPending(false);
      // Notify dish owner
      const fromUser = await getUserByUid(user.uid);
      await createNotification({
        toUid: dish.creatorId,
        fromUid: user.uid,
        fromDisplayName: fromUser?.displayName ?? "Someone",
        fromPhotoURL: fromUser?.photoURL ?? "",
        type: "accepted",
        dishId: dish.id,
        dishName: dish.name,
      });
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUid: dish.creatorId,
          title: "🍳 Cooked",
          body: `${fromUser?.displayName ?? "Someone"} accepted your tag on "${dish.name}"`,
          url: `/dish/${dish.id}`,
        }),
      }).catch(() => {});
      // Trigger pairwise ranking if they have ≥2 personal dishes
      const personal = await getPersonalDishes(user.uid);
      if (personal.length >= 2) {
        setRankingDishes(personal);
        setShowRanking(true);
      }
    } finally {
      setAccepting(false);
      setSelectedQuickRate(null);
    }
  }

  // ── Tag editor ──────────────────────────────────────────────────────────────
  async function handleOpenTagEditor() {
    if (!dish) return;
    const users = await getAllUsers();
    setAllUsers(users.filter((u) => u.uid !== dish.creatorId));
    setPendingTagIds(dish.taggedUserIds ?? []);
    setTagSearch("");
    setEditingTags(true);
  }

  async function handleSaveTags() {
    if (!user || !dish) return;
    setSavingTags(true);
    try {
      const addedUids = await updateDishTags(dish.id, user.uid, pendingTagIds);
      // Notify newly tagged users
      await Promise.all(addedUids.map(async (uid) => {
        await createNotification({
          toUid: uid,
          fromUid: user.uid,
          fromDisplayName: user.displayName ?? "Someone",
          fromPhotoURL: user.photoURL ?? "",
          type: "tag",
          dishId: dish.id,
          dishName: dish.name,
        });
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toUid: uid,
            title: "🍳 Cooked",
            body: `${user.displayName ?? "Someone"} tagged you in "${dish.name}"`,
            url: `/dish/${dish.id}`,
          }),
        }).catch(() => {});
      }));
      // Update local state
      setDish((d) => d ? { ...d, taggedUserIds: pendingTagIds } : d);
      const resolved = await Promise.all(pendingTagIds.map((uid) => getUserByUid(uid)));
      setTaggedUsers(resolved.filter(Boolean) as UserDoc[]);
      setEditingTags(false);
    } finally {
      setSavingTags(false);
    }
  }

  // ── Edit dish ────────────────────────────────────────────────────────────────
  function handleOpenEdit() {
    if (!dish) return;
    // Pre-fill with current values
    setEditName(dish.name);
    setEditNotes(dish.notes ?? "");
    setEditRecipeLink(dish.recipeLink ?? "");
    // Pre-fill photo with creator's current log
    const creatorLog = logs.find((l) => l.userId === dish.creatorId);
    setEditPhotoPreview(creatorLog?.photoURL ?? dish.coverPhotoURL ?? null);
    setEditPhotoFile(null);
    setEditSheetOpen(true);
  }

  function handleEditFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setEditPhotoFile(f);
    setEditPhotoPreview(URL.createObjectURL(f));
  }

  async function handleSaveEdit() {
    if (!user || !dish || !editName.trim()) return;
    setSavingEdit(true);
    try {
      // Update text fields
      await updateDish(dish.id, user.uid, {
        name: editName.trim(),
        notes: editNotes.trim(),
        recipeLink: editRecipeLink.trim(),
      });
      // Update photo if changed
      if (editPhotoFile) {
        const photoURL = await compressImageToBase64(editPhotoFile);
        await updateCreatorPhoto(dish.id, user.uid, photoURL);
        // Refresh logs from server
        const updatedLogs = await getDishLogs(dish.id);
        setLogs(updatedLogs);
        setDish((d) => d ? { ...d, name: editName.trim(), notes: editNotes.trim(), recipeLink: editRecipeLink.trim(), coverPhotoURL: photoURL } : d);
      } else {
        setDish((d) => d ? { ...d, name: editName.trim(), notes: editNotes.trim(), recipeLink: editRecipeLink.trim() } : d);
      }
      setEditSheetOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to save. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  // ── Re-rank ──────────────────────────────────────────────────────────────────
  async function handleRerank() {
    if (!user || !dish) return;
    const personal = await getPersonalDishes(user.uid);
    if (personal.length >= 2) {
      setRankingDishes(personal);
      setShowRanking(true);
    }
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
  // Can re-rank if they have an ELO entry: owner always does; tagged users do after accepting
  const isAcceptedTagged = !isTagPending && (dish.taggedUserIds ?? []).includes(user?.uid ?? "");
  const canRerank = isOwner || isAcceptedTagged;

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
      {/* ── Edit dish sheet ───────────────────────────────────────────────── */}
      {editSheetOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center backdrop-enter"
          onClick={() => setEditSheetOpen(false)}
        >
          <div
            className="bg-white rounded-t-3xl w-full max-w-lg overflow-y-auto sheet-enter"
            style={{ maxHeight: "92vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 pt-2 pb-4">
              <h2 className="font-bold text-lg">Edit dish</h2>
              <button onClick={() => setEditSheetOpen(false)} className="p-1 -mr-1">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="px-4 pb-10 space-y-4">
              {/* Photo */}
              <div
                className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 cursor-pointer group"
                onClick={() => editFileRef.current?.click()}
              >
                {editPhotoPreview ? (
                  <img src={editPhotoPreview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-400">
                    <ImageIcon className="h-10 w-10" />
                    <span className="text-sm font-medium">Add photo</span>
                  </div>
                )}
                {/* Overlay hint */}
                <div className="absolute inset-0 bg-black/0 group-active:bg-black/15 transition-colors flex items-center justify-center">
                  <div className="bg-black/40 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2 opacity-0 group-active:opacity-100 transition-opacity">
                    <ImageIcon className="h-4 w-4 text-white" />
                    <span className="text-white text-sm font-medium">Change photo</span>
                  </div>
                </div>
                <div className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-sm rounded-full p-2.5 shadow">
                  <ImageIcon className="h-4 w-4 text-white" />
                </div>
                <input
                  ref={editFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleEditFile}
                />
              </div>

              {/* Dish name */}
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Dish name *"
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-base placeholder-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />

              {/* Notes */}
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={4}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-base placeholder-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none"
              />

              {/* Recipe link */}
              <input
                type="url"
                value={editRecipeLink}
                onChange={(e) => setEditRecipeLink(e.target.value)}
                placeholder="Recipe link (optional)"
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-base placeholder-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />

              {/* Save */}
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editName.trim()}
                className="w-full py-4 bg-orange-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-orange-200/50 disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition-all"
              >
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Likers modal */}
      {showLikersModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6 backdrop-enter"
          onClick={() => setShowLikersModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-xl modal-enter"
            style={{ maxHeight: "70vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
              <h2 className="font-bold text-base">
                {likesCount} like{likesCount !== 1 ? "s" : ""}
              </h2>
              <button onClick={() => setShowLikersModal(false)} className="p-1 -mr-1">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0">
              {likers.length === 0 ? (
                <p className="text-center text-gray-400 py-10 text-sm">No likes yet</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {likers.map((u) => (
                    <Link key={u.uid} href={`/profile/${u.handle}`} onClick={() => setShowLikersModal(false)}>
                      <div className="flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 transition-colors">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={u.photoURL} />
                          <AvatarFallback className="bg-orange-100 text-orange-600 font-semibold">{u.displayName?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm leading-tight">{u.displayName}</p>
                          <p className="text-xs text-gray-400 mt-0.5">@{u.handle}</p>
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

      {/* Quick rate modal — shown when tagged user taps Accept */}
      {showQuickRate && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center backdrop-enter"
          onClick={() => setShowQuickRate(false)}
        >
          <div
            className="bg-white rounded-t-3xl w-full max-w-sm pb-10 sheet-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-1">
              <div>
                <h2 className="font-bold text-base">How was this dish?</h2>
                <p className="text-xs text-gray-400 mt-0.5">Your rating anchors your starting score</p>
              </div>
              <button onClick={() => setShowQuickRate(false)} className="p-1 -mr-1">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4">
              {QUICK_RATING_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSelectedQuickRate(opt.key)}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border-2 transition-all text-left ${
                    selectedQuickRate === opt.key
                      ? "border-orange-500 bg-orange-50 text-orange-700"
                      : "border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="text-sm font-medium leading-tight">{opt.label}</span>
                </button>
              ))}
            </div>
            <div className="px-4">
              <button
                onClick={handleAcceptTag}
                disabled={!selectedQuickRate || accepting}
                className="w-full py-3.5 bg-orange-500 text-white font-semibold rounded-2xl text-sm disabled:opacity-40 active:scale-95 transition-all"
              >
                {accepting ? "Adding to profile…" : "Accept & add to profile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tag editor modal */}
      {editingTags && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6 backdrop-enter"
          onClick={() => { setEditingTags(false); setTagSearch(""); }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-xl modal-enter"
            style={{ maxHeight: "75vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <div>
                <h2 className="font-bold text-base">Tag people</h2>
                {pendingTagIds.length > 0 && (
                  <p className="text-xs text-orange-500 mt-0.5">{pendingTagIds.length} selected</p>
                )}
              </div>
              <button onClick={() => { setEditingTags(false); setTagSearch(""); }} className="p-1 -mr-1">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pb-3 shrink-0">
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search people…"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  autoFocus
                  className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
                />
                {tagSearch && (
                  <button onClick={() => setTagSearch("")} className="text-gray-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* User list */}
            <div className="overflow-y-auto flex-1 min-h-0 border-t border-gray-100">
              {allUsers
                .filter((u) => {
                  const q = tagSearch.toLowerCase();
                  return !q
                    || (u.displayName || "").toLowerCase().includes(q)
                    || u.handle.toLowerCase().includes(q);
                })
                .map((u) => {
                  const selected = pendingTagIds.includes(u.uid);
                  return (
                    <button
                      key={u.uid}
                      onClick={() => setPendingTagIds((prev) =>
                        selected ? prev.filter((id) => id !== u.uid) : [...prev, u.uid]
                      )}
                      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                        selected ? "bg-orange-50" : "active:bg-gray-50"
                      }`}
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={u.photoURL} />
                        <AvatarFallback className="bg-orange-100 text-orange-600 text-sm font-semibold">
                          {(u.displayName || u.handle)[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-semibold text-sm leading-tight truncate">
                          {u.displayName || u.handle}
                        </p>
                        <p className="text-xs text-gray-400 truncate">@{u.handle}</p>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selected ? "bg-orange-500 border-orange-500" : "border-gray-300"
                      }`}>
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </button>
                  );
                })}
            </div>

            {/* Save */}
            <div className="p-4 border-t border-gray-100 shrink-0">
              <button
                onClick={handleSaveTags}
                disabled={savingTags}
                className="w-full py-3 bg-orange-500 text-white font-semibold rounded-2xl text-sm disabled:opacity-50"
              >
                {savingTags ? "Saving…" : "Save tags"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-nav">
        {/* Photo scroll */}
        <div className="relative">
          {logs.length > 0 ? (
            <div
              ref={photoScrollRef}
              className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
              onScroll={(e) => {
                const el = e.currentTarget;
                setCurrentPhotoIndex(Math.round(el.scrollLeft / el.offsetWidth));
              }}
            >
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
                        {isOwner && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteLog(log.id!); }}
                            className="ml-0.5 p-0.5 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors"
                          >
                            <Trash2 className="h-3 w-3 text-white/80" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="aspect-square bg-gray-100 flex items-center justify-center text-7xl">🍽️</div>
          )}

          <button
            onClick={() => router.back()}
            className="absolute top-12 left-4 bg-black/40 backdrop-blur-sm rounded-full p-2"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>

          <div
            className="absolute top-12 right-4 rounded-full h-12 w-12 flex items-center justify-center shadow-lg"
            style={{ backgroundColor: scoreColor(score) }}
          >
            <span className="text-white text-sm font-bold">{eloToRating(score)}</span>
          </div>

          {logs.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {logs.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    photoScrollRef.current?.scrollTo({ left: i * photoScrollRef.current!.offsetWidth, behavior: "smooth" });
                    setCurrentPhotoIndex(i);
                  }}
                  className={`rounded-full transition-all duration-200 ${i === currentPhotoIndex ? "w-4 h-2 bg-white" : "w-2 h-2 bg-white/50"}`}
                />
              ))}
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
                  onClick={handleOpenEdit}
                  className="p-2 rounded-full bg-gray-100 text-gray-500 active:bg-gray-200 transition-colors"
                  title="Edit dish"
                >
                  <PenLine className="h-4 w-4" />
                </button>
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

          {/* Creator */}
          {creator && (
            <Link href={`/profile/${creator.handle}`} className="flex items-center gap-2 group w-fit">
              <Avatar className="h-8 w-8 ring-2 ring-white">
                <AvatarImage src={creator.photoURL} />
                <AvatarFallback className="bg-orange-100 text-orange-600 text-xs">{creator.displayName?.[0]}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold group-hover:underline">{creator.displayName}</p>
                <p className="text-[10px] text-gray-400">Creator</p>
              </div>
            </Link>
          )}

          {/* Tagged people + edit button */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Tagged</span>
              {isOwner && (
                <button
                  onClick={handleOpenTagEditor}
                  className="p-1 rounded-full bg-gray-100 active:bg-gray-200 transition-colors"
                >
                  <Pencil className="h-3 w-3 text-gray-400" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {taggedUsers.length === 0 && (
                <span className="text-xs text-gray-300 italic">No one tagged</span>
              )}
              {taggedUsers.map((u) => {
                // Check if this user has accepted (has a userDishes record)
                const hasAccepted = !(u.uid === user?.uid && isTagPending);
                return (
                  <Link key={u.uid} href={`/profile/${u.handle}`}>
                    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 active:opacity-70 transition-opacity ${hasAccepted ? "bg-gray-100" : "bg-orange-50 border border-orange-200"}`}>
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={u.photoURL} />
                        <AvatarFallback className="text-[8px]">{u.displayName?.[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">{u.displayName}</span>
                      {!hasAccepted && <span className="text-[9px] text-orange-400 font-medium">pending</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Accept tag banner */}
          {isTagPending && !isOwner && (
            <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-orange-700">You've been tagged!</p>
                <p className="text-xs text-orange-400 mt-0.5">Rate it to add this dish to your profile</p>
              </div>
              <button
                onClick={() => setShowQuickRate(true)}
                disabled={accepting}
                className="flex items-center gap-1.5 bg-orange-500 text-white text-sm font-semibold rounded-full px-4 py-2 active:scale-95 transition-transform disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {accepting ? "Adding…" : "Rate & accept"}
              </button>
            </div>
          )}

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
            <button onClick={handleLike} className="flex items-center gap-1.5 group">
              <Heart className={`h-6 w-6 transition-all duration-150 ${liked ? "fill-red-500 text-red-500 scale-110" : "text-gray-400"}`} />
            </button>
            {likesCount > 0 ? (
              <button onClick={handleOpenLikers} className="text-sm font-semibold text-gray-700 -ml-2 hover:underline">
                {likesCount} like{likesCount !== 1 ? "s" : ""}
              </button>
            ) : null}
            {canRerank && (
              <button
                onClick={handleRerank}
                className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 font-medium active:text-orange-500 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Re-rank
              </button>
            )}
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
