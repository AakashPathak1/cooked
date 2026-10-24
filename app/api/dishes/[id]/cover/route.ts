import type { NextRequest } from "next/server";
import { coverSchema } from "@/lib/schemas";
import { getCoverBytes } from "@/lib/server/domain/photos";
import { setCover } from "@/lib/server/domain/participation";
import { api, imageResponse, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = api({}, async ({ req, viewer, params }) =>
  imageResponse(req as NextRequest, await getCoverBytes(viewer.uid, params.id))
);

export const PUT = api({ schema: coverSchema, limit: limits.write }, async ({ viewer, params, body }) => {
  await setCover(viewer.uid, params.id, body.logId);
});
