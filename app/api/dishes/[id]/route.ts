import { updateDishSchema } from "@/lib/schemas";
import { deleteDish, getDishDetail, updateDish } from "@/lib/server/domain/dishes";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = api({}, ({ viewer, params }) => getDishDetail(viewer.uid, params.id));

export const PATCH = api({ schema: updateDishSchema, limit: limits.write }, async ({ viewer, params, body }) => {
  await updateDish(viewer.uid, params.id, body);
  return getDishDetail(viewer.uid, params.id);
});

export const DELETE = api({ limit: limits.write }, async ({ viewer, params }) => {
  await deleteDish(viewer.uid, params.id);
});
