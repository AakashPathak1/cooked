import { leaveDish } from "@/lib/server/domain/participation";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = api({ limit: limits.write }, async ({ viewer, params }) => {
  await leaveDish(viewer.uid, params.id);
});
