import type { ApiErrorBody } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Options {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/** JSON request helper. Throws `ApiError` with a message fit to show people. */
export async function request<T>(path: string, { method = "GET", body, signal }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "network", "You appear to be offline. Check your connection and try again.");
  }
  if (!res.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error page */
    }
    throw new ApiError(
      res.status,
      parsed?.error.code ?? "error",
      parsed?.error.message ?? "Something went wrong. Please try again."
    );
  }
  return (await res.json()) as T;
}

export const fetcher = <T,>(path: string) => request<T>(path);

export const errorMessage = (err: unknown): string =>
  err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
