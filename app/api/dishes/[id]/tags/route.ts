import { tagsSchema } from "@/lib/schemas";
import { setTags } from "@/lib/server/domain/participation";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const PUT = api({ schema: tagsSchema, limit: limits.write }, ({ viewer, params, body }) =>
  setTags(viewer, params.id, body.userIds)
);
