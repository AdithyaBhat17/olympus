import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Cache pages as they're visited so a cold open with no signal still lands
  // on Today / the live session; the outbox handles writes.
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // Never hard-reload when signal returns mid-set — the outbox syncs instead.
  reloadOnOnline: false,
  cacheStartUrl: true,
  dynamicStartUrl: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep visited / prefetched dynamic pages in the client router cache so
    // tab switches render instantly. Server actions (revalidatePath) and
    // router.refresh() still invalidate it after every write.
    staleTimes: { dynamic: 60, static: 300 },
  },
  // No next/image in this app: keep the optimizer (and sharp/libvips) unreachable.
  images: { unoptimized: true, localPatterns: [], remotePatterns: [] },
  // OAuth discovery for the MCP connector lives under /.well-known.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/api/oauth/metadata",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/metadata",
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/oauth/protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/protected-resource",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
