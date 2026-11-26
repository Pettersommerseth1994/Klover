'use strict';
/* ddai – prototype. Åpne data fra Brønnøysundregistrene (NLOD) + eksempeldata for eierskap. */

// ---------- Hjelpere ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const V = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('nb-NO');
const dec = (v, d = 1) => v.toLocaleString('nb-NO', { maximumFractionDigits: d });
function kr(v) {
  if (v == null || !isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a >= 1e9) return dec(v / 1e9) + ' mrd. kr';
  if (a >= 1e6) return dec(v / 1e6) + ' mill. kr';
  return nf.format(Math.round(v)) + ' kr';
}
const pc = (v, d = 1) => (v == null || !isFinite(v) ? '–' : dec(v, d) + ' %');
const sgn = v => (v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + dec(Math.abs(v), 1) + ' %');
const fmtOrg = o => String(o).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
const fmtDate = d => (d ? d.slice(0, 10).split('-').reverse().join('.') : '');
const UP = new Set(['AS', 'ASA', 'ANS', 'DA', 'SA', 'BA', 'NUF', 'KS', 'IKS', 'A/S', 'HF', 'IL', 'BKS']);
const nice = n => String(n || '').toLowerCase().split(' ').map(w => (UP.has(w.toUpperCase()) || (w.length <= 4 && /^[^aeiouyæøå\d]+$/.test(w)) ? w.toUpperCase() : w.replace(/(^|[-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()))).join(' ');
const ini = n => String(n || '').replace(/\b(AS|ASA|A\/S)\b/gi, '').trim().split(/\s+/).filter(w => /^[\p{L}\d]/u.test(w)).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
const first = n => String(n).split(' ')[0];
// Lokalt: via server.py (proxy). Publisert (GitHub Pages): Enhetsregisteret direkte (støtter CORS),
// regnskap fra lagret utdrag i data/regnskap, siden Regnskapsregisteret ikke sender CORS-headere.
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const getJSON = u => fetch(u, { headers: { Accept: 'application/json' } }).then(r => (r.ok ? r.json() : null)).catch(() => null);
const api = p => {
  if (LOCAL) return getJSON('/api/' + p);
  const m = p.match(/^regnskapsregisteret\/regnskap\/(\d{9})$/);
  if (m) return getJSON(`data/regnskap/${m[1]}.json`).then(d => d ?? { mangler: true });
  return getJSON('https://data.brreg.no/' + p);
};
let timers = [];
const every = (fn, ms) => timers.push(setInterval(fn, ms));

const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  tree: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-3h14v3"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', ext: '<path d="M7 17 17 7M8 7h9v9"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15.5 9.6a6 6 0 1 1-6 6"/>',
  up: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>', down: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a3.5 3.5 0 0 1 0 7M22 20c0-3-1.5-5-4-5.7"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  filter: '<path d="M3 5h18M6 12h12M10 19h4"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>', pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  dollar: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', rev: '<path d="M3 17l6-6 4 4 8-8"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
const ic = (n, c = 'i') => `<svg class="${c}" viewBox="0 0 24 24">${P[n] || ''}</svg>`;
const MARK = '<path d="M8.5 2a6.5 6.5 0 0 1 6.5 6.5V15H8.5a6.5 6.5 0 1 1 0-13zM23.5 2a6.5 6.5 0 1 1 0 13H17V8.5A6.5 6.5 0 0 1 23.5 2zM8.5 17H15v6.5A6.5 6.5 0 1 1 8.5 17zM17 17h6.5a6.5 6.5 0 1 1-6.5 6.5z"/>';
const TONES = ['peach', 'sky', 'mint', 'lilac', 'sun'];

// ---------- Data ----------
let TOP, OWN;
const loadTop = async () => (TOP ??= await fetch('data/toplists.json').then(r => r.json()));
const loadOwn = async () => (OWN ??= await fetch('data/ownership.json').then(r => r.json()));
const E = id => OWN.enheter[id];
const ownersOf = id => OWN.eierskap.filter(e => e.selskap === id);
const holdingsOf = id => OWN.eierskap.filter(e => e.eier === id);
const entHref = id => (E(id)?.type === 'person' ? `#/person/${id}` : `#/selskap/${id}`);

// Endelige eiere: gå oppover til personer og gang andelene
function ultimate(id, mult = 1, chain = [], seen = new Set([id])) {
  const out = [];
  for (const e of ownersOf(id)) {
    if (seen.has(e.eier)) continue;
    const m = mult * e.andel / 100, ch = [...chain, e];
    if (E(e.eier)?.type === 'person') out.push({ person: e.eier, pct: m * 100, chain: ch });
    else out.push(...ultimate(e.eier, m, ch, new Set([...seen, e.eier])));
  }
  return out;
}
function groupUltimate(id) {
  const g = new Map();
  for (const u of ultimate(id)) {
    const x = g.get(u.person) || { person: u.person, pct: 0, paths: [] };
    x.pct += u.pct; x.paths.push(u); g.set(u.person, x);
  }
  return [...g.values()].sort((a, b) => b.pct - a.pct);
}
// Eiertre nedover fra en person eller et selskap
function buildTree(id, mult = 1, chain = [], seen = new Set([id])) {
  return holdingsOf(id).filter(e => !seen.has(e.selskap)).map(e => {
    const m = mult * e.andel / 100, ch = [...chain, e];
    return { id: e.selskap, andel: e.andel, eff: m * 100, chain: ch, kids: buildTree(e.selskap, m, ch, new Set([...seen, e.selskap])) };
  });
}
function aggregate(nodes, map = new Map()) {
  for (const n of nodes) {
    const x = map.get(n.id) || { id: n.id, total: 0, paths: [] };
    x.total += n.eff; x.paths.push(n); map.set(n.id, x);
    aggregate(n.kids, map);
  }
  return map;
}

// ---------- Router ----------
const routes = [
  [/^#?\/?$/, () => home()],
  [/^#\/topplister$/, () => home(true)],
  [/^#\/selskap\/([\w-]+)$/, id => company(id)],
  [/^#\/person\/([\w-]+)$/, id => person(id)],
  [/^#\/eiere$/, () => owners()],
  [/^#\/om$/, () => about()],
];
async function route() {
  timers.forEach(clearInterval); timers = [];
  const h = location.hash || '#/';
  const r = h.startsWith('#/topplister') ? 'top' : h.startsWith('#/eiere') || h.startsWith('#/person') ? 'own' : h.startsWith('#/om') ? 'about' : h === '#/' || h === '' ? 'home' : '';
  $$('.rail .ri').forEach(a => a.classList.toggle('on', a.dataset.r === r));
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) { if (!h.startsWith('#/topplister')) window.scrollTo(0, 0); return fn(...m.slice(1)); }
  }
  home();
}
window.addEventListener('hashchange', route);
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { const i = $('.search input'); if (i) { e.preventDefault(); i.focus(); } }
});

// ---------- Søk ----------
async function searchAll(q) {
  await loadOwn();
  const ql = q.toLowerCase(), out = [];
  for (const [id, e] of Object.entries(OWN.enheter)) {
    if (e.ekte || !e.navn.toLowerCase().includes(ql)) continue;
    const pe = e.type === 'person';
    out.push({ sec: pe ? 'Personer' : 'Eksempelselskaper', href: entHref(id), title: e.navn, kind: pe ? 'pe' : 'co',
      sub: pe ? `Eier i ${aggregate(buildTree(id)).size} selskaper · eksempeldata` : `Eksempelselskap · ${e.sted}` });
  }
  const d = q.replace(/\s/g, '');
  const r = await api(/^\d{9}$/.test(d) ? `enhetsregisteret/api/enheter?organisasjonsnummer=${d}` : `enhetsregisteret/api/enheter?navn=${encodeURIComponent(q)}&size=7`);
  const cos = (r?._embedded?.enheter || []).map(e => ({ sec: 'Selskaper', href: `#/selskap/${e.organisasjonsnummer}`, title: nice(e.navn), kind: 'co',
    sub: [fmtOrg(e.organisasjonsnummer), e.organisasjonsform?.kode, nice(e.forretningsadresse?.poststed || e.postadresse?.poststed || '')].filter(Boolean).join(' · ') }));
  return [...out.filter(x => x.kind === 'pe'), ...cos, ...out.filter(x => x.kind === 'co')];
}
function searchBox({ big = false, placeholder = 'Søk på selskap, org.nr eller person' } = {}) {
  const w = document.createElement('div');
  w.className = 'search';
  w.innerHTML = `<label class="search-box">${ic('search')}<input type="search" autocomplete="off" spellcheck="false" placeholder="${placeholder}" aria-label="Søk">${big ? '<button class="go" type="button">Søk</button>' : '<span class="kbd">/</span>'}</label><div class="drop" hidden></div>`;
  const inp = $('input', w), drop = $('.drop', w);
  let items = [], act = -1, t, seq = 0;
  const render = () => {
    if (!items.length) { drop.innerHTML = '<div class="empty" style="padding:18px">Ingen treff – prøv et annet navn</div>'; drop.hidden = false; return; }
    let sec = '';
    drop.innerHTML = items.map((x, i) => (x.sec !== sec ? `<div class="sec">${(sec = x.sec)}</div>` : '') +
      `<a class="it ${i === act ? 'act' : ''}" href="${x.href}" data-i="${i}"><span class="av ${x.kind}">${esc(ini(x.title))}</span><div><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></div></a>`).join('');
    drop.hidden = false;
  };
  const run = async () => {
    const q = inp.value.trim(), my = ++seq;
    if (q.length < 2) { drop.hidden = true; return; }
    const res = await searchAll(q);
    if (my !== seq) return;
    items = res; act = res.length ? 0 : -1; render();
  };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 180); });
  inp.addEventListener('focus', () => { if (items.length && inp.value.trim().length > 1) drop.hidden = false; });
  inp.addEventListener('blur', () => setTimeout(() => (drop.hidden = true), 160));
  inp.addEventListener('keydown', async e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; act = (act + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!items.length) await run(); const x = items[Math.max(act, 0)]; if (x) location.hash = x.href; }
    else if (e.key === 'Escape') { drop.hidden = true; inp.blur(); }
  });
  $('.go', w)?.addEventListener('click', async () => { if (!items.length) await run(); if (items[0]) location.hash = items[0].href; else inp.focus(); });
  return { el: w, input: inp };
}
function topbar(crumb) {
  const el = document.createElement('header');
  el.className = 'card topbar';
  el.innerHTML = `<div class="crumb"><a href="#/" class="logo-s" style="display:flex;align-items:center;gap:6px;color:var(--fg);font-weight:800;letter-spacing:-.05em;font-size:17px"><svg viewBox="0 0 32 32" style="width:18px;height:18px">${MARK}</svg>ddai</a>${crumb ? `<span>/</span><b>${crumb}</b>` : ''}</div><div style="width:min(380px,55%)"></div>`;
  el.lastElementChild.append(searchBox().el);
  return el;
}

