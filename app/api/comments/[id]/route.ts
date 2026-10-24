import { deleteComment } from "@/lib/server/domain/social";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const DELETE = api({ limit: limits.write }, async ({ viewer, params }) => {
  await deleteComment(viewer.uid, params.id);
});
