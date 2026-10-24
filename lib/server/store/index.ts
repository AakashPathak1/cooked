import "server-only";

import { demoEnabled } from "../config";
import { AdminStore } from "./admin";
import type { Store } from "./types";

/**
 * The process-wide store. It lives on `globalThis` because Next.js dev mode
 * can evaluate this module more than once (route handlers and server
 * components get separate bundles), and tests / demo mode swap it out.
 */
const globalKey = "__cookedStore" as const;
type GlobalWithStore = typeof globalThis & { [globalKey]?: Store };

export function getStore(): Store {
  const g = globalThis as GlobalWithStore;
  if (!g[globalKey]) {
    if (demoEnabled()) {
      // Loaded lazily so production bundles never touch the demo fixtures.
      g[globalKey] = (require("../demo") as typeof import("../demo")).createDemoStore();
    } else {
      g[globalKey] = new AdminStore();
    }
  }
  return g[globalKey]!;
}

/** Replace the store (tests, local demo). Pass `null` to reset to Firestore. */
export function setStore(store: Store | null): void {
  const g = globalThis as GlobalWithStore;
  if (store) g[globalKey] = store;
  else delete g[globalKey];
}

export * from "./types";
