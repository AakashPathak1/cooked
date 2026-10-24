import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import type { ZodType, output } from "zod";
import { firstIssue } from "@/lib/schemas";
import { requireViewer } from "./auth";
import { ConfigError } from "./config";
import type { Viewer } from "./domain/users";
import { badRequest, forbidden, HttpError, tooLarge } from "./errors";
import { rateLimit } from "./ratelimit";
import { AlreadyExistsError, NotFoundError } from "./store";

export interface RouteContext<B> {
  req: NextRequest;
  viewer: Viewer;
  params: Record<string, string>;
  body: B;
}

export interface RouteOptions<S extends ZodType | undefined> {
  /** Validates the JSON body. */
  schema?: S;
  /** Largest accepted body, in bytes. */
  maxBytes?: number;
  /** Per-user limit, e.g. 30 requests a minute under this name. */
  limit?: { name: string; max: number; windowMs: number };
  /** Skip authentication (health checks). */
  public?: boolean;
}

const MINUTE = 60_000;
export const limits = {
  write: { name: "write", max: 90, windowMs: MINUTE },
  heavy: { name: "heavy", max: 20, windowMs: 10 * MINUTE },
  comment: { name: "comment", max: 20, windowMs: MINUTE },
  rate: { name: "rate", max: 120, windowMs: MINUTE },
  search: { name: "search", max: 60, windowMs: MINUTE },
};

const NO_STORE = { "Cache-Control": "no-store" };

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: NO_STORE }
    );
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Not found" } },
      { status: 404, headers: NO_STORE }
    );
  }
  if (error instanceof AlreadyExistsError) {
    return NextResponse.json(
      { error: { code: "conflict", message: "That already exists" } },
      { status: 409, headers: NO_STORE }
    );
  }
  if (error instanceof ConfigError) {
    console.error("[config]", error.message);
    return NextResponse.json(
      { error: { code: "misconfigured", message: "The server isn't configured correctly yet." } },
      { status: 503, headers: NO_STORE }
    );
  }
  if ((error as { code?: number })?.code === 5) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Not found" } },
      { status: 404, headers: NO_STORE }
    );
  }
  console.error("[api] unhandled:", error);
  return NextResponse.json(
    { error: { code: "internal", message: "Something went wrong on our side. Please try again." } },
    { status: 500, headers: NO_STORE }
  );
}

/** Browsers send Origin on cross-site writes; refuse any that isn't us. */
function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  if (req.headers.get("sec-fetch-site") === "cross-site") throw forbidden("Cross-site request blocked");
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))?.split(",")[0].trim();
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Bad origin");
  }
  if (host && originHost !== host) throw forbidden("Cross-site request blocked");
}

async function readBody(req: NextRequest, schema: ZodType, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw tooLarge();
  const text = await req.text();
  if (text.length > maxBytes) throw tooLarge();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest("Request body must be JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw badRequest(firstIssue(parsed.error));
  return parsed.data;
}

type Body<S> = S extends ZodType ? output<S> : undefined;
type Handler<S> = (ctx: RouteContext<Body<S>>) => Promise<unknown> | unknown;

/**
 * Wrap a route handler: same-origin check, auth, rate limit, body
 * validation and uniform JSON errors. Returning a `Response` passes it
 * through untouched (used for image bytes); anything else becomes JSON.
 */
export function api<S extends ZodType | undefined = undefined>(
  options: RouteOptions<S>,
  handler: Handler<S>
) {
  return async (req: NextRequest, route: { params?: Record<string, string> } = {}) => {
    try {
      assertSameOrigin(req);
      const viewer = options.public ? ({ uid: "", name: null, email: null, image: null } as Viewer) : await requireViewer();
      if (options.limit && viewer.uid) {
        rateLimit(`${options.limit.name}:${viewer.uid}`, options.limit.max, options.limit.windowMs);
      }
      const body = (options.schema
        ? await readBody(req, options.schema, options.maxBytes ?? 32_000)
        : undefined) as Body<S>;
      const result = await handler({ req, viewer, params: route.params ?? {}, body });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: NO_STORE });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Image bytes with strong caching: URLs are versioned, so they never change. */
export function imageResponse(
  req: NextRequest,
  image: { bytes: Buffer; mime: string; etag: string }
): Response {
  const headers = {
    "Content-Type": image.mime,
    ETag: image.etag,
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (req.headers.get("if-none-match") === image.etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(new Uint8Array(image.bytes), { status: 200, headers });
}

export const PHOTO_BODY_BYTES = 900_000;
