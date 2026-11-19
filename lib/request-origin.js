const WEBHOOKS = new Set(['/api/v1/whatsapp/webhook', '/api/v1/ussd/callback']);
export function unsafeOrigin(request, siteUrl) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  if (WEBHOOKS.has(new URL(request.url).pathname)) return false; // verified by their own provider credentials
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true;
  const origin = request.headers.get('origin');
  if (!origin) return false; // non-browser API clients; authentication still applies
  try { return new URL(origin).origin !== new URL(siteUrl || request.url).origin; }
  catch { return true; }
}
