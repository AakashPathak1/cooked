import { markAllRead } from "@/lib/server/domain/notifications";
import { api } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = api({}, async ({ viewer }) => ({ marked: await markAllRead(viewer.uid) }));
