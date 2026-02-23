"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Heart, MessageCircle } from "lucide-react";
import {
  toggleLike, isLiked,
  getUserByUid, getDish, createNotification, DishDoc,
} from "@/lib/firestore";
import { useAuth } from "@/hooks/useAuth";
import { eloToRating, scoreColor } from "@/lib/eloDisplay";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface DishCardProps {
  dish: DishDoc;
}

export function DishCard({ dish }: DishCardProps) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(dish.likesCount ?? 0);
  const [creatorName, setCreatorName] = useState("");
  const [creatorHandle, setCreatorHandle] = useState("");
  const [creatorPhoto, setCreatorPhoto] = useState("");
  const [imgLoaded, setImgLoaded] = useState(false);

  const score = dish.globalScore ?? 1200;
  const rating = eloToRating(score);

  useEffect(() => {
    if (!user) return;
    isLiked(user.uid, dish.id).then(setLiked);
    getUserByUid(dish.creatorId).then((u) => {
      if (u) {
        setCreatorName(u.displayName || u.handle);
        setCreatorHandle(u.handle);
        setCreatorPhoto(u.photoURL);
      }
    });
  }, [user, dish.id, dish.creatorId]);

  async function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    if (!user) return;
    const nowLiked = await toggleLike(user.uid, dish.id);
    setLiked(nowLiked);
    setLikesCount((c) => (nowLiked ? c + 1 : c - 1));

    // Send notification to dish owner if liking
    if (nowLiked && dish.creatorId !== user.uid) {
      const [dishDoc, fromUser] = await Promise.all([
        getDish(dish.id),
        getUserByUid(user.uid),
      ]);
      await createNotification({
        toUid: dish.creatorId,
        fromUid: user.uid,
        fromDisplayName: fromUser?.displayName ?? "Someone",
        fromPhotoURL: fromUser?.photoURL ?? "",
        type: "like",
        dishId: dish.id,
        dishName: dishDoc?.name ?? dish.name,
      });
      // Fire push notification (fire-and-forget)
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUid: dish.creatorId,
          title: "🍳 Cooked",
          body: `${fromUser?.displayName ?? "Someone"} liked your dish "${dishDoc?.name ?? dish.name}"`,
          url: `/dish/${dish.id}`,
        }),
      }).catch(() => {});
    }
  }

  return (
    <div className="bg-white mb-3 rounded-3xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.07)] border border-gray-100/80 transition-all duration-150 active:scale-[0.97] active:shadow-sm">
      {/* Photo */}
      <Link href={`/dish/${dish.id}`}>
        <div className="relative aspect-square bg-gray-100">
          {dish.coverPhotoURL ? (
            <img
              src={dish.coverPhotoURL}
              alt={dish.name}
              className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImgLoaded(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl">🍽️</div>
          )}

          {/* Score badge — smooth green→yellow→orange→red gradient */}
          <div
            className="absolute top-3 right-3 w-11 h-11 rounded-full shadow-lg flex items-center justify-center"
            style={{ backgroundColor: scoreColor(score) }}
          >
            <span className="text-white text-sm font-bold">{rating}</span>
          </div>
        </div>
      </Link>

      {/* Info row */}
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2.5">
          <Link href={`/profile/${creatorHandle}`}>
            <Avatar className="h-8 w-8 shrink-0 ring-2 ring-white">
              <AvatarImage src={creatorPhoto} />
              <AvatarFallback className="text-xs bg-orange-100 text-orange-600">{creatorName[0]}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/dish/${dish.id}`}>
              <p className="font-semibold text-[15px] leading-tight truncate">{dish.name}</p>
            </Link>
            <Link href={`/profile/${creatorHandle}`}>
              <p className="text-xs text-gray-400 truncate">{creatorName}</p>
            </Link>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 mt-2.5">
          <button onClick={handleLike} className="flex items-center gap-1.5 group">
            <Heart className={`h-5 w-5 transition-all duration-150 ${liked ? "fill-red-500 text-red-500 scale-110" : "text-gray-400 group-active:scale-125"}`} />
            {likesCount > 0 && <span className="text-xs text-gray-500 font-medium">{likesCount}</span>}
          </button>
          <Link href={`/dish/${dish.id}#comments`} className="group">
            <MessageCircle className="h-5 w-5 text-gray-400 group-active:text-orange-400 transition-colors" />
          </Link>
        </div>
      </div>
    </div>
  );
}
