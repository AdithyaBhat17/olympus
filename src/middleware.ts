export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    // Public: NextAuth, the MCP endpoint, the iOS app API + OAuth server (own bearer auth),
    // the Apple Health ingest webhook (own token), well-known metadata,
    // the public /docs guide and /embed (the app's form viewer, no user data), the service worker and static assets.
    "/((?!api/auth|api/mcp|api/v1|api/oauth|api/ingest|docs$|embed/|\\.well-known|_next/static|_next/image|favicon.ico|sw.js|swe-worker-.*|workbox-.*|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
