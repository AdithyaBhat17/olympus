import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth: session, request: { nextUrl } }) {
      const isLoggedIn = !!session?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      const isAuthRoute = nextUrl.pathname.startsWith("/api/auth");

      if (isAuthRoute) return true;

      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/log", nextUrl));
        return true;
      }

      return isLoggedIn;
    },
  },
});

export async function requireUserEmail(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Unauthorized");
  return session.user.email;
}
