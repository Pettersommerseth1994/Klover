// klover-proxy – Cloudflare Worker for Kløver.
//   GET /regnskap/{orgnr}  Regnskapsregisteret sender ikke CORS-headere, så nettleseren kan ikke kalle det direkte.
//                          Svaret caches i ett døgn.
//   GET /topp?liste=...    Topplister fra D1-databasen «klover» (bygget med scripts/bygg_database.py).
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const json = (body, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, ...CORS } });

// Topplistene. col/expr er SQL fra denne listen, aldri fra brukeren.
const LISTER = {
  // Margin og egenkapitalandel bare for selskaper med ansatte, ellers fylles listene av holdingselskaper med 100 %
  lonnsom: { col: 'margin', dir: -1, where: 'ans > 0' },
  tjente: { col: 'net', dir: -1 },
  tapte: { col: 'net', dir: 1 },
  utbytte: { col: 'div', dir: -1, where: 'div > 0' },
  ek: { col: 'eq', dir: -1 },
  oms: { col: 'rev', dir: -1 },
  vekst: { col: 'vekst', dir: -1 },
  solid: { col: 'solid', dir: -1, where: 'ans > 0' },
  ansatte: { col: 'ans', dir: -1, where: 'ans > 0' },
  drift_per_ansatt: { expr: 'op * 1.0 / ans', dir: -1, where: 'ans > 0 AND op IS NOT NULL' },
  resultat_per_ansatt: { expr: 'net * 1.0 / ans', dir: -1, where: 'ans > 0 AND net IS NOT NULL' },
};
const FYLKER = ['Oslo', 'Akershus', 'Østfold', 'Buskerud', 'Vestfold', 'Telemark', 'Agder', 'Rogaland', 'Vestland', 'Møre og Romsdal', 'Trøndelag', 'Nordland', 'Troms', 'Finnmark', 'Innlandet'];
const ANS = { a: [0, 9], b: [10, 49], c: [50, 249], d: [250, 999], e: [1000, 1e9] };
const FORMER = { '': ['AS', 'ASA'], AS: ['AS'], ASA: ['ASA'] };

async function topp(url, env) {
  const q = url.searchParams;
  const l = LISTER[q.get('liste') || 'lonnsom'];
  if (!l) return json({ feil: 'Ukjent liste' }, 400);
  const ar = +(q.get('ar') || 2025);
  if (!(ar >= 2023 && ar <= 2025)) return json({ feil: 'Ukjent år' }, 400);
  const val = l.expr || l.col;
  const where = ['ar = ?'], args = [ar];
  if (l.col) where.push(`${l.col} IS NOT NULL`);
  if (l.where) where.push(l.where);
  const fylke = q.get('fylke');
  if (fylke) { if (!FYLKER.includes(fylke)) return json({ feil: 'Ukjent fylke' }, 400); where.push('fylke = ?'); args.push(fylke); }
  const knr = q.get('kommune');
  if (knr) { if (!/^\d{4}$/.test(knr)) return json({ feil: 'Ukjent kommune' }, 400); where.push('knr = ?'); args.push(knr); }
  const sek = q.get('bransje');
  if (sek) { if (!/^[A-S]$/.test(sek)) return json({ feil: 'Ukjent bransje' }, 400); where.push('seksjon = ?'); args.push(sek); }
  const nace = (q.get('nace') || '').split(',').filter(Boolean);
  if (nace.length) {
    if (nace.length > 10 || !nace.every(k => /^\d\d\.\d{3}$/.test(k))) return json({ feil: 'Ukjent næringskode' }, 400);
    where.push(`nace IN (${nace.map(() => '?').join(',')})`); args.push(...nace);
  }
  const form = q.get('form') || '';
  if (form !== 'alle') {
    const f = FORMER[form]; if (!f) return json({ feil: 'Ukjent selskapsform' }, 400);
    where.push(`form IN (${f.map(() => '?').join(',')})`); args.push(...f);
  }
  const ans = q.get('ans');
  if (ans) { const r = ANS[ans]; if (!r) return json({ feil: 'Ukjent antall ansatte' }, 400); where.push('ans BETWEEN ? AND ?'); args.push(...r); }
  const minans = +q.get('minans') || 0;
  if (minans > 0) { where.push('ans >= ?'); args.push(minans); }
  const min = +q.get('min') || 0;
  if (min > 0) { where.push('rev >= ?'); args.push(min); }
  const dir = (+q.get('dir') || l.dir) < 0 ? 'DESC' : 'ASC';
  const n = Math.min(Math.max(+q.get('n') || 25, 1), 500);

  const w = where.join(' AND ');
  const [count, top] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM aar WHERE ${w}`).bind(...args),
    env.DB.prepare(`SELECT t.*, s.navn, s.kommune, b.navn AS bransje FROM (
        SELECT org, form, nace, ans, rev, op, net, eq, ass, div, ${val} AS v FROM aar WHERE ${w} ORDER BY v ${dir}, org LIMIT ?
      ) t JOIN selskap s ON s.org = t.org LEFT JOIN naering b ON b.kode = t.nace ORDER BY t.v ${dir}, t.org`).bind(...args, n),
  ]);
  return json({ ar, total: count.results[0].total, rader: top.results }, 200, 'public, max-age=21600');
}

async function regnskap(url, org, ctx) {
  const cache = caches.default;
  const key = new Request(url.origin + url.pathname);
  const hit = await cache.match(key);
  if (hit) return hit;
  const up = await fetch(`https://data.brreg.no/regnskapsregisteret/regnskap/${org}`, { headers: { Accept: 'application/json' } });
  const res = new Response(up.body, {
    status: up.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': up.ok ? 'public, max-age=86400' : 'no-store', ...CORS },
  });
  if (up.ok) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'GET') return new Response('Ikke funnet', { status: 404, headers: CORS });
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/regnskap\/(\d{9})$/);
    if (m) return regnskap(url, m[1], ctx);
    if (url.pathname === '/topp') {
      // Topplistene endres bare når databasen bygges på nytt, så svarene caches i seks timer
      const cache = caches.default;
      const key = new Request(url.toString());
      const hit = await cache.match(key);
      if (hit) return hit;
      // Prøver én gang til hvis databasen svarer med en forbigående feil
      for (let i = 0; i < 2; i++) {
        try {
          const res = await topp(url, env);
          if (res.ok) ctx.waitUntil(cache.put(key, res.clone()));
          return res;
        } catch (e) {
          console.error('topp', url.search, e?.message || e);
        }
      }
      return json({ feil: 'Databasen svarte ikke' }, 500);
    }
    return new Response('Ikke funnet', { status: 404, headers: CORS });
  },
};
