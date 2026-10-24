import { api } from "@/lib/server/http";
import { getFeed } from "@/lib/server/domain/dishes";

export const dynamic = "force-dynamic";

export const GET = api({}, ({ req, viewer }) =>
  getFeed(viewer.uid, new URL(req.url).searchParams.get("cursor"))
);
