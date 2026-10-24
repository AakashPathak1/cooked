import { acceptTagSchema } from "@/lib/schemas";
import { acceptTag } from "@/lib/server/domain/participation";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = api({ schema: acceptTagSchema, limit: limits.write }, ({ viewer, params, body }) =>
  acceptTag(viewer, params.id, body.quickRating)
);
