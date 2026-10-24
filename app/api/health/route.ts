import { api } from "@/lib/server/http";
import { getConfigStatus } from "@/lib/server/config";

export const dynamic = "force-dynamic";

/** Liveness plus which settings are present (never their values). */
export const GET = api({ public: true }, async () => ({ ok: true, config: getConfigStatus() }));