// ---------- Topplister ----------
const PRESETS = [
  { k: 'lonnsom', t: 'Mest lønnsomme', s: 'Høyest driftsmargin', ic: 'trophy', c: 'peach', v: y => (y.rev > 0 && y.op != null ? y.op / y.rev * 100 : null), f: v => pc(v), dir: -1, min: 10e6, sub: y => 'Driftsresultat ' + kr(y.op) },
  { k: 'tjente', t: 'Tjente mest', s: 'Høyest årsresultat', ic: 'up', c: 'mint', v: y => y.net, f: kr, dir: -1, sub: y => 'Omsetning ' + kr(y.rev) },
  { k: 'tapte', t: 'Tapte mest', s: 'Lavest årsresultat', ic: 'down', c: 'lilac', v: y => y.net, f: kr, dir: 1, sub: y => 'Omsetning ' + kr(y.rev) },
  { k: 'utbytte', t: 'Størst utbytte', s: 'Estimert fra regnskapet', ic: 'coins', c: 'sun', v: y => y.div || null, f: kr, dir: -1, sub: y => (y.net > 0 && y.div ? pc(y.div / y.net * 100, 0) + ' av årsresultatet' : '') },
  { k: 'ek', t: 'Mest egenkapital', s: 'Størst sum egenkapital', ic: 'shield', c: 'sky', v: y => y.eq, f: kr, dir: -1, sub: y => (y.ass ? 'Egenkapitalandel ' + pc(y.eq / y.ass * 100, 0) : '') },
  { k: 'oms', t: 'Størst omsetning', s: 'Sum driftsinntekter', ic: 'building', c: 'peach', v: y => y.rev, f: kr, dir: -1, sub: y => 'Årsresultat ' + kr(y.net) },
  { k: 'vekst', t: 'Raskest vekst', s: 'Vekst fra i fjor (min. 10 mill. året før)', ic: 'spark', c: 'mint', v: (y, p) => (p && p.rev >= 1e7 && y.rev != null ? (y.rev / p.rev - 1) * 100 : null), f: sgn, dir: -1, min: 10e6, sub: y => 'Omsetning ' + kr(y.rev) },
  { k: 'solid', t: 'Mest solide', s: 'Høyest egenkapitalandel', ic: 'percent', c: 'sky', v: y => (y.ass > 0 && y.eq != null ? y.eq / y.ass * 100 : null), f: v => pc(v), dir: -1, min: 10e6, sub: y => 'Egenkapital ' + kr(y.eq) },
  { k: 'ansatte', t: 'Flest ansatte', s: 'Fra Enhetsregisteret', ic: 'users', c: 'lilac', v: (y, p, c) => c.ansatte || null, f: v => nf.format(v), dir: -1, sub: y => 'Omsetning ' + kr(y.rev) },
];
const FYLKER = ['Oslo', 'Akershus', 'Østfold', 'Buskerud', 'Vestfold', 'Telemark', 'Agder', 'Rogaland', 'Vestland', 'Møre og Romsdal', 'Trøndelag', 'Nordland', 'Troms', 'Finnmark', 'Innlandet'];
const SECTIONS = [['A', 1, 3, 'Jordbruk, skogbruk og fiske'], ['B', 5, 9, 'Bergverk og utvinning'], ['C', 10, 33, 'Industri'], ['D', 35, 35, 'Kraftforsyning'], ['E', 36, 39, 'Vann, avløp og renovasjon'], ['F', 41, 43, 'Bygg og anlegg'], ['G', 45, 47, 'Varehandel'], ['H', 49, 53, 'Transport og lagring'], ['I', 55, 56, 'Overnatting og servering'], ['J', 58, 63, 'Informasjon og kommunikasjon'], ['K', 64, 66, 'Finans og forsikring'], ['L', 68, 68, 'Eiendom'], ['M', 69, 75, 'Faglig og teknisk tjenesteyting'], ['N', 77, 82, 'Forretningsmessig tjenesteyting'], ['O', 84, 84, 'Offentlig administrasjon'], ['P', 85, 85, 'Undervisning'], ['Q', 86, 88, 'Helse og sosial'], ['R', 90, 93, 'Kultur og fritid'], ['S', 94, 96, 'Annen tjenesteyting']];
const sect = code => { const d = parseInt(code); const s = SECTIONS.find(x => d >= x[1] && d <= x[2]); return s ? s[0] : ''; };
const TL = { fylke: '', preset: 'lonnsom', år: '2025', bransje: '', kommune: '', min: 10e6, ans: '', form: '', dir: 0, n: 10, open: false };
const ANS = { '': [0, Infinity], a: [0, 9], b: [10, 49], c: [50, 249], d: [250, 999], e: [1000, Infinity] };

