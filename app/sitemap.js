/** The public pages, for search engines. */
export default function sitemap() {
  const site = process.env.SITE_URL ?? "http://localhost:3000";
  const now = new Date();
  return ["", "/volunteer", "/status", "/help", "/privacy"].map((p, i) => ({
    url: `${site}${p}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: i === 0 ? 1 : 0.7,
  }));
}
