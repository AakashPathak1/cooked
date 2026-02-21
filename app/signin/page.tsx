"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useAuth } from "@/hooks/useAuth";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: "Could not start Google sign-in.",
  OAuthCallback: "Google returned an error during sign-in.",
  OAuthCreateAccount: "Could not create your account.",
  Callback: "Callback error — check that the redirect URI is added in Google Cloud Console.",
  OAuthAccountNotLinked: "This email is already linked to another account.",
  Default: "Something went wrong. Try again.",
};

export default function SignInPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [signingIn, setSigningIn] = useState(false);

  const errorCode = searchParams.get("error");
  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] ?? `${errorCode}: ${ERROR_MESSAGES.Default}`) : null;

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [user, loading, router]);

  async function handleSignIn() {
    setSigningIn(true);
    await signIn("google");
  }

  if (loading) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="text-7xl mb-4">🍳</div>
        <h1 className="text-4xl font-bold tracking-tight">cooked</h1>
        <p className="text-gray-500 mt-2 text-sm">rank your dishes. flex on your friends.</p>
      </div>

      {/* Sign in button */}
      <div className="w-full max-w-xs space-y-3">
        <button
          disabled={signingIn}
          onClick={handleSignIn}
          className="w-full flex items-center justify-center gap-3 bg-orange-500 active:bg-orange-600 text-white font-semibold py-4 rounded-2xl text-base shadow-lg shadow-orange-200 disabled:opacity-60 transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {signingIn ? "Opening Google…" : "Continue with Google"}
        </button>

        {errorMessage && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            {errorMessage}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-8 text-center">
        By signing in, you agree to have fun and eat well.
      </p>
    </div>
  );
}