function rankRows(o) {
  const p = PRESETS.find(x => x.k === o.preset);
  const [lo, hi] = ANS[o.ans || ''];
  const rows = [];
  for (const c of TOP.selskaper) {
    if ((o.fylke && c.fylke !== o.fylke) || (o.kommune && c.kommune !== o.kommune) || (o.bransje && sect(c.nace) !== o.bransje) || (o.form && c.form !== o.form) || c.ansatte < lo || c.ansatte > hi) continue;
    const y = c.år[o.år], prev = c.år[String(+o.år - 1)];
    if (!y || (o.min && !(y.rev >= o.min))) continue;
    const v = p.v(y, prev, c);
    if (v == null || !isFinite(v)) continue;
    rows.push({ c, y, v });
  }
  const dir = o.dir || p.dir;
  rows.sort((a, b) => (dir < 0 ? b.v - a.v : a.v - b.v));
  return { p, rows: rows.slice(0, o.n), total: rows.length };
}
const sel = (name, opts, cur) => `<select data-f="${name}">${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
async function renderTL(box) {
  await loadTop();
  const sc = $('.scroller', box)?.scrollLeft || 0;
  const { p, rows, total } = rankRows(TL);
  const max = Math.max(...rows.map(r => Math.abs(r.v)), 1);
  const kommuner = [...new Set(TOP.selskaper.filter(c => !TL.fylke || c.fylke === TL.fylke).map(c => c.kommune))].sort((a, b) => a.localeCompare(b, 'nb'));
  const where = TL.kommune || TL.fylke || 'hele Norge';
  const nActive = [TL.bransje, TL.kommune, TL.ans, TL.form, TL.dir].filter(Boolean).length + (TL.min !== (p.min || 0) ? 1 : 0) + (TL.år !== '2025' ? 1 : 0);
  box.innerHTML = `
  <div class="tl-head"><div><div class="lab">${ic('trophy')} Topplister</div><h2 style="margin-top:6px">${esc(p.t)} i ${esc(where)}</h2><p class="muted" style="font-size:13px;margin-top:2px">${esc(p.s)} · regnskapsår ${TL.år}</p></div>
    <button class="btn" data-a="filters">${ic('filter')} Flere filtre${nActive ? ` <span class="tag" style="padding:0 6px;background:var(--fg);color:#fff;border-color:var(--fg)">${nActive}</span>` : ''}</button></div>
  <div class="scroller"><button class="chip ${!TL.fylke ? 'on' : ''}" data-fy="">Hele landet</button>${FYLKER.map(f => `<button class="chip ${TL.fylke === f ? 'on' : ''}" data-fy="${f}">${f}</button>`).join('')}</div>
  <div class="presets">${PRESETS.map(x => `<button class="preset ${x.k === TL.preset ? 'on' : ''}" data-p="${x.k}"><div class="pi c-${x.c}">${ic(x.ic)}</div><b>${x.t}</b><span>${x.s}</span></button>`).join('')}</div>
  ${TL.open ? `<div class="filters">
    <label>Kommune${sel('kommune', [['', 'Alle kommuner'], ...kommuner.map(k => [k, k])], TL.kommune)}</label>
    <label>Bransje${sel('bransje', [['', 'Alle bransjer'], ...SECTIONS.map(s => [s[0], s[3]])], TL.bransje)}</label>
    <label>Min. omsetning${sel('min', [[0, 'Ingen grense'], [1e6, 'Over 1 mill.'], [1e7, 'Over 10 mill.'], [1e8, 'Over 100 mill.'], [1e9, 'Over 1 mrd.']], TL.min)}</label>
    <label>Ansatte${sel('ans', [['', 'Alle'], ['a', '0–9'], ['b', '10–49'], ['c', '50–249'], ['d', '250–999'], ['e', '1000+']], TL.ans)}</label>
    <label>Selskapsform${sel('form', [['', 'AS og ASA'], ['AS', 'AS'], ['ASA', 'ASA (børs)']], TL.form)}</label>
    <label>Regnskapsår${sel('år', [['2025', '2025'], ['2024', '2024'], ['2023', '2023']], TL.år)}</label>
    <label>Rekkefølge${sel('dir', [[0, 'Standard'], [-1, 'Høyest først'], [1, 'Lavest først']], TL.dir)}</label>
    <label>Vis${sel('n', [[10, 'Topp 10'], [25, 'Topp 25'], [50, 'Topp 50']], TL.n)}</label>
    <div style="display:flex;align-items:flex-end"><button class="btn" data-a="reset" style="width:100%;justify-content:center">Nullstill</button></div>
  </div>` : ''}
  <div>${rows.length ? rows.map((r, i) => `<a class="rank" href="#/selskap/${r.c.org}"><span class="no">${i + 1}</span><div class="nm"><b>${esc(nice(r.c.navn))}</b><span>${esc(r.c.kommune)} · ${esc(r.c.bransje)}</span></div><div class="vl"><b class="num ${r.v < 0 && p.k !== 'ansatte' ? 'neg' : ''}">${p.f(r.v)}</b><div class="muted" style="font-size:11px">${esc(p.sub(r.y) || '')}</div><div class="bar"><i style="width:${Math.max(3, Math.abs(r.v) / max * 100)}%"></i></div></div></a>`).join('')
    : '<div class="empty">Ingen selskaper matcher filtrene. Prøv å fjerne et filter.</div>'}</div>
  <p class="foot">${ic('info')} Viser ${rows.length} av ${nf.format(total)} treff i et eksempelutvalg på ${nf.format(TOP.selskaper.length)} selskaper (de største og et utvalg mellomstore i hvert fylke), hentet ${fmtDate(TOP.generert)}. Utbytte er estimert som årsresultat minus endring i opptjent egenkapital.</p>`;
  $('.scroller', box).scrollLeft = sc;
}
function wireTL(box) {
  box.addEventListener('click', e => {
    const t = e.target.closest('[data-fy],[data-p],[data-a]');
    if (!t) return;
    if ('fy' in t.dataset) { TL.fylke = t.dataset.fy; TL.kommune = ''; }
    if (t.dataset.p) { const p = PRESETS.find(x => x.k === t.dataset.p); TL.preset = p.k; TL.min = p.min || 0; TL.dir = 0; }
    if (t.dataset.a === 'filters') TL.open = !TL.open;
    if (t.dataset.a === 'reset') Object.assign(TL, { bransje: '', kommune: '', ans: '', form: '', dir: 0, n: 10, år: '2025', min: PRESETS.find(x => x.k === TL.preset).min || 0 });
    renderTL(box);
  });
  box.addEventListener('change', e => {
    const f = e.target.dataset.f; if (!f) return;
    TL[f] = ['min', 'dir', 'n'].includes(f) ? +e.target.value : e.target.value;
    renderTL(box);
  });
}

// ---------- Forside ----------
async function home(toList) {
  const words = ['Oslo', 'Vestland', 'Nordland', 'Rogaland', 'Trøndelag', 'Agder', 'Troms', 'ditt fylke'];
  V.innerHTML = `
  <section class="card hero">
    <a class="logo-full" href="#/" style="position:absolute;left:20px;top:18px;display:flex;align-items:center;gap:7px;font-weight:800;font-size:22px;letter-spacing:-.05em"><svg viewBox="0 0 32 32" style="width:22px;height:22px">${MARK}</svg>ddai</a>
    <div style="position:absolute;right:16px;top:14px;display:flex;gap:6px" class="hero-links"><a class="btn" href="#/topplister">${ic('trophy')} Topplister</a><a class="btn" href="#/eiere">${ic('tree')} Eiersøk</a></div>
    <div class="live"><i></i><span id="live">Henter fersk data fra Brønnøysund …</span></div>
    <h1>Hvem tjener mest<br>i <span class="rot">${words.map((w, i) => `<span class="${i ? '' : 'on'}">${w}?</span>`).join('')}</span></h1>
    <p class="lead">Søk blant alle norske selskaper. Se regnskap, eiere og morsomme fakta – uten å drukne i tall.</p>
    <div id="hs"></div>
    <div class="tries">Prøv:
      <a class="chip" href="#/selskap/935851076">Efjord Extreme AS</a>
      <a class="chip" href="#/person/p-petter">${ic('user')} Petter Sommerseth</a>
      <a class="chip" href="#/selskap/918298037">Proff AS</a>
      <a class="chip" href="#/selskap/923609016">Equinor ASA</a>
    </div>
    <div class="stickers" id="stk"></div>
  </section>
  <section class="card panel" id="tl"></section>`;
  const sb = searchBox({ big: true });
  $('#hs').append(sb.el);
  const ph = ['Søk på selskap, org.nr eller person …', 'Prøv «Efjord Extreme»', 'Prøv «Petter Sommerseth»', 'Prøv «935 851 076»'];
  let pi = 0;
  every(() => { if (document.activeElement !== sb.input && !sb.input.value) sb.input.placeholder = ph[(pi = (pi + 1) % ph.length)]; }, 2600);
  sb.input.placeholder = ph[0];
  let wi = 0;
  const rot = $('.rot'), fit = () => { const s = $$('span', rot)[wi]; if (s) rot.style.width = s.offsetWidth + 'px'; };
  fit(); document.fonts?.ready.then(fit);
  every(() => {
    const s = $$('.rot span'); if (!s.length) return;
    s[wi].className = 'out'; wi = (wi + 1) % s.length; s[wi].className = 'on'; fit();
    setTimeout(() => s.forEach((x, i) => i !== wi && (x.className = '')), 500);
  }, 2200);
  api('enhetsregisteret/api/enheter?size=1').then(d => { const n = d?.page?.totalElements; if (n && $('#live')) $('#live').textContent = `${nf.format(n)} virksomheter i Enhetsregisteret – live`; });

  const tl = $('#tl');
  wireTL(tl);
  await renderTL(tl);
  if (toList) tl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const pick = (k, extra) => rankRows({ ...TL, fylke: '', kommune: '', bransje: '', ans: '', form: '', dir: 0, år: '2025', n: 1, preset: k, min: 0, ...extra }).rows[0];
  const st = [
    ['lonnsom', 'peach', 'Mest lønnsomme', { min: 1e8 }], ['utbytte', 'mint', 'Største utbytte'], ['vekst', 'sky', 'Raskest vekst', { min: 5e7 }], ['ek', 'lilac', 'Mest egenkapital'],
  ].map(([k, c, t, x]) => { const r = pick(k, x), p = PRESETS.find(y => y.k === k); return r ? `<button class="sticker c-${c}" data-p="${k}" data-min="${x?.min ?? ''}"><div class="k">${ic(p.ic)} ${t}</div><div class="v">${p.f(r.v)}</div><div class="n">${esc(nice(r.c.navn))}</div></button>` : ''; });
  $('#stk').innerHTML = st.join('');
  $('#stk').onclick = e => {
    const b = e.target.closest('.sticker'); if (!b) return;
    Object.assign(TL, { preset: b.dataset.p, fylke: '', kommune: '', dir: 0, min: b.dataset.min ? +b.dataset.min : PRESETS.find(x => x.k === b.dataset.p).min || 0 });
    renderTL(tl); tl.scrollIntoView({ behavior: 'smooth' });
  };
}

// ---------- Selskap ----------
const g = (o, ...p) => { for (const k of p) { if (o == null) return null; o = o[k]; } return typeof o === 'number' ? o : null; };
function parseYears(rs) {
  const ys = (Array.isArray(rs) ? rs : []).filter(r => r.regnskapstype === 'SELSKAP').map(r => {
    const R = r.resultatregnskapResultat || {}, A = r.eiendeler || {}, B = r.egenkapitalGjeld || {};
    return {
      y: r.regnskapsperiode.tilDato.slice(0, 4), fravalg: r.revisjon?.fravalgRevisjon,
      salg: g(R, 'driftsresultat', 'driftsinntekter', 'salgsinntekter'), rev: g(R, 'driftsresultat', 'driftsinntekter', 'sumDriftsinntekter'),
      wage: g(R, 'driftsresultat', 'driftskostnad', 'loennskostnad'), cost: g(R, 'driftsresultat', 'driftskostnad', 'sumDriftskostnad'),
      op: g(R, 'driftsresultat', 'driftsresultat'), finInn: g(R, 'finansresultat', 'finansinntekt', 'sumFinansinntekter'),
      finKost: g(R, 'finansresultat', 'finanskostnad', 'sumFinanskostnad'), pre: g(R, 'ordinaertResultatFoerSkattekostnad'),
      tax: g(R, 'ordinaertResultatSkattekostnad'), net: g(R, 'aarsresultat'),
      anlegg: g(A, 'anleggsmidler', 'sumAnleggsmidler'), varer: g(A, 'sumVarer'), fordr: g(A, 'sumFordringer'), bank: g(A, 'sumBankinnskuddOgKontanter'),
      omlop: g(A, 'omloepsmidler', 'sumOmloepsmidler'), ass: g(A, 'sumEiendeler'),
      innskutt: g(B, 'egenkapital', 'innskuttEgenkapital', 'sumInnskuttEgenkaptial'), opptjent: g(B, 'egenkapital', 'opptjentEgenkapital', 'sumOpptjentEgenkapital'),
      eq: g(B, 'egenkapital', 'sumEgenkapital'), lang: g(B, 'gjeldOversikt', 'langsiktigGjeld', 'sumLangsiktigGjeld'),
      kort: g(B, 'gjeldOversikt', 'kortsiktigGjeld', 'sumKortsiktigGjeld'), gjeld: g(B, 'gjeldOversikt', 'sumGjeld'),
    };
  }).sort((a, b) => a.y - b.y);
  ys.forEach((c, i) => {
    const p = ys[i - 1];
    if (p && c.net != null && c.opptjent != null && p.opptjent != null) c.div = Math.max(0, c.net - (c.opptjent - p.opptjent));
    const r = (a, b) => (a != null && b ? a / b * 100 : null);
    Object.assign(c, { r_margin: r(c.op, c.rev), r_nm: r(c.net, c.rev), r_ek: r(c.eq, c.ass), r_tkr: c.pre != null && c.ass ? (c.pre + (c.finKost || 0)) / c.ass * 100 : null,
      r_ekr: c.eq > 0 ? r(c.net, c.eq) : null, r_lik: c.omlop != null && c.kort ? c.omlop / c.kort : null, r_lonn: c.wage ? r(c.wage, c.rev) : null });
  });
  return ys;
}

function facts(name, ys, ent, ro, ult) {
  const F = [], L = ys.at(-1), Pv = ys.at(-2), n = `<b>${esc(name)}</b>`;
  const add = (ic_, k, big, text, sm) => F.push({ ic: ic_, k, big, text, sm });
  if (L) {
    if (Pv?.rev > 0 && L.rev != null) { const g_ = (L.rev / Pv.rev - 1) * 100; add(g_ >= 0 ? 'up' : 'down', 'Vekst', sgn(g_), `${n} omsatte for <b>${pc(Math.abs(g_))} ${g_ >= 0 ? 'mer' : 'mindre'}</b> i ${L.y} enn i ${Pv.y}.`); }
    if (L.rev > 0) add('cal', 'Hver dag', kr(L.rev / 365), `Det tilsvarer omtrent <b>${kr(L.rev / 365)}</b> i omsetning – hver eneste dag i ${L.y}.`);
    if (L.rev > 0 && L.op != null) {
      if (L.op >= 0) add('percent', 'Lønnsomhet', `${Math.round(L.op / L.rev * 100)} øre`, `Av hver krone ${n} tok inn, ble <b>${Math.round(L.op / L.rev * 100)} øre</b> igjen som driftsresultat.`);
      else add('down', 'Driftsresultat', kr(L.op), `Driftsresultatet ble <b>${kr(L.op)}</b> i ${L.y}${ys.length === 1 ? ' – ikke uvanlig i et første driftsår.' : '.'}`);
    }
    if (L.div > 0) add('coins', 'Utbytte (estimat)', kr(L.div), `Eierne fikk anslagsvis <b>${kr(L.div)}</b> i utbytte${L.net > 0 ? ` – ${pc(L.div / L.net * 100, 0)} av årsresultatet` : ''}.`);
    if (L.rev > 0 && L.cost) add('bag', 'Kostnader', `${dec(L.cost / L.rev, 2)} kr`, `For hver krone som kom inn, brukte ${n} <b>${dec(L.cost / L.rev, 2)} kr</b> på drift.`);
    if (Pv && L.net > 0 && Pv.net > 0) { const d = (L.net / Pv.net - 1) * 100; add(d >= 0 ? 'up' : 'down', 'Bunnlinja', sgn(d), `Årsresultatet ${d >= 0 ? 'økte' : 'falt'} fra <b>${kr(Pv.net)}</b> til <b>${kr(L.net)}</b>.`); }
    if (L.tax > 0) add('dollar', 'Skatt', kr(L.tax), `${n} kostnadsførte <b>${kr(L.tax)}</b> i skatt – rundt <b>${kr(L.tax / 365)}</b> per dag.`);
    if (ent?.antallAnsatte > 0 && L.rev > 0) add('users', 'Per ansatt', kr(L.rev / ent.antallAnsatte), `Hver av de ${nf.format(ent.antallAnsatte)} ansatte står for rundt <b>${kr(L.rev / ent.antallAnsatte)}</b> i omsetning.`);
    if (L.wage > 0 && L.rev > 0) add('users', 'Lønn', pc(L.wage / L.rev * 100, 0), `Lønn utgjør <b>${pc(L.wage / L.rev * 100, 0)}</b> av inntektene${Pv?.wage && Pv.rev ? ` (${pc(Pv.wage / Pv.rev * 100, 0)} året før)` : ''}.`);
    if (L.ass > 0 && L.eq != null) { const r = L.eq / L.ass * 100; add('shield', 'Soliditet', pc(r, 0), `Egenkapitalandelen er <b>${pc(r, 0)}</b>${r >= 30 ? ' – en solid buffer.' : r < 0 ? ' – egenkapitalen er negativ.' : '.'}`); }
    if (L.varer > 0 && L.ass > 0) add('bag', 'Varelager', pc(L.varer / L.ass * 100, 0), `Varelageret på <b>${kr(L.varer)}</b> utgjør ${pc(L.varer / L.ass * 100, 0)} av alle eiendelene.`);
    if (ys.length > 2) { const b = [...ys].sort((a, c) => (c.net ?? -1e15) - (a.net ?? -1e15))[0]; add('trophy', 'Rekordår', b.y, b.y === L.y ? `${L.y} er det <b>beste resultatåret</b> i perioden vi har tall for.` : `Beste årsresultat i perioden kom i <b>${b.y}</b> (${kr(b.net)}).`); }
  }
  if (ult?.length) { const u = ult[0]; add('tree', 'Største eier', pc(u.pct), `<b>${esc(E(u.person).navn)}</b> eier ${pc(u.pct)} totalt${u.paths.some(p => p.chain.length > 1) ? ' – delvis via holdingselskap' : ''}. <span class="tag demo" style="margin-top:4px">Eksempel</span>`); }
  if (ent?.stiftelsesdato) {
    const days = Math.floor((Date.now() - new Date(ent.stiftelsesdato)) / 864e5);
    if (days < 730) add('clock', 'Fersk', `${nf.format(days)} dager`, `${n} ble stiftet ${fmtDate(ent.stiftelsesdato)} – fortsatt i oppstartsfasen.`);
    else add('clock', 'Alder', `${Math.floor(days / 365.25)} år`, `${n} ble stiftet ${fmtDate(ent.stiftelsesdato)}.`);
  }
  const hn = ent?.historiskeNavn?.[0];
  if (hn) add('pen', 'Navnebytte', nice(hn.navn), `Selskapet het <b>${esc(nice(hn.navn))}</b>${hn.tilDato ? ` frem til ${fmtDate(hn.tilDato)}` : ''}.`, true);
  const k = ent?.kapital;
  if (k?.belop && k.antallAksjer) add('tag', 'Aksjekapital', kr(k.belop), `Fordelt på <b>${nf.format(k.antallAksjer)} aksjer</b> à ${kr(k.belop / k.antallAksjer)}.`);
  const roles = (ro?.rollegrupper || []).flatMap(x => x.roller).filter(r => !r.fratraadt);
  const nm = r => r.person ? [r.person.navn?.fornavn, r.person.navn?.mellomnavn, r.person.navn?.etternavn].filter(Boolean).join(' ') : '';
  const dl = roles.find(r => r.type.kode === 'DAGL'), sl = roles.find(r => r.type.kode === 'LEDE');
  if (dl && sl && nm(dl) && nm(dl) === nm(sl)) add('user', 'Ledelse', '1 person', `<b>${esc(nm(dl))}</b> er både daglig leder og styreleder.`);
  const board = roles.filter(r => ['LEDE', 'MEDL', 'NEST'].includes(r.type.kode)).length;
  if (board > 2) add('users', 'Styret', `${board} personer`, `Styret består av <b>${board} personer</b>.`);
  if (L?.fravalg) add('info', 'Revisjon', 'Fravalgt', 'Selskapet har valgt bort revisjon – det er lov for små aksjeselskap.', true);
  return F;
}
function carousel(F) {
  if (!F.length) return '<p class="muted" style="margin-top:10px">Ikke nok tall til å lage innsikt ennå.</p>';
  return `<div class="ins-wrap"><div class="ins-track">${F.map((f, i) => `<article class="fact c-${TONES[i % TONES.length]}"><div class="k">${ic(f.ic)} ${esc(f.k)}</div><div class="big num" ${f.sm ? 'style="font-size:22px"' : ''}>${esc(f.big)}</div><p>${f.text}</p></article>`).join('')}</div>
  <div class="dots">${F.map((_, i) => `<i data-d="${i}" class="${i ? '' : 'on'}"></i>`).join('')}</div></div>`;
}
function wireCarousel(root) {
  const tr = $('.ins-track', root); if (!tr) return;
  const cards = $$('.fact', tr), dots = $$('.dots i', root), cnt = $('[data-cnt]', root), prev = $('[data-prev]', root), next = $('[data-next]', root);
  const step = () => cards[0].offsetWidth + 12;
  const upd = () => {
    const i = Math.min(cards.length - 1, Math.round(tr.scrollLeft / step()));
    dots.forEach((d, j) => d.classList.toggle('on', j === i));
    if (cnt) cnt.textContent = `${i + 1} / ${cards.length}`;
    if (prev) prev.disabled = tr.scrollLeft < 4;
    if (next) next.disabled = tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 4;
  };
  tr.addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true });
  prev?.addEventListener('click', () => tr.scrollBy({ left: -step(), behavior: 'smooth' }));
  next?.addEventListener('click', () => tr.scrollBy({ left: step(), behavior: 'smooth' }));
  dots.forEach(d => d.addEventListener('click', () => tr.scrollTo({ left: d.dataset.d * step(), behavior: 'smooth' })));
  upd();
}
const kpi = (l, i, v, s, c = '') => `<div class="card kpi"><div class="lab">${ic(i)} ${l}</div><div class="val num ${c}">${v}</div><div class="sub">${s || ''}</div></div>`;

const ROWS = [
  ['g', 'Resultatregnskap'], ['Salgsinntekter', 'salg'], ['Sum driftsinntekter', 'rev', 1], ['Lønnskostnad', 'wage'], ['Sum driftskostnader', 'cost'],
  ['Driftsresultat', 'op', 1], ['Finansinntekter', 'finInn'], ['Finanskostnader', 'finKost'], ['Resultat før skatt', 'pre', 1], ['Skattekostnad', 'tax'],
  ['Årsresultat', 'net', 1], ['Estimert utbytte', 'div'],
  ['g', 'Balanse'], ['Sum anleggsmidler', 'anlegg'], ['Varer', 'varer'], ['Fordringer', 'fordr'], ['Bankinnskudd og kontanter', 'bank'], ['Sum omløpsmidler', 'omlop'],
  ['Sum eiendeler', 'ass', 1], ['Innskutt egenkapital', 'innskutt'], ['Opptjent egenkapital', 'opptjent'], ['Sum egenkapital', 'eq', 1], ['Langsiktig gjeld', 'lang'],
  ['Kortsiktig gjeld', 'kort'], ['Sum gjeld', 'gjeld', 1],
  ['g', 'Nøkkeltall'], ['Driftsmargin', 'r_margin', 0, '%'], ['Resultatmargin', 'r_nm', 0, '%'], ['Egenkapitalandel', 'r_ek', 0, '%'], ['Totalkapitalrentabilitet', 'r_tkr', 0, '%'],
  ['Egenkapitalrentabilitet', 'r_ekr', 0, '%'], ['Likviditetsgrad 1', 'r_lik', 0, 'x'], ['Lønn i % av inntekter', 'r_lonn', 0, '%'],
];
function finTable(ys) {
  const cols = [...ys].reverse();
  const big = Math.max(...ys.map(y => Math.abs(y.rev || 0)), ...ys.map(y => Math.abs(y.ass || 0)));
  const unit = big >= 1e7 ? 1000 : 1;
  const cell = (v, u) => (v == null ? '<td class="na">–</td>' : `<td>${u === '%' ? pc(v) : u === 'x' ? dec(v, 2) : nf.format(Math.round(v / unit))}`);
  let html = '', grp = null;
  for (const [label, key, sum, u] of ROWS) {
    if (label === 'g') { grp = `<tr class="grp"><td colspan="${cols.length + 1}">${key}</td></tr>`; continue; }
    if (ys.every(y => y[key] == null)) continue;
    if (grp) { html += grp; grp = null; }
    html += `<tr class="${sum ? 'sum' : ''}"><td>${label}</td>${cols.map((y, i) => {
      const v = y[key], p = cols[i + 1]?.[key];
      const ch = sum && !u && v != null && p ? (v - p) / Math.abs(p) * 100 : null;
      return cell(v, u) + (ch != null ? `<small class="${ch >= 0 ? 'pos' : 'neg'}">${sgn(ch)}</small>` : '') + '</td>';
    }).join('')}</tr>`;
  }
  const yrs = cols.map(y => y.y);
  return `<div class="tbl-wrap"><table class="fin"><thead><tr><th>${unit === 1000 ? 'Beløp i 1000 kr' : 'Beløp i kr'}</th>${yrs.map(y => `<th>${y}</th>`).join('')}</tr></thead><tbody>${html}</tbody></table></div>`;
}
function chart(ys, k) {
  const vals = ys.map(r => r[k] || 0), max = Math.max(...vals.map(Math.abs), 1), W = 700, H = 200, bw = Math.min(80, W / ys.length - 40);
  return `<svg viewBox="0 0 ${W} ${H + 28}" style="width:100%;max-height:260px">${ys.map((r, i) => {
    const v = r[k] || 0, h = Math.max(2, Math.abs(v) / max * (H - 34)), x = (W / ys.length) * (i + 0.5) - bw / 2, last = i === ys.length - 1;
    return `<rect x="${x}" y="${H - h}" width="${bw}" height="${h}" rx="8" fill="${v < 0 ? 'var(--neg)' : last ? 'var(--brand)' : 'var(--bar-soft)'}"/><text x="${x + bw / 2}" y="${H - h - 9}" text-anchor="middle" font-size="13" font-weight="600" fill="currentColor">${kr(v)}</text><text x="${x + bw / 2}" y="${H + 20}" text-anchor="middle" font-size="12" fill="var(--muted-fg)">${r.y}</text>`;
  }).join('')}</svg>`;
}

const OWN_COLORS = ['var(--brand)', 'oklch(55% .1 255)', 'oklch(70% .1 160)', 'oklch(75% .1 95)', 'oklch(65% .1 300)', 'oklch(80% .03 255)'];
function ownershipPanel(id, name) {
  const direct = ownersOf(id), hold = holdingsOf(id);
  if (!direct.length && !hold.length) return `<section class="card panel" id="s-eiere"><div class="panel-h"><div><h2>Eiere</h2><p>Hvem eier selskapet – direkte og via andre selskaper</p></div></div>
    <div class="empty" style="padding:26px">${ic('tree')}<br>Eierdata er ikke koblet på ennå for dette selskapet.<br><span style="font-size:12px">Aksjonærregisteret hentes fra Skatteetaten som en årlig fil.</span><br><br><a class="chip" href="#/selskap/935851076">Se eksempelet: Efjord Extreme AS</a></div></section>`;
  const ult = groupUltimate(id), ent = E(id);
  const via = u => u.paths.map(p => p.chain.length === 1 ? `${pc(p.pct)} direkte` : `${pc(p.pct)} via ${p.chain.slice(0, -1).map(e => esc(E(e.eier).navn)).reverse().join(' → ')}`).join(' · ');
  return `<section class="card panel" id="s-eiere"><div class="panel-h"><div><h2>Hvem eier ${esc(name)}?</h2><p>Endelige eiere regnes ut gjennom alle ledd – også via holdingselskaper</p></div><span class="tag demo">${ic('info')} Eksempeldata</span></div>
  ${ult.length ? `<div class="own-bar">${ult.map((u, i) => `<i style="width:${u.pct}%;background:${OWN_COLORS[i % OWN_COLORS.length]}" title="${esc(E(u.person).navn)} ${pc(u.pct)}"></i>`).join('')}</div>
  <div class="legend">${ult.map((u, i) => `<a class="lg" href="#/person/${u.person}"><span class="sw" style="background:${OWN_COLORS[i % OWN_COLORS.length]}"></span><div><b>${esc(E(u.person).navn)}</b><div class="via">${via(u)}</div></div><span class="pc num">${pc(u.pct)}</span></a>`).join('')}</div>` : ''}
  <div class="cols">
    ${direct.length ? `<div><div class="subh">Direkte aksjonærer</div><table class="mini">${direct.sort((a, b) => b.andel - a.andel).map(e => `<tr onclick="location.hash='${entHref(e.eier)}'"><td><span style="display:flex;align-items:center;gap:8px"><span class="av ${E(e.eier).type === 'person' ? 'pe' : 'co'}" style="width:24px;height:24px;font-size:10px">${esc(ini(E(e.eier).navn))}</span>${esc(E(e.eier).navn)}</span></td><td class="muted" style="font-weight:400;text-align:right">${ent?.aksjer ? nf.format(Math.round(ent.aksjer * e.andel / 100)) + ' aksjer' : ''}</td><td>${pc(e.andel)}</td></tr>`).join('')}</table></div>` : ''}
    ${hold.length ? `<div><div class="subh">${esc(name)} eier selv</div><table class="mini">${hold.map(e => `<tr onclick="location.hash='#/selskap/${e.selskap}'"><td>${esc(E(e.selskap).navn)}</td><td>${pc(e.andel)}</td></tr>`).join('')}</table></div>` : ''}
  </div></section>`;
}
function rolesPanel(ro) {
  const gs = (ro?.rollegrupper || []).map(gr => ({ t: gr.type.beskrivelse, r: gr.roller.filter(r => !r.fratraadt && !r.avregistrert) })).filter(x => x.r.length);
  const people = Object.entries(OWN.enheter).filter(([, e]) => e.type === 'person');
  const body = gs.length ? gs.map(gr => `<div class="lab" style="margin-top:14px">${esc(gr.t)}</div><div class="roles">${gr.r.map(r => {
    const n = r.person ? [r.person.navn?.fornavn, r.person.navn?.mellomnavn, r.person.navn?.etternavn].filter(Boolean).join(' ') : nice([].concat(r.enhet?.navn || []).join(' '));
    const yr = r.person?.fodselsdato ? ` · f. ${r.person.fodselsdato.slice(0, 4)}` : '';
    const match = people.find(([, e]) => e.navn.toLowerCase() === n.toLowerCase());
    const link = match ? `#/person/${match[0]}` : r.enhet?.organisasjonsnummer ? `#/selskap/${r.enhet.organisasjonsnummer}` : '';
    return `<${link ? `a href="${link}"` : 'div'} class="person"><span class="av ${r.person ? 'pe' : 'co'}">${esc(ini(n))}</span><div><b>${esc(n)}</b><span>${esc(r.type.beskrivelse)}${yr}${match ? ' · se eierskap →' : ''}</span></div></${link ? 'a' : 'div'}>`;
  }).join('')}</div>`).join('') : '<p class="muted" style="margin-top:10px">Ingen roller registrert.</p>';
  return `<section class="card panel" id="s-roller"><h2>Roller</h2><p>Styre, ledelse, revisor og regnskapsfører fra Enhetsregisteret</p>${body}</section>`;
}

async function company(id) {
  V.innerHTML = '<div class="card empty" style="margin-top:10px">Henter selskapet …</div>';
  await loadOwn();
  const demo = id.startsWith('d-');
  let ent = null, rs = null, ro = null;
  if (!demo) {
    [ent, rs, ro] = await Promise.all([api(`enhetsregisteret/api/enheter/${id}`), api(`regnskapsregisteret/regnskap/${id}`), api(`enhetsregisteret/api/enheter/${id}/roller`)]);
    if (!ent?.navn) { V.innerHTML = ''; V.append(topbar()); V.insertAdjacentHTML('beforeend', '<div class="card empty">Fant ikke selskapet i Enhetsregisteret.</div>'); return; }
  } else if (!E(id)) { location.hash = '#/'; return; }
  const name = demo ? E(id).navn : nice(ent.navn);
  document.title = `${name} – ddai`;
  const ys = parseYears(rs), L = ys.at(-1), Pv = ys.at(-2);
  const ult = groupUltimate(id);
  const F = facts(name, ys, ent, ro, ult);
  const tags = demo ? [`<span class="tag demo">${ic('info')} Oppdiktet eksempelselskap</span>`, `<span class="tag">${esc(E(id).sted)}</span>`] : [
    `<span class="tag">Org.nr ${fmtOrg(id)}</span>`, `<span class="tag">${esc(ent.organisasjonsform?.beskrivelse || '')}</span>`,
    ent.forretningsadresse?.kommune ? `<span class="tag">${esc(nice(ent.forretningsadresse.kommune))}</span>` : '',
    ent.naeringskode1 ? `<span class="tag">${esc(ent.naeringskode1.beskrivelse)}</span>` : '',
    ent.stiftelsesdato ? `<span class="tag">${ic('cal')} Stiftet ${fmtDate(ent.stiftelsesdato)}</span>` : '',
    ent.harRegistrertAntallAnsatte ? `<span class="tag">${ic('users')} ${nf.format(ent.antallAnsatte)} ansatte</span>` : '',
    ent.hjemmeside ? `<span class="tag">${esc(ent.hjemmeside)}</span>` : '',
    ent.konkurs || ent.underAvvikling || ent.underTvangsavviklingEllerTvangsopplosning ? '<span class="tag" style="background:oklch(95% .04 27);color:var(--neg)">Konkurs/avvikling</span>' : '',
  ];
  const hn = (ent?.historiskeNavn || []).map(h => nice(h.navn));
  V.innerHTML = '';
  V.append(topbar(esc(name)));
  V.insertAdjacentHTML('beforeend', `
  <section class="card co-head"><div class="big">${esc(ini(name))}</div><div style="flex:1;min-width:0"><h1>${esc(name)}</h1>
    ${hn.length ? `<div class="was">Tidligere navn: ${hn.map(esc).join(', ')}</div>` : ''}<div class="tags">${tags.join('')}</div>
    ${ent?.aktivitet?.length ? `<p class="muted" style="margin-top:10px;font-size:13px;max-width:720px">${esc(ent.aktivitet.join(' '))}</p>` : ''}</div></section>
  <nav class="card secnav">${[['s-kpi', 'Nøkkeltall'], ['s-innsikt', 'Innsikt'], ['s-regnskap', 'Regnskap'], ['s-eiere', 'Eiere'], ['s-roller', 'Roller']].filter(([s]) => !demo || s === 's-eiere').map(([s, t]) => `<a href="javascript:void 0" data-go="${s}">${t}</a>`).join('')}</nav>
  ${L ? `<div class="grid" id="s-kpi">
    ${kpi('Driftsinntekter', 'rev', kr(L.rev), Pv?.rev ? `${sgn((L.rev / Pv.rev - 1) * 100)} fra ${Pv.y}` : `Regnskapsår ${L.y}`)}
    ${kpi('Driftsresultat', 'dollar', kr(L.op), L.rev ? pc(L.r_margin) + ' margin' : '', L.op < 0 ? 'neg' : '')}
    ${kpi('Årsresultat', 'dollar', kr(L.net), `Regnskapsår ${L.y}`, L.net < 0 ? 'neg' : '')}
    ${kpi('Egenkapital', 'shield', kr(L.eq), L.ass ? pc(L.r_ek, 0) + ' av eiendelene' : '', L.eq < 0 ? 'neg' : '')}
    ${kpi('Estimert utbytte', 'coins', L.div != null ? kr(L.div) : '–', L.div != null ? 'Fra endring i opptjent EK' : 'Krever to års regnskap')}
    ${kpi('Sum eiendeler', 'building', kr(L.ass), L.gjeld != null ? 'Gjeld ' + kr(L.gjeld) : '')}
  </div>` : ''}
  ${F.length ? `<section class="card panel" id="s-innsikt"><div class="panel-h"><div><h2>Innsikt</h2><p>Bla gjennom kjappe fakta om ${esc(name)}</p></div>
    <div class="ins-ctl"><span class="muted num" data-cnt style="font-size:12px;min-width:44px;text-align:right"></span><button class="r" data-prev aria-label="Forrige">${ic('left')}</button><button class="r" data-next aria-label="Neste">${ic('right')}</button></div></div>${carousel(F)}</section>` : ''}
  ${!demo ? `<section class="card panel" id="s-regnskap"><div class="panel-h"><div><h2>Regnskap</h2><p>Hentet fra Regnskapsregisteret · nyeste år først</p></div>${ys.length > 1 ? `<div class="scroller" data-ch>${[['rev', 'Omsetning'], ['op', 'Driftsresultat'], ['net', 'Årsresultat'], ['eq', 'Egenkapital']].map(([k, t], i) => `<button class="chip ${i ? '' : 'on'}" data-k="${k}">${t}</button>`).join('')}</div>` : ''}</div>
    ${ys.length > 1 ? `<div id="chart" style="margin-top:12px">${chart(ys, 'rev')}</div>` : ''}
    ${ys.length ? finTable(ys) : rs?.mangler ? '<div class="empty">Regnskapet til dette selskapet er ikke med i den publiserte demoen ennå.<br><span style="font-size:12px">Demoen har lagret regnskap for selskapene i topplistene. Kjør appen lokalt for å se alle.</span></div>' : '<div class="empty">Ingen regnskap funnet i Regnskapsregisteret.</div>'}
    <p class="foot">Kilde: Regnskapsregisteret (NLOD). Det åpne API-et gir de tre siste årene${L?.fravalg ? ' · Revisjon er fravalgt' : ''}. Lengre historikk krever at vi lagrer tallene år for år.</p></section>` : ''}
  ${ownershipPanel(id, name)}
  ${!demo ? rolesPanel(ro) : ''}`);
  wireCarousel($('#s-innsikt') || V);
  $$('[data-go]').forEach(a => a.addEventListener('click', () => $('#' + a.dataset.go)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  $('[data-ch]')?.addEventListener('click', e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    $$('[data-ch] .chip').forEach(x => x.classList.toggle('on', x === b));
    $('#chart').innerHTML = chart(ys, b.dataset.k);
  });
}

// ---------- Person og eiertre ----------
async function person(id) {
  await loadOwn();
  const p = E(id);
  if (!p || p.type !== 'person') { location.hash = '#/eiere'; return; }
  document.title = `${p.navn} – ddai`;
  const tree = buildTree(id), agg = aggregate(tree);
  const direct = holdingsOf(id).length, fn = first(p.navn);
  const open = new Set(), keyOf = n => n.chain.map(e => e.selskap).join('>');
  let selected = null, mode = 'tree';
  const find = (nodes, k) => { for (const n of nodes) { if (keyOf(n) === k) return n; const f = find(n.kids, k); if (f) return f; } };
  const all = (nodes, f) => nodes.forEach(n => { f(n); all(n.kids, f); });

  V.innerHTML = '';
  V.append(topbar(esc(p.navn)));
  V.insertAdjacentHTML('beforeend', `
  <section class="card co-head"><div class="big" style="background:var(--peach);color:var(--peach-ink);border-radius:50%">${esc(ini(p.navn))}</div><div style="flex:1"><h1>${esc(p.navn)}</h1>
    <div class="tags"><span class="tag">${ic('user')} Person</span><span class="tag">${esc(p.sted)}</span><span class="tag demo">${ic('info')} Eksempeldata</span></div>
    <p class="muted" style="margin-top:10px;font-size:13px">Eier noe i <b style="color:var(--fg)">${agg.size} selskaper</b> – ${direct} direkte og ${agg.size - direct} gjennom andre selskaper.</p></div></section>
  <section class="card panel"><div class="panel-h"><div><h2>Hva eier ${esc(fn)}?</h2><p>Trykk deg nedover i treet. Prosenten til høyre er ${esc(fn)}s andel – ganget gjennom alle ledd.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><div class="seg"><button data-m="tree" class="on">Eiertre</button><button data-m="list">Samlet oversikt</button></div><button class="btn" data-x>Utvid alle</button></div></div>
    <div id="pbox"></div><div id="tv"></div></section>`);

  const nodeHtml = (n, parent) => {
    const e = E(n.id), k = keyOf(n), has = n.kids.length, isOpen = open.has(k), tot = agg.get(n.id).total;
    return `<div class="node"><div class="nrow ${selected === k ? 'sel' : ''}" data-key="${k}">
      <span class="tg ${has ? (isOpen ? 'open' : '') : 'leaf'}">${ic('right')}</span><span class="av co">${esc(ini(e.navn))}</span>
      <div class="nm"><b>${esc(e.navn)}</b><span>${esc(parent)} eier ${pc(n.andel)}${has ? ` · eier selv ${n.kids.length} selskap${n.kids.length > 1 ? 'er' : ''}` : ''}</span></div>
      <div class="eff"><b class="num">${pc(n.eff)}</b><span>${esc(fn)} ${n.chain.length > 1 ? 'indirekte' : 'direkte'}${Math.abs(tot - n.eff) > 0.01 ? ` · totalt ${pc(tot)}` : ''}</span></div>
      <a class="btn" href="${entHref(n.id)}" data-open title="Åpne selskapet" style="padding:6px">${ic('ext')}</a></div>
      ${has && isOpen ? `<div class="kids">${n.kids.map(c => nodeHtml(c, e.navn)).join('')}</div>` : ''}</div>`;
  };
  const pathBox = () => {
    const n = selected && find(tree, selected);
    if (!n) return `<div class="pathbox">${ic('info')} Trykk på et selskap for å se regnestykket bak eierandelen.</div>`;
    const steps = n.chain.map(e => `<span class="ar">→ ${pc(e.andel)} →</span><span class="st">${esc(E(e.selskap).navn)}</span>`).join('');
    const formula = n.chain.length > 1 ? `<div style="width:100%;font-size:12px;margin-top:4px">${n.chain.map(e => pc(e.andel)).join(' × ')} = <b>${pc(n.eff)}</b></div>` : '';
    return `<div class="pathbox"><span class="st">${esc(p.navn)}</span>${steps}<span class="res">= ${pc(n.eff)}</span>${formula}</div>`;
  };
  const listHtml = () => `<table class="mini" style="margin-top:12px">${[...agg.values()].sort((a, b) => b.total - a.total).map(a => {
    const e = E(a.id), kinds = new Set(a.paths.map(x => (x.chain.length > 1 ? 'indirekte' : 'direkte')));
    return `<tr onclick="location.hash='${entHref(a.id)}'"><td><span style="display:flex;align-items:center;gap:10px"><span class="av co">${esc(ini(e.navn))}</span><span><b style="font-weight:600">${esc(e.navn)}</b><br><span class="muted" style="font-size:12px">${a.paths.map(x => x.chain.length > 1 ? `${pc(x.eff)} via ${x.chain.slice(0, -1).map(c => esc(E(c.selskap).navn)).join(' → ')}` : `${pc(x.eff)} direkte`).join(' · ')}</span></span></span></td>
      <td class="muted" style="font-weight:400;text-align:right">${[...kinds].join(' + ')}</td><td style="font-size:16px">${pc(a.total)}</td></tr>`;
  }).join('')}</table>`;
  const render = () => {
    $('#pbox').innerHTML = mode === 'tree' ? pathBox() : '';
    $('#tv').innerHTML = mode === 'tree' ? `<div class="tree"><div class="nrow" style="cursor:default;background:var(--muted)"><span class="av pe">${esc(ini(p.navn))}</span><div class="nm"><b>${esc(p.navn)}</b><span>${agg.size} selskaper totalt</span></div><div class="eff"><b>100 %</b><span>utgangspunkt</span></div></div><div class="node"><div class="kids">${tree.map(n => nodeHtml(n, fn)).join('')}</div></div></div>` : listHtml();
    $('[data-x]').style.display = mode === 'tree' ? '' : 'none';
  };
  $('#tv').addEventListener('click', e => {
    if (e.target.closest('[data-open]')) return;
    const r = e.target.closest('.nrow[data-key]'); if (!r) return;
    const k = r.dataset.key;
    if (open.has(k) && selected === k) open.delete(k); else open.add(k);
    selected = k; render();
  });
  $('.seg').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; $$('.seg button').forEach(x => x.classList.toggle('on', x === b)); render(); });
  $('[data-x]').addEventListener('click', e => {
    const any = open.size; open.clear();
    if (!any) all(tree, n => n.kids.length && open.add(keyOf(n)));
    e.target.textContent = any ? 'Utvid alle' : 'Lukk alle'; render();
  });
  render();
}

async function owners() {
  await loadOwn();
  document.title = 'Eiersøk – ddai';
  const people = Object.entries(OWN.enheter).filter(([, e]) => e.type === 'person');
  V.innerHTML = '';
  V.append(topbar('Eiersøk'));
  V.insertAdjacentHTML('beforeend', `
  <section class="card hero" style="padding:44px 24px 32px"><div class="lab" style="justify-content:center">${ic('tree')} Eiersøk</div>
    <h1 style="font-size:clamp(28px,4vw,44px);margin-top:10px">Hvem eier <span class="hl">hva</span>?</h1>
    <p class="lead" style="margin-bottom:22px">Søk på en person og se alt de eier – direkte og gjennom holdingselskaper. Vi regner ut den reelle andelen for deg.</p><div id="os" style="max-width:560px;margin:0 auto"></div></section>
  <section class="card panel"><div class="panel-h"><div><h2>Prøv eksempelet</h2><p>Eierdataene under er oppdiktet for å vise hvordan det fungerer</p></div><span class="tag demo">${ic('info')} Eksempeldata</span></div>
    <div class="roles" style="margin-top:14px">${people.map(([id, e]) => { const n = aggregate(buildTree(id)).size; return `<a class="person" href="#/person/${id}"><span class="av pe">${esc(ini(e.navn))}</span><div><b>${esc(e.navn)}</b><span>Eier i ${n} selskaper · ${esc(e.sted)}</span></div></a>`; }).join('')}
    <a class="person" href="#/selskap/935851076"><span class="av co">EE</span><div><b>Efjord Extreme AS</b><span>Se hvem som eier selskapet</span></div></a></div></section>`);
  $('#os').append(searchBox({ placeholder: 'Søk på en person, f.eks. Petter Sommerseth' }).el);
}

function about() {
  document.title = 'Om dataene – ddai';
  V.innerHTML = '';
  V.append(topbar('Om dataene'));
  V.insertAdjacentHTML('beforeend', `<section class="card panel" style="max-width:760px"><h2>Om dataene</h2><p>Hvor tallene i ddai kommer fra</p>
  <div class="legend" style="margin-top:14px">
    <div class="lg" style="cursor:default"><span class="sw" style="background:var(--pos)"></span><div><b>Enhetsregisteret</b><div class="via">Navn, adresse, bransje, ansatte, stiftelsesdato, navnehistorikk og roller. Åpent API, oppdatert fortløpende.</div></div><span class="tag">Live</span></div>
    <div class="lg" style="cursor:default"><span class="sw" style="background:var(--pos)"></span><div><b>Regnskapsregisteret</b><div class="via">Resultat og balanse for de tre siste årene. Utbytte er estimert som årsresultat minus endring i opptjent egenkapital.${LOCAL ? '' : ' Den publiserte demoen viser et lagret utdrag for selskapene i topplistene, fordi Regnskapsregisteret ikke kan kalles direkte fra nettleseren.'}</div></div><span class="tag">${LOCAL ? 'Live' : 'Utdrag'}</span></div>
    <div class="lg" style="cursor:default"><span class="sw" style="background:var(--brand)"></span><div><b>Topplister</b><div class="via">Et eksempelutvalg på ${TOP ? nf.format(TOP.selskaper.length) : 'ca. 1 400'} selskaper, bygget med scripts/build_toplists.py. Hele landet krever at alle regnskap lagres i en egen database.</div></div><span class="tag">Utvalg</span></div>
    <div class="lg" style="cursor:default"><span class="sw" style="background:oklch(75% .1 95)"></span><div><b>Eierskap</b><div class="via">Eksempeldata. Aksjonærregisteret må bestilles fra Skatteetaten som en årlig fil og vurderes opp mot personvern før det kan vises.</div></div><span class="tag demo">Eksempel</span></div>
  </div><p class="foot">Data fra Brønnøysundregistrene er lisensiert under Norsk lisens for offentlige data (NLOD).</p></section>`);
}

route();
