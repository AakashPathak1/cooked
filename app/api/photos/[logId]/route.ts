import type { NextRequest } from "next/server";
import { getPhotoBytes } from "@/lib/server/domain/photos";
import { api, imageResponse } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = api({}, async ({ req, viewer, params }) => {
  const size = new URL(req.url).searchParams.get("s") === "thumb" ? "thumb" : "full";
  return imageResponse(req as NextRequest, await getPhotoBytes(viewer.uid, params.logId, size));
});
