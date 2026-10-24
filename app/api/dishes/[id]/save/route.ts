import { z } from "zod";
import { setSaved } from "@/lib/server/domain/social";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const PUT = api(
  { schema: z.object({ saved: z.boolean() }), limit: limits.write },
  async ({ viewer, params, body }) => {
    await setSaved(viewer.uid, params.id, body.saved);
    return { saved: body.saved };
  }
);
