'use strict';
/* ddai – prototype. Åpne data fra Brønnøysundregistrene (NLOD) + eksempeldata for eierskap.
   Designsystem: Stetinden Studio (Inter Tight, #EF7140, glass, stjernefelt). */

// Adressen til Cloudflare-proxyen for Regnskapsregisteret (se proxy/). Tom = bruk lagret utdrag.
const PROXY = '';

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
function krShort(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return dec(v / 1e9) + ' mrd.';
  if (a >= 1e6) return dec(v / 1e6, a >= 1e8 ? 0 : 1) + ' mill.';
  if (a >= 1e4) return dec(v / 1e3, 0) + ' k';
  return nf.format(Math.round(v));
}
const pc = (v, d = 1) => (v == null || !isFinite(v) ? '–' : dec(v, d) + ' %');
const sgn = v => (v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + dec(Math.abs(v), 1) + ' %');
const chg = (a, b) => (a != null && b ? (a - b) / Math.abs(b) * 100 : null);
const arrow = v => (v == null ? '' : `<span class="${v >= 0 ? 'up' : 'dn'}">${v >= 0 ? '▲' : '▼'} ${dec(Math.abs(v), 1)} %</span>`);
const fmtOrg = o => String(o).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
const fmtDate = d => (d ? d.slice(0, 10).split('-').reverse().join('.') : '');
const UP = new Set(['AS', 'ASA', 'ANS', 'DA', 'SA', 'BA', 'NUF', 'KS', 'IKS', 'A/S', 'HF', 'IL', 'BKS']);
const nice = n => String(n || '').toLowerCase().split(' ').map(w => (UP.has(w.toUpperCase()) || (w.length <= 4 && /^[^aeiouyæøå\d]+$/.test(w)) ? w.toUpperCase() : w.replace(/(^|[-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()))).join(' ');
const ini = n => String(n || '').replace(/\b(AS|ASA|A\/S)\b/gi, '').trim().split(/\s+/).filter(w => /^[\p{L}\d]/u.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const first = n => String(n).split(' ')[0];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let timers = [];
const every = (fn, ms) => timers.push(setInterval(fn, ms));

// ---------- API ----------
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const getJSON = u => fetch(u, { headers: { Accept: 'application/json' } }).then(r => (r.ok ? r.json() : null)).catch(() => null);
async function api(p) {
  if (LOCAL) return getJSON('/api/' + p);
  const m = p.match(/^regnskapsregisteret\/regnskap\/(\d{9})$/);
  if (m) {
    if (PROXY) {
      try { const r = await fetch(`${PROXY}/regnskap/${m[1]}`); if (r.ok) return await r.json(); if (r.status === 404) return []; } catch (e) { /* faller tilbake */ }
    }
    return (await getJSON(`data/regnskap/${m[1]}.json`)) ?? { mangler: true };
  }
  return getJSON('https://data.brreg.no/' + p);
}

// ---------- Ikoner og illustrasjoner ----------
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', right: '<path d="m9 18 6-6-6-6"/>', left: '<path d="m15 18-6-6 6-6"/>',
  ext: '<path d="M7 17 17 7M8 7h9v9"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
  filter: '<path d="M3 5h18M6 12h12M10 19h4"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', check: '<path d="m5 12 5 5L20 7"/>',
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
const STAR = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 37 32 32 60 27 32Z"/><path d="M32 4 37 32 32 60 27 32Z" transform="rotate(90 32 32)"/></svg>';
const twinkles = pts => pts.map(([x, y, s, d]) => `<span class="tw" style="left:${x}%;top:${y}%;--s:${s}px;animation-delay:${d}s" aria-hidden="true">${STAR}</span>`).join('');

// Stjernefelt (samme tegneprimitiv som Stetinden)
const RM = matchMedia('(prefers-reduced-motion:reduce)').matches, G = '#cfcfcf', O = '#EF7140';
function star(cx, x, y, r, c) {
  const L = r * 2.3, w = L * .2; cx.fillStyle = c; cx.beginPath();
  cx.moveTo(x, y - L); cx.lineTo(x + w, y); cx.lineTo(x, y + L); cx.lineTo(x - w, y); cx.closePath();
  cx.moveTo(x - L, y); cx.lineTo(x, y - w); cx.lineTo(x + L, y); cx.lineTo(x, y + w); cx.closePath(); cx.fill();
}
const hs = (x, y) => { const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n); };
let FIELDS = [];
function mountCanvas(cv, draw) {
  const f = { cv, cx: cv.getContext('2d'), W: 0, H: 0, mx: null, my: null, vis: true, draw };
  f.size = () => { const D = Math.min(2, devicePixelRatio || 1); f.W = cv.clientWidth; f.H = cv.clientHeight; cv.width = f.W * D; cv.height = f.H * D; f.cx.setTransform(D, 0, 0, D, 0, 0); f.init?.(); };
  const host = cv.parentElement;
  host.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); f.mx = e.clientX - r.left; f.my = e.clientY - r.top; });
  host.addEventListener('pointerleave', () => { f.mx = f.my = null; });
  new IntersectionObserver(e => { f.vis = e[0].isIntersecting; }).observe(cv);
  FIELDS.push(f);
  return f;
}
function starField(cv, { mode = 'follow', sp = 12 } = {}) {
  const f = mountCanvas(cv, t => {
    const { cx, W, H } = f; cx.clearRect(0, 0, W, H);
    if (mode === 'follow') {
      const px = f.mx ?? W * .6 + Math.cos(t * .7) * W * .3, py = f.my ?? H * .55 + Math.sin(t * 1.1) * H * .3;
      for (let y = sp / 2; y < H; y += sp) for (let x = sp / 2; x < W; x += sp) {
        const k = Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * 80 * 80)), amb = .5 + .5 * Math.sin(t + x * .02 + y * .03);
        star(cx, x, y, .55 + amb * .3 + k * 1.9, k > .35 ? O : G);
      }
    } else {
      for (let y = sp / 2; y < H; y += sp) for (let x = sp / 2; x < W; x += sp) {
        const h = hs(x, y); let r = .45 + (Math.sin(t * 1.3 + y * .045 + x * .008) + 1) * .6, col = G;
        if (h > .985 && Math.sin(t * 3 + h * 90) > .85) { r = 1.8; col = O; }
        if (f.mx != null) { const k = Math.exp(-((x - f.mx) ** 2 + (y - f.my) ** 2) / (2 * 70 * 70)); r += k * 1.4; if (k > .4) col = O; }
        star(cx, x, y, r, col);
      }
    }
  });
  f.size(); if (RM) f.draw(2);
  return f;
}
// Konstellasjon – brukt som illustrasjon for eiernettverk
function constellation(cv) {
  let nodes = [], pulses = [], last = 0;
  const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(42);
  const f = mountCanvas(cv, t => {
    const { cx, W, H } = f; cx.clearRect(0, 0, W, H);
    const Pp = nodes.map(n => [n.x + Math.sin(t * .35 + n.ph) * n.ax, n.y + Math.cos(t * .3 + n.ph * 1.3) * n.ay]), D = 150;
    cx.lineWidth = .7;
    for (let i = 0; i < Pp.length; i++) for (let j = i + 1; j < Pp.length; j++) {
      const d = Math.hypot(Pp[i][0] - Pp[j][0], Pp[i][1] - Pp[j][1]);
      if (d < D) { cx.strokeStyle = `rgba(130,135,145,${(1 - d / D) * .5})`; cx.beginPath(); cx.moveTo(...Pp[i]); cx.lineTo(...Pp[j]); cx.stroke(); }
    }
    if (f.mx != null) Pp.forEach(p => { const d = Math.hypot(p[0] - f.mx, p[1] - f.my); if (d < 180) { cx.strokeStyle = `rgba(239,113,64,${(1 - d / 180) * .85})`; cx.beginPath(); cx.moveTo(...p); cx.lineTo(f.mx, f.my); cx.stroke(); } });
    if (!RM && t - last > 1.3) { last = t; const i = Math.floor(rnd() * Pp.length); let b = -1, bd = D; Pp.forEach((p, j) => { const d = Math.hypot(p[0] - Pp[i][0], p[1] - Pp[i][1]); if (j !== i && d < bd) { bd = d; b = j; } }); if (b >= 0) pulses.push({ a: i, b, t0: t }); }
    pulses = pulses.filter(p => t - p.t0 < 1.7);
    pulses.forEach(p => { const k = (t - p.t0) / 1.7, a = Pp[p.a], b = Pp[p.b]; star(cx, a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 1.4, O); });
    nodes.forEach((n, i) => { const p = Pp[i], m = f.mx != null ? Math.exp(-((p[0] - f.mx) ** 2 + (p[1] - f.my) ** 2) / (2 * 90 * 90)) : 0; star(cx, p[0], p[1], n.s * (1 + .25 * Math.sin(t * 1.6 + n.ph)) + m * 3.2, m > .3 || n.or ? O : '#8a8f98'); });
  });
  f.init = () => { const n = Math.max(16, Math.round(f.W / 40)); nodes = Array.from({ length: n }, () => ({ x: rnd() * f.W, y: f.H * .1 + rnd() * f.H * .8, s: 1.6 + rnd() * 3.2, ph: rnd() * 6.28, or: rnd() < .2, ax: 6 + rnd() * 16, ay: 6 + rnd() * 16 })); };
  f.size(); if (RM) f.draw(2);
  return f;
}
addEventListener('resize', () => FIELDS.forEach(f => f.size()));
if (!RM) (function loop(ms) { const t = ms / 1000; FIELDS = FIELDS.filter(f => f.cv.isConnected); FIELDS.forEach(f => f.vis && f.draw(t)); requestAnimationFrame(loop); })(0);

// ---------- Avsløring ved scroll og tellere ----------
let io;
function reveal(root = document) {
  io ??= new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target; el.classList.add('in'); io.unobserve(el);
    const sp = $('[data-n]', el);
    if (sp) { const N = +sp.dataset.n, t0 = performance.now(); (function f(t) { const p = Math.min(1, (t - t0) / 2200), e2 = 1 - Math.pow(1 - p, 3); sp.textContent = nf.format(Math.round(N * e2)); if (p < 1) requestAnimationFrame(f); })(t0); }
  }), { threshold: .12 });
  $$('.rv,.lab,.kpi-big', root).forEach(el => io.observe(el));
}

// ---------- Tooltips ----------
const TIP = $('#tip');
let tipEl = null;
function tipShow(el) {
  const t = el.dataset.tip; if (!t) return;
  TIP.innerHTML = (el.dataset.tipT ? `<b>${esc(el.dataset.tipT)}</b>` : '') + esc(t).replace(/\n/g, '<br>');
  TIP.classList.add('on'); tipEl = el; el.setAttribute('aria-describedby', 'tip');
  const r = el.getBoundingClientRect(), w = TIP.offsetWidth, h = TIP.offsetHeight;
  let x = r.left + r.width / 2 - w / 2; x = Math.max(8, Math.min(innerWidth - w - 8, x));
  let y = r.top - h - 10; if (y < 70) y = r.bottom + 10;
  TIP.style.left = x + 'px'; TIP.style.top = y + 'px';
}
function tipHide() { tipPinned = false; TIP.classList.remove('on'); if (tipEl) { tipEl.removeAttribute('aria-describedby'); if (tipEl.matches('.info')) tipEl.setAttribute('aria-expanded', 'false'); } tipEl = null; }
let tipPinned = false; // åpnet med klikk/trykk – blir stående til man klikker et annet sted
document.addEventListener('pointerover', e => {
  if (e.pointerType === 'touch' || tipPinned) return;
  const t = e.target.closest?.('[data-tip]');
  if (t && t !== tipEl) tipShow(t); else if (!t && tipEl) tipHide();
});
document.addEventListener('focusin', e => { const t = e.target.closest?.('[data-tip]'); if (t && !tipPinned) tipShow(t); });
document.addEventListener('focusout', () => { if (!tipPinned) tipHide(); });
document.addEventListener('click', e => {
  const t = e.target.closest('button.info');
  if (t) {
    e.preventDefault();
    if (tipPinned && tipEl === t) { tipPinned = false; tipHide(); return; }
    tipPinned = false; tipShow(t); tipPinned = true; t.setAttribute('aria-expanded', 'true');
  } else if (tipEl && !e.target.closest('[data-tip]')) { tipPinned = false; tipHide(); }
});
addEventListener('scroll', () => { if (tipEl) { tipPinned = false; tipHide(); } }, { passive: true });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && tipEl) { tipPinned = false; tipHide(); } });

