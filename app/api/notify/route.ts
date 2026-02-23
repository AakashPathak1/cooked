import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { sendPushNotification } from "@/lib/webpush";
import type webpush from "web-push";

export async function POST(req: NextRequest) {
  try {
    const { toUid, title, body, url } = await req.json();
    if (!toUid) return NextResponse.json({ ok: false, error: "Missing toUid" }, { status: 400 });

    // Fetch the user's push subscription
    const subSnap = await getDoc(doc(db, "pushSubscriptions", toUid));
    if (!subSnap.exists()) {
      return NextResponse.json({ ok: false, error: "No subscription" });
    }

    const subscription = subSnap.data().subscription as webpush.PushSubscription;
    const result = await sendPushNotification(subscription, { title, body, url });

    if (result === "expired") {
      // Remove stale subscription
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "pushSubscriptions", toUid));
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("Notify error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
