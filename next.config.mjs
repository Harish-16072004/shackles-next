/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "utfs.io", // Allow UploadThing images
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ufs.sh", // Allow new UploadThing URLs
        pathname: "/**",
      }
    ],
  },
};

export default nextConfig;