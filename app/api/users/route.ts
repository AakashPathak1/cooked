import { listUsers } from "@/lib/server/domain/users";
import { api } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = api({}, async ({ viewer }) => ({
  users: (await listUsers()).filter((u) => u.uid !== viewer.uid),
}));