// Forklaringer (som Proff sine «i»-ikoner)
const GL = {
  salg: 'Inntekter fra salg av varer og tjenester i selskapets vanlige virksomhet.',
  rev: 'Alle inntekter fra den ordinære driften: salgsinntekter pluss andre driftsinntekter, som leieinntekter og gevinst ved salg av driftsmidler. Ofte kalt omsetning.',
  wage: 'Lønn, feriepenger, arbeidsgiveravgift, pensjon og andre ytelser til de ansatte.',
  cost: 'Alle kostnader knyttet til driften: varekjøp, lønn, avskrivninger og andre driftskostnader.',
  op: 'Driftsinntekter minus driftskostnader. Viser hva selskapet tjener på selve driften, før renter, finansposter og skatt.',
  finInn: 'Renteinntekter, utbytte fra andre selskaper, valutagevinster og lignende.',
  finKost: 'Rentekostnader på lån, valutatap og nedskrivning av finansielle eiendeler.',
  pre: 'Driftsresultat pluss netto finansposter. Det selskapet tjente før skatten er trukket fra.',
  tax: 'Beregnet skatt på årets resultat, inkludert endring i utsatt skatt. Er ikke nødvendigvis det som faktisk ble betalt i året.',
  net: 'Bunnlinja: det som er igjen etter alle kostnader og skatt. Kan deles ut som utbytte eller beholdes i selskapet.',
  div: 'Vårt anslag: årsresultat minus økningen i opptjent egenkapital. Kan avvike fra faktisk utbytte hvis det har vært konsernbidrag, fusjoner eller andre bevegelser i egenkapitalen.',
  anlegg: 'Eiendeler som skal brukes over lang tid, som bygninger, maskiner, programvare og langsiktige investeringer.',
  varer: 'Verdien av varelageret: råvarer, varer under arbeid og ferdigvarer.',
  fordr: 'Penger selskapet har til gode, for eksempel fra kunder som ikke har betalt ennå.',
  bank: 'Penger på konto og i kasse ved årsslutt.',
  omlop: 'Eiendeler som ventes brukt eller gjort om til penger innen ett år: varer, fordringer og kontanter.',
  ass: 'Alt selskapet eier til sammen. Er alltid lik summen av egenkapital og gjeld.',
  innskutt: 'Penger eierne har skutt inn i selskapet, som aksjekapital og overkurs.',
  opptjent: 'Overskudd som er tjent opp over tid og holdt tilbake i selskapet – eller tap som har spist av egenkapitalen.',
  eq: 'Eiernes del av selskapet: innskutt pluss opptjent egenkapital. Det som ville vært igjen om all gjeld ble betalt.',
  lang: 'Gjeld som forfaller om mer enn ett år, for eksempel banklån og obligasjoner.',
  kort: 'Gjeld som forfaller innen ett år: leverandørgjeld, skyldige avgifter, betalbar skatt og avsatt utbytte.',
  gjeld: 'Langsiktig og kortsiktig gjeld til sammen.',
  r_margin: 'Driftsresultat delt på driftsinntekter. Hvor mange øre av hver krone i omsetning som blir igjen fra driften.',
  r_nm: 'Årsresultat delt på driftsinntekter. Hvor mye av omsetningen som blir igjen helt nederst.',
  r_ek: 'Egenkapital delt på sum eiendeler. Et mål på soliditet – hvor godt selskapet tåler tap. Over 30 % regnes ofte som solid.',
  r_tkr: '(Resultat før skatt + finanskostnader) delt på sum eiendeler. Hvor godt selskapet forrenter alt det eier, uansett hvordan det er finansiert.',
  r_ekr: 'Årsresultat delt på egenkapital. Avkastningen eierne får på pengene som står i selskapet.',
  r_lik: 'Omløpsmidler delt på kortsiktig gjeld. Over 1 betyr at kortsiktig gjeld kan dekkes av eiendeler som snart blir penger. Ofte ønsker man over 1,5.',
  r_lonn: 'Hvor stor del av driftsinntektene som går til lønn og andre personalkostnader.',
};
const info = (k, title) => (GL[k] ? `<button class="info" type="button" aria-label="Hva betyr ${esc(title)}?" aria-expanded="false" data-tip-t="${esc(title)}" data-tip="${esc(GL[k])}">i</button>` : '');

// ---------- Data ----------
let TOP, OWN;
const loadTop = async () => (TOP ??= await fetch('data/toplists.json').then(r => r.json()));
const loadOwn = async () => (OWN ??= await fetch('data/ownership.json').then(r => r.json()));
const E = id => OWN.enheter[id];
const ownersOf = id => OWN.eierskap.filter(e => e.selskap === id);
const holdingsOf = id => OWN.eierskap.filter(e => e.eier === id);
const entHref = id => (E(id)?.type === 'person' ? `#/person/${id}` : `#/selskap/${id}`);
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
  for (const u of ultimate(id)) { const x = g.get(u.person) || { person: u.person, pct: 0, paths: [] }; x.pct += u.pct; x.paths.push(u); g.set(u.person, x); }
  return [...g.values()].sort((a, b) => b.pct - a.pct);
}
function buildTree(id, mult = 1, chain = [], seen = new Set([id])) {
  return holdingsOf(id).filter(e => !seen.has(e.selskap)).map(e => {
    const m = mult * e.andel / 100, ch = [...chain, e];
    return { id: e.selskap, andel: e.andel, eff: m * 100, chain: ch, kids: buildTree(e.selskap, m, ch, new Set([...seen, e.selskap])) };
  });
}
function aggregate(nodes, map = new Map()) {
  for (const n of nodes) { const x = map.get(n.id) || { id: n.id, total: 0, paths: [] }; x.total += n.eff; x.paths.push(n); map.set(n.id, x); aggregate(n.kids, map); }
  return map;
}

// Nylig besøkt (bare i denne nettleseren)
const RK = 'ddai.recent';
const recent = {
  get() { try { return JSON.parse(localStorage.getItem(RK)) || []; } catch (e) { return []; } },
  add(x) { try { localStorage.setItem(RK, JSON.stringify([x, ...recent.get().filter(y => y.href !== x.href)].slice(0, 6))); } catch (e) { /* privat modus */ } },
};

// ---------- Søk ----------
const EXAMPLES = [
  { href: '#/selskap/935851076', title: 'Efjord Extreme AS', sub: 'Eksempel med eiere og innsikt', kind: 'co' },
  { href: '#/person/p-petter', title: 'Petter Sommerseth', sub: 'Eiertre · eksempeldata', kind: 'pe' },
  { href: '#/selskap/923609016', title: 'Equinor ASA', sub: 'Stavanger', kind: 'co' },
  { href: '#/selskap/918298037', title: 'Proff AS', sub: 'Oslo', kind: 'co' },
];
async function searchAll(q) {
  await loadOwn();
  const ql = q.toLowerCase(), out = [];
  for (const [id, e] of Object.entries(OWN.enheter)) {
    if (e.ekte || !e.navn.toLowerCase().includes(ql)) continue;
    const pe = e.type === 'person';
    out.push({ sec: pe ? 'Personer' : 'Eksempelselskaper', href: entHref(id), title: e.navn, kind: pe ? 'pe' : 'co', sub: pe ? `Eier i ${aggregate(buildTree(id)).size} selskaper · eksempeldata` : `Eksempelselskap · ${e.sted}` });
  }
  const d = q.replace(/\s/g, '');
  const r = await api(/^\d{9}$/.test(d) ? `enhetsregisteret/api/enheter?organisasjonsnummer=${d}` : `enhetsregisteret/api/enheter?navn=${encodeURIComponent(q)}&size=7`);
  const cos = (r?._embedded?.enheter || []).map(e => ({ sec: 'Selskaper', href: `#/selskap/${e.organisasjonsnummer}`, title: nice(e.navn), kind: 'co',
    sub: [fmtOrg(e.organisasjonsnummer), e.organisasjonsform?.kode, nice(e.forretningsadresse?.poststed || e.postadresse?.poststed || '')].filter(Boolean).join(' · ') }));
  return [...out.filter(x => x.kind === 'pe'), ...cos, ...out.filter(x => x.kind === 'co')];
}
function makeSearch({ mode = 'hero', placeholder = 'Søk på selskap, org.nr eller person' } = {}) {
  const w = document.createElement('div');
  w.className = 'search';
  const id = 'sr' + Math.random().toString(36).slice(2, 7);
  w.innerHTML = `<div class="sbox glass-hi">${ic('search')}<input type="search" autocomplete="off" spellcheck="false" placeholder="${esc(placeholder)}" aria-label="Søk" role="combobox" aria-expanded="false" aria-controls="${id}" aria-autocomplete="list">${mode === 'hero' ? '<button class="go" type="button">Søk</button>' : '<span class="kbd">Esc</span>'}</div><div class="drop" id="${id}" role="listbox" ${mode === 'palette' ? '' : 'hidden'}></div>`;
  const inp = $('input', w), drop = $('.drop', w);
  let items = [], act = -1, t, seq = 0;
  const render = () => {
    let sec = '';
    drop.innerHTML = items.length ? items.map((x, i) => (x.sec !== sec ? `<div class="sec-h">${esc((sec = x.sec))}</div>` : '') +
      `<a class="it ${i === act ? 'act' : ''}" href="${x.href}" role="option" id="${id}-${i}" aria-selected="${i === act}"><span class="av ${x.kind}">${esc(ini(x.title))}</span><div><b>${esc(x.title)}</b><span class="s">${esc(x.sub)}</span></div><span class="go-i">${ic('arrow')}</span></a>`).join('')
      : `<div class="empty">Ingen treff på «${esc(inp.value.trim())}». Prøv et annet navn eller et organisasjonsnummer.</div>`;
    drop.hidden = false; inp.setAttribute('aria-expanded', 'true');
    if (act >= 0) { inp.setAttribute('aria-activedescendant', `${id}-${act}`); $(`#${id}-${act}`)?.scrollIntoView({ block: 'nearest' }); }
  };
  const suggest = () => {
    const rc = recent.get().map(x => ({ ...x, sec: 'Nylig besøkt' }));
    items = [...rc, ...EXAMPLES.filter(x => !rc.some(r => r.href === x.href)).map(x => ({ ...x, sec: 'Prøv' }))]; act = -1; render();
  };
  const run = async () => {
    const q = inp.value.trim(), my = ++seq;
    if (q.length < 2) { suggest(); return; }
    drop.hidden = false;
    const res = await searchAll(q);
    if (my !== seq) return;
    items = res; act = res.length ? 0 : -1; render();
  };
  const go = x => { if (!x) return; closePalette(); location.hash = x.href; };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 160); });
  inp.addEventListener('focus', () => { if (!inp.value.trim()) suggest(); else if (items.length) drop.hidden = false; });
  if (mode !== 'palette') inp.addEventListener('blur', () => setTimeout(() => { drop.hidden = true; inp.setAttribute('aria-expanded', 'false'); }, 160));
  inp.addEventListener('keydown', async e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; act = (act + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (inp.value.trim().length > 1 && !items.length) await run(); go(items[Math.max(act, 0)]); }
    else if (e.key === 'Escape') { if (mode === 'palette') closePalette(); else { drop.hidden = true; inp.blur(); } }
  });
  drop.addEventListener('click', e => { if (e.target.closest('.it')) closePalette(); });
  $('.go', w)?.addEventListener('click', async () => { if (inp.value.trim().length < 2) return inp.focus(); await run(); go(items[0]); });
  if (mode === 'palette') suggest();
  return { el: w, input: inp };
}

