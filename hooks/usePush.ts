"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, request } from "@/lib/client/api";

export type PushState = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

const urlBase64ToUint8Array = (b64: string) => {
  const padded = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Web-push opt-in for this device. */
export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    try {
      const status = await request<{ configured: boolean }>("/api/push");
      if (!status.configured) return setState("unconfigured");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { publicKey } = await request<{ publicKey: string | null }>("/api/push");
      if (!publicKey) throw new Error("Notifications aren't set up on the server.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      await request("/api/push", { method: "POST", body: sub.toJSON() });
      setState("on");
    } catch (err) {
      setError(err instanceof Error && !("status" in err) ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await request("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable };
}
