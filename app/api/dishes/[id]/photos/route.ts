import { addPhotoSchema } from "@/lib/schemas";
import { addPhoto } from "@/lib/server/domain/participation";
import { api, limits, PHOTO_BODY_BYTES } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = api(
  { schema: addPhotoSchema, maxBytes: PHOTO_BODY_BYTES, limit: limits.heavy },
  ({ viewer, params, body }) => addPhoto(viewer, params.id, body)
);
