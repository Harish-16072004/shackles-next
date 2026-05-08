import withPWAInit from "next-pwa";
import defaultRuntimeCaching from "next-pwa/cache.js";

const activePublicDomain = process.env.ACTIVE_PUBLIC_DOMAIN?.trim() || "";
const doSpacesEndpointHost = process.env.DO_SPACES_ENDPOINT
  ? (() => {
      try {
        return new URL(process.env.DO_SPACES_ENDPOINT).hostname;
      } catch {
        return "";
      }
    })()
  : "";

const remoteHosts = Array.from(
  new Set([
    "shackles-dev.sgp1.cdn.digitaloceanspaces.com",
    "ui-avatars.com",
    activePublicDomain,
    doSpacesEndpointHost,
  ].filter(Boolean))
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 0. Standalone output — required for Docker / container deployments.
  //    Next.js copies only the files needed to run the server into
  //    .next/standalone, dramatically reducing the image footprint.
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
  serverExternalPackages: ["sharp", "pdfkit", "@xenova/transformers"],

  // 3. Webpack Configuration (Merged and Fixed)
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };

    // Fix for __webpack_require__ error with ONNX/Transformers
    config.externals.push({
      'onnxruntime-node': 'commonjs onnxruntime-node',
      'sharp': 'commonjs sharp',
    });

    // Alias fixes
    config.resolve.alias = {
      ...config.resolve.alias,
      "sharp$": false,
      "onnxruntime-node$": false,
    };

    return config;
  },

  turbopack: {},

  // 4. Dev Server Settings
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 8,
  },

  // 5. Security Headers
  async headers() {
    const imgSrcHosts = remoteHosts.map((h) => `https://${h}`).join(" ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              `img-src 'self' data: blob: ${imgSrcHosts}`,
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.googleapis.com https://*.upstash.io",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// 5. PWA Wrapper
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    ...defaultRuntimeCaching,
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/admin/scanner-v2"),
      handler: "NetworkFirst",
      options: {
        cacheName: "scanner-v2-route",
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 60 * 60, // 1 hour cache
        },
      },
    },
  ],
});

export default withPWA(nextConfig);
