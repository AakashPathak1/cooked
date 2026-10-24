import { quickRatingSchema } from "@/lib/schemas";
import { rerank } from "@/lib/server/domain/participation";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = api({ schema: quickRatingSchema, limit: limits.write }, ({ viewer, params, body }) =>
  rerank(viewer.uid, params.id, body.quickRating)
);
