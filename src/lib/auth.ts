import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedUser } from "@/lib/allowlist";

export const { handlers, auth, signIn, signOut } = NextAuth({
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

export async function requireUserEmail(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email || !isAllowedUser(session.user.email)) {
    throw new Error("Unauthorized");
  }
  return session.user.email;
}