// Kommandopalett (⌘K / Ctrl+K / «/»)
const CMDK = $('#cmdk');
function openPalette() {
  const s = makeSearch({ mode: 'palette' });
  $('#cmdk-panel').replaceChildren(s.el);
  s.el.insertAdjacentHTML('beforeend', '<div class="foot-h glass" style="border-radius:0 0 4px 4px;border-top:0"><span>↑↓ for å velge</span><span>↵ for å åpne</span><span>Esc for å lukke</span></div>');
  $('.drop', s.el).style.borderRadius = '0';
  CMDK.classList.add('open'); document.body.style.overflow = 'hidden';
  setTimeout(() => s.input.focus(), 30);
}
function closePalette() { if (!CMDK.classList.contains('open')) return; CMDK.classList.remove('open'); document.body.style.overflow = ''; }
CMDK.addEventListener('mousedown', e => { if (e.target === CMDK) closePalette(); });
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); CMDK.classList.contains('open') ? closePalette() : openPalette(); }
  else if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openPalette(); }
});
$$('[data-cmdk],[data-cmdk-link]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); openPalette(); }));
$$('[data-kbd]').forEach(k => (k.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'));

// Header: fremdrift, krymping, mobilmeny
const prog = $('.prog');
const onScroll = () => { const H = document.documentElement.scrollHeight - innerHeight; prog.style.transform = `scaleX(${scrollY / (H || 1)})`; document.body.classList.toggle('scr', scrollY > 40); };
addEventListener('scroll', onScroll, { passive: true });
const mb = $('[data-menu]');
mb.addEventListener('click', () => { const o = document.body.classList.toggle('menu'); mb.setAttribute('aria-expanded', o); $('span', mb).textContent = o ? 'Lukk' : 'Meny'; });
const closeMenu = () => { document.body.classList.remove('menu'); mb.setAttribute('aria-expanded', 'false'); $('span', mb).textContent = 'Meny'; };
$$('.mnav a').forEach(a => a.addEventListener('click', closeMenu));

// ---------- Router ----------
let firstRoute = true, pageAC = new AbortController();
// Lyttere på #view som hører til én side – fjernes når man navigerer videre
const onV = (type, fn) => V.addEventListener(type, fn, { signal: pageAC.signal });
function parseHash() { const h = location.hash.slice(1) || '/'; const [path, qs] = h.split('?'); return { path: path || '/', q: new URLSearchParams(qs || '') }; }
async function route() {
  timers.forEach(clearInterval); timers = []; tipHide(); closePalette(); closeMenu();
  pageAC.abort(); pageAC = new AbortController();
  const { path, q } = parseHash();
  const seg = path.split('/').filter(Boolean);
  $$('.hd nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === (seg[0] === 'person' ? 'eiere' : seg[0])));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (!firstRoute) V.focus({ preventScroll: true });
  firstRoute = false;
  if (!seg.length) await home();
  else if (seg[0] === 'topplister') await toplists(q);
  else if (seg[0] === 'selskap' && seg[1]) await company(seg[1]);
  else if (seg[0] === 'person' && seg[1]) await person(seg[1]);
  else if (seg[0] === 'eiere') await owners();
  else if (seg[0] === 'om') about();
  else await home();
  reveal(V); onScroll();
}
addEventListener('hashchange', route);

// ---------- Topplister: data ----------
const PRESETS = [
  { k: 'lonnsom', t: 'Mest lønnsomme', s: 'Høyest driftsmargin', v: y => (y.rev > 0 && y.op != null ? y.op / y.rev * 100 : null), f: v => pc(v), dir: -1, min: 10e6, sub: y => 'Driftsresultat ' + kr(y.op) },
  { k: 'tjente', t: 'Tjente mest', s: 'Høyest årsresultat', v: y => y.net, f: kr, dir: -1, sub: y => 'Omsetning ' + kr(y.rev) },
  { k: 'tapte', t: 'Tapte mest', s: 'Lavest årsresultat', v: y => y.net, f: kr, dir: 1, sub: y => 'Omsetning ' + kr(y.rev) },
  { k: 'utbytte', t: 'Størst utbytte', s: 'Estimert fra regnskapet', v: y => y.div || null, f: kr, dir: -1, sub: y => (y.net > 0 && y.div ? pc(y.div / y.net * 100, 0) + ' av årsresultatet' : '') },
  { k: 'ek', t: 'Mest egenkapital', s: 'Størst sum egenkapital', v: y => y.eq, f: kr, dir: -1, sub: y => (y.ass ? 'Egenkapitalandel ' + pc(y.eq / y.ass * 100, 0) : '') },
  { k: 'oms', t: 'Størst omsetning', s: 'Sum driftsinntekter', v: y => y.rev, f: kr, dir: -1, sub: y => 'Årsresultat ' + kr(y.net) },
  { k: 'vekst', t: 'Raskest vekst', s: 'Omsetningsvekst fra året før', v: (y, p) => (p && p.rev >= 1e7 && y.rev != null ? (y.rev / p.rev - 1) * 100 : null), f: sgn, dir: -1, min: 10e6, sub: y => 'Omsetning ' + kr(y.rev) },
  { k: 'solid', t: 'Mest solide', s: 'Høyest egenkapitalandel', v: y => (y.ass > 0 && y.eq != null ? y.eq / y.ass * 100 : null), f: v => pc(v), dir: -1, min: 10e6, sub: y => 'Egenkapital ' + kr(y.eq) },
  { k: 'ansatte', t: 'Flest ansatte', s: 'Fra Enhetsregisteret', v: (y, p, c) => c.ansatte || null, f: v => nf.format(v), dir: -1, sub: y => 'Omsetning ' + kr(y.rev) },
];
const FYLKER = ['Oslo', 'Akershus', 'Østfold', 'Buskerud', 'Vestfold', 'Telemark', 'Agder', 'Rogaland', 'Vestland', 'Møre og Romsdal', 'Trøndelag', 'Nordland', 'Troms', 'Finnmark', 'Innlandet'];
const SECTIONS = [['A', 1, 3, 'Jordbruk, skogbruk og fiske'], ['B', 5, 9, 'Bergverk og utvinning'], ['C', 10, 33, 'Industri'], ['D', 35, 35, 'Kraftforsyning'], ['E', 36, 39, 'Vann, avløp og renovasjon'], ['F', 41, 43, 'Bygg og anlegg'], ['G', 45, 47, 'Varehandel'], ['H', 49, 53, 'Transport og lagring'], ['I', 55, 56, 'Overnatting og servering'], ['J', 58, 63, 'Informasjon og kommunikasjon'], ['K', 64, 66, 'Finans og forsikring'], ['L', 68, 68, 'Eiendom'], ['M', 69, 75, 'Faglig og teknisk tjenesteyting'], ['N', 77, 82, 'Forretningsmessig tjenesteyting'], ['O', 84, 84, 'Offentlig administrasjon'], ['P', 85, 85, 'Undervisning'], ['Q', 86, 88, 'Helse og sosial'], ['R', 90, 93, 'Kultur og fritid'], ['S', 94, 96, 'Annen tjenesteyting']];
const sect = code => { const d = parseInt(code); const s = SECTIONS.find(x => d >= x[1] && d <= x[2]); return s ? s[0] : ''; };
const ANS = { '': [0, Infinity], a: [0, 9], b: [10, 49], c: [50, 249], d: [250, 999], e: [1000, Infinity] };
const ANS_T = { a: '0–9 ansatte', b: '10–49 ansatte', c: '50–249 ansatte', d: '250–999 ansatte', e: '1000+ ansatte' };
const MIN_T = { 1e6: 'Over 1 mill.', 1e7: 'Over 10 mill.', 1e8: 'Over 100 mill.', 1e9: 'Over 1 mrd.' };
function rankRows(o) {
  const p = PRESETS.find(x => x.k === o.liste) || PRESETS[0];
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
  const dir = +o.dir || p.dir;
  rows.sort((a, b) => (dir < 0 ? b.v - a.v : a.v - b.v));
  return { p, rows: rows.slice(0, o.n), total: rows.length };
}
const sel = (name, opts, cur, label) => `<span class="sel"><select data-f="${name}" aria-label="${esc(label)}">${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></span>`;

// ---------- Forside ----------
async function home() {
  document.title = 'ddai – alt om norske selskaper';
  const words = ['Alt', 'om', 'norske', 'selskaper,', 'enkelt', 'forklart.'];
  V.innerHTML = `
  <section class="hero" aria-labelledby="h-hero"><canvas class="field" aria-hidden="true"></canvas>
    ${twinkles([[12, 24, 16, 0], [86, 18, 12, -2], [78, 72, 18, -4], [18, 76, 10, -1], [50, 12, 9, -3]])}
    <div class="wrap">
      <div class="eb glass-hi"><i></i><span id="live">Åpne data fra Brønnøysundregistrene</span></div>
      <h1 class="h1" id="h-hero" aria-label="${words.join(' ')}">${words.map((w, i) => `<span class="w" aria-hidden="true"><span class="wi" style="--i:${i}">${w}</span></span>`).join(' ')}</h1>
      <p class="lead">Søk blant alle norske virksomheter. Se regnskap, eiere og topplister – med forklaringer på det som er vanskelig.</p>
      <div id="hs"></div>
      <div class="tries"><span>Prøv:</span>${EXAMPLES.map(x => `<a class="chip" href="${x.href}">${x.kind === 'pe' ? ic('user') : ''}${esc(x.title)}</a>`).join('')}</div>
    </div>
    <a class="scroll-cue" href="javascript:void 0" data-scroll="#tl-prev" aria-label="Gå til topplister">Utforsk<i></i></a>
  </section>
  <section class="sec" id="tl-prev"><div class="wrap">
    <div class="lab">Topplister</div>
    <div class="block-h"><h2 class="h2 rv">Hvem tjener mest<br>der du bor?</h2>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap" class="rv">${sel('fy', [['', 'Hele landet'], ...FYLKER.map(f => [f, f])], '', 'Velg fylke')}<a class="btn" href="#/topplister">Alle topplister ${ic('arrow')}</a></div></div>
    <div class="grid3 tl-prev" id="tlp"></div>
  </div></section>
  <section class="sec alt"><div class="wrap">
    <div class="lab">I tall</div>
    <div class="kpis">
      <div class="kpi-big glass"><div class="n num"><span data-n="1182031" id="n-tot">0</span></div><div class="bar"><i></i></div><p>virksomheter i Enhetsregisteret akkurat nå</p></div>
      <div class="kpi-big glass"><div class="n num"><span data-n="1447">0</span></div><div class="bar"><i></i></div><p>selskaper med regnskap i topplistene</p></div>
      <div class="kpi-big glass"><div class="n num"><span data-n="15">0</span><small>fylker</small></div><div class="bar"><i></i></div><p>å sammenligne – ned på kommunenivå</p></div>
    </div>
  </div></section>
  <section class="sec"><div class="wrap feat">
    <div><div class="lab">Eiersøk</div><h2 class="h2 rv">Se hvem som <span style="color:var(--ac)">egentlig</span> eier.</h2>
      <p class="lead rv" style="margin-top:20px">Søk på en person og følg eierskapet gjennom holdingselskapene. Vi regner ut den reelle andelen for deg: eier du 50 % av et selskap som eier 50 % av et annet, eier du 25 %.</p>
      <div class="rv" style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn solid" href="#/person/p-petter">Se eksempelet ${ic('arrow')}</a><a class="btn ghost" href="#/eiere">Slik fungerer eiersøk</a></div></div>
    <div class="feat-vis rv"><canvas aria-hidden="true"></canvas></div>
  </div></section>
  <section class="sec alt"><div class="wrap">
    <div class="lab">Slik fungerer det</div>
    <div class="sv">
      <div class="rv"><span>01</span><h3>Søk</h3><p>Finn et selskap på navn eller organisasjonsnummer – eller søk på en person for å se hva de eier.</p></div>
      <div class="rv"><span>02</span><h3>Forstå</h3><p>Hvert tall har en forklaring. Innsiktskortene oversetter regnskapet til korte, konkrete fakta.</p></div>
      <div class="rv"><span>03</span><h3>Sammenlign</h3><p>Topplistene viser hvem som tjener mest, tapte mest og tok ut mest utbytte – i hele landet eller i din kommune.</p></div>
    </div>
  </div></section>`;
  starField($('.hero .field'), { mode: 'follow', sp: 12 });
  constellation($('.feat-vis canvas'));
  const s = makeSearch({ mode: 'hero', placeholder: 'Søk på selskap, org.nr eller person …' });
  $('#hs').append(s.el);
  const ph = ['Søk på selskap, org.nr eller person …', 'Prøv «Efjord Extreme»', 'Prøv «Petter Sommerseth»', 'Prøv «923 609 016»'];
  let pi = 0;
  every(() => { if (document.activeElement !== s.input && !s.input.value) s.input.placeholder = ph[(pi = (pi + 1) % ph.length)]; }, 2800);
  $('[data-scroll]').addEventListener('click', () => $('#tl-prev').scrollIntoView({ behavior: 'smooth' }));
  api('enhetsregisteret/api/enheter?size=1').then(d => {
    const n = d?.page?.totalElements; if (!n) return;
    $('#live') && ($('#live').textContent = `${nf.format(n)} virksomheter · åpne data fra Brønnøysund`);
    const el = $('#n-tot'); if (el) { el.dataset.n = n; if (el.closest('.in')) el.textContent = nf.format(n); }
  });
  await loadTop();
  const fySel = $('#tl-prev select');
  let fy = ''; try { fy = localStorage.getItem('ddai.fylke') || ''; } catch (e) { /* */ }
  fySel.value = fy;
  const renderPrev = () => {
    const base = { fylke: fy, kommune: '', bransje: '', ans: '', form: '', dir: 0, år: '2025', n: 5 };
    $('#tlp').innerHTML = [['lonnsom', 1e7], ['utbytte', 0], ['tjente', 0]].map(([k, min]) => {
      const { p, rows } = rankRows({ ...base, liste: k, min });
      const qs = new URLSearchParams({ liste: k, ...(fy ? { fylke: fy } : {}) });
      return `<article class="card glass rv in"><div class="vt">${esc(p.s)}</div><h3>${esc(p.t)}<a class="lnk" style="font-size:13px" href="#/topplister?${qs}">Se alle</a></h3>
        ${rows.map((r, i) => `<a class="mrow" href="#/selskap/${r.c.org}"><span class="n">${i + 1}</span><b>${esc(nice(r.c.navn))}</b><span class="v num">${p.f(r.v)}</span></a>`).join('') || '<p class="muted">Ingen treff.</p>'}</article>`;
    }).join('');
  };
  fySel.addEventListener('change', () => { fy = fySel.value; try { localStorage.setItem('ddai.fylke', fy); } catch (e) { /* */ } renderPrev(); });
  renderPrev();
}

// ---------- Topplister-side ----------
async function toplists(q) {
  await loadTop();
  const st = {
    liste: q.get('liste') || 'lonnsom', fylke: q.get('fylke') || '', kommune: q.get('kommune') || '', bransje: q.get('bransje') || '',
    år: q.get('år') || '2025', ans: q.get('ans') || '', form: q.get('form') || '', dir: +q.get('dir') || 0, n: +q.get('n') || 25,
  };
  const p0 = PRESETS.find(x => x.k === st.liste) || PRESETS[0];
  st.liste = p0.k;
  st.min = q.has('min') ? +q.get('min') : p0.min || 0;
  let open = false;
  V.innerHTML = `
  <section class="ph"><canvas class="field" aria-hidden="true"></canvas><div class="wrap"><div class="lab nl">Topplister</div><div id="tl-h"></div></div></section>
  <div class="wrap" style="padding-bottom:110px">
    <div class="lists" role="tablist" aria-label="Velg toppliste">${PRESETS.map(x => `<button class="chip" role="tab" data-l="${x.k}">${esc(x.t)}</button>`).join('')}</div>
    <div class="tb glass" id="tb"></div>
    <div class="fpanel glass" id="fp" hidden></div>
    <div class="active-f" id="af"></div>
    <p class="sr" aria-live="polite" id="cnt"></p>
    <div class="rows" id="rows"></div>
    <div id="more" style="text-align:center;margin-top:24px"></div>
    <p class="note">${ic('clock')} <span>Eksempelutvalg på ${nf.format(TOP.selskaper.length)} selskaper: de største og et utvalg mellomstore i hvert fylke, hentet ${fmtDate(TOP.generert)}. Utbytte er estimert som årsresultat minus endring i opptjent egenkapital.</span></p>
  </div>`;
  starField($('.ph .field'), { mode: 'breathe', sp: 11 });
  const sync = () => {
    const o = new URLSearchParams();
    Object.entries({ liste: st.liste, fylke: st.fylke, kommune: st.kommune, bransje: st.bransje, år: st.år !== '2025' && st.år, ans: st.ans, form: st.form, dir: st.dir || '', n: st.n !== 25 && st.n }).forEach(([k, v]) => v && o.set(k, v));
    const p = PRESETS.find(x => x.k === st.liste); if (st.min !== (p.min || 0)) o.set('min', st.min);
    history.replaceState(null, '', '#/topplister?' + o);
  };
  const render = () => {
    const { p, rows, total } = rankRows(st);
    const max = Math.max(...rows.map(r => Math.abs(r.v)), 1);
    const where = st.kommune || st.fylke || 'hele Norge';
    document.title = `${p.t} i ${where} – ddai`;
    $('#tl-h').innerHTML = `<h1 class="h1" style="font-size:clamp(40px,5.8vw,88px)">${esc(p.t)}<br><span class="muted">i ${esc(where)}</span></h1><p class="lead" style="margin-top:20px">${esc(p.s)} · regnskapsår ${st.år}.</p>`;
    $$('[data-l]').forEach(b => { b.classList.toggle('on', b.dataset.l === st.liste); b.setAttribute('aria-selected', b.dataset.l === st.liste); });
    const kommuner = [...new Set(TOP.selskaper.filter(c => !st.fylke || c.fylke === st.fylke).map(c => c.kommune))].sort((a, b) => a.localeCompare(b, 'nb'));
    $('#tb').innerHTML = `${sel('fylke', [['', 'Hele landet'], ...FYLKER.map(f => [f, f])], st.fylke, 'Fylke')}${sel('år', [['2025', '2025'], ['2024', '2024'], ['2023', '2023']], st.år, 'Regnskapsår')}${sel('dir', [[0, p.dir < 0 ? 'Høyest først' : 'Lavest først'], [p.dir < 0 ? 1 : -1, p.dir < 0 ? 'Lavest først' : 'Høyest først']], st.dir, 'Rekkefølge')}
      <button class="btn ghost" data-a="open" aria-expanded="${open}" aria-controls="fp">${ic('filter')} Flere filtre</button><span class="sp"></span><span class="muted num" style="font-size:14px">${nf.format(total)} selskaper</span>`;
    $('#fp').hidden = !open;
    $('#fp').innerHTML = `<label>Kommune${sel('kommune', [['', 'Alle kommuner'], ...kommuner.map(k => [k, k])], st.kommune, 'Kommune')}</label>
      <label>Bransje${sel('bransje', [['', 'Alle bransjer'], ...SECTIONS.map(s => [s[0], s[3]])], st.bransje, 'Bransje')}</label>
      <label>Minste omsetning${sel('min', [[0, 'Ingen grense'], ...Object.entries(MIN_T)], st.min, 'Minste omsetning')}</label>
      <label>Ansatte${sel('ans', [['', 'Alle'], ...Object.entries(ANS_T)], st.ans, 'Ansatte')}</label>
      <label>Selskapsform${sel('form', [['', 'AS og ASA'], ['AS', 'AS'], ['ASA', 'ASA (børsnotert)']], st.form, 'Selskapsform')}</label>`;
    const af = [
      st.fylke && ['fylke', st.fylke], st.kommune && ['kommune', st.kommune], st.bransje && ['bransje', SECTIONS.find(s => s[0] === st.bransje)?.[3]],
      st.min && ['min', MIN_T[st.min] + ' i omsetning'], st.ans && ['ans', ANS_T[st.ans]], st.form && ['form', st.form], st.år !== '2025' && ['år', 'År ' + st.år],
    ].filter(Boolean);
    $('#af').innerHTML = af.length ? af.map(([k, t]) => `<button class="chip ex" data-rm="${k}" aria-label="Fjern filter ${esc(t)}">${esc(t)}<span class="x" aria-hidden="true">✕</span></button>`).join('') + '<button class="lnk" data-a="reset" style="font-size:13px;margin-left:6px">Nullstill</button>' : '';
    $('#cnt').textContent = `${nf.format(total)} selskaper passer filtrene`;
    $('#rows').innerHTML = rows.length ? rows.map((r, i) => `<a class="rrow glass" href="#/selskap/${r.c.org}"><span class="rn num">${String(i + 1).padStart(2, '0')}</span>
      <div style="min-width:0"><b>${esc(nice(r.c.navn))}</b><span class="s">${esc(r.c.kommune)} · ${esc(r.c.bransje)}</span></div>
      <div class="val"><strong class="num">${p.f(r.v)}</strong><span class="s">${esc(p.sub(r.y) || '')}</span><div class="bar"><i style="width:${Math.max(2, Math.abs(r.v) / max * 100)}%"></i></div></div></a>`).join('')
      : '<div class="glass empty">Ingen selskaper passer filtrene. <button class="lnk" data-a="reset">Nullstill filtrene</button></div>';
    $('#more').innerHTML = total > rows.length ? `<button class="btn" data-a="more">Vis flere (${nf.format(Math.min(25, total - rows.length))} til)</button>` : '';
    sync();
  };
  onV('click', e => {
    const t = e.target.closest('[data-l],[data-a],[data-rm]'); if (!t) return;
    if (t.dataset.l) { const p = PRESETS.find(x => x.k === t.dataset.l); Object.assign(st, { liste: p.k, min: p.min || 0, dir: 0, n: 25 }); }
    if (t.dataset.a === 'open') { open = !open; }
    if (t.dataset.a === 'more') st.n += 25;
    if (t.dataset.a === 'reset') Object.assign(st, { fylke: '', kommune: '', bransje: '', ans: '', form: '', dir: 0, år: '2025', n: 25, min: PRESETS.find(x => x.k === st.liste).min || 0 });
    if (t.dataset.rm) { st[t.dataset.rm] = t.dataset.rm === 'min' ? 0 : t.dataset.rm === 'år' ? '2025' : ''; if (t.dataset.rm === 'fylke') st.kommune = ''; }
    render();
  });
  onV('change', e => {
    const f = e.target.dataset.f; if (!f) return;
    st[f] = ['min', 'dir'].includes(f) ? +e.target.value : e.target.value;
    if (f === 'fylke') st.kommune = '';
    st.n = 25; render();
  });
  render();
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
  const add = (k, big, text, sm) => F.push({ k, big, text, sm });
  if (L) {
    if (Pv?.rev > 0 && L.rev != null) { const g_ = (L.rev / Pv.rev - 1) * 100; add('Vekst', sgn(g_), `${n} omsatte for <b>${pc(Math.abs(g_))} ${g_ >= 0 ? 'mer' : 'mindre'}</b> i ${L.y} enn i ${Pv.y}.`); }
    if (L.rev > 0) add('Hver dag', kr(L.rev / 365), `Det tilsvarer omtrent <b>${kr(L.rev / 365)}</b> i omsetning – hver eneste dag i ${L.y}.`);
    if (L.rev > 0 && L.op != null) {
      if (L.op >= 0) add('Lønnsomhet', `${Math.round(L.op / L.rev * 100)} øre`, `Av hver krone ${n} tok inn, ble <b>${Math.round(L.op / L.rev * 100)} øre</b> igjen som driftsresultat.`);
      else add('Driftsresultat', kr(L.op), `Driftsresultatet ble <b>${kr(L.op)}</b> i ${L.y}${ys.length === 1 ? ' – ikke uvanlig i et første driftsår.' : '.'}`);
    }
    if (L.div > 0) add('Utbytte (estimat)', kr(L.div), `Eierne fikk anslagsvis <b>${kr(L.div)}</b> i utbytte${L.net > 0 ? ` – ${pc(L.div / L.net * 100, 0)} av årsresultatet` : ''}.`);
    if (L.rev > 0 && L.cost) add('Kostnader', `${dec(L.cost / L.rev, 2)} kr`, `For hver krone som kom inn, brukte ${n} <b>${dec(L.cost / L.rev, 2)} kr</b> på drift.`);
    if (Pv && L.net > 0 && Pv.net > 0) { const d = (L.net / Pv.net - 1) * 100; add('Bunnlinja', sgn(d), `Årsresultatet ${d >= 0 ? 'økte' : 'falt'} fra <b>${kr(Pv.net)}</b> til <b>${kr(L.net)}</b>.`); }
    if (L.tax > 0) add('Skatt', kr(L.tax), `${n} kostnadsførte <b>${kr(L.tax)}</b> i skatt – rundt <b>${kr(L.tax / 365)}</b> per dag.`);
    if (ent?.antallAnsatte > 0 && L.rev > 0) add('Per ansatt', kr(L.rev / ent.antallAnsatte), `Hver av de ${nf.format(ent.antallAnsatte)} ansatte står for rundt <b>${kr(L.rev / ent.antallAnsatte)}</b> i omsetning.`);
    if (L.wage > 0 && L.rev > 0) add('Lønn', pc(L.wage / L.rev * 100, 0), `Lønn utgjør <b>${pc(L.wage / L.rev * 100, 0)}</b> av inntektene${Pv?.wage && Pv.rev ? ` (${pc(Pv.wage / Pv.rev * 100, 0)} året før)` : ''}.`);
    if (L.ass > 0 && L.eq != null) { const r = L.eq / L.ass * 100; add('Soliditet', pc(r, 0), `Egenkapitalandelen er <b>${pc(r, 0)}</b>${r >= 30 ? ' – en solid buffer.' : r < 0 ? ' – egenkapitalen er negativ.' : '.'}`); }
    if (L.varer > 0 && L.ass > 0) add('Varelager', pc(L.varer / L.ass * 100, 0), `Varelageret på <b>${kr(L.varer)}</b> utgjør ${pc(L.varer / L.ass * 100, 0)} av alle eiendelene.`);
    if (ys.length > 2) { const b = [...ys].sort((a, c) => (c.net ?? -1e15) - (a.net ?? -1e15))[0]; add('Rekordår', b.y, b.y === L.y ? `${L.y} er det <b>beste resultatåret</b> i perioden vi har tall for.` : `Beste årsresultat i perioden kom i <b>${b.y}</b> (${kr(b.net)}).`); }
  }
  if (ult?.length) { const u = ult[0]; add('Største eier', pc(u.pct), `<b>${esc(E(u.person).navn)}</b> eier ${pc(u.pct)} totalt${u.paths.some(p => p.chain.length > 1) ? ', delvis via holdingselskap' : ''}. <span class="demo" style="margin-top:8px">Eksempeldata</span>`); }
  if (ent?.stiftelsesdato) {
    const days = Math.floor((Date.now() - new Date(ent.stiftelsesdato)) / 864e5);
    if (days < 730) add('Fersk', `${nf.format(days)} dager`, `${n} ble stiftet ${fmtDate(ent.stiftelsesdato)} – fortsatt i oppstartsfasen.`);
    else add('Alder', `${Math.floor(days / 365.25)} år`, `${n} ble stiftet ${fmtDate(ent.stiftelsesdato)}.`);
  }
  const hn = ent?.historiskeNavn?.[0];
  if (hn) add('Navnebytte', nice(hn.navn), `Selskapet het <b>${esc(nice(hn.navn))}</b>${hn.tilDato ? ` frem til ${fmtDate(hn.tilDato)}` : ''}.`, true);
  const k = ent?.kapital;
  if (k?.belop && k.antallAksjer) add('Aksjekapital', kr(k.belop), `Fordelt på <b>${nf.format(k.antallAksjer)} aksjer</b> à ${kr(k.belop / k.antallAksjer)}.`);
  const roles = (ro?.rollegrupper || []).flatMap(x => x.roller).filter(r => !r.fratraadt);
  const nm = r => (r.person ? [r.person.navn?.fornavn, r.person.navn?.mellomnavn, r.person.navn?.etternavn].filter(Boolean).join(' ') : '');
  const dl = roles.find(r => r.type.kode === 'DAGL'), sl = roles.find(r => r.type.kode === 'LEDE');
  if (dl && sl && nm(dl) && nm(dl) === nm(sl)) add('Ledelse', '1 person', `<b>${esc(nm(dl))}</b> er både daglig leder og styreleder.`);
  const board = roles.filter(r => ['LEDE', 'MEDL', 'NEST'].includes(r.type.kode)).length;
  if (board > 2) add('Styret', `${board} personer`, `Styret består av <b>${board} personer</b>.`);
  if (L?.fravalg) add('Revisjon', 'Fravalgt', 'Selskapet har valgt bort revisjon – det er lov for små aksjeselskap.', true);
  return F;
}

// Graf
const METRICS = [['rev', 'Omsetning'], ['op', 'Driftsresultat'], ['net', 'Årsresultat'], ['eq', 'Egenkapital'], ['ass', 'Sum eiendeler'], ['r_margin', 'Driftsmargin']];
function ticks(min, max, n = 4) {
  if (min === max) max = min + 1;
  const step0 = (max - min) / n, mag = 10 ** Math.floor(Math.log10(step0)), e = step0 / mag;
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag, out = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}
function chartSVG(ys, key, si, cw = 820) {
  const isPct = key.startsWith('r_'), fmt = v => (isPct ? pc(v) : kr(v)), short = v => (isPct ? pc(v, 0) : krShort(v));
  const label = METRICS.find(m => m[0] === key)[1];
  const vals = ys.map(y => y[key]);
  const T = ticks(Math.min(0, ...vals.filter(v => v != null)), Math.max(0, ...vals.filter(v => v != null)));
  const W = Math.max(300, Math.round(cw)), sm = W < 560, H = sm ? 240 : 300, L = sm ? 50 : 64, R = 8, Tp = 30, B = 40, lo = T[0], hi = T.at(-1);
  const Y = v => Tp + (hi - v) / (hi - lo) * (H - Tp - B);
  const slot = (W - L - R) / ys.length, bw = Math.min(96, slot * .5);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} per år">`;
  T.forEach(t => { s += `<line class="${t === 0 ? 'zl' : 'gl'}" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${L - 10}" y="${Y(t) + 4}" text-anchor="end">${short(t)}</text>`; });
  ys.forEach((y, i) => {
    const v = y[key], cx = L + slot * (i + .5), x = cx - bw / 2, on = i === si;
    const tip = `${label}: ${fmt(v)}` + (i > 0 && v != null && ys[i - 1][key] ? `\nEndring fra ${ys[i - 1].y}: ${isPct ? dec(v - ys[i - 1][key], 1) + ' prosentpoeng' : sgn(chg(v, ys[i - 1][key]))}` : '') + '\nKlikk for å velge året';
    s += `<rect class="hit" x="${L + slot * i}" y="${Tp - 20}" width="${slot}" height="${H - Tp - B + 40}" data-i="${i}" data-tip-t="${y.y}" data-tip="${esc(tip)}"/>`;
    if (v != null) {
      const y0 = Y(0), y1 = Y(v), h = Math.max(2, Math.abs(y1 - y0));
      s += `<rect class="bar ${v < 0 ? 'neg' : ''} ${on ? 'on' : ''}" x="${x}" y="${Math.min(y0, y1)}" width="${bw}" height="${h}" rx="2" data-i="${i}" data-tip-t="${y.y}" data-tip="${esc(tip)}" style="pointer-events:none"/>`;
      s += `<text class="vl" x="${cx}" y="${v >= 0 ? Math.min(y0, y1) - 9 : Math.max(y0, y1) + 18}" text-anchor="middle" style="opacity:${on || ys.length <= 6 ? 1 : 0};font-weight:${on ? 600 : 500}">${short(v)}</text>`;
    }
    s += `<text class="yr ${on ? 'on' : ''}" x="${cx}" y="${H - 12}" text-anchor="middle">${y.y}</text>`;
  });
  return s + '</svg>';
}

const ROWS = [
  ['g', 'Resultatregnskap'], ['Salgsinntekter', 'salg'], ['Sum driftsinntekter', 'rev', 1], ['Lønnskostnad', 'wage'], ['Sum driftskostnader', 'cost'],
  ['Driftsresultat', 'op', 1], ['Finansinntekter', 'finInn'], ['Finanskostnader', 'finKost'], ['Resultat før skatt', 'pre', 1], ['Skattekostnad', 'tax'],
  ['Årsresultat', 'net', 1], ['Estimert utbytte', 'div'],
  ['g', 'Balanse – eiendeler'], ['Sum anleggsmidler', 'anlegg'], ['Varer', 'varer'], ['Fordringer', 'fordr'], ['Bankinnskudd og kontanter', 'bank'], ['Sum omløpsmidler', 'omlop'], ['Sum eiendeler', 'ass', 1],
  ['g', 'Balanse – egenkapital og gjeld'], ['Innskutt egenkapital', 'innskutt'], ['Opptjent egenkapital', 'opptjent'], ['Sum egenkapital', 'eq', 1], ['Langsiktig gjeld', 'lang'], ['Kortsiktig gjeld', 'kort'], ['Sum gjeld', 'gjeld', 1],
  ['g', 'Nøkkeltall'], ['Driftsmargin', 'r_margin', 0, '%'], ['Resultatmargin', 'r_nm', 0, '%'], ['Egenkapitalandel', 'r_ek', 0, '%'], ['Totalkapitalrentabilitet', 'r_tkr', 0, '%'],
  ['Egenkapitalrentabilitet', 'r_ekr', 0, '%'], ['Likviditetsgrad 1', 'r_lik', 0, 'x'], ['Lønn i % av inntekter', 'r_lonn', 0, '%'],
];
function finTable(ys, si) {
  const cols = ys.map((y, i) => ({ ...y, i })).reverse();
  const big = Math.max(...ys.map(y => Math.abs(y.rev || 0)), ...ys.map(y => Math.abs(y.ass || 0)));
  const unit = big >= 1e7 ? 1000 : 1;
  let html = '', grp = null;
  for (const [label, key, sum, u] of ROWS) {
    if (label === 'g') { grp = `<tr class="grp"><td colspan="${cols.length + 1}">${key}</td></tr>`; continue; }
    if (ys.every(y => y[key] == null)) continue;
    if (grp) { html += grp; grp = null; }
    html += `<tr class="${sum ? 'sum' : ''}"><td><span class="rl">${label}${info(key, label)}</span></td>${cols.map(y => {
      const v = y[key], p = ys[y.i - 1]?.[key], on = y.i === si;
      if (v == null) return `<td class="na ${on ? 'on' : ''}">–</td>`;
      const txt = u === '%' ? pc(v) : u === 'x' ? dec(v, 2) : nf.format(Math.round(v / unit));
      const c = on && sum && !u && p ? chg(v, p) : null;
      return `<td class="${on ? 'on' : ''}">${txt}${c != null ? `<small>${arrow(c)}</small>` : ''}</td>`;
    }).join('')}</tr>`;
  }
  return { html: `<div class="tbl-wrap"><table class="fin"><thead><tr><th scope="col">${unit === 1000 ? 'Beløp i 1000 kr' : 'Beløp i kr'}</th>${cols.map(y => `<th scope="col" class="${y.i === si ? 'on' : ''}" data-yi="${y.i}" tabindex="0" aria-label="Velg ${y.y}">${y.y}</th>`).join('')}</tr></thead><tbody>${html}</tbody></table></div>`, unit };
}

const OWN_C = ['#EF7140', '#111', '#6b6f76', '#cfcfcf', '#9a9ea4'];
function ownershipBlock(id, name) {
  const direct = ownersOf(id), hold = holdingsOf(id);
  const head = `<div class="block-h"><div><div class="lab nl" style="margin-bottom:10px">Eiere</div><h2 class="h2">Hvem eier ${esc(name)}?</h2><p>Endelige eiere regnes ut gjennom alle ledd – også via holdingselskaper.</p></div>${direct.length || hold.length ? '<span class="demo">Eksempeldata</span>' : ''}</div>`;
  if (!direct.length && !hold.length) return head + `<div class="glass card" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:240px"><b style="font-weight:500;font-size:18px">Eierdata er ikke koblet på ennå</b><p class="muted" style="margin-top:4px">Aksjonærregisteret hentes fra Skatteetaten som en årlig fil og må vurderes opp mot personvern før det vises.</p></div><a class="btn" href="#/selskap/935851076">Se eksempelet ${ic('arrow')}</a></div>`;
  const ult = groupUltimate(id), ent = E(id);
  const via = u => u.paths.map(p => (p.chain.length === 1 ? `${pc(p.pct)} direkte` : `${pc(p.pct)} via ${p.chain.slice(0, -1).map(e => esc(E(e.eier).navn)).reverse().join(' → ')}`)).join(' · ');
  return head + `<div class="own">
    <div class="glass card"><div class="vt">Endelige eiere</div>
      <div class="ownbar" role="img" aria-label="${ult.map(u => `${esc(E(u.person).navn)} ${pc(u.pct)}`).join(', ')}">${ult.map((u, i) => `<i style="width:${u.pct}%;background:${OWN_C[i % OWN_C.length]}"></i>`).join('')}</div>
      ${ult.map((u, i) => `<a class="lg-row" href="#/person/${u.person}"><span class="sw" style="background:${OWN_C[i % OWN_C.length]}"></span><div><b>${esc(E(u.person).navn)}</b><div class="via">${via(u)}</div></div><span class="pc num">${pc(u.pct)}</span></a>`).join('')}</div>
    <div class="glass card">
      ${direct.length ? `<div class="vt">Direkte aksjonærer</div><table class="mini" style="margin-top:8px"><tbody>${direct.sort((a, b) => b.andel - a.andel).map(e => `<tr data-href="${entHref(e.eier)}"><td><span style="display:flex;align-items:center;gap:10px"><span class="av ${E(e.eier).type === 'person' ? 'pe' : ''}" style="width:28px;height:28px;font-size:11px">${esc(ini(E(e.eier).navn))}</span>${esc(E(e.eier).navn)}</span></td><td class="muted" style="text-align:right;font-weight:400">${ent?.aksjer ? nf.format(Math.round(ent.aksjer * e.andel / 100)) + ' aksjer' : ''}</td><td>${pc(e.andel)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${hold.length ? `<div class="vt" style="margin-top:${direct.length ? 24 : 0}px">${esc(name)} eier selv</div><table class="mini" style="margin-top:8px"><tbody>${hold.map(e => `<tr data-href="#/selskap/${e.selskap}"><td>${esc(E(e.selskap).navn)}</td><td>${pc(e.andel)}</td></tr>`).join('')}</tbody></table>` : ''}
    </div></div>`;
}
function rolesBlock(ro) {
  const gs = (ro?.rollegrupper || []).map(gr => ({ t: gr.type.beskrivelse, r: gr.roller.filter(r => !r.fratraadt && !r.avregistrert) })).filter(x => x.r.length);
  const people = Object.entries(OWN.enheter).filter(([, e]) => e.type === 'person');
  const body = gs.length ? gs.map(gr => `<div class="lab nl" style="margin:24px 0 12px">${esc(gr.t)}</div><div class="roles">${gr.r.map(r => {
    const n = r.person ? [r.person.navn?.fornavn, r.person.navn?.mellomnavn, r.person.navn?.etternavn].filter(Boolean).join(' ') : nice([].concat(r.enhet?.navn || []).join(' '));
    const yr = r.person?.fodselsdato ? ` · f. ${r.person.fodselsdato.slice(0, 4)}` : '';
    const match = people.find(([, e]) => e.navn.toLowerCase() === n.toLowerCase());
    const link = match ? `#/person/${match[0]}` : r.enhet?.organisasjonsnummer ? `#/selskap/${r.enhet.organisasjonsnummer}` : '';
    return `<${link ? `a href="${link}"` : 'div'} class="role glass"><span class="av ${r.person ? 'pe' : ''}">${esc(ini(n))}</span><div><b>${esc(n)}</b><span>${esc(r.type.beskrivelse)}${yr}${match ? ' · se eierskap →' : ''}</span></div></${link ? 'a' : 'div'}>`;
  }).join('')}</div>`).join('') : '<p class="muted">Ingen roller registrert.</p>';
  return `<div class="block-h"><div><div class="lab nl" style="margin-bottom:10px">Roller</div><h2 class="h2">Hvem leder selskapet?</h2><p>Styre, ledelse, revisor og regnskapsfører fra Enhetsregisteret.</p></div></div>${body}`;
}

function skeleton() {
  V.innerHTML = `<section class="ph"><div class="wrap"><div class="skel" style="height:12px;width:120px;margin-bottom:30px"></div><div class="skel" style="height:76px;width:min(680px,90%)"></div><div class="skel" style="height:18px;width:min(360px,70%);margin-top:22px"></div></div></section>
  <div class="wrap" style="padding-bottom:110px"><div class="skel" style="height:50px;border-radius:999px;margin:30px 0 40px"></div><div class="kgrid">${'<div class="skel" style="height:150px"></div>'.repeat(6)}</div></div>`;
}

async function company(id) {
  skeleton();
  await loadOwn();
  const demo = id.startsWith('d-');
  let ent = null, rs = null, ro = null;
  if (!demo) {
    [ent, rs, ro] = await Promise.all([api(`enhetsregisteret/api/enheter/${id}`), api(`regnskapsregisteret/regnskap/${id}`), api(`enhetsregisteret/api/enheter/${id}/roller`)]);
    if (!ent?.navn) { V.innerHTML = `<section class="ph"><div class="wrap"><div class="lab nl">Selskap</div><h1 class="h2">Fant ikke selskapet</h1><p class="lead" style="margin-top:16px">Vi fant ingen enhet med organisasjonsnummer ${esc(fmtOrg(id))} i Enhetsregisteret.</p><button class="btn" style="margin-top:24px" data-cmdk-open>${ic('search')} Søk på nytt</button></div></section>`; $('[data-cmdk-open]').onclick = openPalette; return; }
  } else if (!E(id)) { location.hash = '#/'; return; }
  const name = demo ? E(id).navn : nice(ent.navn);
  document.title = `${name} – ddai`;
  recent.add({ href: `#/selskap/${id}`, title: name, sub: demo ? 'Eksempelselskap' : `${fmtOrg(id)} · ${nice(ent.forretningsadresse?.poststed || '')}`, kind: 'co' });
  const ys = parseYears(rs), ult = groupUltimate(id), F = facts(name, ys, ent, ro, ult);
  let si = ys.length - 1, metric = 'rev';
  const hn = (ent?.historiskeNavn || []).map(h => nice(h.navn));
  const tabs = demo ? [['eiere', 'Eiere']] : [['oversikt', 'Oversikt'], ['innsikt', 'Innsikt'], ['regnskap', 'Regnskap'], ['eiere', 'Eiere'], ['roller', 'Roller']];
  const dl = demo ? [['Type', 'Oppdiktet eksempelselskap'], ['Sted', E(id).sted]] : [
    ['Org.nr', `${fmtOrg(id)}<button class="copy" type="button" data-copy="${id}" aria-label="Kopier organisasjonsnummer">${ic('copy')}</button>`],
    ['Selskapsform', esc(ent.organisasjonsform?.beskrivelse || '')], ['Stiftet', fmtDate(ent.stiftelsesdato) || '–'],
    ['Ansatte', ent.harRegistrertAntallAnsatte ? nf.format(ent.antallAnsatte) : 'Ikke registrert'], ['Kommune', esc(nice(ent.forretningsadresse?.kommune || '–'))],
    ['Revisjon', ys.at(-1)?.fravalg ? 'Fravalgt' : ys.length ? 'Revidert' : '–'],
  ];
  V.innerHTML = `
  <section class="ph"><canvas class="field" aria-hidden="true"></canvas><div class="wrap">
    <div class="lab nl"><a href="#/" class="lnk" style="border:0;padding:0">ddai</a><span>/</span><span>${demo ? 'Eksempelselskap' : esc(ent.naeringskode1?.beskrivelse || 'Selskap')}</span></div>
    <div class="co-top">
      <div><h1>${esc(name)}</h1>${hn.length ? `<p class="was">Tidligere navn: ${hn.map(esc).join(', ')}</p>` : ''}
        <div class="chips" style="margin-top:18px">${demo ? '<span class="demo">Eksempeldata</span>' : ''}${ent?.konkurs || ent?.underAvvikling || ent?.underTvangsavviklingEllerTvangsopplosning ? '<span class="chip ex">Konkurs eller avvikling</span>' : ''}${ent?.hjemmeside ? `<a class="chip" href="https://${esc(ent.hjemmeside.replace(/^https?:\/\//, ''))}" target="_blank" rel="noopener">${esc(ent.hjemmeside)} ${ic('ext')}</a>` : ''}</div>
        ${ent?.aktivitet?.length ? `<p class="desc">${esc(ent.aktivitet.join(' '))}</p>` : ''}</div>
      <aside class="facts glass card" aria-label="Nøkkelinformasjon"><dl>${dl.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></aside>
    </div></div></section>
  <div class="wrap" style="padding-bottom:40px">
    <nav class="subnav glass-hi" aria-label="Seksjoner"><div class="tabs">${tabs.map(([k, t], i) => `<a href="javascript:void 0" data-go="${k}" class="${i ? '' : 'on'}">${t}</a>`).join('')}</div>
      ${ys.length ? `<div class="yearnav" role="group" aria-label="Velg regnskapsår"><span class="lbl">Regnskapsår</span><button class="rbtn" data-y="-1" aria-label="Forrige år">${ic('left')}</button><b class="num" aria-live="polite" id="yr"></b><button class="rbtn" data-y="1" aria-label="Neste år">${ic('right')}</button></div>` : ''}</nav>
    ${!demo ? `<section class="block" id="oversikt"><div class="block-h"><div><div class="lab nl" style="margin-bottom:10px">Oversikt</div><h2 class="h2" id="ov-h"></h2><p id="ov-p"></p></div></div><div class="kgrid" id="kpis"></div></section>` : ''}
    ${F.length ? `<section class="block" id="innsikt"><div class="block-h"><div><div class="lab nl" style="margin-bottom:10px">Innsikt</div><h2 class="h2">Kjappe fakta</h2><p>Bla gjennom det regnskapet faktisk forteller om ${esc(name)}.</p></div>
      <div class="ins-ctl"><div class="trk" aria-hidden="true"><i></i></div><span class="muted num" style="font-size:13px;min-width:48px;text-align:right" data-cnt></span><button class="rbtn" data-prev aria-label="Forrige fakta">${ic('left')}</button><button class="rbtn" data-next aria-label="Neste fakta">${ic('right')}</button></div></div>
      <div class="ins"><div class="ins-track" tabindex="0" aria-label="Fakta om ${esc(name)}">${F.map((f, i) => `<article class="fact glass"><span class="idx num">${String(i + 1).padStart(2, '0')}/${String(F.length).padStart(2, '0')}</span><div class="k">${STAR}${esc(f.k)}</div><div class="big num ${f.sm ? 'sm' : ''}">${esc(f.big)}</div><p>${f.text}</p></article>`).join('')}</div></div></section>` : ''}
    ${!demo ? `<section class="block" id="regnskap"><div class="block-h"><div><div class="lab nl" style="margin-bottom:10px">Regnskap</div><h2 class="h2">Tallene år for år</h2><p>Velg et nøkkeltall, og klikk på et år i grafen eller tabellen for å bla tilbake i tid. Trykk på <span class="info" style="display:inline-grid;vertical-align:-3px">i</span> for å se hva en post betyr.</p></div></div>
      ${ys.length ? `<div class="chart-card glass" style="margin-bottom:20px"><div class="chart-h"><div class="chart-v" id="cv"></div><div class="seg" role="tablist" aria-label="Velg nøkkeltall">${METRICS.map(([k, t]) => `<button role="tab" data-m="${k}" class="${k === metric ? 'on' : ''}" aria-selected="${k === metric}">${t}</button>`).join('')}</div></div><div class="chart" id="chart" tabindex="0" aria-label="Graf. Bruk piltastene for å bytte år."></div>${ys.length === 1 ? '<p class="chart-note">Selskapet har levert ett regnskap så langt. Grafen fylles på år for år.</p>' : ''}</div>
        <div class="tbl-card glass"><div id="tbl"></div><div class="tbl-foot"><span id="unit"></span><span>Kilde: Regnskapsregisteret${LOCAL || PROXY ? '' : ' (lagret utdrag)'} · Klikk på et år for å velge det</span></div></div>`
        : `<div class="glass card empty">${rs?.mangler ? 'Regnskapet til dette selskapet er ikke med i den publiserte demoen ennå. Den har lagret regnskap for selskapene i topplistene.' : 'Ingen regnskap funnet i Regnskapsregisteret.'}</div>`}
      </section>` : ''}
    <section class="block" id="eiere">${ownershipBlock(id, name)}</section>
    ${!demo ? `<section class="block" id="roller">${rolesBlock(ro)}</section>` : ''}
  </div>`;
  starField($('.ph .field'), { mode: 'breathe', sp: 11 });

  const draw = () => {
    if (!ys.length) return;
    const L = ys[si], Pv = ys[si - 1];
    $('#yr').textContent = L.y;
    $('[data-y="-1"]').disabled = si === 0; $('[data-y="1"]').disabled = si === ys.length - 1;
    if ($('#kpis')) {
      $('#ov-h').textContent = `Nøkkeltall ${L.y}`;
      $('#ov-p').textContent = Pv ? `Sammenlignet med ${Pv.y}. Bla mellom årene øverst til høyre.` : ys.length === 1 ? 'Første regnskapsår vi har tall for.' : `Det eldste året vi har tall for.`;
      const K = [['rev', 'Driftsinntekter'], ['op', 'Driftsresultat'], ['net', 'Årsresultat'], ['eq', 'Sum egenkapital'], ['div', 'Estimert utbytte'], ['r_ek', 'Egenkapitalandel']];
      $('#kpis').innerHTML = K.map(([k, t]) => {
        const v = L[k], p = Pv?.[k], pct = k.startsWith('r_');
        const vals = ys.map(y => y[k] ?? 0), mx = Math.max(...vals.map(Math.abs), 1);
        const d = pct ? (v != null && p != null ? `${v - p >= 0 ? '▲' : '▼'} ${dec(Math.abs(v - p), 1)} poeng` : '') : arrow(chg(v, p));
        return `<div class="kc glass"><div class="k">${t}${info(k === 'eq' ? 'eq' : k, t)}</div><div class="v num">${pct ? pc(v, 0) : kr(v)}</div>
          <div class="d"><span>${v == null && k === 'div' ? 'Krever to års regnskap' : d ? `${d} <span class="muted">fra ${Pv.y}</span>` : ''}</span>${ys.length > 1 ? `<span class="spark" aria-hidden="true">${vals.map((x, i) => `<i class="${i === si ? 'on' : ''}" style="height:${Math.max(8, Math.abs(x) / mx * 100)}%"></i>`).join('')}</span>` : ''}</div></div>`;
      }).join('');
    }
    if ($('#chart')) {
      const isPct = metric.startsWith('r_'), v = L[metric], p = Pv?.[metric];
      $('#cv').innerHTML = `<strong class="num">${isPct ? pc(v) : kr(v)}</strong><span>${Pv && v != null && p != null ? (isPct ? `${v - p >= 0 ? '▲' : '▼'} ${dec(Math.abs(v - p), 1)} poeng` : arrow(chg(v, p))) + ` <span class="muted">fra ${Pv.y}</span>` : `<span class="muted">${METRICS.find(m => m[0] === metric)[1]} ${L.y}</span>`}</span>`;
      $('#chart').innerHTML = chartSVG(ys, metric, si, $('#chart').clientWidth);
      const t = finTable(ys, si); $('#tbl').innerHTML = t.html; $('#unit').textContent = t.unit === 1000 ? 'Beløp i 1000 kr' : 'Beløp i kroner';
    }
  };
  const setYear = i => { si = Math.max(0, Math.min(ys.length - 1, i)); tipHide(); draw(); };
  onV('click', e => {
    const y = e.target.closest('[data-y]'); if (y) setYear(si + +y.dataset.y);
    const b = e.target.closest('#chart [data-i]'); if (b) setYear(+b.dataset.i);
    const th = e.target.closest('th[data-yi]'); if (th) setYear(+th.dataset.yi);
    const m = e.target.closest('[data-m]'); if (m) { metric = m.dataset.m; $$('[data-m]').forEach(x => { x.classList.toggle('on', x === m); x.setAttribute('aria-selected', x === m); }); draw(); }
    const go = e.target.closest('[data-go]'); if (go) $('#' + go.dataset.go)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const tr = e.target.closest('tr[data-href]'); if (tr) location.hash = tr.dataset.href;
    const cp = e.target.closest('[data-copy]');
    if (cp) navigator.clipboard?.writeText(cp.dataset.copy).then(() => { cp.innerHTML = ic('check'); cp.setAttribute('aria-label', 'Kopiert'); setTimeout(() => { cp.innerHTML = ic('copy'); cp.setAttribute('aria-label', 'Kopier organisasjonsnummer'); }, 1500); });
  });
  onV('keydown', e => {
    if (e.target.matches('th[data-yi]') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setYear(+e.target.dataset.yi); }
    if (e.target.id === 'chart' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); setYear(si + (e.key === 'ArrowLeft' ? -1 : 1)); }
  });
  // Innsiktskarusell
  const tr = $('.ins-track');
  if (tr) {
    const cards = $$('.fact', tr), cnt = $('[data-cnt]'), bar = $('.trk i'), prev = $('[data-prev]'), next = $('[data-next]');
    const step = () => cards[0].offsetWidth + 16;
    const upd = () => {
      const i = Math.min(cards.length - 1, Math.round(tr.scrollLeft / step())), vis = Math.max(1, Math.round(tr.clientWidth / step()));
      cnt.textContent = `${i + 1} / ${cards.length}`;
      bar.style.width = `${Math.min(100, vis / cards.length * 100)}%`; bar.style.left = `${Math.min(100 - vis / cards.length * 100, i / cards.length * 100)}%`;
      prev.disabled = tr.scrollLeft < 4; next.disabled = tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 4;
    };
    tr.addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true });
    prev.addEventListener('click', () => tr.scrollBy({ left: -step(), behavior: 'smooth' }));
    next.addEventListener('click', () => tr.scrollBy({ left: step(), behavior: 'smooth' }));
    tr.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); tr.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * step(), behavior: 'smooth' }); } });
    upd();
  }
  // Scrollspy for seksjonsmenyen
  const spy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) $$('.subnav [data-go]').forEach(a => a.classList.toggle('on', a.dataset.go === e.target.id)); }), { rootMargin: '-35% 0px -60% 0px' });
  $$('.block').forEach(b => spy.observe(b));
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 150); }, { signal: pageAC.signal });
  draw();
}

