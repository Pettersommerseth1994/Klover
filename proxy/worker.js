// klover-proxy – Cloudflare Worker foran Regnskapsregisteret.
// Regnskapsregisteret sender ikke CORS-headere, så nettleseren kan ikke kalle det direkte.
// Workeren slipper bare gjennom GET /regnskap/{orgnr} og cacher svaret i ett døgn.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/regnskap\/(\d{9})$/);
    if (req.method !== 'GET' || !m) return new Response('Ikke funnet', { status: 404, headers: CORS });

    const cache = caches.default;
    const key = new Request(url.origin + url.pathname);
    const hit = await cache.match(key);
    if (hit) return hit;

    const up = await fetch(`https://data.brreg.no/regnskapsregisteret/regnskap/${m[1]}`, { headers: { Accept: 'application/json' } });
    const res = new Response(up.body, {
      status: up.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': up.ok ? 'public, max-age=86400' : 'no-store', ...CORS },
    });
    if (up.ok) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  },
};
