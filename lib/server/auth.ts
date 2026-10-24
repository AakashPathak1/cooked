import "server-only";

import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { demoEnabled } from "./config";
import { unauthorized } from "./errors";
import { ensureUserCached, type Viewer } from "./domain/users";

/**
 * Demo sign-in exists only for local development and automated checks. It is
 * impossible to enable in a production build.
 */
export const isDemoMode = demoEnabled;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    ...(isDemoMode()
      ? [
          CredentialsProvider({
            id: "demo",
            name: "Demo",
            credentials: { uid: { label: "uid", type: "text" } },
            async authorize(credentials) {
              const uid = String(credentials?.uid ?? "");
              if (!/^[a-z0-9_-]{1,40}$/.test(uid)) return null;
              const names: Record<string, string> = {
                ann: "Ann Park",
                bob: "Bob Reyes",
                cy: "Cy Okafor",
                dee: "Dee Lindqvist",
              };
              return { id: uid, name: names[uid] ?? uid, email: `${uid}@demo.local` };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id && !token.sub) token.sub = user.id;
      if (user) token.signedInAt = Date.now();
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) (session.user as { id?: string }).id = token.sub;
      (session as { signedInAt?: number }).signedInAt =
        (token.signedInAt as number | undefined) ?? (token.iat ? Number(token.iat) * 1000 : 0);
      return session;
    },
  },
  pages: { signIn: "/signin", error: "/signin" },
};

/** The signed-in viewer, or null. Also makes sure their profile exists. */
export async function getViewer(): Promise<Viewer | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string | null; email?: string | null; image?: string | null } | undefined;
  if (!user?.id) return null;
  const viewer: Viewer = {
    uid: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
    signedInAt: (session as { signedInAt?: number }).signedInAt,
  };
  await ensureUserCached(viewer);
  return viewer;
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw unauthorized();
  return viewer;
}