// ---------- Person og eiertre ----------
async function person(id) {
  await loadOwn();
  const p = E(id);
  if (!p || p.type !== 'person') { location.hash = '#/eiere'; return; }
  document.title = `${p.navn} – ddai`;
  recent.add({ href: `#/person/${id}`, title: p.navn, sub: 'Eiertre · eksempeldata', kind: 'pe' });
  const tree = buildTree(id), agg = aggregate(tree);
  const direct = holdingsOf(id).length, fn = first(p.navn);
  const open = new Set(), keyOf = n => n.chain.map(e => e.selskap).join('>');
  let selected = null, mode = 'tree';
  const find = (nodes, k) => { for (const n of nodes) { if (keyOf(n) === k) return n; const f = find(n.kids, k); if (f) return f; } };
  const all = (nodes, f) => nodes.forEach(n => { f(n); all(n.kids, f); });
  V.innerHTML = `
  <section class="ph"><canvas class="field" aria-hidden="true"></canvas><div class="wrap">
    <div class="lab nl"><a href="#/eiere" class="lnk" style="border:0;padding:0">Eiersøk</a><span>/</span><span>Person</span></div>
    <h1 class="h1" style="font-size:clamp(40px,5.8vw,88px)">${esc(p.navn)}</h1>
    <p class="lead" style="margin-top:20px">Eier noe i <b>${agg.size} selskaper</b> – ${direct} direkte og ${agg.size - direct} gjennom andre selskaper.</p>
    <div class="chips" style="margin-top:18px"><span class="chip">${esc(p.sted)}</span><span class="demo">Eksempeldata</span></div>
  </div></section>
  <div class="wrap" style="padding-bottom:110px">
    <div class="block-h"><div><h2 class="h2">Hva eier ${esc(fn)}?</h2><p>Trykk deg nedover i treet. Prosenten til høyre er ${esc(fn)}s reelle andel – ganget gjennom alle ledd.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><div class="seg" role="tablist"><button role="tab" data-m="tree" class="on" aria-selected="true">Eiertre</button><button role="tab" data-m="list" aria-selected="false">Samlet oversikt</button></div><button class="btn ghost" data-x>Utvid alle</button></div></div>
    <div id="pbox"></div><div id="tv"></div>
  </div>`;
  constellation($('.ph .field'));
  const nodeHtml = (n, parent) => {
    const e = E(n.id), k = keyOf(n), has = n.kids.length, isOpen = open.has(k), tot = agg.get(n.id).total;
    return `<div class="node"><div class="nrow glass ${selected === k ? 'sel' : ''}" data-key="${k}" role="treeitem" tabindex="0" aria-expanded="${has ? isOpen : ''}" aria-selected="${selected === k}">
      <span class="tg ${has ? (isOpen ? 'open' : '') : 'leaf'}">${ic('right')}</span><span class="av">${esc(ini(e.navn))}</span>
      <div class="nm"><b>${esc(e.navn)}</b><span>${esc(parent)} eier ${pc(n.andel)}${has ? ` · eier selv ${n.kids.length} selskap${n.kids.length > 1 ? 'er' : ''}` : ''}</span></div>
      <div class="eff"><b class="num">${pc(n.eff)}</b><span>${esc(fn)} ${n.chain.length > 1 ? 'indirekte' : 'direkte'}${Math.abs(tot - n.eff) > .01 ? ` · totalt ${pc(tot)}` : ''}</span></div>
      <a class="open-l" href="${entHref(n.id)}" data-open aria-label="Åpne ${esc(e.navn)}">${ic('arrow')}</a></div>
      ${has && isOpen ? `<div class="kids" role="group">${n.kids.map(c => nodeHtml(c, e.navn)).join('')}</div>` : ''}</div>`;
  };
  const pathBox = () => {
    const n = selected && find(tree, selected);
    if (!n) return `<div class="pathbox glass">${STAR.replace('<svg', '<svg style="width:12px;height:12px;fill:var(--ac)"')}<span class="muted">Trykk på et selskap for å se regnestykket bak eierandelen.</span></div>`;
    const steps = n.chain.map(e => `<span class="ar">→ ${pc(e.andel)} →</span><span class="st">${esc(E(e.selskap).navn)}</span>`).join('');
    return `<div class="pathbox glass" aria-live="polite"><span class="st">${esc(p.navn)}</span>${steps}<span class="res num">= ${pc(n.eff)}</span>${n.chain.length > 1 ? `<span class="fm">${n.chain.map(e => pc(e.andel)).join(' × ')} = ${pc(n.eff)}</span>` : ''}</div>`;
  };
  const listHtml = () => `<div class="glass card"><table class="mini"><tbody>${[...agg.values()].sort((a, b) => b.total - a.total).map(a => {
    const e = E(a.id), kinds = new Set(a.paths.map(x => (x.chain.length > 1 ? 'indirekte' : 'direkte')));
    return `<tr data-href="${entHref(a.id)}"><td><span style="display:flex;align-items:center;gap:12px"><span class="av">${esc(ini(e.navn))}</span><span><b style="font-weight:500">${esc(e.navn)}</b><br><span class="muted" style="font-size:13px">${a.paths.map(x => (x.chain.length > 1 ? `${pc(x.eff)} via ${x.chain.slice(0, -1).map(c => esc(E(c.selskap).navn)).join(' → ')}` : `${pc(x.eff)} direkte`)).join(' · ')}</span></span></span></td>
      <td class="muted" style="font-weight:400;text-align:right;white-space:nowrap">${[...kinds].join(' + ')}</td><td style="font-size:20px;white-space:nowrap;padding-left:16px">${pc(a.total)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  const render = () => {
    $('#pbox').innerHTML = mode === 'tree' ? pathBox() : '';
    $('#tv').innerHTML = mode === 'tree' ? `<div class="tree" role="tree" aria-label="Eiertre for ${esc(p.navn)}"><div class="nrow glass" style="cursor:default;transform:none"><span class="av pe">${esc(ini(p.navn))}</span><div class="nm"><b>${esc(p.navn)}</b><span>${agg.size} selskaper totalt</span></div><div class="eff"><b>100 %</b><span>utgangspunkt</span></div></div><div class="node"><div class="kids" role="group">${tree.map(n => nodeHtml(n, fn)).join('')}</div></div></div>` : listHtml();
    $('[data-x]').style.display = mode === 'tree' ? '' : 'none';
  };
  const toggle = k => { if (open.has(k) && selected === k) open.delete(k); else open.add(k); selected = k; render(); $(`.nrow[data-key="${k}"]`)?.focus({ preventScroll: true }); };
  $('#tv').addEventListener('click', e => {
    if (e.target.closest('[data-open]')) return;
    const tr = e.target.closest('tr[data-href]'); if (tr) { location.hash = tr.dataset.href; return; }
    const r = e.target.closest('.nrow[data-key]'); if (r) toggle(r.dataset.key);
  });
  $('#tv').addEventListener('keydown', e => { const r = e.target.closest('.nrow[data-key]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(r.dataset.key); } });
  $('.seg').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; $$('.seg button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); render(); });
  $('[data-x]').addEventListener('click', e => { const any = open.size; open.clear(); if (!any) all(tree, n => n.kids.length && open.add(keyOf(n))); e.target.textContent = any ? 'Utvid alle' : 'Lukk alle'; render(); });
  render();
}

async function owners() {
  await loadOwn();
  document.title = 'Eiersøk – ddai';
  const people = Object.entries(OWN.enheter).filter(([, e]) => e.type === 'person');
  V.innerHTML = `
  <section class="ph" style="padding-bottom:80px"><canvas class="field" aria-hidden="true"></canvas><div class="wrap">
    <div class="lab nl">Eiersøk</div><h1 class="h1" style="font-size:clamp(40px,6vw,92px)">Hvem eier<br><span style="color:var(--ac)">hva</span>?</h1>
    <p class="lead" style="margin:22px 0 30px">Søk på en person og se alt de eier – direkte og gjennom holdingselskaper. Vi regner ut den reelle andelen for deg.</p>
    <div id="os" style="max-width:620px"></div></div></section>
  <section class="sec" style="padding-top:40px"><div class="wrap">
    <div class="lab">Prøv eksempelet</div>
    <div class="block-h"><h2 class="h2 rv">Oppdiktede eiere,<br>ekte regnestykker.</h2><span class="demo rv">Eksempeldata</span></div>
    <div class="roles">${people.map(([pid, e]) => `<a class="role glass rv" href="#/person/${pid}"><span class="av pe">${esc(ini(e.navn))}</span><div><b>${esc(e.navn)}</b><span>Eier i ${aggregate(buildTree(pid)).size} selskaper · ${esc(e.sted)}</span></div></a>`).join('')}
      <a class="role glass rv" href="#/selskap/935851076"><span class="av">EE</span><div><b>Efjord Extreme AS</b><span>Se hvem som eier selskapet</span></div></a></div>
  </div></section>
  <section class="sec alt"><div class="wrap">
    <div class="lab">Slik regner vi</div>
    <div class="sv">
      <div class="rv"><span>01</span><h3>Direkte eierskap</h3><p>Personen eier aksjer i selskapet selv. Andelen er antall aksjer delt på alle aksjene.</p></div>
      <div class="rv"><span>02</span><h3>Indirekte eierskap</h3><p>Eier du 50 % av Selskap A, og A eier 50 % av Selskap B, eier du 50 % × 50 % = 25 % av B.</p></div>
      <div class="rv"><span>03</span><h3>Samlet eierskap</h3><p>Eier du det samme selskapet gjennom flere veier, legger vi sammen alle veiene til én total andel.</p></div>
    </div></div></section>`;
  constellation($('.ph .field'));
  $('#os').append(makeSearch({ mode: 'hero', placeholder: 'Søk på en person, f.eks. Petter Sommerseth' }).el);
}

function about() {
  document.title = 'Om dataene – ddai';
  V.innerHTML = `
  <section class="ph"><canvas class="field" aria-hidden="true"></canvas><div class="wrap"><div class="lab nl">Om dataene</div>
    <h1 class="h1" style="font-size:clamp(40px,5.8vw,88px)">Hvor tallene<br>kommer fra.</h1>
    <p class="lead" style="margin-top:22px">ddai er bygget på åpne data fra Brønnøysundregistrene, lisensiert under Norsk lisens for offentlige data (NLOD).</p></div></section>
  <section class="sec" style="padding-top:30px"><div class="wrap"><div class="sv">
    <div class="rv"><span>01</span><h3>Enhetsregisteret</h3><p>Navn, adresse, bransje, ansatte, stiftelsesdato, navnehistorikk og roller. Hentes direkte og er alltid oppdatert.</p></div>
    <div class="rv"><span>02</span><h3>Regnskapsregisteret</h3><p>Resultat og balanse for de tre siste årene. ${LOCAL || PROXY ? 'Hentes direkte.' : 'Den publiserte siden viser et lagret utdrag for selskapene i topplistene, fordi registeret ikke kan kalles direkte fra nettleseren.'} Utbytte er estimert som årsresultat minus endring i opptjent egenkapital.</p></div>
    <div class="rv"><span>03</span><h3>Topplister</h3><p>Et eksempelutvalg på ${TOP ? nf.format(TOP.selskaper.length) : 'rundt 1 400'} selskaper: de største og et utvalg mellomstore i hvert fylke. Hele landet krever at alle regnskap lagres i en egen database.</p></div>
    <div class="rv"><span>04</span><h3>Eierskap</h3><p>Eksempeldata. Aksjonærregisteret må bestilles fra Skatteetaten som en årlig fil og vurderes opp mot personvern før det kan vises.</p></div>
  </div></div></section>`;
  starField($('.ph .field'), { mode: 'breathe', sp: 11 });
}

route();
