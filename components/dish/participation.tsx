"use client";

import { ImagePlus, LogOut, Swords } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { PhotoPicker } from "@/components/photo-picker";
import { RatingPicker } from "@/components/rating-picker";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/ui/confirm";
import { Field, Textarea } from "@/components/ui/field";
import { ScoreStamp } from "@/components/ui/score-stamp";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { errorMessage, request } from "@/lib/client/api";
import type { ProcessedImage } from "@/lib/client/image";
import type { QuickRating } from "@/lib/elo";
import { LIMITS } from "@/lib/schemas";
import type { DishDetail } from "@/lib/types";

/** Everything the viewer can do with their own relationship to this dish. */
export function ParticipationPanel({ dish, onChanged }: { dish: DishDetail; onChanged: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const v = dish.viewer;

  const [rating, setRating] = useState<QuickRating | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"try" | "rerate" | "photo" | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [image, setImage] = useState<ProcessedImage | null>(null);
  const [notes, setNotes] = useState("");

  const refreshLists = () => void mutate((key) => typeof key === "string" && key.startsWith("/api/"), undefined, { revalidate: true });

  async function run(fn: () => Promise<unknown>, done: string, after?: () => void) {
    setBusy(true);
    try {
      await fn();
      toast({ message: done });
      after?.();
      onChanged();
      refreshLists();
    } catch (err) {
      toast({ message: errorMessage(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setSheet(null);
    setImage(null);
    setNotes("");
    setRating(null);
  };

  if (v.isOwner || v.role) {
    return (
      <section aria-label="Your ranking" className="rounded-2xl bg-sunk p-4">
        <div className="flex items-center gap-4">
          {v.personalElo !== null && <ScoreStamp elo={v.personalElo} size="md" label="Your score" />}
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold leading-tight">Your score</p>
            <p className="text-sm text-mute">
              {v.personalRank
                ? `#${v.personalRank.position} of ${v.personalRank.total} in your dishes`
                : "Not ranked yet"}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/rank?focus=${dish.id}`}>
              <Swords className="h-4 w-4" aria-hidden /> Compare it
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSheet("rerate")}>
            Re-rate
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSheet("photo")}>
            <ImagePlus className="h-4 w-4" aria-hidden /> Add photo
          </Button>
          {!v.isOwner && (
            <Button variant="ghost" size="sm" onClick={() => setLeaving(true)}>
              <LogOut className="h-4 w-4" aria-hidden /> Remove from mine
            </Button>
          )}
        </div>

        <Sheet open={sheet === "rerate"} onOpenChange={(o) => !o && close()} title="Re-rate this dish" description="This resets your score for it. Then compare it again to fine-tune.">
          <RatingPicker value={rating} onChange={setRating} />
          <Button
            className="mt-4 w-full"
            disabled={!rating}
            loading={busy}
            onClick={() => run(() => request(`/api/dishes/${dish.id}/rerank`, { method: "POST", body: { quickRating: rating } }), "Score updated", close)}
          >
            Save rating
          </Button>
        </Sheet>

        <Sheet open={sheet === "photo"} onOpenChange={(o) => !o && close()} title="Add a photo">
          <PhotoPicker value={image} onChange={setImage} />
          <Field label="Caption" hint="Optional">
            {(p) => <Textarea {...p} value={notes} maxLength={LIMITS.notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[64px]" />}
          </Field>
          <Button
            className="mt-4 w-full"
            disabled={!image}
            loading={busy}
            onClick={() =>
              run(
                () => request(`/api/dishes/${dish.id}/photos`, { method: "POST", body: { ...image, notes: notes.trim() } }),
                "Photo added",
                close
              )
            }
          >
            Add photo
          </Button>
        </Sheet>

        <ConfirmSheet
          open={leaving}
          onOpenChange={setLeaving}
          title="Remove from your dishes?"
          body="Your score and photos for this dish are deleted. The dish stays for everyone else."
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            try {
              await request(`/api/dishes/${dish.id}/leave`, { method: "POST" });
              refreshLists();
              toast({ message: "Removed from your dishes" });
              router.push("/");
            } catch (err) {
              toast({ message: errorMessage(err), tone: "error" });
            }
          }}
        />
      </section>
    );
  }

  if (v.pendingTag) {
    return (
      <section aria-label="You were tagged" className="rounded-2xl bg-brand-soft p-4">
        <h2 className="font-display text-lg font-bold">
          {dish.creator.displayName} tagged you
        </h2>
        <p className="mb-3 mt-0.5 text-sm text-mute">How did it turn out for you? Your rating joins the group score.</p>
        <RatingPicker value={rating} onChange={setRating} />
        <div className="mt-4 flex gap-2">
          <Button
            disabled={!rating}
            loading={busy}
            onClick={() => run(() => request(`/api/dishes/${dish.id}/accept`, { method: "POST", body: { quickRating: rating } }), "Added to your dishes")}
          >
            Add to my dishes
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => run(() => request(`/api/dishes/${dish.id}/leave`, { method: "POST" }), "Tag declined", () => router.push("/"))}
          >
            Not this time
          </Button>
        </div>
      </section>
    );
  }

  if (v.canTry) {
    return (
      <section aria-label="Try this dish">
        <Button variant="outline" className="w-full" size="lg" onClick={() => setSheet("try")}>
          I made this too
        </Button>
        <Sheet open={sheet === "try"} onOpenChange={(o) => !o && close()} title="Add your version" description="Share your photo and rate it. It joins the group score.">
          <div className="space-y-4">
            <PhotoPicker value={image} onChange={setImage} />
            <RatingPicker value={rating} onChange={setRating} />
            <Field label="Notes" hint="Optional">
              {(p) => <Textarea {...p} value={notes} maxLength={LIMITS.notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[64px]" />}
            </Field>
            <Button
              className="w-full"
              disabled={!image || !rating}
              loading={busy}
              onClick={() =>
                run(
                  () => request(`/api/dishes/${dish.id}/try`, { method: "POST", body: { ...image, notes: notes.trim(), quickRating: rating } }),
                  "Added to your dishes",
                  close
                )
              }
            >
              Add to my dishes
            </Button>
          </div>
        </Sheet>
      </section>
    );
  }
  return null;
}
