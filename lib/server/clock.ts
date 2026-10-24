/** Injectable clock so tests (and the demo seed) can control time. */
let override: (() => Date) | null = null;

export function now(): Date {
  return override ? override() : new Date();
}

export function setClock(fn: (() => Date) | null): void {
  override = fn;
}
