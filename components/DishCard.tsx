"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Bookmark } from "lucide-react";
import { toggleLike, toggleSave, isLiked, isSaved, getUserByUid, DishDoc } from "@/lib/firestore";
import { useAuth } from "@/hooks/useAuth";
import { eloToRating, eloTier } from "@/lib/eloDisplay";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface DishCardProps {
  dish: DishDoc;
}

export function DishCard({ dish }: DishCardProps) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(dish.likesCount ?? 0);
  const [creatorName, setCreatorName] = useState("");
  const [creatorPhoto, setCreatorPhoto] = useState("");

  const score = dish.personalElo ?? dish.globalScore ?? 1200;
  const tier = eloTier(score);
  const rating = eloToRating(score);

  useEffect(() => {
    if (!user) return;
    isLiked(user.uid, dish.id).then(setLiked);
    isSaved(user.uid, dish.id).then(setSaved);
    getUserByUid(dish.creatorId).then((u) => {
      if (u) { setCreatorName(u.displayName || u.handle); setCreatorPhoto(u.photoURL); }
    });
  }, [user, dish.id, dish.creatorId]);

  async function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    if (!user) return;
    const nowLiked = await toggleLike(user.uid, dish.id);
    setLiked(nowLiked);
    setLikesCount((c) => (nowLiked ? c + 1 : c - 1));
  }

  async function handleSave(e: React.MouseEvent) {
    e.preventDefault();
    if (!user) return;
    setSaved(await toggleSave(user.uid, dish.id));
  }

  return (
    <div className="bg-white mb-3 rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      {/* Photo */}
      <Link href={`/dish/${dish.id}`}>
        <div className="relative aspect-square bg-gray-100">
          {dish.coverPhotoURL ? (
            <img src={dish.coverPhotoURL} alt={dish.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl">🍽️</div>
          )}
          {/* Rating badge */}
          <div className={`absolute top-3 right-3 ${tier.color} rounded-full h-10 w-10 flex flex-col items-center justify-center shadow`}>
            <span className="text-white text-[10px] font-bold leading-none">{tier.label}</span>
            <span className="text-white text-[9px] leading-none opacity-80">{rating}</span>
          </div>
        </div>
      </Link>

      {/* Info row */}
      <div className="px-3 pt-2.5 pb-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={creatorPhoto} />
              <AvatarFallback className="text-xs">{creatorName[0]}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <Link href={`/dish/${dish.id}`}>
                <p className="font-semibold text-sm leading-tight truncate">{dish.name}</p>
              </Link>
              <p className="text-xs text-gray-400 truncate">{creatorName}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-2 pb-1">
          <button onClick={handleLike} className="flex items-center gap-1">
            <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
            <span className="text-xs text-gray-500">{likesCount > 0 ? likesCount : ""}</span>
          </button>
          <Link href={`/dish/${dish.id}#comments`}>
            <MessageCircle className="h-5 w-5 text-gray-400" />
          </Link>
          <button onClick={handleSave} className="ml-auto">
            <Bookmark className={`h-5 w-5 ${saved ? "fill-orange-500 text-orange-500" : "text-gray-400"}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
