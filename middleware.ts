import { withAuth } from "next-auth/middleware";

/**
 * Pages require a session; the sign-in page, auth endpoints, API routes
 * (which authenticate themselves and answer with JSON) and static assets
 * are excluded.
 */
export default withAuth({ pages: { signIn: "/signin" } });

export const config = {
  matcher: [
    "/((?!signin|privacy|terms|api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|offline.html).*)",
  ],
};
