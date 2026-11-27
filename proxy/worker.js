// klover-proxy – Cloudflare Worker for Kløver.
//   GET /regnskap/{orgnr}  Regnskapsregisteret sender ikke CORS-headere, så nettleseren kan ikke kalle det direkte.
//                          Svaret caches i ett døgn.
//   GET /topp?liste=...    Topplister fra D1-databasen «klover» (bygget med scripts/bygg_database.py).
//   GET /eiere/meta, /eiere/{orgnr}, /eierskap/{id}, /personsok?q=..., /utbytte?by=...
//                          Aksjonærregisteret fra D1-databasen «klover-eiere» (scripts/bygg_eierdatabase.py).
//                          Bare når databasen er koblet til (binding EIERE); ellers svarer de 404 og siden bruker eksempeldata.
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

// ---------- Aksjonærregisteret ----------
// Persondata: bare oppslag på ett selskap eller én person om gangen, bare fra Kløver, og uten postnummer.
const EIER_ORIGINS = ['https://xn--klver-wua.com', 'https://www.xn--klver-wua.com', 'http://localhost:5173', 'http://127.0.0.1:5173'];
const eierHeaders = req => {
  const o = req.headers.get('Origin');
  return { 'Access-Control-Allow-Origin': EIER_ORIGINS.includes(o) ? o : EIER_ORIGINS[0], 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' };
};
// «0784 OSLO» -> «OSLO»: stedet er nok til å skille personer med samme navn
const sted = s => (s || '').replace(/^\d{4}\s+/, '');
// Personer som har bedt om å ikke vises (tabellen skjult, se scripts/skjul_person.py). Lastes på nytt hvert minutt.
let SKJULT = { ids: new Set(), t: 0 };
async function skjulte(env) {
  if (Date.now() - SKJULT.t > 60_000) {
    try {
      const { results } = await env.EIERE.prepare('SELECT id FROM skjult').all();
      SKJULT = { ids: new Set(results.map(r => r.id)), t: Date.now() };
    } catch (e) {
      console.error('skjult', e?.message || e); // tabellen mangler: ingen skjult
      SKJULT = { ids: SKJULT.ids, t: Date.now() };
    }
  }
  return SKJULT.ids;
}
// Skjulte personer står igjen som «Skjult person» med andelen, så summen av eierne stemmer
const tidyOwners = (rec, hid) => ({ ...rec, o: rec.o.map(o => (o[0] !== 'p' ? o
  : hid.has(o[1]) ? ['h', '', 'Skjult person', '', '', ...o.slice(5)]
  : [o[0], o[1], o[2], o[3], sted(o[4]), ...o.slice(5)])) });
const tidyHold = rec => (rec.i?.[0] === 'p' ? { ...rec, i: [rec.i[0], rec.i[1], rec.i[2], sted(rec.i[3])] } : rec);
const normTok = s => String(s || '').toLowerCase().replace(/[^a-zæøåäöü0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

// Henter poster for flere nøkler i én spørring (D1 tåler maks 100 parametre)
async function many(env, table, col, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await env.EIERE.prepare(`SELECT ${col} AS k, d FROM ${table} WHERE ${col} IN (${part.map(() => '?').join(',')})`).bind(...part).all();
    for (const r of results) out[r.k] = JSON.parse(r.d);
  }
  return out;
}

// Selskapet og eierne oppover i kjeden (holdingselskaper), så siden kan regne ut endelige eiere uten nye oppslag
async function eierePost(env, org) {
  const recs = {}, seen = new Set([org]), hid = await skjulte(env);
  let level = [org];
  for (let depth = 0; depth < 7 && level.length && Object.keys(recs).length < 120; depth++) {
    const got = await many(env, 'eiere', 'org', level);
    const next = [];
    for (const [k, rec] of Object.entries(got)) {
      recs[k] = tidyOwners(rec, hid);
      for (const o of rec.o) if (o[0] === 'c' && !seen.has(o[1])) { seen.add(o[1]); next.push(o[1]); }
    }
    level = next.slice(0, 120 - Object.keys(recs).length);
  }
  return recs;
}

// Eieren og selskapene nedover i kjeden, til eiertreet på personsiden
async function eierskapPost(env, id) {
  if ((await skjulte(env)).has(id)) return {};
  const recs = {}, seen = new Set([id]);
  let level = [id];
  for (let depth = 0; depth < 7 && level.length && Object.keys(recs).length < 200; depth++) {
    const got = await many(env, 'eierskap', 'id', level);
    const next = [];
    for (const [k, rec] of Object.entries(got)) {
      recs[k] = tidyHold(rec);
      for (const h of rec.h) if (!seen.has(h[0])) { seen.add(h[0]); next.push(h[0]); }
    }
    level = next.slice(0, 200 - Object.keys(recs).length);
  }
  return recs;
}

// Personsøk: slår opp på det lengste ordet (minst tre tegn), og sjekker resten av ordene her
async function personsok(env, q, max) {
  const toks = normTok(q);
  const key = toks.reduce((a, b) => (b.length > a.length ? b : a), '');
  if (key.length < 3) return [];
  const { results } = await env.EIERE.prepare('SELECT id, navn, yr, sted, n FROM navn WHERE tok >= ? AND tok < ? ORDER BY n DESC LIMIT 2000')
    .bind(key, key + '\uffff').all();
  const out = [], seen = new Set(), hid = await skjulte(env);
  for (const r of results) {
    if (seen.has(r.id) || hid.has(r.id)) continue;
    const nt = normTok(r.navn);
    if (toks.every(t => nt.some(x => x.startsWith(t)))) { seen.add(r.id); out.push([r.id, r.navn, r.yr, sted(r.sted), r.n]); if (out.length >= max) break; }
  }
  return out;
}

// Toppliste: personer i en by som fikk mest utbytte fra holdingselskapene sine (scripts/bygg_utbytteliste.py)
async function utbytte(env, by, n) {
  if (!/^[a-zæøå]{2,30}$/.test(by)) return undefined;
  const hid = await skjulte(env);
  const [{ results }, meta] = await Promise.all([
    env.EIERE.prepare('SELECT id, d FROM utbytte WHERE by = ? ORDER BY rang LIMIT ?').bind(by, n + hid.size).all(),
    env.EIERE.prepare("SELECT v FROM meta WHERE k = 'utbytte'").first(),
  ]);
  return { ...(meta ? JSON.parse(meta.v) : {}), by, rader: results.filter(r => !hid.has(r.id)).slice(0, n).map(r => JSON.parse(r.d)) };
}

async function eiere(url, env) {
  const p = url.pathname;
  if (p === '/eiere/meta') {
    const r = await env.EIERE.prepare("SELECT v FROM meta WHERE k = 'meta'").first();
    return r ? JSON.parse(r.v) : null;
  }
  let m = p.match(/^\/eiere\/(\d{9})$/);
  if (m) return { recs: await eierePost(env, m[1]) };
  m = p.match(/^\/eierskap\/(\d{9}|[pf][0-9a-f]{10})$/);
  if (m) return { recs: await eierskapPost(env, m[1]) };
  if (p === '/personsok') return personsok(env, url.searchParams.get('q') || '', Math.min(Math.max(+url.searchParams.get('n') || 6, 1), 40));
  if (p === '/utbytte') return utbytte(env, url.searchParams.get('by') || '', Math.min(Math.max(+url.searchParams.get('n') || 10, 1), 50));
  return undefined;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const isEier = /^\/(eiere|eierskap|personsok|utbytte)(\/|$)/.test(url.pathname);
    if (req.method === 'OPTIONS') return new Response(null, { headers: isEier ? eierHeaders(req) : CORS });
    if (req.method !== 'GET') return new Response('Ikke funnet', { status: 404, headers: CORS });
    if (isEier) {
      const h = eierHeaders(req);
      if (!env.EIERE) return new Response('Ikke funnet', { status: 404, headers: h });
      // Grense per IP-adresse (binding EIER_GRENSE), så registeret ikke kan lastes ned automatisk
      if (env.EIER_GRENSE) {
        const { success } = await env.EIER_GRENSE.limit({ key: req.headers.get('CF-Connecting-IP') || 'ukjent' });
        if (!success) return new Response(JSON.stringify({ feil: 'For mange oppslag. Vent et minutt og prøv igjen.' }),
          { status: 429, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60', ...h } });
      }
      // Svaret caches uten CORS-headere (de avhenger av hvem som spør) og får dem lagt på her
      const cache = caches.default, key = new Request(url.toString());
      const hit = await cache.match(key);
      if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), ...h } });
      let body;
      try { body = await eiere(url, env); } catch (e) { console.error('eiere', url.pathname, e?.message || e); return json({ feil: 'Databasen svarte ikke' }, 500); }
      if (body === undefined) return new Response('Ikke funnet', { status: 404, headers: h });
      // Én time, så en person som skjules forsvinner fra svarene innen en time
      const res = new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
      ctx.waitUntil(cache.put(key, res.clone()));
      return new Response(res.body, { headers: { ...Object.fromEntries(res.headers), ...h } });
    }
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
