import { createDishSchema } from "@/lib/schemas";
import { createDish } from "@/lib/server/domain/dishes";
import { api, limits, PHOTO_BODY_BYTES } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = api(
  { schema: createDishSchema, maxBytes: PHOTO_BODY_BYTES, limit: limits.heavy },
  ({ viewer, body }) => createDish(viewer, body)
);
