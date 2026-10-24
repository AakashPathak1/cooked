import { tryDishSchema } from "@/lib/schemas";
import { tryDish } from "@/lib/server/domain/participation";
import { api, limits, PHOTO_BODY_BYTES } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = api(
  { schema: tryDishSchema, maxBytes: PHOTO_BODY_BYTES, limit: limits.heavy },
  ({ viewer, params, body }) => tryDish(viewer, params.id, body)
);
