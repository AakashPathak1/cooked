import { z } from "zod";
import { deleteAccount } from "@/lib/server/domain/account";
import { getUser } from "@/lib/server/domain/users";
import { badRequest } from "@/lib/server/errors";
import { api } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Requires the caller to type their own handle, so a stray request can't erase an account. */
export const DELETE = api(
  { schema: z.object({ confirm: z.string().min(1).max(60) }), limit: { name: "account", max: 3, windowMs: 3_600_000 } },
  async ({ viewer, body }) => {
    const me = await getUser(viewer.uid);
    if (!me || body.confirm.trim().replace(/^@/, "").toLowerCase() !== me.handle) {
      throw badRequest("Type your handle exactly to confirm");
    }
    await deleteAccount(viewer.uid);
  }
);
