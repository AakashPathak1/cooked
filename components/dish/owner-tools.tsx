"use client";

import { MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { TagPicker } from "@/components/tag-picker";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { errorMessage, request } from "@/lib/client/api";
import { LIMITS } from "@/lib/schemas";
import type { DishDetail } from "@/lib/types";

export function OwnerTools({ dish, onChanged }: { dish: DishDetail; onChanged: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<"edit" | "tags" | "delete" | null>(null);

  const [name, setName] = useState(dish.name);
  const [notes, setNotes] = useState(dish.notes);
  const [link, setLink] = useState(dish.recipeLink);
  const [priv, setPriv] = useState(dish.isPrivate);
  const [tags, setTags] = useState(() => dish.participants.filter((p) => p.role !== "creator").map((p) => p.user.uid));
  const [busy, setBusy] = useState(false);

  const refreshLists = () => void mutate((key) => typeof key === "string" && key.startsWith("/api/"), undefined, { revalidate: true });
  const open = (m: "edit" | "tags" | "delete") => {
    setName(dish.name);
    setNotes(dish.notes);
    setLink(dish.recipeLink);
    setPriv(dish.isPrivate);
    setTags(dish.participants.filter((p) => p.role !== "creator").map((p) => p.user.uid));
    setMenu(false);
    setMode(m);
  };

  async function save(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast({ message: done });
      setMode(null);
      onChanged();
      refreshLists();
    } catch (err) {
      toast({ message: errorMessage(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const removedCount = dish.participants.filter((p) => p.role !== "creator" && !tags.includes(p.user.uid)).length;

  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Manage dish" onClick={() => setMenu(true)}>
        <MoreHorizontal className="h-5 w-5" />
      </Button>

      <Sheet open={menu} onOpenChange={setMenu} title="Manage dish" hideTitle>
        <ul className="-mx-2 space-y-0.5">
          {[
            { m: "edit" as const, label: "Edit details", Icon: Pencil },
            { m: "tags" as const, label: "Change tagged friends", Icon: Users },
            { m: "delete" as const, label: "Delete dish", Icon: Trash2, danger: true },
          ].map(({ m, label, Icon, danger }) => (
            <li key={m}>
              <button
                onClick={() => open(m)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium hover:bg-sunk ${danger ? "text-danger" : ""}`}
              >
                <Icon className="h-5 w-5" aria-hidden /> {label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={mode === "edit"} onOpenChange={(o) => !o && setMode(null)} title="Edit details">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void save(
              () => request(`/api/dishes/${dish.id}`, { method: "PATCH", body: { name: name.trim(), notes: notes.trim(), recipeLink: link.trim(), isPrivate: priv } }),
              "Changes saved"
            );
          }}
        >
          <Field label="Name">{(p) => <Input {...p} value={name} maxLength={LIMITS.name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Notes">{(p) => <Textarea {...p} value={notes} maxLength={LIMITS.notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          <Field label="Recipe link">{(p) => <Input {...p} type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />}</Field>
          <label className="flex items-center gap-3 text-[15px]">
            <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} className="h-5 w-5 accent-[hsl(var(--brand))]" />
            Private (only you and tagged friends)
          </label>
          <Button type="submit" className="w-full" loading={busy} disabled={!name.trim()}>
            Save changes
          </Button>
        </form>
      </Sheet>

      <Sheet open={mode === "tags"} onOpenChange={(o) => !o && setMode(null)} title="Tagged friends">
        <TagPicker value={tags} onChange={setTags} disabled={busy} />
        {removedCount > 0 && (
          <p role="status" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            Untagging deletes {removedCount === 1 ? "that person's" : "their"} rating and photos for this dish.
          </p>
        )}
        <Button className="mt-4 w-full" loading={busy} onClick={() => save(() => request(`/api/dishes/${dish.id}/tags`, { method: "PUT", body: { userIds: tags } }), "Tags updated")}>
          Save
        </Button>
      </Sheet>

      <ConfirmSheet
        open={mode === "delete"}
        onOpenChange={(o) => !o && setMode(null)}
        title="Delete this dish?"
        body="Its photos, comments and everyone's ratings are removed for good."
        confirmLabel="Delete dish"
        danger
        onConfirm={async () => {
          try {
            await request(`/api/dishes/${dish.id}`, { method: "DELETE" });
            refreshLists();
            toast({ message: "Dish deleted" });
            router.replace("/");
          } catch (err) {
            toast({ message: errorMessage(err), tone: "error" });
          }
        }}
      />
    </>
  );
}
