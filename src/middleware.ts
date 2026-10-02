export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    // Public: NextAuth, the MCP endpoint + OAuth server (own bearer auth),
    // the Apple Health ingest webhook (own token), well-known metadata,
    // the service worker and static assets.
    "/((?!api/auth|api/mcp|api/oauth|api/ingest|\\.well-known|_next/static|_next/image|favicon.ico|sw.js|swe-worker-.*|workbox-.*|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
