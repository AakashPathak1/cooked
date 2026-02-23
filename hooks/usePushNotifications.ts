"use client";

import { useEffect, useRef } from "react";
import { savePushSubscription } from "@/lib/firestore";

export function usePushNotifications(uid: string | null) {
  const registered = useRef(false);

  useEffect(() => {
    if (!uid || registered.current) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    registered.current = true;

    async function setup() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        // Check existing permission
        if (Notification.permission === "denied") return;

        // Request permission if not granted
        if (Notification.permission !== "granted") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") return;
        }

        // Subscribe to push
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!pubKey) return;
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(pubKey),
          });
        }

        // Save to Firestore
        await savePushSubscription(uid!, sub);
      } catch (err) {
        console.error("Push setup failed:", err);
      }
    }

    setup();
  }, [uid]);
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}
