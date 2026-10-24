import { z } from "zod";
import { setLike } from "@/lib/server/domain/social";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const PUT = api(
  { schema: z.object({ liked: z.boolean() }), limit: limits.write },
  ({ viewer, params, body }) => setLike(viewer, params.id, body.liked)
);
