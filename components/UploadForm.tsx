"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getAllUsers, createDish, getPersonalDishes, UserDoc, DishDoc } from "@/lib/firestore";
import { compressImageToBase64 } from "@/lib/storage";
import { Camera, ImageIcon, X, Lock, Globe } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PairwiseComparison } from "@/components/PairwiseComparison";
import { QUICK_RATING_OPTIONS, QUICK_RATINGS, QuickRating } from "@/lib/elo";

type Stage = "form" | "ranking";

export function UploadForm() {
  const { user } = useAuth();
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("form");
  const [createdDishId, setCreatedDishId] = useState<string | null>(null);
  const [rankingDishes, setRankingDishes] = useState<DishDoc[]>([]);

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [recipeLink, setRecipeLink] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [allUsers, setAllUsers] = useState<UserDoc[]>([]);
  const [tagged, setTagged] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [quickRating, setQuickRating] = useState<QuickRating | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAllUsers().then((users) =>
      setAllUsers(users.filter((u) => u.uid !== user?.uid))
    );
  }, [user]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function toggleTag(uid: string) {
    setTagged((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !file || !name.trim() || !quickRating) return;
    setLoading(true);
    try {
      const photoURL = await compressImageToBase64(file);
      const dishId = await createDish({
        creatorId: user.uid,
        name: name.trim(),
        photoURL,
        notes: notes.trim(),
        recipeLink: recipeLink.trim(),
        taggedUserIds: tagged,
        isPrivate,
        initialElo: QUICK_RATINGS[quickRating],
      });
      setCreatedDishId(dishId);

      // Notify tagged users (type: "tag")
      if (tagged.length > 0) {
        const { createNotification } = await import("@/lib/firestore");
        await Promise.all(tagged.map((uid) =>
          createNotification({
            toUid: uid,
            fromUid: user.uid,
            fromDisplayName: user.displayName ?? "Someone",
            fromPhotoURL: user.photoURL ?? "",
            type: "tag",
            dishId,
            dishName: name.trim(),
          })
        ));
      }

      // Go to ranking if they have ≥2 personal dishes
      const dishes = await getPersonalDishes(user.uid);
      if (dishes.length >= 2) {
        setRankingDishes(dishes);
        setStage("ranking");
      } else {
        router.push(`/dish/${dishId}`);
      }
    } catch (err) {
      console.error(err);
      alert("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleRankingComplete() {
    if (createdDishId) router.push(`/dish/${createdDishId}`);
  }

  if (stage === "ranking") {
    return (
      <div className="pb-8">
        <div className="mb-5">
          <h2 className="text-lg font-bold">How does it rank?</h2>
          <p className="text-sm text-gray-400 mt-0.5">Compare your new dish against ones you&apos;ve had before</p>
        </div>
        <PairwiseComparison
          dishes={rankingDishes}
          highlightDishId={createdDishId ?? undefined}
          onComplete={handleRankingComplete}
          completeLabel="View dish"
        />
      </div>
    );
  }

  const canSubmit = !!file && name.trim().length > 0 && !!quickRating && !loading;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-8">
      {/* Photo picker */}
      {preview ? (
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100">
          <img src={preview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
          <button
            type="button"
            className="absolute top-3 right-3 bg-black/50 rounded-full p-1.5"
            onClick={() => { setPreview(null); setFile(null); }}
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 active:bg-gray-50 transition-colors"
          >
            <Camera className="h-8 w-8" />
            <span className="text-sm font-medium">Take photo</span>
          </button>
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 active:bg-gray-50 transition-colors"
          >
            <ImageIcon className="h-8 w-8" />
            <span className="text-sm font-medium">Choose from library</span>
          </button>
          {/* Camera input — forces camera on mobile */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
          {/* Library input — opens photo picker on mobile */}
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      )}

      {/* Dish name */}
      <input
        type="text"
        placeholder="Dish name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-base placeholder-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />

      {/* Notes */}
      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-base placeholder-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none"
      />

      {/* Recipe link */}
      <input
        type="url"
        placeholder="Recipe link (optional)"
        value={recipeLink}
        onChange={(e) => setRecipeLink(e.target.value)}
        className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-base placeholder-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />

      {/* Quick rating — required before posting */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2.5 px-1">How was it? *</p>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_RATING_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setQuickRating(opt.key)}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border-2 transition-all text-left ${
                quickRating === opt.key
                  ? "border-orange-500 bg-orange-50 text-orange-700"
                  : "border-gray-200 bg-white text-gray-600 active:bg-gray-50"
              }`}
            >
              <span className="text-xl">{opt.emoji}</span>
              <span className="text-sm font-medium leading-tight">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Privacy toggle */}
      <button
        type="button"
        onClick={() => setIsPrivate((p) => !p)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-colors ${
          isPrivate
            ? "bg-gray-50 border-gray-300 text-gray-700"
            : "bg-white border-gray-200 text-gray-600"
        }`}
      >
        <div className="flex items-center gap-2">
          {isPrivate ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
          <span className="text-sm font-medium">
            {isPrivate ? "Private — only you can see this" : "Public — visible to everyone"}
          </span>
        </div>
        <div className={`w-10 h-6 rounded-full transition-colors relative ${isPrivate ? "bg-gray-400" : "bg-orange-500"}`}>
          <div className={`absolute top-1 h-4 w-4 bg-white rounded-full shadow transition-transform ${isPrivate ? "translate-x-1" : "translate-x-5"}`} />
        </div>
      </button>

      {/* Tag friends */}
      {allUsers.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2 px-1">Tag friends</p>
          <div className="flex flex-wrap gap-2">
            {allUsers.map((u) => (
              <button
                key={u.uid}
                type="button"
                onClick={() => toggleTag(u.uid)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
                  tagged.includes(u.uid)
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-white text-gray-700 border-gray-200"
                }`}
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={u.photoURL} />
                  <AvatarFallback className="text-[10px]">{(u.displayName || u.handle)[0]}</AvatarFallback>
                </Avatar>
                {u.displayName || u.handle}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-4 bg-orange-500 text-white font-semibold rounded-2xl text-base shadow-lg shadow-orange-200 disabled:opacity-40 disabled:shadow-none transition-all active:scale-95"
      >
        {loading ? "Posting…" : "Post dish"}
      </button>
    </form>
  );
}
