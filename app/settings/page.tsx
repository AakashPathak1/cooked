"use client";

import { signOut } from "next-auth/react";
import { ArrowLeft, Bell, LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Shell } from "@/components/nav";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/useMe";
import { usePush } from "@/hooks/usePush";
import { errorMessage, request } from "@/lib/client/api";

const PUSH_HELP: Record<string, string> = {
  unsupported: "This browser can't receive notifications. On iPhone, add Cooked to your Home Screen first.",
  unconfigured: "Push notifications aren't turned on for this app yet.",
  denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
};

export default function SettingsPage() {
  const { me } = useMe();
  const toast = useToast();
  const push = usePush();
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function deleteAccount() {
    setBusy(true);
    try {
      await request("/api/account", { method: "DELETE", body: { confirm } });
      await signOut({ callbackUrl: "/signin" });
    } catch (err) {
      toast({ message: errorMessage(err), tone: "error" });
      setBusy(false);
    }
  }

  return (
    <Shell>
      <Link href="/me" className="-ml-2 mb-3 inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-mute hover:bg-sunk hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Profile
      </Link>
      <h1 className="mb-6 font-display text-[28px] font-extrabold tracking-tightest">Settings</h1>

      {me && (
        <section className="mb-8 flex items-center gap-3">
          <Avatar name={me.displayName} src={me.photoURL} size={48} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{me.displayName}</p>
            <p className="text-sm text-mute">@{me.handle} · signed in with Google</p>
          </div>
        </section>
      )}

      <section className="mb-8 rounded-2xl bg-sunk p-4" aria-labelledby="notif-h">
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="notif-h" className="font-display text-lg font-bold leading-tight">Push notifications</h2>
            <p className="mt-1 text-sm text-mute">
              {push.state === "on"
                ? "This device gets a notification for likes, comments and tags."
                : PUSH_HELP[push.state] ?? "Get a notification on this device when friends like, comment or tag you."}
            </p>
            {push.error && <p role="alert" className="mt-2 text-sm text-danger">{push.error}</p>}
          </div>
          {(push.state === "off" || push.state === "on") && (
            <Button size="sm" variant={push.state === "on" ? "outline" : "solid"} loading={push.busy} onClick={push.state === "on" ? push.disable : push.enable}>
              {push.state === "on" ? "Turn off" : "Turn on"}
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <Button variant="outline" className="w-full justify-start" size="lg" onClick={async () => {
            // Stop this device receiving the account's notifications after sign-out.
            if (push.state === "on") await push.disable().catch(() => {});
            await signOut({ callbackUrl: "/signin" });
          }}>
          <LogOut className="h-5 w-5" aria-hidden /> Sign out
        </Button>
        <Button variant="dangerSoft" className="w-full justify-start" size="lg" onClick={() => setDeleting(true)}>
          <Trash2 className="h-5 w-5" aria-hidden /> Delete account
        </Button>
      </section>

      <Sheet
        open={deleting}
        onOpenChange={(o) => !busy && setDeleting(o)}
        title="Delete your account?"
        description="This removes your profile, the dishes you posted (with everyone's comments and ratings on them), and your own ratings and photos on other people's dishes. It can't be undone."
      >
        <label htmlFor="confirm-handle" className="mb-1.5 block text-sm font-medium">
          Type <span className="font-bold">@{me?.handle}</span> to confirm
        </label>
        <Input id="confirm-handle" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="off" />
        <Button
          variant="danger"
          className="mt-4 w-full"
          loading={busy}
          disabled={!me || confirm.trim().replace(/^@/, "").toLowerCase() !== me.handle}
          onClick={deleteAccount}
        >
          Delete everything
        </Button>
      </Sheet>
    </Shell>
  );
}
