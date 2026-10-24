import { api } from "@/lib/server/http";
import { getLeaderboard } from "@/lib/server/domain/dishes";

export const dynamic = "force-dynamic";

export const GET = api({}, ({ req, viewer }) =>
  getLeaderboard(viewer.uid, new URL(req.url).searchParams.get("cursor"))
);
