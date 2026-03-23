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
    activePublicDomain,
    doSpacesEndpointHost,
  ].filter(Boolean))
);

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
    remotePatterns: remoteHosts.map((hostname) => ({
      protocol: "https",
      hostname,
      pathname: "/**",
    })),
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