import { removePhoto } from "@/lib/server/domain/participation";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const DELETE = api({ limit: limits.write }, async ({ viewer, params }) => {
  await removePhoto(viewer.uid, params.id, params.logId);
});
