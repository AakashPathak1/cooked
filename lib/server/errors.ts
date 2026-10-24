/** An error that maps directly onto an HTTP response. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message = "Invalid request") => new HttpError(400, "bad_request", message);
export const unauthorized = (message = "Please sign in") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You can't do that") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
export const conflict = (message = "That conflicts with the current state") =>
  new HttpError(409, "conflict", message);
export const tooLarge = (message = "That upload is too large") => new HttpError(413, "too_large", message);
export const tooMany = (message = "Slow down a little") => new HttpError(429, "rate_limited", message);
