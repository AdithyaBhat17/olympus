import { cache } from "react";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedUser } from "@/lib/allowlist";

const nextAuth = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Lock sign-in to ALLOWED_EMAILS when it's set.
    signIn({ user, profile }) {
      if (profile && profile.email_verified === false) return false;
      return isAllowedUser(user.email);
    },
    authorized({ auth: session, request: { nextUrl } }) {
      // Re-checked on every request so dropping someone from ALLOWED_EMAILS
      // locks out sessions they already hold.
      const isLoggedIn = !!session?.user && isAllowedUser(session.user.email);
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      const isAuthRoute = nextUrl.pathname.startsWith("/api/auth");

      if (isAuthRoute) return true;

      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/today", nextUrl));
        return true;
      }

      return isLoggedIn;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;
/**
 * The session, decoded once per request: layout, page and every server helper
 * share it instead of re-reading the JWT. `auth` also serves as the middleware.
 */
export const auth = nextAuth.auth;
export const getSession = cache(() => nextAuth.auth());

export async function requireUserEmail(): Promise<string> {
  const session = await getSession();
  if (!session?.user?.email || !isAllowedUser(session.user.email)) {
    throw new Error("Unauthorized");
  }
  return session.user.email;
}
