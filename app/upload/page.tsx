"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { PhotoPicker } from "@/components/photo-picker";
import { RatingPicker } from "@/components/rating-picker";
import { Shell, PageTitle } from "@/components/nav";
import { TagPicker } from "@/components/tag-picker";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { errorMessage, request } from "@/lib/client/api";
import type { ProcessedImage } from "@/lib/client/image";
import type { QuickRating } from "@/lib/elo";
import { LIMITS } from "@/lib/schemas";
import { cn } from "@/lib/cn";

export default function UploadPage() {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();

  const [image, setImage] = useState<ProcessedImage | null>(null);
  const [name, setName] = useState("");
  const [rating, setRating] = useState<QuickRating | null>(null);
  const [notes, setNotes] = useState("");
  const [recipeLink, setRecipeLink] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [isPrivate, setPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!image) e.photo = "Add a photo of the dish.";
    if (!name.trim()) e.name = "Give your dish a name.";
    if (!rating) e.rating = "Pick how it turned out.";
    if (recipeLink.trim() && !/^https?:\/\//i.test(recipeLink.trim())) {
      e.recipeLink = "Start the link with http:// or https://";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting || !validate() || !image || !rating) return;
    setSubmitting(true);
    try {
      const { id } = await request<{ id: string }>("/api/dishes", {
        method: "POST",
        body: {
          name: name.trim(),
          notes: notes.trim(),
          recipeLink: recipeLink.trim(),
          taggedUserIds: tagged,
          isPrivate,
          quickRating: rating,
          photo: image.photo,
          thumb: image.thumb,
          color: image.color,
        },
      });
      void mutate(() => true, undefined, { revalidate: true });
      toast({ message: "Dish added" });
      router.push(`/dish/${id}`);
    } catch (err) {
      toast({ message: errorMessage(err), tone: "error" });
      setSubmitting(false);
    }
  }

  return (
    <Shell>
      <PageTitle title="Add a dish" />
      <form onSubmit={submit} noValidate className="space-y-6">
        <PhotoPicker value={image} onChange={setImage} error={errors.photo} />

        <Field label="What did you make?" error={errors.name} counter={`${name.length}/${LIMITS.name}`}>
          {(p) => (
            <Input
              {...p}
              value={name}
              maxLength={LIMITS.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Brown butter gnocchi"
              autoComplete="off"
            />
          )}
        </Field>

        <div className="space-y-2">
          <p className="text-sm font-medium">How did it turn out?</p>
          <RatingPicker value={rating} onChange={setRating} />
          {errors.rating && <p className="text-[13px] text-danger">{errors.rating}</p>}
          <p className="text-[13px] text-mute">This sets its starting score. Head-to-head rankings refine it later.</p>
        </div>

        <Field label="Notes" hint="Optional. What you changed, what to fix next time." counter={`${notes.length}/${LIMITS.notes}`}>
          {(p) => <Textarea {...p} value={notes} maxLength={LIMITS.notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>

        <Field label="Recipe link" error={errors.recipeLink}>
          {(p) => (
            <Input
              {...p}
              type="url"
              inputMode="url"
              value={recipeLink}
              onChange={(e) => setRecipeLink(e.target.value)}
              placeholder="https://"
              autoComplete="off"
            />
          )}
        </Field>

        <div className="space-y-2">
          <p className="text-sm font-medium">Cooked with someone?</p>
          <TagPicker value={tagged} onChange={setTagged} disabled={submitting} />
        </div>

        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors",
            isPrivate ? "border-brand bg-brand-soft" : "border-line bg-surface"
          )}
        >
          <Lock className="h-5 w-5 shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="block text-[15px] font-semibold">Keep it private</span>
            <span className="block text-sm text-mute">Only you and people you tag can see this dish.</span>
          </span>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setPrivate(e.target.checked)}
            className="h-5 w-5 accent-[hsl(var(--brand))]"
          />
        </label>

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? "Adding…" : "Add dish"}
        </Button>
      </form>
    </Shell>
  );
}
