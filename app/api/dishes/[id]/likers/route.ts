import { getLikers } from "@/lib/server/domain/dishes";
import { api } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = api({}, async ({ viewer, params }) => ({
  users: await getLikers(viewer.uid, params.id),
}));
