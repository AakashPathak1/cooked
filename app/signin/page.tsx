"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ScoreStamp } from "@/components/ui/score-stamp";

const ERRORS: Record<string, string> = {
  OAuthSignin: "We couldn't reach Google. Try again in a moment.",
  OAuthCallback: "Google sent back an error. Try signing in again.",
  OAuthAccountNotLinked: "That email is already tied to a different sign-in method.",
  Callback: "Sign-in didn't finish. Check that this site's address is listed as a redirect URI in Google Cloud.",
  AccessDenied: "Access was denied. Try again with a different Google account.",
  Configuration: "Sign-in isn't set up on the server yet.",
};

const DEMO = process.env.NEXT_PUBLIC_COOKED_E2E === "1";

// A small rack of scores, to show what the app is about.
const SAMPLE = [1400, 1345, 1285, 1220, 1150, 1085];

function SignIn() {
  const { status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const code = params.get("error");
  const error = code ? (ERRORS[code] ?? "Something went wrong signing in. Try again.") : null;
  const callbackUrl = params.get("callbackUrl") ?? "/";

  useEffect(() => {
    if (status === "authenticated") router.replace(callbackUrl.startsWith("/") ? callbackUrl : "/");
  }, [status, router, callbackUrl]);

  return (
    <div className="mx-auto grid min-h-dvh max-w-5xl items-center gap-12 px-6 py-12 md:grid-cols-[1.1fr_1fr] md:gap-16">
      <div>
        <Wordmark />
        <h1 className="mt-10 max-w-[14ch] font-display text-[44px] font-extrabold leading-[1.02] tracking-tightest md:text-6xl">
          Which dish of yours is actually the best?
        </h1>
        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-mute">
          Photograph what you cook, then put dishes head to head until the order is honest. See how friends score the same meal.
        </p>

        <div className="mt-8 max-w-xs space-y-3">
          <Button
            size="lg"
            className="w-full"
            loading={busy}
            onClick={() => {
              setBusy(true);
              void signIn("google", { callbackUrl });
            }}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1zM12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23zM5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.83zM12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            Continue with Google
          </Button>
          {error && (
            <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          {DEMO && (
            <div className="flex gap-2 pt-2" data-testid="demo-signin">
              {["ann", "bob", "cy"].map((uid) => (
                <Button key={uid} variant="outline" size="sm" onClick={() => signIn("demo", { uid, callbackUrl })}>
                  Demo: {uid}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div aria-hidden className="grid grid-cols-3 gap-4 md:gap-6">
        {SAMPLE.map((elo, i) => (
          <div
            key={elo}
            className="flex aspect-square items-center justify-center rounded-3xl bg-sunk"
            style={{ transform: `translateY(${i % 3 === 1 ? 14 : i % 3 === 2 ? -6 : 0}px)` }}
          >
            <ScoreStamp elo={elo} size="lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
