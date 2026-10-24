import "server-only";

/**
 * Environment handling for server code. Nothing here ever returns secret
 * values to callers other than the Firebase credential loader.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

type Env = Record<string, string | undefined>;

function parseJsonLoose(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const text = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Firebase Admin credentials, from either:
 *  - FIREBASE_SERVICE_ACCOUNT_KEY: the downloaded JSON (raw or base64), or
 *  - FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (+ FIREBASE_PROJECT_ID).
 */
export function loadServiceAccount(env: Env = process.env): ServiceAccount | null {
  const blob = env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (blob) {
    let json: Record<string, unknown>;
    try {
      json = parseJsonLoose(blob);
    } catch {
      throw new ConfigError(
        "FIREBASE_SERVICE_ACCOUNT_KEY is set but is neither valid JSON nor base64-encoded JSON."
      );
    }
    const projectId = String(json.project_id ?? json.projectId ?? "");
    const clientEmail = String(json.client_email ?? json.clientEmail ?? "");
    const privateKey = String(json.private_key ?? json.privateKey ?? "");
    if (!projectId || !clientEmail || !privateKey) {
      throw new ConfigError(
        "FIREBASE_SERVICE_ACCOUNT_KEY is missing project_id, client_email or private_key."
      );
    }
    return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
  }

  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY;
  const projectId = env.FIREBASE_PROJECT_ID ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (clientEmail && privateKey && projectId) {
    return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
  }
  return null;
}

export interface ConfigStatus {
  database: boolean;
  auth: boolean;
  push: boolean;
  /** Names of required variables that are missing, for the setup hint. */
  missing: string[];
}

/** Which integrations are configured. Safe to expose: booleans and names only. */
export function getConfigStatus(env: Env = process.env): ConfigStatus {
  const missing: string[] = [];
  let database = false;
  try {
    database = loadServiceAccount(env) !== null || Boolean(env.FIRESTORE_EMULATOR_HOST);
  } catch {
    database = false;
  }
  if (!database) missing.push("FIREBASE_SERVICE_ACCOUNT_KEY");

  const authVars = ["NEXTAUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
  const authMissing = authVars.filter((name) => !env[name]);
  missing.push(...authMissing);

  return {
    database,
    auth: authMissing.length === 0,
    push: Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
    missing,
  };
}

/**
 * Demo mode: an in-memory, pre-seeded store and passwordless sign-in for
 * local development and automated checks. It can never be on in production.
 */
export const demoEnabled = (env: Env = process.env) =>
  env.COOKED_E2E === "1" && env.NODE_ENV !== "production";
