import { commentSchema } from "@/lib/schemas";
import { addComment, listComments } from "@/lib/server/domain/social";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = api({}, async ({ viewer, params }) => ({
  comments: await listComments(viewer.uid, params.id),
}));

export const POST = api({ schema: commentSchema, limit: limits.comment }, ({ viewer, params, body }) =>
  addComment(viewer, params.id, body.text)
);
