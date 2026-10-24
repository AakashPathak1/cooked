import { rateSchema } from "@/lib/schemas";
import { recordDuel } from "@/lib/server/domain/ratings";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = api({ schema: rateSchema, limit: limits.rate }, ({ viewer, body }) =>
  recordDuel(viewer.uid, body)
);
