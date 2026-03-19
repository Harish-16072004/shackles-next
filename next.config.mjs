import withPWAInit from "next-pwa";
import defaultRuntimeCaching from "next-pwa/cache.js";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    ...defaultRuntimeCaching,
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/admin/scanner"),
      handler: "NetworkFirst",
      options: {
        cacheName: "scanner-route",
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 60 * 60, // 1 hour cache to keep UI available offline
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["sharp", "pdfkit"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "shackles-dev.sgp1.cdn.digitaloceanspaces.com",
        pathname: "/**",
      }
    ],
  },
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  swcMinify: true,
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 8,
  },
};

export default withPWA(nextConfig);