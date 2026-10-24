import { searchSchema } from "@/lib/schemas";
import { search } from "@/lib/server/domain/search";
import { api, limits } from "@/lib/server/http";
import { badRequest } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

export const GET = api({ limit: limits.search }, ({ req, viewer }) => {
  const parsed = searchSchema.safeParse({ q: new URL(req.url).searchParams.get("q") ?? "" });
  if (!parsed.success) throw badRequest("Search is too long");
  return search(viewer.uid, parsed.data.q);
});
