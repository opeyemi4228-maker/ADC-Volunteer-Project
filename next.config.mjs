/** @type {import('next').NextConfig} */
const nextConfig = {
  // Files the server reads at runtime; listed so hosts like Vercel include them.
  outputFileTracingIncludes: {
    "/**": ["./public/geo/**/*", "./public/brand/**/*", "./assets/fonts/**/*"],
  },
  serverExternalPackages: ["sharp", "nodemailer", "pdf-lib", "@pdf-lib/fontkit"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
          // Browsers only ever talk to the site over HTTPS once they've seen it (production only).
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        ],
      },
      {
        source: "/geo/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
};
export default nextConfig;
