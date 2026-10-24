"use client";

import { Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { errorMessage, request } from "@/lib/client/api";
import { LIMITS } from "@/lib/schemas";
import { timeAgo } from "@/lib/format";
import type { CommentDTO } from "@/lib/types";

export function Comments({
  dishId,
  comments,
  truncated,
  viewerUid,
  isOwner,
  onChanged,
}: {
  dishId: string;
  comments: CommentDTO[];
  truncated: boolean;
  viewerUid: string | undefined;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await request(`/api/dishes/${dishId}/comments`, { method: "POST", body: { text: value } });
      setText("");
      onChanged();
    } catch (err) {
      toast({ message: errorMessage(err), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    try {
      await request(`/api/comments/${id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      toast({ message: errorMessage(err), tone: "error" });
    }
  }

  return (
    <section aria-labelledby="comments-h">
      <h2 id="comments-h" className="mb-3 font-display text-xl font-bold">
        Comments{comments.length > 0 && <span className="ml-2 text-base font-medium text-mute">{comments.length}</span>}
      </h2>
      {truncated && <p className="mb-3 text-sm text-mute">Showing the latest {comments.length} comments.</p>}
      {comments.length === 0 ? (
        <p className="mb-4 text-[15px] text-mute">No comments yet. Say what you&apos;d change or what you want to steal.</p>
      ) : (
        <ul className="mb-4 space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.user?.displayName ?? "?"} src={c.user?.photoURL} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {c.user?.handle ? (
                    <Link href={`/profile/${c.user.handle}`} className="font-semibold hover:underline">
                      {c.user.displayName}
                    </Link>
                  ) : (
                    <span className="font-semibold">{c.user?.displayName ?? "Deleted user"}</span>
                  )}
                  {c.createdAt && <span className="ml-2 text-mute">{timeAgo(c.createdAt)}</span>}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{c.text}</p>
              </div>
              {(c.user?.uid === viewerUid || isOwner) && (
                <button
                  onClick={() => remove(c.id)}
                  aria-label="Delete comment"
                  className="h-8 w-8 shrink-0 self-start rounded-full text-mute hover:bg-sunk hover:text-danger"
                >
                  <Trash2 className="mx-auto h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={send} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.comment}
          placeholder="Add a comment"
          aria-label="Add a comment"
          autoComplete="off"
        />
        <Button type="submit" size="icon" disabled={!text.trim()} loading={sending} aria-label="Post comment">
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </form>
    </section>
  );
}
