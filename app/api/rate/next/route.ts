import { suggestPair } from "@/lib/server/domain/ratings";
import { api } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = api({}, async ({ req, viewer }) => {
  const q = new URL(req.url).searchParams;
  const exclude = (q.get("exclude") ?? "").split(",").filter(Boolean).slice(0, 50);
  const focus = q.get("focus") || undefined;
  return { next: await suggestPair(viewer.uid, { focusId: focus, exclude }) };
});
