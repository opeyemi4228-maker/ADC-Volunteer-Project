/** Search engines may index the public pages, never the dashboards or the API. */
export default function robots() {
  const site = process.env.SITE_URL ?? "http://localhost:3000";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/workspace", "/api/", "/pu-agent", "/reset", "/status", "/verify/"] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
