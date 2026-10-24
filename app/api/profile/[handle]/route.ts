import { getProfile } from "@/lib/server/domain/profile";
import { api } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = api({}, ({ viewer, params }) => getProfile(viewer.uid, params.handle));
