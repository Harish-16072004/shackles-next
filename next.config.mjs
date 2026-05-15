// next.config.mjs
import withPWAInit from "next-pwa";
import defaultRuntimeCaching from "next-pwa/cache.js";

const activePublicDomain = process.env.ACTIVE_PUBLIC_DOMAIN?.trim() || "";

// Normalize ACTIVE_PUBLIC_DOMAIN to a hostname if a full URL is provided
const activePublicDomainHost = activePublicDomain
  ? (() => {
    try {
      const url = new URL(activePublicDomain);
      return url.hostname;
    } catch {
      // If it's already just a hostname, keep as-is
      return activePublicDomain;
    }
  })()
  : "";

// DO Spaces endpoint host, derived from DO_SPACES_ENDPOINT
// e.g. DO_SPACES_ENDPOINT=https://shackles-dev.sgp1.digitaloceanspaces.com
const doSpacesEndpointHost = process.env.DO_SPACES_ENDPOINT
  ? (() => {
    try {
      return new URL(process.env.DO_SPACES_ENDPOINT).hostname;
    } catch {
      return "";
    }
  })()
  : "";

// Canonical list of remote hosts that we trust for images
const remoteHosts = Array.from(
  new Set(
    [
      // CDN host (optional, used when DO_SPACES_CDN_BASE_URL is configured)
      "shackles-dev.sgp1.cdn.digitaloceanspaces.com",

      // Avatars and external QR images
      "ui-avatars.com",
      "api.qrserver.com",

      // App public domain (NEXT_PUBLIC_APP_URL / ACTIVE_PUBLIC_DOMAIN)
      activePublicDomainHost,

      // Raw DO Spaces endpoint host derived from DO_SPACES_ENDPOINT
      // e.g. shackles-dev.sgp1.digitaloceanspaces.com
      doSpacesEndpointHost,
    ].filter(Boolean)
  )
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 0. Standalone output — required for Docker / container deployments.
  output: "standalone",

  // 1. Image & Optimization Settings
  images: {
    remotePatterns: remoteHosts.map((hostname) => ({
      protocol: "https",
      hostname,
      pathname: "/**",
    })),
  },
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  // 2. Server Packages
  serverExternalPackages: ["sharp", "pdfkit", "bullmq", "ioredis"],

  // 3. Webpack Configuration
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };

    return config;
  },

  // 4. Dev Server Settings (development only)
  ...(process.env.NODE_ENV === "development"
    ? {
      onDemandEntries: {
        maxInactiveAge: 60 * 1000,
        pagesBufferLength: 8,
      },
    }
    : {}),

  // 5. Security Headers
  async headers() {
    const imgSrcHosts = remoteHosts.map((h) => `https://${h}`).join(" ");
    const isDev = process.env.NODE_ENV === "development";

    // In dev we allow eval for React Refresh and inline for HMR tooling.
    // In prod we keep it stricter: no eval, but still allow inline for Next's scripts.
    const scriptSrc = isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval'"
      : "'self' 'unsafe-inline'";

    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Allow images from self, data, blob, the canonical set of remoteHosts,
      // and any DigitalOcean Spaces buckets (for presigned URLs)
      `img-src 'self' data: blob: ${imgSrcHosts} https://*.digitaloceanspaces.com`,
      "font-src 'self' https://fonts.gstatic.com",
      // Allow XHR/WebSocket/fetch to these origins (DO Spaces + QR API, etc.)
      "connect-src 'self' blob: https://api.qrserver.com https://*.googleapis.com https://*.upstash.io https://*.digitaloceanspaces.com https://sgp1.digitaloceanspaces.com https://fastly.jsdelivr.net",
      "media-src 'self' data:",
      "frame-src 'self' https://www.google.com",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: csp,
          },
        ],
      },
    ];
  },
  // 6. Turbopack acknowledge (Required by Next.js 16 when custom webpack config exists)
  turbopack: {},
};

// 6. PWA Wrapper
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    ...defaultRuntimeCaching,
  ],
});

export default withPWA(nextConfig);