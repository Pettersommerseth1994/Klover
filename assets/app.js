'use strict';
/* Kløver – prototype. Åpne data fra Brønnøysundregistrene (NLOD) + eksempeldata for eierskap.
   Designsystem: Stetinden Studio (Inter Tight, aksent #EBECA0, glass, stjernefelt). */

// Adressen til Cloudflare-proxyen for Regnskapsregisteret (se proxy/). Tom = bruk lagret utdrag.
const PROXY = 'https://klover-proxy.klover.workers.dev';

// ---------- Hjelpere ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// Glidende markering (som i Claude): en «tommel» bak knappene flytter seg til den valgte (.on).
// Brukes av brytere (.seg) og seksjonsmenyen. Beholderen må ha data-thumb.
function thumb(el) {
  if (!el || !el.isConnected) return;
  let th = el.querySelector(':scope > .thumb');
  const fresh = !th;
  if (fresh) { th = document.createElement('span'); th.className = 'thumb'; th.setAttribute('aria-hidden', 'true'); el.prepend(th); }
  const on = el.querySelector(':scope > .on');
  if (!on || !on.offsetWidth) { th.style.opacity = '0'; return; }
  if (fresh) th.style.transition = 'none';
  Object.assign(th.style, { opacity: '1', width: `${on.offsetWidth}px`, height: `${on.offsetHeight}px`, transform: `translate(${on.offsetLeft}px,${on.offsetTop}px)` });
  if (fresh) { void th.offsetWidth; th.style.transition = ''; }
}
addEventListener('resize', () => $$('[data-thumb]').forEach(thumb));
document.fonts?.ready.then(() => $$('[data-thumb]').forEach(thumb));
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
// Skrå pil med strek: opp til høyre for økning, ned til høyre for nedgang
const trend = up => `<svg class="ar" viewBox="0 0 12 12" aria-hidden="true"><path d="${up ? 'M3 9 9 3M4 3h5v5' : 'M3 3l6 6M9 4v5H4'}"/></svg>`;
const arrow = v => (v == null ? '' : `<span class="${v >= 0 ? 'up' : 'dn'}">${trend(v >= 0)}${dec(Math.abs(v), 1)} %</span>`);
const fmtOrg = o => String(o).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
const fmtDate = d => (d ? d.slice(0, 10).split('-').reverse().join('.') : '');
const UP = new Set(['AS', 'ASA', 'ANS', 'DA', 'SA', 'BA', 'NUF', 'KS', 'IKS', 'A/S', 'HF', 'IL', 'BKS']);
const SMALL = new Set(['og', 'i', 'av', 'for', 'på', 'til', 'med', 'fra', 'von', 'van', 'der', 'den', 'de', 'la', 'du']);
// Pene navn fra STORE BOKSTAVER: «NÆRINGS- OG FISKERIDEPARTEMENTET» → «Nærings- og Fiskeridepartementet», «N.A.» beholdes
const nice = n => String(n || '').toLowerCase().split(' ').map((w, i) => (UP.has(w.toUpperCase().replace(/,$/, '')) || (w.length <= 4 && /^[^aeiouyæøå\d]+$/.test(w)) || /^(\p{L}\.)+\p{L}?\.?,?$/u.test(w) ? w.toUpperCase()
  : i > 0 && SMALL.has(w) ? w : w.replace(/(^|[-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()))).join(' ');
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
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  tree: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-3h14v3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a3.5 3.5 0 0 1 0 7M22 20c0-3-1.5-5-4-5.7"/>', down: '<path d="m6 9 6 6 6-6"/>',
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
const STAR = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 37 32 32 60 27 32Z"/><path d="M32 4 37 32 32 60 27 32Z" transform="rotate(90 32 32)"/></svg>';
const twinkles = pts => pts.map(([x, y, s, d]) => `<span class="tw" style="left:${x}%;top:${y}%;--s:${s}px;animation-delay:${d}s" aria-hidden="true">${STAR}</span>`).join('');

// Stjernefelt (samme tegneprimitiv som Stetinden)
const RM = matchMedia('(prefers-reduced-motion:reduce)').matches, G = '#cfcfcf', O = '#EBECA0';
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
function starField(cv, { mode = 'follow', sp = 12, mouse = true } = {}) {
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
        if (mouse && f.mx != null) { const k = Math.exp(-((x - f.mx) ** 2 + (y - f.my) ** 2) / (2 * 70 * 70)); r += k * 1.4; if (k > .4) col = O; }
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
    if (f.mx != null) Pp.forEach(p => { const d = Math.hypot(p[0] - f.mx, p[1] - f.my); if (d < 180) { cx.strokeStyle = `rgba(235,236,160,${(1 - d / 180) * .85})`; cx.beginPath(); cx.moveTo(...p); cx.lineTo(f.mx, f.my); cx.stroke(); } });
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
let OWN, TMETA;
// Topplistene hentes fra databasen bak Workeren. Lokalt kjøres Workeren med «npx wrangler dev -c proxy/wrangler.toml».
const TOPP_API = LOCAL ? 'http://localhost:8787' : PROXY;
const loadMeta = async () => {
  if (!TMETA) { TMETA = await getJSON('data/topp-meta.json'); TMETA?.kommuner.sort((a, b) => a[1].localeCompare(b[1], 'nb')); }
  return TMETA;
};
const kommuneNavn = knr => TMETA?.kommuner.find(k => k[0] === knr)?.[1] || knr;
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
    const m = mult * e.andel / 100, name = E(e.selskap).navn, ch = [...chain, { selskap: e.selskap, andel: e.andel, name }];
    return { id: e.selskap, name, andel: e.andel, eff: m * 100, chain: ch, kids: buildTree(e.selskap, m, ch, new Set([...seen, e.selskap])) };
  });
}

// ---------- Aksjonærregisteret (lokal indeks fra scripts/build_aksjonaerregister.py) ----------
// Filene finnes bare lokalt (personopplysninger, ignorert av Git). Mangler de, brukes eksempeldataene.
const REG = { meta: undefined, sh: new Map() };
const regMeta = async () => (REG.meta === undefined ? (REG.meta = LOCAL ? await getJSON('data/aksjonaerregister/meta.json') : null) : REG.meta);
const regShard = (dir, name) => {
  const k = `${dir}/${name}`;
  if (!REG.sh.has(k)) REG.sh.set(k, getJSON(`data/aksjonaerregister/${dir}/${encodeURIComponent(name)}.json`).then(d => d || {}));
  return REG.sh.get(k);
};
const isRegKey = k => /^[pf][0-9a-f]{10}$/.test(k);
const regOwners = async org => (await regShard('eiere', org.slice(0, 4)))[org] || null;
const regHold = async key => (await regShard('eierskap', /^\d/.test(key) ? 'c' + key.slice(0, 4) : key.slice(0, 4)))[key] || null;
const normTok = s => String(s || '').toLowerCase().replace(/[^a-zæøåäöü0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
async function regSearchPeople(q, max = 6) {
  const toks = normTok(q);
  if (!toks.length || toks[0].length < 2 || !(await regMeta())) return [];
  const rows = await regShard('navn', toks[0].slice(0, 2)), out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const nt = normTok(r[1]);
    if (toks.every(t => nt.some(x => x.startsWith(t)))) { out.push(r); if (out.length >= max) break; }
  }
  return out;
}
const regPersonItem = r => ({ sec: 'Personer', href: `#/person/${r[0]}`, title: nice(r[1]), kind: 'pe',
  sub: [r[2] && `f. ${r[2]}`, nice(r[3] || ''), `eier i ${r[4]} selskap${r[4] === 1 ? '' : 'er'}`].filter(Boolean).join(' · ') });
const ownerHref = (t, id, org) => (t === 'c' && id !== org ? `#/selskap/${id}` : t === 'p' || t === 'f' ? `#/person/${id}` : '');
async function examplePersonHref() {
  const hit = (await regSearchPeople('Petter Sommerseth', 1))[0];
  return hit ? `#/person/${hit[0]}` : '#/person/p-petter';
}
// Endelige eiere: følg eierkjeden oppover og gang andelene. Begrenset i dybde og antall oppslag.
async function regUltimate(org) {
  const res = [];
  let budget = 80;
  const walk = async (id, mult, via, seen, depth) => {
    const rec = await regOwners(id);
    if (!rec) return false;
    for (const o of rec.o) {
      const m = mult * o[6] / 100;
      if (m < 0.0005) continue;
      const self = o[1] === org, nm = self ? 'Egne aksjer' : nice(o[2]);
      if (o[0] === 'c' && !self && !seen.has(o[1]) && depth < 6 && budget > 0) {
        budget--;
        if (await walk(o[1], m, [...via, nm], new Set([...seen, o[1]]), depth + 1)) continue;
      }
      res.push({ key: o[1], name: nm, type: self ? 'self' : o[0], pct: m * 100, via, href: ownerHref(o[0], o[1], org) });
    }
    if (depth === 0 && rec.x) res.push({ key: '_rest', name: `${nf.format(rec.x[0])} andre aksjonærer`, type: 'rest', pct: rec.x[1], via: [], href: '' });
    return true;
  };
  await walk(org, 1, [], new Set([org]), 0);
  const g = new Map();
  for (const r of res) { const x = g.get(r.key) || { ...r, pct: 0, paths: [] }; x.pct += r.pct; x.paths.push({ pct: r.pct, via: [...r.via].reverse() }); g.set(r.key, x); }
  return [...g.values()].sort((a, b) => (a.type === 'rest') - (b.type === 'rest') || b.pct - a.pct);
}
// Eiertre nedover fra en person eller et selskap
async function regTree(key) {
  let budget = 150;
  const build = async (id, mult, chain, seen, depth) => {
    const h = await regHold(id);
    if (!h) return [];
    const out = [];
    for (const x of h.h) {
      if (seen.has(x[0])) continue;
      const m = mult * x[3] / 100, name = nice(x[1]), ch = [...chain, { selskap: x[0], andel: x[3], name }];
      let kids = [];
      if (depth < 6 && budget > 0) { budget--; kids = await build(x[0], m, ch, new Set([...seen, x[0]]), depth + 1); }
      out.push({ id: x[0], name, andel: x[3], eff: m * 100, chain: ch, kids });
    }
    return out.sort((a, b) => b.eff - a.eff);
  };
  return build(key, 1, [], new Set([key]), 0);
}
// Felles eierstruktur for selskapssiden – ekte register lokalt, ellers eksempeldata
async function ownership(id) {
  if (!id.startsWith('d-') && await regMeta()) {
    const [rec, hold] = await Promise.all([regOwners(id), regHold(id)]);
    const base = { src: 'reg', year: REG.meta.år, prevYear: REG.meta.tidligere?.[0] };
    if (!rec && !hold) return { ...base, none: true, direct: [], ult: [], holds: [] };
    return { ...base, total: rec?.t, rest: rec?.x,
      direct: (rec?.o || []).map(o => ({ type: o[1] === id ? 'self' : o[0], id: o[1], name: o[1] === id ? 'Egne aksjer' : nice(o[2]), yr: o[3], place: nice(o[4] || ''), shares: o[5], pct: o[6], prev: o[7], href: ownerHref(o[0], o[1], id) })),
      ult: rec ? await regUltimate(id) : [],
      holds: (hold?.h || []).map(h => ({ id: h[0], name: nice(h[1]), shares: h[2], pct: h[3], href: `#/selskap/${h[0]}` })), holdsN: hold?.n || 0 };
  }
  await loadOwn();
  const ent = E(id), direct = ownersOf(id).sort((a, b) => b.andel - a.andel), holds = holdingsOf(id);
  if (!direct.length && !holds.length) return { src: null, direct: [], ult: [], holds: [] };
  return { src: 'demo',
    direct: direct.map(e => ({ type: E(e.eier).type === 'person' ? 'p' : 'c', id: e.eier, name: E(e.eier).navn, shares: ent?.aksjer ? Math.round(ent.aksjer * e.andel / 100) : null, pct: e.andel, href: entHref(e.eier) })),
    ult: groupUltimate(id).map(u => ({ key: u.person, name: E(u.person).navn, type: 'p', pct: u.pct, href: `#/person/${u.person}`, paths: u.paths.map(p => ({ pct: p.pct, via: p.chain.slice(0, -1).map(e => E(e.eier).navn).reverse() })) })),
    holds: holds.map(e => ({ id: e.selskap, name: E(e.selskap).navn, pct: e.andel, href: `#/selskap/${e.selskap}` })), holdsN: holds.length };
}
// Kobler styremedlemmer og ledere til personsidene deres (navn + fødselsår)
async function roleLinksFor(ro) {
  const links = new Map();
  if (!(await regMeta())) return links;
  const ppl = (ro?.rollegrupper || []).flatMap(g => g.roller).filter(r => r.person && !r.fratraadt);
  await Promise.all(ppl.map(async r => {
    const n = [r.person.navn?.fornavn, r.person.navn?.mellomnavn, r.person.navn?.etternavn].filter(Boolean).join(' ');
    const yr = r.person.fodselsdato?.slice(0, 4), want = normTok(n);
    const hit = (await regSearchPeople(n, 40)).find(x => x[2] === yr && want.every(t => normTok(x[1]).includes(t)));
    if (hit) links.set(n.toLowerCase(), `#/person/${hit[0]}`);
  }));
  return links;
}
function aggregate(nodes, map = new Map()) {
  for (const n of nodes) { const x = map.get(n.id) || { id: n.id, total: 0, paths: [] }; x.total += n.eff; x.paths.push(n); map.set(n.id, x); aggregate(n.kids, map); }
  return map;
}

// Nylig besøkt (bare i denne nettleseren)
const RK = 'klover.recent';
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
  const ql = q.toLowerCase(), out = [], d = q.replace(/\s/g, '');
  const brreg = api(/^\d{9}$/.test(d) ? `enhetsregisteret/api/enheter?organisasjonsnummer=${d}` : `enhetsregisteret/api/enheter?navn=${encodeURIComponent(q)}&size=7`);
  if (await regMeta()) out.push(...(await regSearchPeople(q)).map(regPersonItem));
  else {
    await loadOwn();
    for (const [id, e] of Object.entries(OWN.enheter)) {
      if (e.ekte || !e.navn.toLowerCase().includes(ql)) continue;
      const pe = e.type === 'person';
      out.push({ sec: pe ? 'Personer' : 'Eksempelselskaper', href: entHref(id), title: e.navn, kind: pe ? 'pe' : 'co', sub: pe ? `Eier i ${aggregate(buildTree(id)).size} selskaper · eksempeldata` : `Eksempelselskap · ${e.sted}` });
    }
  }
  const r = await brreg;
  const cos = (r?._embedded?.enheter || []).map(e => ({ sec: 'Selskaper', href: `#/selskap/${e.organisasjonsnummer}`, title: nice(e.navn), kind: 'co',
    sub: [fmtOrg(e.organisasjonsnummer), e.organisasjonsform?.kode, nice(e.forretningsadresse?.poststed || e.postadresse?.poststed || '')].filter(Boolean).join(' · ') }));
  return [...out.filter(x => x.kind === 'pe'), ...cos, ...out.filter(x => x.kind === 'co')];
}
function makeSearch({ mode = 'hero', placeholder = innerWidth < 560 ? 'Søk etter selskap eller person' : 'Søk etter selskap, organisasjonsnummer eller person' } = {}) {
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
  const suggest = async () => {
    const rc = recent.get().map(x => ({ ...x, sec: 'Nylig besøkt' }));
    let ex = EXAMPLES;
    if (await regMeta()) { const href = await examplePersonHref(); ex = EXAMPLES.map(x => (x.kind === 'pe' ? { ...x, href, sub: 'Eiertre fra aksjonærregisteret' } : x)); }
    items = [...rc, ...ex.filter(x => !rc.some(r => r.href === x.href)).map(x => ({ ...x, sec: 'Prøv' }))]; act = -1; render();
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
  $$('.hd nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === (seg[0] === 'person' ? 'eiere' : seg[0] === 'lister' ? 'topplister' : seg[0])));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (!firstRoute) V.focus({ preventScroll: true });
  firstRoute = false;
  if (!seg.length) await home();
  else if (seg[0] === 'topplister') await toplists(q);
  else if (seg[0] === 'lister') await listIdeas();
  else if (seg[0] === 'selskap' && seg[1]) await company(seg[1]);
  else if (seg[0] === 'person' && seg[1]) await person(seg[1]);
  else if (seg[0] === 'eiere') await owners();
  else if (seg[0] === 'om') await about();
  else await home();
  reveal(V); onScroll();
}
addEventListener('hashchange', route);

// ---------- Topplister: data ----------
const PRESETS = [
  { k: 'lonnsom', t: 'Mest lønnsomme', s: 'Høyest driftsmargin', f: v => pc(v), dir: -1, min: 10e6, sub: y => 'Driftsresultat ' + kr(y.op) },
  { k: 'tjente', t: 'Tjente mest', s: 'Høyest årsresultat', f: kr, dir: -1, sub: y => 'Omsetning ' + kr(y.rev) },
  { k: 'tapte', t: 'Tapte mest', s: 'Lavest årsresultat', f: kr, dir: 1, sub: y => 'Omsetning ' + kr(y.rev) },
  { k: 'utbytte', t: 'Størst utbytte', s: 'Estimert fra regnskapet', f: kr, dir: -1, sub: y => (y.net > 0 && y.div ? pc(y.div / y.net * 100, 0) + ' av årsresultatet' : '') },
  { k: 'ek', t: 'Mest egenkapital', s: 'Størst sum egenkapital', f: kr, dir: -1, sub: y => (y.ass ? 'Egenkapitalandel ' + pc(y.eq / y.ass * 100, 0) : '') },
  { k: 'oms', t: 'Størst omsetning', s: 'Sum driftsinntekter', f: kr, dir: -1, sub: y => 'Årsresultat ' + kr(y.net) },
  { k: 'vekst', t: 'Raskest vekst', s: 'Omsetningsvekst fra året før', f: sgn, dir: -1, min: 10e6, sub: y => 'Omsetning ' + kr(y.rev) },
  { k: 'solid', t: 'Mest solide', s: 'Høyest egenkapitalandel', f: v => pc(v), dir: -1, min: 10e6, sub: y => 'Egenkapital ' + kr(y.eq) },
  { k: 'ansatte', t: 'Flest ansatte', s: 'Fra Enhetsregisteret', f: v => nf.format(v), dir: -1, sub: y => 'Omsetning ' + kr(y.rev) },
];
const FYLKER = ['Oslo', 'Akershus', 'Østfold', 'Buskerud', 'Vestfold', 'Telemark', 'Agder', 'Rogaland', 'Vestland', 'Møre og Romsdal', 'Trøndelag', 'Nordland', 'Troms', 'Finnmark', 'Innlandet'];
const SECTIONS = [['A', 1, 3, 'Jordbruk, skogbruk og fiske'], ['B', 5, 9, 'Bergverk og utvinning'], ['C', 10, 33, 'Industri'], ['D', 35, 35, 'Kraftforsyning'], ['E', 36, 39, 'Vann, avløp og renovasjon'], ['F', 41, 43, 'Bygg og anlegg'], ['G', 45, 47, 'Varehandel'], ['H', 49, 53, 'Transport og lagring'], ['I', 55, 56, 'Overnatting og servering'], ['J', 58, 63, 'Informasjon og kommunikasjon'], ['K', 64, 66, 'Finans og forsikring'], ['L', 68, 68, 'Eiendom'], ['M', 69, 75, 'Faglig og teknisk tjenesteyting'], ['N', 77, 82, 'Forretningsmessig tjenesteyting'], ['O', 84, 84, 'Offentlig administrasjon'], ['P', 85, 85, 'Undervisning'], ['Q', 86, 88, 'Helse og sosial'], ['R', 90, 93, 'Kultur og fritid'], ['S', 94, 96, 'Annen tjenesteyting']];
const ANS_T = { a: '0–9 ansatte', b: '10–49 ansatte', c: '50–249 ansatte', d: '250–999 ansatte', e: '1000+ ansatte' };
const MIN_T = { 1e6: 'Over 1 mill.', 1e7: 'Over 10 mill.', 1e8: 'Over 100 mill.', 1e9: 'Over 1 mrd.' };
const TQ = new Map();
// Rått oppslag mot /topp i Workeren: { ar, total, rader }. Svarene huskes til siden lastes på nytt.
function topp(o) {
  const qs = new URLSearchParams({ liste: o.liste, ar: o.år || '2025' });
  for (const k of ['fylke', 'kommune', 'bransje', 'ans', 'form', 'nace', 'minans', 'min', 'dir']) if (o[k]) qs.set(k, o[k]);
  qs.set('n', o.n || 25);
  const url = `${TOPP_API}/topp?${qs}`;
  if (!TQ.has(url)) TQ.set(url, getJSON(url).then(d => { if (!d?.rader) TQ.delete(url); return d?.rader ? d : null; }));
  return TQ.get(url);
}
// Én av topplistene i PRESETS: { p, rows: [{ c, y, v }], total }
async function rankRows(o) {
  const p = PRESETS.find(x => x.k === o.liste) || PRESETS[0];
  const d = await topp({ ...o, liste: p.k });
  if (!d) return { p, rows: [], total: 0, feil: true };
  return { p, total: d.total, rows: d.rader.map(r => ({ c: { org: r.org, navn: r.navn, kommune: r.kommune || '', bransje: r.bransje || '', ansatte: r.ans }, y: r, v: r.v })) };
}
const sel = (name, opts, cur, label) => `<span class="sel"><select data-f="${name}" aria-label="${esc(label)}">${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></span>`;

// ---------- Forside ----------
async function home() {
  document.title = 'Kløver – alt om norske selskaper';
  const words = ['Alt', 'om', 'norske', 'selskaper,', 'enkelt', 'forklart.'], br = 3; // linjeskift etter «selskaper,»
  V.innerHTML = `
  <section class="hero" aria-labelledby="h-hero"><canvas class="field" aria-hidden="true"></canvas>
    ${twinkles([[12, 24, 16, 0], [86, 18, 12, -2], [78, 72, 18, -4], [18, 76, 10, -1], [50, 12, 9, -3]])}
    <div class="wrap">
      <button class="eb glass-hi" type="button" data-scroll="#tl-prev"><span><b>Nytt:</b> Topplister for alle fylker</span><span class="eb-ar" aria-hidden="true">${ic('arrow')}</span></button>
      <h1 class="h1" id="h-hero" aria-label="${words.join(' ')}">${words.map((w, i) => `<span class="w" aria-hidden="true"><span class="wi" style="--i:${i}">${w}</span></span>${i === br ? '<br>' : ''}`).join(' ')}</h1>
      <p class="lead">Søk blant alle norske virksomheter. Se regnskap, eiere og topplister – med forklaringer på det som er vanskelig.</p>
      <div id="hs"></div>
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
      <div class="kpi-big glass"><div class="n num"><span data-n="397000" id="n-topp">0</span></div><div class="bar"><i></i></div><p>selskaper med regnskap i topplistene</p></div>
      <div class="kpi-big glass"><div class="n num"><span data-n="15">0</span><small>fylker</small></div><div class="bar"><i></i></div><p>å sammenligne – ned på kommunenivå</p></div>
    </div>
  </div></section>
  <section class="sec"><div class="wrap feat">
    <div><div class="lab">Eiersøk</div><h2 class="h2 rv">Se hvem som <span style="color:var(--mut)">egentlig</span> eier.</h2>
      <p class="lead rv" style="margin-top:20px">Søk på en person og følg eierskapet gjennom holdingselskapene. Vi regner ut den reelle andelen for deg: eier du 50 % av et selskap som eier 50 % av et annet, eier du 25 %.</p>
      <div class="rv" style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn solid" href="#/person/p-petter" data-expl>Se eksempelet ${ic('arrow')}</a><a class="btn ghost" href="#/eiere">Slik fungerer eiersøk</a></div></div>
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
  starField($('.hero .field'), { mode: 'breathe', sp: 12, mouse: false });
  constellation($('.feat-vis canvas'));
  if (await regMeta()) { const b = $('[data-expl]'); if (b) b.href = await examplePersonHref(); }
  $('#hs').append(makeSearch({ mode: 'hero' }).el);
  $$('[data-scroll]').forEach(el => el.addEventListener('click', () => $(el.dataset.scroll).scrollIntoView({ behavior: 'smooth', block: 'start' })));
  api('enhetsregisteret/api/enheter?size=1').then(d => {
    const n = d?.page?.totalElements; if (!n) return;
    const el = $('#n-tot'); if (el) { el.dataset.n = n; if (el.closest('.in')) el.textContent = nf.format(n); }
  });
  loadMeta().then(m => {
    const el = $('#n-topp'); if (!m || !el) return;
    el.dataset.n = m.selskaper; if (el.closest('.in')) el.textContent = nf.format(m.selskaper);
  });
  const fySel = $('#tl-prev select');
  let fy = ''; try { fy = localStorage.getItem('klover.fylke') || ''; } catch (e) { /* */ }
  fySel.value = fy;
  let tok = 0;
  const renderPrev = async () => {
    const base = { fylke: fy, år: '2025', n: 5 }, my = ++tok;
    const lists = await Promise.all([['lonnsom', 1e7], ['utbytte', 0], ['tjente', 0]].map(([k, min]) => rankRows({ ...base, liste: k, min })));
    if (my !== tok || !$('#tlp')) return;
    $('#tlp').innerHTML = lists.map(({ p, rows, feil }) => {
      const k = p.k, qs = new URLSearchParams({ liste: k, ...(fy ? { fylke: fy } : {}) });
      return `<article class="card glass rv in"><div class="vt">${esc(p.s)}</div><h3>${esc(p.t)}<a class="lnk" style="font-size:13px" href="#/topplister?${qs}">Se alle</a></h3>
        ${rows.map((r, i) => `<a class="mrow" href="#/selskap/${r.c.org}"><span class="n">${i + 1}</span><b>${esc(nice(r.c.navn))}</b><span class="v num">${p.f(r.v)}</span></a>`).join('') || `<p class="muted">${feil ? 'Klarte ikke å hente listen akkurat nå.' : 'Ingen treff.'}</p>`}</article>`;
    }).join('');
  };
  fySel.addEventListener('change', () => { fy = fySel.value; try { localStorage.setItem('klover.fylke', fy); } catch (e) { /* */ } renderPrev(); });
  renderPrev();
}

// ---------- Topplister-side ----------
// ---------- Nye topplister (#/lister) ----------
// Tre lister fra databasen. Utbyttelisten bygger på aksjonærregisteret og finnes bare lokalt (personopplysninger).
async function listIdeas() {
  document.title = 'Nye topplister – Kløver';
  // Utbyttelisten finnes per by (bygget med scripts/build_lister.py --bare-utbytte --by <By>), bare lokalt
  const BYER = [['trondheim', 'Trondheim'], ['bergen', 'Bergen'], ['oslo', 'Oslo']], UT = {};
  if (LOCAL) await Promise.all(BYER.map(async ([k]) => { const d = await getJSON(`data/aksjonaerregister/lister/utbytte-${k}.json`); if (d) UT[k] = d; }));
  const byer = BYER.filter(([k]) => UT[k]), byNavn = k => (BYER.find(b => b[0] === k) || [k, k])[1];
  const Y = '2025';
  const st = { kons: 'mest', adv: 'net', by: byer[0]?.[0] || 'trondheim' };
  const short = c => (c.nace === '62.200' ? 'IT-konsulent' : c.nace === '70.200' ? 'Rådgivning' : '');
  const rowsHtml = (rows, empty) => (rows?.length ? `<ol class="irows">${rows.map((r, i) => `<li><a class="irow" href="${r.href}"><span class="ir-n num">${i + 1}</span><span class="ir-t"><b>${esc(r.name)}</b><span>${r.sub}</span></span><span class="ir-v num">${r.val}</span></a></li>`).join('')}</ol>`
    : `<p class="muted ir-empty">${rows ? empty : 'Klarte ikke å hente listen akkurat nå.'}</p>`);
  const co = (c, val, sub) => ({ href: `#/selskap/${c.org}`, name: nice(c.navn), val, sub });
  const ans = c => `${nf.format(c.ans)} ansatte`;
  // Spørringene mot databasen. Bare AS og ASA (standard i Workeren).
  const Q = {
    kons: () => ({ liste: 'drift_per_ansatt', nace: '70.200,62.200', kommune: '0301', minans: 5, min: 5e6, dir: st.kons === 'mest' ? -1 : 1, n: 10 }),
    adv: () => ({ liste: { net: 'tjente', rev: 'oms', per: 'resultat_per_ansatt' }[st.adv], nace: '69.100', minans: 5, n: 10 }),
    regn: () => ({ liste: 'lonnsom', nace: '69.202', kommune: '0301', min: 3e6, n: 10 }),
  };
  const R = {
    // 1. Konsulentselskaper i Oslo: driftsresultat per ansatt
    kons: d => d?.rader.map(c => co(c, kr(c.v), `${short(c)} · ${ans(c)} · driftsresultat ${kr(c.op)}`)),
    // 3. Advokatselskaper: tjente mest
    adv: d => d?.rader.map(c => co(c, kr(c.v), st.adv === 'rev' ? `Årsresultat ${kr(c.net)} · ${ans(c)}` : `Omsetning ${kr(c.rev)} · ${ans(c)}`)),
    // 4. Regnskapsbyråer i Oslo: høyest driftsmargin
    regn: d => d?.rader.map(c => co(c, pc(c.v), `Driftsresultat ${kr(c.op)} · omsetning ${kr(c.rev)}`)),
  };
  const D = {};
  await Promise.all(Object.keys(Q).map(async k => { D[k] = await topp({ ...Q[k](), år: Y }); }));
  const total = k => (D[k] ? `${nf.format(D[k].total)} selskaper med regnskap.` : '');
  // 2. Personer i valgt by: anslått utbytte fra holdingselskapene deres
  const utb = () => {
    const D = UT[st.by];
    if (!D) return null;
    // Forsvinner nesten hele egenkapitalen (under 10 % igjen), er det som regel en fusjon eller fisjon – ikke utbytte
    const restructured = h => { const a = h.år?.[String(+Y - 1)]?.eq, b = h.år?.[Y]?.eq; return a > 1e6 && b != null && b < a * 0.1; };
    return D.personer.map(p => {
      const parts = p.h.filter(h => !restructured(h)).map(h => ({ h, v: h.år?.[Y]?.div != null ? h.år[Y].div * h.pct / 100 : null })).filter(x => x.v > 0);
      return { p, parts, v: parts.reduce((s, x) => s + x.v, 0) };
    }).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 10).map(({ p, parts, v }) => {
      const top = parts.sort((a, b) => b.v - a.v)[0];
      return { href: p.key ? `#/person/${p.key}` : `#/selskap/${top.h.org}`, name: nice(p.navn), val: kr(v),
        sub: `f. ${p.yr} · via ${esc(nice(top.h.navn))} (${pcp(top.h.pct)})${parts.length > 1 ? ` + ${parts.length - 1} til` : ''}` };
    });
  };
  const seg = (k, opts) => `<div class="seg" data-thumb data-idea="${k}" role="tablist">${opts.map(([v, t]) => `<button type="button" role="tab" data-v="${v}" class="${st[k] === v ? 'on' : ''}" aria-selected="${st[k] === v}">${t}</button>`).join('')}</div>`;
  const card = (id, kick, title, sub, ctl, body, foot) => `<article class="idea glass" id="${id}"><span class="ov-k">${kick}</span><h3>${title}</h3><p class="idea-s">${sub}</p>${ctl}<div class="idea-b">${body}</div><p class="idea-f">${foot}</p></article>`;
  const ut = utb();
  V.innerHTML = `<section class="ph"><canvas class="field" aria-hidden="true"></canvas><div class="wrap">
    <div class="crumb"><a href="#/topplister">Topplister</a><span>/</span><span>Nye lister</span></div>
    <h1 class="h1" style="font-size:clamp(40px,5.8vw,84px)">Nye topplister</h1>
    <p class="lead" style="margin-top:18px">Fire nye lister med regnskapene for ${Y}, for alle norske aksjeselskaper i bransjen.</p></div></section>
  <div class="wrap" style="padding-bottom:110px"><div class="ideas">
    ${card('i-kons', 'Oslo · Konsulentselskaper', 'Mest og minst lønnsomme per ansatt', `Driftsresultat delt på antall ansatte, ${Y}. Bedriftsrådgivning og IT-konsulenter med minst 5 ansatte og 5 mill. kr i omsetning.`, seg('kons', [['mest', 'Mest lønnsomme'], ['minst', 'Minst lønnsomme']]), rowsHtml(R.kons(D.kons), 'Ingen treff.'), `${total('kons')} Antall ansatte er det Enhetsregisteret oppgir i dag.`)}
    ${card('i-utb', `${byNavn(st.by)} · Personer`, 'Hvem tok mest utbytte fra holdingselskapet sitt?', `Anslått utbytte for ${Y} fra holdingselskaper der personen eier minst 20 %, ganget med eierandelen.`, `<div class="idea-tag">Bare lokalt · aksjonærregisteret</div>${byer.length > 1 ? seg('by', byer) : ''}`, ut ? rowsHtml(ut, 'Ingen treff.') : '<p class="muted ir-empty">Listen bygger på aksjonærregisteret, som bare finnes i den lokale versjonen.</p>', 'Utbyttet er anslått fra regnskapet: årsresultat minus økningen i opptjent egenkapital. Holdingselskaper er her selskaper med «holding» i navnet. Selskaper der nesten hele egenkapitalen forsvant (som regel fusjon eller fisjon) er tatt ut. Byen er postnumrene i kommunen.')}
    ${card('i-adv', 'Hele landet · Advokatselskaper', `Advokatselskapene som tjente mest i ${Y}`, 'Juridisk tjenesteyting med minst 5 ansatte. Mange advokatfirmaer er organisert som DA eller ANS og har ikke offentlig regnskap – de er ikke med.', seg('adv', [['net', 'Årsresultat'], ['rev', 'Omsetning'], ['per', 'Per ansatt']]), rowsHtml(R.adv(D.adv), 'Ingen treff.'), total('adv'))}
    ${card('i-regn', 'Oslo · Regnskapsbyråer', `Høyest driftsmargin i ${Y}`, 'Driftsresultat delt på omsetning. Regnskapsføring og bokføring med ansatte og minst 3 mill. kr i omsetning.', '', rowsHtml(R.regn(D.regn), 'Ingen treff.'), total('regn'))}
  </div>
  <p class="note">${ic('info')} <span>Kilder: Enhetsregisteret og Regnskapsregisteret (åpne data, NLOD)${byer.length ? ', og aksjonærregisteret fra Skatteetaten (lokalt)' : ''}. Bare aksjeselskaper (AS og ASA) er med. Bransjekodene er de nye fra SSB (SN2025).</span></p></div>`;
  starField($('.ph .field'), { mode: 'breathe', sp: 11 });
  $$('.ideas [data-thumb]').forEach(thumb);
  onV('click', e => {
    const b = e.target.closest('.idea [data-v]'); if (!b) return;
    const box = b.closest('[data-idea]'), k = box.dataset.idea; if (st[k] === b.dataset.v) return;
    st[k] = b.dataset.v;
    $$('button', box).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); thumb(box);
    const art = box.closest('.idea'), body = $('.idea-b', art);
    if (k === 'by') body.innerHTML = rowsHtml(utb() || [], 'Ingen treff.');
    else { body.classList.add('loading'); topp({ ...Q[k](), år: Y }).then(d => { if (st[k] !== b.dataset.v) return; body.classList.remove('loading'); body.innerHTML = rowsHtml(R[k](d), 'Ingen treff.'); }); }
    if (k === 'by') $('.ov-k', art).textContent = `${byNavn(st.by)} · Personer`;
  });
}

async function toplists(q) {
  await loadMeta();
  const st = {
    liste: q.get('liste') || 'lonnsom', fylke: q.get('fylke') || '', kommune: q.get('kommune') || '', bransje: q.get('bransje') || '',
    år: q.get('år') || '2025', ans: q.get('ans') || '', form: q.get('form') || '', dir: +q.get('dir') || 0, n: +q.get('n') || 25,
  };
  const p0 = PRESETS.find(x => x.k === st.liste) || PRESETS[0];
  st.liste = p0.k;
  st.min = q.has('min') ? +q.get('min') : p0.min || 0;
  // Eldre lenker brukte kommunenavnet
  if (st.kommune && !/^\d{4}$/.test(st.kommune)) st.kommune = TMETA?.kommuner.find(k => k[1].toLowerCase() === st.kommune.toLowerCase())?.[0] || '';
  let open = false, tok = 0;
  V.innerHTML = `<div class="tl-page">
  <section class="ph"><canvas class="field" aria-hidden="true"></canvas><div class="wrap"><div class="lab nl">Topplister</div><div id="tl-h"></div></div></section>
  <div class="wrap" style="padding-bottom:80px">
    <a class="idea-ban glass" href="#/lister"><span><b>Nytt:</b> Fire nye lister – konsulenter per ansatt, advokater, regnskapsbyråer og utbytte</span><span class="eb-ar" aria-hidden="true">${ic('arrow')}</span></a>
    <div class="lists" role="tablist" aria-label="Velg toppliste">${PRESETS.map(x => `<button class="chip" role="tab" data-l="${x.k}">${esc(x.t)}</button>`).join('')}</div>
    <div class="tb glass" id="tb"></div>
    <div class="fpanel glass" id="fp" hidden></div>
    <div class="active-f" id="af"></div>
    <p class="sr" aria-live="polite" id="cnt"></p>
    <div class="rows glass loading" id="rows"><div class="empty">Henter topplisten …</div></div>
    <div id="more" style="text-align:center;margin-top:16px"></div>
    <p class="note">${ic('info')} <span>Topplistene omfatter ${TMETA ? nf.format(TMETA.selskaper) : 'alle'} norske selskaper med regnskap i Regnskapsregisteret${TMETA ? `, hentet ${fmtDate(TMETA.generert)}` : ''}. Selskaper som er konkurs eller under avvikling, og utenlandske foretak (NUF) er ikke med. Regnskap i utenlandsk valuta er regnet om til kroner med Norges Banks årssnitt. Mest lønnsomme og mest solide gjelder selskaper med ansatte. Utbytte er estimert som årsresultat minus endring i opptjent egenkapital.</span></p>
  </div></div>`;
  starField($('.ph .field'), { mode: 'breathe', sp: 11 });
  const sync = () => {
    const o = new URLSearchParams();
    Object.entries({ liste: st.liste, fylke: st.fylke, kommune: st.kommune, bransje: st.bransje, år: st.år !== '2025' && st.år, ans: st.ans, form: st.form, dir: st.dir || '', n: st.n !== 25 && st.n }).forEach(([k, v]) => v && o.set(k, v));
    const p = PRESETS.find(x => x.k === st.liste); if (st.min !== (p.min || 0)) o.set('min', st.min);
    history.replaceState(null, '', '#/topplister?' + o);
  };
  const render = async () => {
    const my = ++tok, p = PRESETS.find(x => x.k === st.liste);
    const where = (st.kommune && kommuneNavn(st.kommune)) || st.fylke || 'hele Norge';
    document.title = `${p.t} i ${where} – Kløver`;
    $('#tl-h').innerHTML = `<h1 class="h1">${esc(p.t)} <span class="muted">i ${esc(where)}</span></h1><p class="lead">${esc(p.s)} · regnskapsår ${st.år}.</p>`;
    $$('[data-l]').forEach(b => { b.classList.toggle('on', b.dataset.l === st.liste); b.setAttribute('aria-selected', b.dataset.l === st.liste); });
    const kommuner = (TMETA?.kommuner || []).filter(k => !st.fylke || k[2] === st.fylke);
    $('#tb').innerHTML = `${sel('fylke', [['', 'Hele landet'], ...FYLKER.map(f => [f, f])], st.fylke, 'Fylke')}${sel('år', [['2025', '2025'], ['2024', '2024'], ['2023', '2023']], st.år, 'Regnskapsår')}${sel('dir', [[0, p.dir < 0 ? 'Høyest først' : 'Lavest først'], [p.dir < 0 ? 1 : -1, p.dir < 0 ? 'Lavest først' : 'Høyest først']], st.dir, 'Rekkefølge')}
      <button class="btn ghost" data-a="open" aria-expanded="${open}" aria-controls="fp">${ic('filter')} Flere filtre</button><span class="sp"></span><span class="muted num" style="font-size:14px" id="tot"></span>`;
    $('#fp').hidden = !open;
    $('#fp').innerHTML = `<label>Kommune${sel('kommune', [['', 'Alle kommuner'], ...kommuner.map(k => [k[0], k[1]])], st.kommune, 'Kommune')}</label>
      <label>Bransje${sel('bransje', [['', 'Alle bransjer'], ...SECTIONS.map(s => [s[0], s[3]])], st.bransje, 'Bransje')}</label>
      <label>Minste omsetning${sel('min', [[0, 'Ingen grense'], ...Object.entries(MIN_T)], st.min, 'Minste omsetning')}</label>
      <label>Ansatte${sel('ans', [['', 'Alle'], ...Object.entries(ANS_T)], st.ans, 'Ansatte')}</label>
      <label>Selskapsform${sel('form', [['', 'AS og ASA'], ['AS', 'AS'], ['ASA', 'ASA (børsnotert)'], ['alle', 'Alle selskapsformer']], st.form, 'Selskapsform')}</label>`;
    const af = [
      st.fylke && ['fylke', st.fylke], st.kommune && ['kommune', kommuneNavn(st.kommune)], st.bransje && ['bransje', SECTIONS.find(s => s[0] === st.bransje)?.[3]],
      st.min && ['min', MIN_T[st.min] + ' i omsetning'], st.ans && ['ans', ANS_T[st.ans]], st.form && ['form', st.form === 'alle' ? 'Alle selskapsformer' : st.form], st.år !== '2025' && ['år', 'År ' + st.år],
    ].filter(Boolean);
    $('#af').innerHTML = af.length ? af.map(([k, t]) => `<button class="chip ex" data-rm="${k}" aria-label="Fjern filter ${esc(t)}">${esc(t)}<span class="x" aria-hidden="true">✕</span></button>`).join('') + '<button class="lnk" data-a="reset" style="font-size:13px;margin-left:6px">Nullstill</button>' : '';
    sync();
    // Kontrollene tegnes med en gang, radene når databasen har svart
    $('#rows').classList.add('loading');
    const { rows, total, feil } = await rankRows(st);
    if (my !== tok || !$('#rows')) return;
    $('#rows').classList.remove('loading');
    const max = Math.max(...rows.map(r => Math.abs(r.v)), 1);
    $('#tot').textContent = feil ? '' : `${nf.format(total)} selskaper`;
    $('#cnt').textContent = feil ? 'Klarte ikke å hente topplisten' : `${nf.format(total)} selskaper passer filtrene`;
    $('#rows').innerHTML = rows.length ? rows.map((r, i) => `<a class="rrow" href="#/selskap/${r.c.org}"><span class="rn num">${String(i + 1).padStart(2, '0')}</span>
      <div style="min-width:0"><b>${esc(nice(r.c.navn))}</b><span class="s">${esc(r.c.kommune)} · ${esc(r.c.bransje)}</span></div>
      <div class="val"><strong class="num">${p.f(r.v)}</strong><span class="s">${esc(p.sub(r.y) || '')}</span><div class="bar"><i style="width:${Math.max(2, Math.abs(r.v) / max * 100)}%"></i></div></div></a>`).join('')
      : feil ? '<div class="empty">Klarte ikke å hente topplisten akkurat nå. <button class="lnk" data-a="retry">Prøv igjen</button></div>'
      : '<div class="empty">Ingen selskaper passer filtrene. <button class="lnk" data-a="reset">Nullstill filtrene</button></div>';
    $('#more').innerHTML = total > rows.length && st.n < 500 ? `<button class="btn" data-a="more">Vis flere (${nf.format(Math.min(25, total - rows.length))} til)</button>` : '';
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

function facts(name, ys, ent, ro, own) {
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
  const topU = own?.ult?.find(u => u.type !== 'rest');
  if (topU) add('Største eier', pc(topU.pct), `<b>${esc(topU.name)}</b> eier ${pc(topU.pct)} totalt${topU.paths?.some(p => p.via.length) ? ', via holdingselskap' : ''}.${own.src === 'demo' ? ' <span class="demo" style="margin-top:8px">Eksempeldata</span>' : ''}`);
  const nOwn = (own?.direct?.length || 0) + (own?.rest?.[0] || 0);
  if (own?.src === 'reg' && nOwn > 1) add('Aksjonærer', nf.format(nOwn), `${n} hadde <b>${nf.format(nOwn)} aksjonærer</b> ved utgangen av ${own.year}.`);
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
function chartSVG(ys, key, si, cw = 820, hh = 0) {
  const isPct = key.startsWith('r_'), fmt = v => (isPct ? pc(v) : kr(v)), short = v => (isPct ? pc(v, 0) : krShort(v));
  const label = METRICS.find(m => m[0] === key)[1];
  const vals = ys.map(y => y[key]);
  const T = ticks(Math.min(0, ...vals.filter(v => v != null)), Math.max(0, ...vals.filter(v => v != null)));
  const W = Math.max(300, Math.round(cw)), sm = W < 560, H = hh || (sm ? 200 : 230), L = sm ? 50 : 64, R = 8, Tp = 30, B = 40, lo = T[0], hi = T.at(-1);
  const Y = v => Tp + (hi - v) / (hi - lo) * (H - Tp - B);
  const n = ys.length, plotW = W - L - R, gap = sm ? 10 : 14;
  const bw = Math.min(sm ? 64 : 112, (plotW - gap * (n - 1)) / n * .8), x0 = L + (plotW - (n * bw + (n - 1) * gap)) / 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} per år">`;
  T.forEach(t => { s += `<line class="${t === 0 ? 'zl' : 'gl'}" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${L - 10}" y="${Y(t) + 4}" text-anchor="end">${short(t)}</text>`; });
  ys.forEach((y, i) => {
    const v = y[key], x = x0 + i * (bw + gap), cx = x + bw / 2, on = i === si;
    const tip = `${label}: ${fmt(v)}` + (i > 0 && v != null && ys[i - 1][key] ? `\nEndring fra ${ys[i - 1].y}: ${isPct ? dec(v - ys[i - 1][key], 1) + ' prosentpoeng' : sgn(chg(v, ys[i - 1][key]))}` : '') + '\nKlikk for å velge året';
    s += `<rect class="hit" x="${x - gap / 2}" y="${Tp - 20}" width="${bw + gap}" height="${H - Tp - B + 40}" data-i="${i}" data-tip-t="${y.y}" data-tip="${esc(tip)}"/>`;
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
function finTable(ys, si, cmp) {
  const cols = ys.map((y, i) => ({ ...y, i })); // eldste år først, nyeste sist
  const big = Math.max(...ys.map(y => Math.abs(y.rev || 0)), ...ys.map(y => Math.abs(y.ass || 0)));
  const unit = big >= 1e7 ? 1000 : 1;
  const na = '<span class="cd na">–</span>';
  // Endring fra året før: grønn pil opp eller rød pil ned
  const delta = (v, p, u) => {
    if (v == null || p == null) return na;
    let d, txt;
    if (u === '%') { d = v - p; txt = dec(Math.abs(d), 1) + ' pp'; }
    else if (u === 'x') { d = v - p; txt = dec(Math.abs(d), 2); }
    else { if (!p) return na; d = (v - p) / Math.abs(p) * 100; txt = dec(Math.abs(d), 1) + ' %'; }
    if (Math.abs(d) < .05) return '<span class="cd">±0</span>';
    return `<span class="cd ${d > 0 ? 'up' : 'dn'}" aria-label="${d > 0 ? 'opp' : 'ned'} ${txt}">${trend(d > 0)}${txt}</span>`;
  };
  const fmt = (v, u) => (v == null ? '–' : u === '%' ? pc(v) : u === 'x' ? dec(v, 2) : nf.format(Math.round(v / unit)));
  // Alle årskolonner får samme bredde: tallet får fast bredde (lengste tall i tabellen) og endringen fast plass ved siden av
  const vw = Math.max(4, ...ROWS.filter(r => r[0] !== 'g').flatMap(([, key, , u]) => ys.map(y => fmt(y[key], u).length)));
  let html = '', grp = null;
  for (const [label, key, sum, u] of ROWS) {
    if (label === 'g') { grp = `${html ? `<tr class="gap" aria-hidden="true"><td colspan="${cols.length + 1}"></td></tr>` : ''}<tr class="grp"><td colspan="${cols.length + 1}">${key}</td></tr>`; continue; }
    if (ys.every(y => y[key] == null)) continue;
    if (grp) { html += grp; grp = null; }
    html += `<tr class="${sum ? 'sum' : ''}"><td><span class="rl">${label}${info(key, label)}</span></td>${cols.map(y => {
      const v = y[key], on = y.i === si;
      const d = y.i > 0 ? delta(v, ys[y.i - 1][key], u) : '<span class="cd"></span>'; // samme plass i alle kolonner, skjules med CSS
      return `<td class="${on ? 'on' : ''}${v == null ? ' na' : ''}"><span class="cv">${fmt(v, u)}</span>${d}</td>`;
    }).join('')}</tr>`;
  }
  return { html: `<div class="tbl-wrap"><table class="fin${cmp ? '' : ' nocmp'}" style="--vw:${vw + 1}ch"><thead><tr><th scope="col">${unit === 1000 ? 'Beløp i 1000 kr' : 'Beløp i kr'}</th>${cols.map(y => `<th scope="col" class="${y.i === si ? 'on' : ''}" data-yi="${y.i}" tabindex="0" aria-label="Velg ${y.y}">${y.y}</th>`).join('')}</tr></thead><tbody>${html}</tbody></table></div>`, unit };
}

// Regnskapstabellen skal aldri scrolle sidelengs. Blir den for bred, legges endringen under tallet.
// Er det fortsatt for trangt (mobil), vises bare året som er valgt – og på de smaleste skjermene
// legges endringen i tillegg under tallet.
function fitFin() {
  const w = $('.tbl-wrap'), t = w && $('table.fin', w);
  if (!t) return;
  for (const c of [[], ['fin-stack'], ['fin-one'], ['fin-one', 'fin-stack']]) {
    t.classList.remove('fin-stack', 'fin-one');
    t.classList.add(...c);
    if (w.scrollWidth <= w.clientWidth + 1) break;
  }
}
// Sjekk på nytt når plassen eller selve tabellen endrer størrelse. Tabellen kan bli bredere etter at den
// er tegnet, for eksempel når skriften Inter Tight er ferdig lastet første gang siden åpnes.
let finRO = null, finRaf = 0;
function watchFin() {
  const tb = $('#tbl'), t = tb && $('table.fin', tb);
  if (!t || !window.ResizeObserver) return;
  finRO?.disconnect();
  finRO = new ResizeObserver(() => { cancelAnimationFrame(finRaf); finRaf = requestAnimationFrame(fitFin); });
  finRO.observe(tb); finRO.observe(t);
}
document.fonts?.addEventListener?.('loadingdone', () => fitFin());
document.fonts?.ready.then(fitFin);

const OWN_C = ['#EBECA0', '#111', '#6b6f76', '#cfcfcf', '#9a9ea4', '#C9CB72'];
const pcp = v => (v == null ? '–' : v < .01 ? '< 0,01 %' : pc(v, v < 1 ? 2 : 1));
function ownershipBlock(own, name) {
  const badge = own.src === 'reg' ? `<span class="src-tag">Aksjonærregisteret ${own.year}</span>` : own.src === 'demo' ? '<span class="demo">Eksempeldata</span>' : '';
  const head = `<div class="block-h"><div><h2 class="h2">Hvem eier ${esc(name)}?</h2><p>${own.src === 'reg' ? `Per 31.12.${own.year}. ` : ''}Endelige eiere regnes ut gjennom alle ledd, også via holdingselskaper.</p></div>${badge}</div>`;
  if (!own.src) return head + `<div class="glass card own-empty"><div><b>Eierdata er ikke koblet på her ennå</b><p class="muted">Aksjonærregisteret fra Skatteetaten er foreløpig bare tilgjengelig i den lokale versjonen.</p></div><a class="btn" href="#/selskap/935851076">Se eksempelet ${ic('arrow')}</a></div>`;
  if (own.none) return head + `<div class="glass card own-empty"><div><b>Ikke i aksjonærregisteret</b><p class="muted">Registeret gjelder aksjeselskaper. ${esc(name)} har ingen registrerte aksjonærer for ${own.year}.</p></div></div>`;
  const U = own.ult.filter(u => u.type !== 'rest'), rest = own.ult.find(u => u.type === 'rest');
  const top = U.slice(0, 6), other = U.slice(6).reduce((s, u) => s + u.pct, 0) + (rest?.pct || 0);
  const via = u => (u.paths || []).map(p => (p.via.length ? `${pcp(p.pct)} via ${p.via.map(esc).join(' → ')}` : `${pcp(p.pct)} direkte`)).join(' · ');
  const kind = u => (u.type === 'f' ? 'Utenlandsk eier · ' : u.type === 'self' ? 'Selskapets egne aksjer · ' : u.type === 'c' ? 'Ingen eiere i registeret · ' : '');
  const row = (u, i) => { const t = u.href ? 'a' : 'div';
    return `<${t} class="lg-row" ${u.href ? `href="${u.href}"` : ''}><span class="sw" style="background:${OWN_C[i % OWN_C.length]}"></span><div><b>${esc(u.name)}</b><div class="via">${kind(u)}${via(u)}</div></div><span class="pc num">${pcp(u.pct)}</span></${t}>`; };
  const chg = d => {
    if (own.src !== 'reg' || !own.prevYear) return '';
    if (d.prev == null) return `<span class="new">Ny i ${own.year}</span>`;
    const x = d.pct - d.prev;
    return Math.abs(x) < .05 ? '' : `<span class="${x > 0 ? 'up' : 'dn'}">${trend(x > 0)}${dec(Math.abs(x), 1)} pp</span>`;
  };
  const sub = d => (d.type === 'p' ? [d.yr && `f. ${d.yr}`, d.place].filter(Boolean).join(' · ') : d.type === 'c' ? `Org.nr ${fmtOrg(d.id)}` : d.type === 'f' ? `Utenlandsk · ${esc(d.place)}` : d.type === 'self' ? 'Selskapets egne aksjer' : '');
  const tr = d => `<tr ${d.href ? `data-href="${d.href}"` : ''}><td><span class="who"><span class="av ${d.type === 'p' ? 'pe' : ''}">${esc(ini(d.name))}</span><span><b>${esc(d.name)}</b><small>${sub(d)}</small></span></span></td><td class="sh num">${d.shares != null ? nf.format(d.shares) : ''}</td><td class="num">${pcp(d.pct)}</td><td class="ch">${chg(d)}</td></tr>`;
  const list = (rows, n) => `<tbody>${rows.slice(0, n).map(tr).join('')}</tbody>${rows.length > n ? `<tbody class="more-own" hidden>${rows.slice(n).map(tr).join('')}</tbody>` : ''}`;
  const more = (rows, n, total) => (rows.length > n ? `<button class="lnk" type="button" data-more-own data-label="Vis alle ${nf.format(total || rows.length)}" style="font-size:13px;margin-top:10px">Vis alle ${nf.format(total || rows.length)}</button>` : '');
  const hdr = `<thead><tr><th>Eier</th><th class="sh">Aksjer</th><th>Andel</th><th class="ch">${own.src === 'reg' && own.prevYear ? `Fra ${own.prevYear}` : ''}</th></tr></thead>`;
  const H = own.holds.map(h => ({ ...h, type: 'c', sub: `Org.nr ${fmtOrg(h.id)}` }));
  return head + `<div class="own">
    ${U.length ? `<div class="glass card"><div class="vt">Endelige eiere</div>
      <div class="ownbar" role="img" aria-label="${top.map(u => `${esc(u.name)} ${pcp(u.pct)}`).join(', ')}">${top.map((u, i) => `<i style="width:${u.pct}%;background:${OWN_C[i % OWN_C.length]}"></i>`).join('')}${other > .05 ? `<i style="width:${other}%;background:var(--ln)"></i>` : ''}</div>
      ${top.map(row).join('')}${other > .05 ? `<div class="lg-row"><span class="sw" style="background:var(--ln)"></span><div><b>Andre</b><div class="via">${rest ? esc(rest.name) + (U.length > 6 ? ' og flere' : '') : `${U.length - 6} flere eiere`}</div></div><span class="pc num">${pcp(other)}</span></div>` : ''}</div>` : ''}
    <div class="glass card">
      ${own.direct.length ? `<div class="vt">Direkte aksjonærer</div><table class="mini own-t">${hdr}${list(own.direct, 8)}</table>${more(own.direct, 8, own.direct.length)}${own.rest ? `<p class="muted" style="font-size:12px;margin-top:8px">+ ${nf.format(own.rest[0])} andre aksjonærer med til sammen ${pcp(own.rest[1])}</p>` : ''}` : ''}
      ${H.length ? `<div class="vt" style="margin-top:${own.direct.length ? 22 : 0}px">${esc(name)} eier selv${own.holdsN > H.length ? ` (${nf.format(own.holdsN)})` : ''}</div><table class="mini own-t"><tbody>${H.slice(0, 8).map(h => `<tr data-href="${h.href}"><td><span class="who"><span class="av">${esc(ini(h.name))}</span><span><b>${esc(h.name)}</b><small>${h.sub}</small></span></span></td><td class="num">${pcp(h.pct)}</td></tr>`).join('')}</tbody>${H.length > 8 ? `<tbody class="more-own" hidden>${H.slice(8).map(h => `<tr data-href="${h.href}"><td><span class="who"><span class="av">${esc(ini(h.name))}</span><span><b>${esc(h.name)}</b><small>${h.sub}</small></span></span></td><td class="num">${pcp(h.pct)}</td></tr>`).join('')}</tbody>` : ''}</table>${more(H, 8, H.length)}` : ''}
    </div></div>`;
}
// Kjønn i styret, anslått ut fra fornavn: Brønnøysundregistrene oppgir ikke kjønn.
// Listene er vanlige fornavn i Norge. Navn som ikke står her, eller brukes av begge kjønn, regnes som ukjent.
const NAMES_K = new Set(('anne inger kari marit ingrid liv eva berit astrid bjørg hilde anna solveig marianne randi ida nina maria elisabeth kristin bente heidi silje hanne gerd linda tone tove elin anita wenche camilla monica monika ragnhild hege kirsten ellen julie karin gunn mari turid sissel janne ann line kjersti trine laila unni grete torill toril reidun irene siri sigrid emma nora sara sofie thea emilie ingeborg mette lene kristine aud jorunn marte marthe stine helene vigdis åse britt synnøve ruth else jenny guro kamilla karoline caroline vilde amalie maja hanna ella olivia leah frida tuva selma ingvild oda aurora mia linnea live mathilde hedda ane malin cecilie susanne tonje gunhild margrethe margit åshild eli ellinor eirin elise ina iselin katrine kine kristina lise lisbeth lill lillian merete mona nanna oddny oddrun petra rakel renate rita rønnaug sandra signe sigrun siv solfrid sonja stina svanhild therese tina torunn trude unn vibeke victoria viktoria yvonne åslaug hilda magnhild borghild jorid gro grethe gry hildegunn edel bodil dagny dagrun ester gudrun hjørdis inga kirsti klara lena lotte magni marie maren martine mina mira nathalie pernille agnes alma amanda andrea annette aslaug beate birgit birgitte bergljot brit carina charlotte christina christine dorthe ebba eline elsa emilia erle evelyn frøydis guri helga hedvig henriette ingunn isabel isabella jane janicke jannicke johanne josefine june karen kaja karina kathrine katharina kristiane laura lea liss louise madeleine mariann marion marita marlene maud mille miriam nikoline paula ronja rose sanna saga tiril tirill torhild tora ulrikke vera veronica veronika wilma agnete alexandra aina eldbjørg elna embla gunvor ingebjørg lisa mariell melissa oline rannveig runa seline sunniva tilde vilja ylva benedicte benedikte cathrine catrine elisabet gunhilde hildur inger-lise kjellaug liv-marit marit-anne randveig sølvi wencke ingerid fernanda dawn jennifer susan sarah rebecca rachel catherine katherine elizabeth mary patricia barbara margaret nancy betty helen donna carol sharon michelle kimberly deborah jessica amy angela brenda nicole samantha katarzyna agnieszka joanna ewa natalia olga irina svetlana tatiana elena julia sofia sophia claudia francesca giulia chiara isabelle sophie valerie sylvie monique birgitta annika åsa ulla kerstin johanna sanne femke ilse sabine heike gabriele ursula renata ana lucia carmen rosa teresa marta beatriz alice grace emily hannah charlotte lucy anne-marie annemarie mai maiken tonje-marie siw kristine-marie clare claire fiona gillian alison kirsty heather shirley jacqueline denise').split(' '));
const NAMES_M = new Set(('jan per bjørn ole lars kjell knut svein arne hans geir thomas tor morten terje odd erik martin andreas john rune anders trond harald jon tore espen olav gunnar arild helge stein øyvind kristian marius rolf leif magnus tom daniel christian einar fredrik jonas jørgen nils kåre dag steinar sverre tormod kenneth roger frode stian petter henrik even eirik vegard vidar ivar sindre sigurd emil william oliver noah lucas lukas filip isak jakob jacob mathias matias sander tobias elias aksel mats markus håkon haakon alexander aleksander kristoffer sebastian joakim joachim adrian benjamin oskar oscar johannes simon ludvig liam theodor teodor kasper vetle sondre brage ola halvor hallvard audun asbjørn atle bård bernt birger bjarne børge eivind endre erlend finn frank gaute georg gjermund glenn gudmund gustav hallgeir hugo idar inge ingvar jarle jens jo johan jostein karl ketil kjetil kolbjørn kurt leiv lasse magne mikael michael mikkel nicolai nikolai njål oddvar paul pål peder preben ragnar reidar richard rikard robert roar ronny ruben runar sigmund snorre stig svend sveinung sølve thor torbjørn thorbjørn tord torgeir torkel torstein trygve tron vebjørn viggo vilhelm vincent åge øystein øivind ørjan amund anton are arnt asle bendik bent birk dan david dennis edvard egil eilif elling erling fabian ferdinand gard gisle gorm halfdan harry herman hermann ingvald jarl jesper jim jonny jørn kristen leon mads mohammad mohammed muhammad odin olaf olve patrick peter ralf raymond rasmus roald rudolf sjur stefan steffen sten stephan sveinar tim tomas torleif truls ulf vemund walter yngve øistein aage alf arvid arve audun bjørge eskil gerhard gunstein hallstein helge ivan jørund kåre lorentz ottar per-olav reidulf sigve sivert sturla svenn tarjei torfinn torvald ulrik james joseph charles christopher mark donald steven andrew joshua kevin brian george edward ronald timothy jason jeffrey ryan gary eric stephen larry scott justin brandon alan philip tony mario marco giovanni francesco luca pierre jacques francois philippe nicolas olivier laurent carlos juan jose luis miguel pedro antonio manuel javier piotr tomasz krzysztof pawel marcin michal andrzej jakub sergei dmitri alexei igor vladimir mikhail ahmed ali omar hassan hussein mustafa yusuf abdul lennart göran sven bengt björn mikko juha jukka matti pekka timo antti heikki jørgen-andreas henning niels claus klaus hans-petter jan-erik tor-arne callum graham stuart iain ian neil gordon duncan alistair alasdair hamish craig colin keith malcolm derek trevor nigel').split(' '));
const genderOf = r => { const f = String(r.person?.navn?.fornavn || '').toLowerCase().split(/[\s-]+/)[0]; return NAMES_K.has(f) ? 'k' : NAMES_M.has(f) ? 'm' : 'u'; };
function genderBlock(board, nameOf) {
  const g = { k: 0, m: 0, u: 0 }; board.forEach(r => g[genderOf(r)]++);
  const known = g.k + g.m, pk = known ? Math.round(g.k / known * 100) : null;
  const parts = [g.k && `<span class="k">${g.k} ${g.k === 1 ? 'kvinne' : 'kvinner'}</span>`, g.m && `<span class="m">${g.m} ${g.m === 1 ? 'mann' : 'menn'}</span>`, g.u && `${g.u} ukjent`].filter(Boolean).join(' · ');
  const tip = 'Brønnøysundregistrene oppgir ikke kjønn. Vi anslår kjønnet ut fra fornavnet, så det kan bli feil. Gjelder styreleder, nestleder og styremedlemmer – ikke varamedlemmer.';
  const order = { k: 0, m: 1, u: 2 };
  return { g, pk, html: `<div class="gend"><div class="gend-p" aria-hidden="true">${[...board].sort((a, b) => order[genderOf(a)] - order[genderOf(b)]).map(r => `<i class="${genderOf(r)}" title="${esc(nameOf(r))}"></i>`).join('')}</div>
    <div class="gend-t">${pk != null ? `<b>${pk} % kvinner</b>` : '<b>Kjønn ukjent</b>'}<span>${parts}</span><button class="info" type="button" aria-label="Hvordan regnes kjønnsfordelingen ut?" aria-expanded="false" data-tip-t="Kjønnsfordeling i styret" data-tip="${esc(tip)}">i</button></div></div>` };
}
const ROLE_COLS = [
  ['Ledelse', ['DAGL', 'INNH', 'FFØR', 'BEST', 'KOMP', 'DTPR', 'DTSO']],
  ['Styret', ['LEDE', 'NEST', 'MEDL', 'VARA', 'OBS']],
  ['Revisor og regnskap', ['REVI', 'REGN']],
];
function rolesBlock(ro, links = new Map()) {
  const all = (ro?.rollegrupper || []).flatMap(gr => gr.roller).filter(r => !r.fratraadt && !r.avregistrert);
  const people = Object.entries(OWN.enheter).filter(([, e]) => e.type === 'person');
  const nameOf = r => (r.person ? [r.person.navn?.fornavn, r.person.navn?.mellomnavn, r.person.navn?.etternavn].filter(Boolean).join(' ') : nice([].concat(r.enhet?.navn || []).join(' ')));
  const order = ['DAGL', 'LEDE', 'NEST', 'MEDL', 'VARA'];
  const cols = ROLE_COLS.map(([t, codes]) => [t, all.filter(r => codes.includes(r.type.kode)).sort((a, b) => order.indexOf(a.type.kode) - order.indexOf(b.type.kode))]);
  const known = ROLE_COLS.flatMap(c => c[1]);
  const rest = all.filter(r => !known.includes(r.type.kode));
  if (rest.length) cols.push(['Andre roller', rest]);
  const item = r => {
    const n = nameOf(r), yr = r.person?.fodselsdato ? ` · f. ${r.person.fodselsdato.slice(0, 4)}` : '';
    const demoHit = !REG.meta && people.find(([, e]) => e.navn.toLowerCase() === n.toLowerCase());
    const plink = links.get(n.toLowerCase()) || (demoHit ? `#/person/${demoHit[0]}` : '');
    const match = !!plink;
    const link = plink || (r.enhet?.organisasjonsnummer ? `#/selskap/${r.enhet.organisasjonsnummer}` : '');
    const lead = ['DAGL', 'LEDE'].includes(r.type.kode);
    return `<${link ? `a href="${link}"` : 'div'} class="pp"><span class="av ${r.person ? 'pe' : ''} ${lead ? 'lead' : ''}">${esc(ini(n))}</span><div><b>${esc(n)}</b><span>${esc(r.type.beskrivelse)}${yr}${match ? ' · se eierskap' : ''}</span></div></${link ? 'a' : 'div'}>`;
  };
  const board = cols[1][1];
  // Kjønnsfordeling: styreleder, nestleder og styremedlemmer (personer, ikke vara)
  const voting = all.filter(r => r.person && ['LEDE', 'NEST', 'MEDL'].includes(r.type.kode));
  const gb = voting.length > 1 ? genderBlock(voting, nameOf) : null;
  const dl = all.find(r => r.type.kode === 'DAGL'), sl = all.find(r => r.type.kode === 'LEDE'), rev = all.find(r => r.type.kode === 'REVI');
  const summary = [
    dl && `Daglig leder: <b>${esc(nameOf(dl))}</b>`,
    board.length && `<b>${board.length}</b> i styret`,
    gb?.pk != null && `<b>${gb.pk} %</b> kvinner i styret`,
    dl && sl && nameOf(dl) === nameOf(sl) && 'Samme person er daglig leder og styreleder',
    rev ? `Revisor: <b>${esc(nameOf(rev))}</b>` : 'Ingen revisor',
  ].filter(Boolean).join('<span class="dot"></span>');
  const body = all.length ? `<div class="org glass">
    <div class="org-sum">${summary}</div>
    <div class="org-cols">${cols.filter(c => c[1].length).map(([t, rs]) => `<div class="org-col ${rs.length > 3 ? 'wide' : ''}"><div class="org-t">${t}<span class="num">${rs.length}</span></div>
      ${t === 'Styret' && rs.length > 1 ? `<div class="stack" aria-hidden="true">${rs.map(r => `<span class="av pe ${r.type.kode === 'LEDE' ? 'lead' : ''}">${esc(ini(nameOf(r)))}</span>`).join('')}</div>` : ''}
      ${t === 'Styret' && gb ? gb.html : ''}
      <div class="pp-grid">${rs.slice(0, 6).map(item).join('')}${rs.length > 6 ? `<div class="pp-more" hidden>${rs.slice(6).map(item).join('')}</div>` : ''}</div>
      ${rs.length > 6 ? `<button class="lnk" type="button" data-more-roles style="font-size:13px;margin-top:6px">Vis alle ${rs.length}</button>` : ''}</div>`).join('')}</div></div>` : '<p class="muted">Ingen roller registrert.</p>';
  return `<div class="block-h"><div><h2 class="h2">Hvem leder selskapet?</h2></div><span class="muted" style="font-size:12px">Kilde: Enhetsregisteret</span></div>${body}`;
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
  document.title = `${name} – Kløver`;
  recent.add({ href: `#/selskap/${id}`, title: name, sub: demo ? 'Eksempelselskap' : `${fmtOrg(id)} · ${nice(ent.forretningsadresse?.poststed || '')}`, kind: 'co' });
  const [own, roleLinks] = await Promise.all([ownership(id), demo ? new Map() : roleLinksFor(ro)]);
  const ys = parseYears(rs), F = facts(name, ys, ent, ro, own);
  let si = ys.length - 1, metric = 'rev', cmp = true;
  try { cmp = localStorage.getItem('klover.cmp') !== '0'; } catch (e) { /* privat modus */ }
  const hn = (ent?.historiskeNavn || []).map(h => nice(h.navn));
  const tabs = demo ? [['eiere', 'Eiere', 'tree']] : [['oversikt', 'Oversikt', 'grid'], ['innsikt', 'Innsikt', 'spark'], ['regnskap', 'Regnskap', 'chart'], ['eiere', 'Eiere', 'tree'], ['roller', 'Roller', 'users']];
  const dl = demo ? [['Type', 'Oppdiktet eksempelselskap'], ['Sted', E(id).sted]] : [
    ['Org.nr', `${fmtOrg(id)}<button class="copy" type="button" data-copy="${id}" aria-label="Kopier organisasjonsnummer">${ic('copy')}</button>`],
    ['Selskapsform', esc(ent.organisasjonsform?.beskrivelse || '')], ['Stiftet', fmtDate(ent.stiftelsesdato) || '–'],
    ['Ansatte', ent.harRegistrertAntallAnsatte ? nf.format(ent.antallAnsatte) : 'Ikke registrert'], ['Kommune', esc(nice(ent.forretningsadresse?.kommune || '–'))],
    ['Revisjon', ys.at(-1)?.fravalg ? 'Fravalgt' : ys.length ? 'Revidert' : '–'],
  ];
  V.innerHTML = `<div class="co-page">
  <section class="ph"><canvas class="field" aria-hidden="true"></canvas><div class="wrap">
    <div class="crumb"><a href="#/">Kløver</a><span>/</span><span>${demo ? 'Eksempelselskap' : esc(ent.naeringskode1?.beskrivelse || 'Selskap')}</span></div>
    <div class="co-top">
      <div><h1>${esc(name)}</h1>${hn.length ? `<p class="was">Tidligere navn: ${hn.map(esc).join(', ')}</p>` : ''}
        <div class="chips" style="margin-top:18px">${demo ? '<span class="demo">Eksempeldata</span>' : ''}${ent?.konkurs || ent?.underAvvikling || ent?.underTvangsavviklingEllerTvangsopplosning ? '<span class="chip ex">Konkurs eller avvikling</span>' : ''}${ent?.hjemmeside ? `<a class="chip" href="https://${esc(ent.hjemmeside.replace(/^https?:\/\//, ''))}" target="_blank" rel="noopener">${esc(ent.hjemmeside)} ${ic('ext')}</a>` : ''}</div>
        ${ent?.aktivitet?.length ? `<p class="desc" id="desc">${esc(ent.aktivitet.join(' ').replace(/\s+/g, ' ').trim())}</p>${ent.aktivitet.join(' ').length > 150 ? '<button class="lnk" type="button" data-more style="font-size:13px;margin-top:6px">Vis mer</button>' : ''}` : ''}</div>
      <aside class="facts glass card" aria-label="Nøkkelinformasjon"><dl>${dl.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></aside>
    </div></div></section>
  <div class="wrap" style="padding-bottom:40px">
    <nav class="subnav glass-hi" aria-label="Seksjoner"><button class="sn-cur" type="button" data-sncur aria-expanded="false" aria-controls="sn-tabs"><span id="sn-cur-t">${tabs[0][1]}</span>${ic('down')}</button>
      <div class="tabs" id="sn-tabs" data-thumb>${tabs.map(([k, t, icn], i) => `<a href="javascript:void 0" data-go="${k}" class="${i ? '' : 'on'}"><span class="sn-i">${ic(icn)}</span><span class="sn-t">${t}</span></a>`).join('')}</div>
      ${ys.length ? `<div class="yearnav" role="group" aria-label="Velg regnskapsår"><span class="lbl">Regnskapsår</span><button class="rbtn" data-y="-1" aria-label="Forrige år">${ic('left')}</button><b class="num" aria-live="polite" id="yr"></b><button class="rbtn" data-y="1" aria-label="Neste år">${ic('right')}</button></div>` : ''}</nav>
    ${!demo ? `<section class="block" id="oversikt"><div class="block-h"><div><h2 class="h2" id="ov-h"></h2><p id="ov-p"></p></div></div><div class="kgrid" id="kpis"></div></section>` : ''}
    ${F.length ? `<section class="block" id="innsikt"><div class="block-h"><div><h2 class="h2">Kjappe fakta</h2><p>Bla gjennom det regnskapet faktisk forteller om ${esc(name)}.</p></div>
      <div class="ins-ctl"><div class="trk" aria-hidden="true"><i></i></div><span class="muted num" style="font-size:13px;min-width:48px;text-align:right" data-cnt></span><button class="rbtn" data-prev aria-label="Forrige fakta">${ic('left')}</button><button class="rbtn" data-next aria-label="Neste fakta">${ic('right')}</button></div></div>
      <div class="ins"><div class="ins-track" tabindex="0" aria-label="Fakta om ${esc(name)}">${F.map((f, i) => `<article class="fact glass"><span class="idx num">${String(i + 1).padStart(2, '0')}/${String(F.length).padStart(2, '0')}</span><div class="k">${STAR}${esc(f.k)}</div><div class="big num ${f.sm ? 'sm' : ''}">${esc(f.big)}</div><p>${f.text}</p></article>`).join('')}</div></div></section>` : ''}
    ${!demo ? `<section class="block" id="regnskap"><div class="block-h"><div><h2 class="h2">Tallene år for år</h2><p>Klikk på et år for å bla tilbake i tid. Trykk på <span class="info info-inline">i</span> for å se hva en post betyr.</p></div></div>
      ${ys.length ? `        <div class="chart-card glass" id="chartbox" style="margin-bottom:20px"></div>
        <div class="tbl-card glass"><div class="tbl-bar"><span id="unit" class="muted"></span><button class="switch" type="button" role="switch" aria-checked="${cmp}" data-cmp><span class="tr" aria-hidden="true"></span>Sammenlign med året før</button></div><div id="tbl"></div><div class="tbl-foot"><span>Kilde: Regnskapsregisteret${LOCAL || PROXY ? '' : ' (lagret utdrag)'}</span><span class="hide-m">Klikk på et år for å velge det</span><span class="show-m">Bytt år med pilene i menyen øverst</span></div></div>`
        : `<div class="glass card empty">${rs?.mangler ? 'Regnskapet til dette selskapet er ikke med i den publiserte demoen ennå. Den har lagret regnskap for selskapene i topplistene.' : 'Ingen regnskap funnet i Regnskapsregisteret.'}</div>`}
      </section>` : ''}
    <section class="block" id="eiere">${ownershipBlock(own, name)}</section>
    ${!demo ? `<section class="block" id="roller">${rolesBlock(ro, roleLinks)}</section>` : ''}
  </div></div>`;
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
        const d = pct ? (v != null && p != null ? `<span class="${v - p >= 0 ? 'up' : 'dn'}">${trend(v - p >= 0)}${dec(Math.abs(v - p), 1)} poeng</span>` : '') : arrow(chg(v, p));
        return `<div class="kc glass"><div class="k">${t}${info(k === 'eq' ? 'eq' : k, t)}</div><div class="v num">${pct ? pc(v, 0) : kr(v)}</div>
          <div class="d"><span>${v == null && k === 'div' ? 'Krever to års regnskap' : d ? `${d} <span class="muted">fra ${Pv.y}</span>` : ''}</span>${ys.length > 1 ? `<span class="spark" aria-hidden="true">${vals.map((x, i) => `<i class="${i === si ? 'on' : ''}" style="height:${Math.max(8, Math.abs(x) / mx * 100)}%"></i>`).join('')}</span>` : ''}</div></div>`;
      }).join('');
    }
    if ($('#chartbox')) {
      renderChart();
      const t = finTable(ys, si, cmp); $('#tbl').innerHTML = t.html; unit = t.unit; setUnit(); fitFin(); watchFin();
    }
  };
  // Grafen: nøkkeltall-meny til venstre og graf til høyre. På mobil ligger menyen over grafen og kan scrolles sidelengs.
  const valTxt = (k, y) => (k.startsWith('r_') ? pc(y?.[k]) : kr(y?.[k]));
  const chgTxt = k => {
    const v = ys[si][k], p = ys[si - 1]?.[k];
    if (v == null || p == null) return '';
    if (k.startsWith('r_')) { const d = v - p; return `<span class="${d >= 0 ? 'up' : 'dn'}">${trend(d >= 0)}${dec(Math.abs(d), 1)} pp</span>`; }
    return arrow(chg(v, p));
  };
  const renderChart = () => {
    const box = $('#chartbox'), L = ys[si], lab = METRICS.find(m => m[0] === metric)[1];
    const mob = innerWidth <= 560;
    box.className = 'chart-card glass cv-A';
    const note = ys.length === 1 ? '<p class="chart-note">Selskapet har levert ett regnskap så langt. Grafen fylles på år for år.</p>' : '';
    const items = METRICS.map(([k, t]) => `<button role="tab" data-m="${k}" class="${k === metric ? 'on' : ''}" aria-selected="${k === metric}"><span class="t">${t}</span><span class="c">${chgTxt(k)}</span><span class="v num">${valTxt(k, L)}</span></button>`).join('');
    let menu = `<div class="cv-menu" role="tablist" aria-label="Velg nøkkeltall">${items}</div>`;
    if (mob) menu = `<div class="cv-mwrap at-start"><button class="cv-arr l" type="button" data-mscroll="-1" aria-label="Forrige nøkkeltall">${ic('left')}</button>${menu}<button class="cv-arr r" type="button" data-mscroll="1" aria-label="Flere nøkkeltall">${ic('right')}</button></div>`;
    box.innerHTML = `${menu}<div class="cv-plot"><div class="cv-head"><b>${lab}</b><span class="muted">${ys[0].y}${ys.length > 1 ? `–${ys.at(-1).y}` : ''}</span></div><div class="chart" id="chart" tabindex="0" aria-label="Graf. Bruk piltastene for å bytte år."></div>${note}</div>`;
    const mh = $('.cv-menu')?.offsetHeight || 0;
    $('#chart').innerHTML = chartSVG(ys, metric, si, $('#chart').clientWidth, mob ? 0 : Math.max(230, mh - 64));
    // Mobil: tone ut kantene og vis piler så lenge det finnes flere valg til siden
    const wrap = $('.cv-mwrap');
    if (wrap) {
      const sc = $('.cv-menu', wrap), on = $('.on', sc);
      const upd = () => { wrap.classList.toggle('at-start', sc.scrollLeft < 4); wrap.classList.toggle('at-end', sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 4); };
      if (on && on.offsetLeft + on.offsetWidth > sc.clientWidth - 40) sc.scrollLeft = on.offsetLeft - 40;
      sc.addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true });
      upd();
    }
  };
  let unit = 1;
  const setUnit = () => { const el = $('#unit'); if (el) el.innerHTML = cmp ? `Endring fra året før: <span class="up">${trend(1)}økning</span> · <span class="dn">${trend(0)}nedgang</span>` :'Slå på for å se endringen fra året før'; };
  const setYear = i => { si = Math.max(0, Math.min(ys.length - 1, i)); tipHide(); draw(); };
  onV('click', e => {
    const y = e.target.closest('[data-y]'); if (y) setYear(si + +y.dataset.y);
    const b = e.target.closest('#chartbox [data-i]'); if (b) setYear(+b.dataset.i);
    const ms = e.target.closest('[data-mscroll]');
    if (ms) { const sc = $('.cv-mwrap .cv-menu'); sc?.scrollBy({ left: +ms.dataset.mscroll * sc.clientWidth * .7, behavior: 'smooth' }); }
    const th = e.target.closest('th[data-yi]'); if (th) setYear(+th.dataset.yi);
    const m = e.target.closest('[data-m]'); if (m) { metric = m.dataset.m; $$('[data-m]').forEach(x => { x.classList.toggle('on', x === m); x.setAttribute('aria-selected', x === m); }); draw(); }
    const go = e.target.closest('[data-go]'); if (go) $('#' + go.dataset.go)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const sn = $('.subnav');
    if (go && $('#sn-cur-t')) $('#sn-cur-t').textContent = go.textContent.trim();
    const cur = e.target.closest('[data-sncur]');
    if (cur) { const o = sn.classList.toggle('open'); cur.setAttribute('aria-expanded', o); }
    else if (sn?.classList.contains('open') && (go || !e.target.closest('.subnav'))) { sn.classList.remove('open'); $('[data-sncur]')?.setAttribute('aria-expanded', 'false'); }
    const tr = e.target.closest('tr[data-href]'); if (tr) location.hash = tr.dataset.href;
    const sw = e.target.closest('[data-cmp]');
    if (sw) { cmp = !cmp; sw.setAttribute('aria-checked', cmp); try { localStorage.setItem('klover.cmp', cmp ? '1' : '0'); } catch (er) { /* */ } $('table.fin')?.classList.toggle('nocmp', !cmp); setUnit(); }
    const mr = e.target.closest('[data-more-roles]');
    if (mr) { const m = mr.parentElement.querySelector('.pp-more'); m.hidden = !m.hidden; mr.textContent = m.hidden ? `Vis alle ${mr.parentElement.querySelectorAll('.pp').length}` : 'Vis færre'; }
    const mw = e.target.closest('[data-more-own]');
    if (mw) { const tb = mw.previousElementSibling?.querySelector('.more-own'); if (tb) { tb.hidden = !tb.hidden; mw.textContent = tb.hidden ? mw.dataset.label : 'Vis færre'; } }
    const mo = e.target.closest('[data-more]');
    if (mo) { const d = $('#desc'); d.classList.toggle('open'); mo.textContent = d.classList.contains('open') ? 'Vis mindre' : 'Vis mer'; }
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
  // Scrollspy: marker den siste seksjonen som har passert under seksjonsmenyen
  const blocks = $$('.block'), tabsEl = $$('.subnav [data-go]');
  let spyRaf = 0;
  const spy = () => {
    spyRaf = 0;
    let cur = blocks[0]?.id;
    for (const b of blocks) if (b.getBoundingClientRect().top <= 170) cur = b.id;
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = blocks[blocks.length - 1]?.id;
    tabsEl.forEach(a => a.classList.toggle('on', a.dataset.go === cur));
    thumb($('#sn-tabs'));
    const ct = $('#sn-cur-t'), on = tabsEl.find(a => a.dataset.go === cur);
    if (ct && on) ct.textContent = on.textContent.trim();
  };
  addEventListener('scroll', () => { if (!spyRaf) spyRaf = requestAnimationFrame(spy); }, { passive: true, signal: pageAC.signal });
  spy();
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 150); }, { signal: pageAC.signal });
  draw();
  pageAC.signal.addEventListener('abort', () => finRO?.disconnect());
}

// ---------- Person og eiertre ----------
// ---------- Eierkartet: alt en person eier, og samlet andel gjennom alle ledd ----------
// En person kan eie samme selskap gjennom flere holdingselskaper. Hver vei ganges ut (100 % × 60 % = 60 %),
// og veiene legges sammen (60 % + 15 % = 75 %). Streken blir tykkere jo mer av selskapet som havner hos personen.
const PATH_C = ['#C8C95E', '#111111', '#E2E393', '#6b6f76', '#b9bcc0'];
function ownTarget(agg, id) {
  const a = agg.get(id);
  if (!a) return null;
  const paths = [...a.paths].sort((x, y) => y.eff - x.eff).map((n, i) => ({ eff: n.eff, chain: n.chain, c: PATH_C[i % PATH_C.length] }));
  return { id, name: a.paths[0].name, total: Math.min(100, a.total), paths };
}
const viaTxt = p => (p.chain.length > 1 ? `gjennom ${p.chain.slice(0, -1).map(c => esc(c.name)).join(' og ')}` : 'direkte');
const mathTxt = p => (p.chain.length > 1 ? `${p.chain.map(c => pcp(c.andel)).join(' × ')} = <b>${pcp(p.eff)}</b>` : `direkte <b>${pcp(p.eff)}</b>`);
// Ring som viser hvor stor del av selskapet personen eier, delt etter veiene
function ownRing(segs, size = 46) {
  const r = 18, C = 2 * Math.PI * r; let acc = 0;
  const arcs = segs.map(([v, c]) => { const len = Math.max(0, v) / 100 * C, o = `<circle r="${r}" cx="22" cy="22" fill="none" stroke="${c}" stroke-width="7" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"/>`; acc += len; return o; }).join('');
  return `<svg class="ring" viewBox="0 0 44 44" width="${size}" height="${size}" aria-hidden="true"><circle r="${r}" cx="22" cy="22" fill="none" stroke="#ecebe6" stroke-width="7"/><g transform="rotate(-90 22 22)">${arcs}</g></svg>`;
}
// Graf for alt personen eier: hver gren (direkte eierskap) får sin farge
function fullGraph(tree, agg, pname, max = 14) {
  const top = new Set([...agg.values()].sort((a, b) => b.total - a.total).slice(0, max).map(a => a.id));
  const all = []; (function walk(ns) { ns.forEach(n => { all.push(n); walk(n.kids); }); })(tree);
  const keep = all.filter(n => top.has(n.id));
  const branch = new Map(tree.map((n, i) => [n.id, PATH_C[i % (PATH_C.length - 1)]]));
  const col = new Map();
  keep.forEach(n => n.chain.forEach((c, k) => col.set(c.selskap, Math.max(col.get(c.selskap) || 0, k + 1))));
  const cols = Math.max(1, ...col.values()) + 1;
  const nodes = new Map([['P', { id: 'P', name: pname, col: 0, pe: 1, pi: new Set(keep.map((_, j) => j)), sub: `${agg.size} selskaper` }]]);
  const links = new Map(), occ = new Set();
  keep.forEach((n, j) => {
    let prev = 'P', prod = 100;
    n.chain.forEach((c, k) => {
      prod *= c.andel / 100;
      if (!nodes.has(c.selskap)) nodes.set(c.selskap, { id: c.selskap, name: c.name, col: col.get(c.selskap), pi: new Set(), total: agg.get(c.selskap)?.total || 0, br: branch.get(n.chain[0].selskap) });
      nodes.get(c.selskap).pi.add(j);
      const key = `${prev}>${c.selskap}`;
      if (!links.has(key)) links.set(key, { key, f: prev, t: c.selskap, w: 0, c: branch.get(n.chain[0].selskap), lb: pcp(c.andel), pi: [], tip: `${nodes.get(prev).name} eier ${pcp(c.andel)} av ${c.name}` });
      const l = links.get(key), o = n.chain.slice(0, k + 1).map(x => x.selskap).join('>');
      if (!occ.has(o)) { occ.add(o); l.w += prod; }
      if (!l.pi.includes(j)) l.pi.push(j);
      prev = c.selskap;
    });
  });
  const ns = [...nodes.values()].sort((a, b) => a.col - b.col || PATH_C.indexOf(a.br) - PATH_C.indexOf(b.br) || (b.total || 0) - (a.total || 0));
  ns.forEach(n => { if (!n.pe) n.sub = `<b class="num">${pcp(n.total)}</b>`; });
  return { cols, nodes: ns, links: [...links.values()], keep };
}
// Flytdiagrammet: noder i kolonner (på mobil i rader) og streker tegnet i SVG når boksene har fått plass
function flowBox(G, cls = '') {
  const colsHtml = Array.from({ length: G.cols }, (_, i) => `<div class="fcol">${G.nodes.filter(n => n.col === i).map(n => `<button type="button" class="fn${n.pe ? ' pe' : ''}" data-n="${esc(n.id)}" data-pi="${[...n.pi].join(',')}"${n.br ? ` style="--br:${n.br}"` : ''}>
      <span class="av${n.pe ? ' pe' : ''}">${esc(ini(n.name))}</span><span class="fn-t"><span class="fn-n">${esc(n.name)}</span>${n.sub ? `<span class="fn-s">${n.sub}</span>` : ''}</span></button>`).join('')}</div>`).join('');
  const L = G.links.map(({ key, f, t, w, c, lb, pi, tip }) => ({ key, f, t, w, c, lb, pi, tip }));
  return `<div class="flow ${cls}" style="--cols:${G.cols}" data-links='${esc(JSON.stringify(L))}'><svg class="flow-l"></svg>${colsHtml}<div class="ftip" hidden></div></div>`;
}
function drawFlow(fl) {
  const svg = fl && $('.flow-l', fl);
  if (!svg) return;
  const R = fl.getBoundingClientRect(), vert = getComputedStyle(fl).display !== 'grid';
  const pos = new Map($$('.fn', fl).map(el => { const r = el.getBoundingClientRect(); return [el.dataset.n, { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height }]; }));
  const links = JSON.parse(fl.dataset.links), outs = new Map(), ins = new Map();
  const push = (m, k, l) => (m.get(k) || m.set(k, []).get(k)).push(l);
  links.forEach(l => { if (pos.has(l.f) && pos.has(l.t)) { push(outs, l.f, l); push(ins, l.t, l); } });
  const mid = id => (vert ? pos.get(id).x + pos.get(id).w / 2 : pos.get(id).y + pos.get(id).h / 2);
  outs.forEach(a => a.sort((x, y) => mid(x.t) - mid(y.t)));
  ins.forEach(a => a.sort((x, y) => mid(x.f) - mid(y.f)));
  // Tykkelse: 100 % gir 12 px. Strekene fra samme boks legges ved siden av hverandre, som i et Sankey-diagram.
  const sw = l => Math.max(2, l.w / 100 * 12);
  const stack = (arr, l, size) => { const tot = arr.reduce((s, x) => s + sw(x), 0) + (arr.length - 1) * 3, room = Math.min(tot, size - 12); let o = -room / 2; for (const x of arr) { const w = sw(x) * room / tot; if (x === l) return o + w / 2; o += w + 3 * room / tot; } return 0; };
  let s = '';
  const labs = [];
  links.forEach(l => {
    if (!pos.has(l.f) || !pos.has(l.t)) return;
    const a = pos.get(l.f), b = pos.get(l.t), w = sw(l);
    let x1, y1, x2, y2, d, cp;
    if (!vert) {
      x1 = a.x + a.w; y1 = a.y + a.h / 2 + stack(outs.get(l.f), l, a.h); x2 = b.x; y2 = b.y + b.h / 2 + stack(ins.get(l.t), l, b.h);
      const m = (x1 + x2) / 2; d = `M${x1.toFixed(1)} ${y1.toFixed(1)}C${m.toFixed(1)} ${y1.toFixed(1)} ${m.toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      cp = [m, y1, m, y2];
    } else {
      x1 = a.x + a.w / 2 + stack(outs.get(l.f), l, a.w); y1 = a.y + a.h; x2 = b.x + b.w / 2 + stack(ins.get(l.t), l, b.w); y2 = b.y;
      const m = (y1 + y2) / 2; d = `M${x1.toFixed(1)} ${y1.toFixed(1)}C${x1.toFixed(1)} ${m.toFixed(1)} ${x2.toFixed(1)} ${m.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      cp = [x1, m, x2, m];
    }
    const pi = l.pi.join(',');
    s += `<g class="lk" data-pi="${pi}" style="--c:${l.c}"><path class="lk-b" d="${d}" stroke-width="${w.toFixed(1)}"/><path class="lk-h" d="${d}" stroke-width="${Math.max(18, w + 10).toFixed(1)}" data-ftip="${esc(l.tip)}" data-pi="${pi}"/></g>`;
    // Etiketten står 70 % ut på streken, nær selskapet den peker på – da kolliderer de sjeldnere der strekene krysser
    const t = .7, u = 1 - t, bz = (p0, p1, p2, p3) => u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    const lw = l.lb.length * 7 + 16, lx = bz(x1, cp[0], cp[2], x2), ly = bz(y1, cp[1], cp[3], y2);
    labs.push({ x: lx, y: ly, w: lw, pi, c: l.c, lb: l.lb });
  });
  // Etiketter som overlapper, skyves fra hverandre på tvers av strekene
  const ax = vert ? 'x' : 'y', size = q => (vert ? q.w : 22);
  labs.sort((p, q) => p[ax] - q[ax]);
  for (let i = 0; i < labs.length; i++) for (let j = 0; j < i; j++) {
    const a = labs[j], b = labs[i];
    if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 2 && Math.abs(a.y - b.y) < 24) b[ax] = a[ax] + (size(a) + size(b)) / 2 + 4;
  }
  const lab = labs.map(q => `<g class="lb" data-pi="${q.pi}" transform="translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})" style="--c:${q.c}"><rect x="${-q.w / 2}" y="-11" width="${q.w}" height="22" rx="11"/><text text-anchor="middle" dy="4.2">${esc(q.lb)}</text></g>`).join('');
  svg.innerHTML = s + lab;
}
// Fremhev veiene med disse nummerne (null = alle)
function hlFlow(box, pis) {
  if (!box) return;
  $$('[data-pi]', box).forEach(el => {
    const on = !pis || el.dataset.pi.split(',').some(i => pis.includes(+i));
    el.classList.toggle('dim', !on); el.classList.toggle('hl', !!pis && on);
  });
}
// Hele eierkartet: alt personen eier i ett diagram – trykk på et selskap for å se regnestykket
function ovMap(tree, agg, pname, tid) {
  const fn = first(pname), G = fullGraph(tree, agg, pname), T = ownTarget(agg, tid);
  const pis = G.keep.map((n, j) => (n.id === tid ? j : -1)).filter(j => j >= 0);
  const card = T ? `<aside class="map-card" aria-live="polite"><span class="ov-k">Valgt selskap</span><h4>${esc(T.name)}</h4>
      <div class="map-tot">${ownRing(T.paths.map(p => [p.eff, p.c]), 64)}<div><b class="num">${pcp(T.total)}</b><span>eies av ${esc(fn)}${T.paths.length > 1 ? `, gjennom ${T.paths.length} veier` : ''}</span></div></div>
      <div class="map-paths">${T.paths.map(p => `<div class="mp" style="--c:${p.c}"><span class="dot"></span><div><span>${p.chain.length > 1 ? viaTxt(p).replace(/^gjennom/, 'Via') : 'Direkte'}</span><span class="num">${mathTxt(p)}</span></div></div>`).join('')}
      ${T.paths.length > 1 ? `<div class="mp sum"><div><span>Til sammen</span><span class="num">${T.paths.map(p => pcp(p.eff)).join(' + ')} = <b>${pcp(T.total)}</b></span></div></div>` : ''}</div>
      <a class="btn ghost sm" href="#/selskap/${esc(T.id)}">Åpne selskapet ${ic('arrow')}</a></aside>` : '';
  const more = agg.size > G.nodes.length - 1 ? `<p class="ov-n">Viser de ${G.nodes.length - 1} største av ${agg.size} selskaper.</p>` : '';
  return `<div class="ov glass ov-m" data-selpi="${pis.join(',')}">
    <div class="ov-h"><div><span class="ov-k">Eierkart</span><h3>Alt ${esc(fn)} eier – trykk på et selskap</h3></div></div>
    <div class="map-grid">${flowBox(G, 'map')}${card}</div>
    <p class="ov-n">Tallet på hver strek er eierandelen i det leddet. Jo tykkere strek, jo mer av selskapet havner hos ${esc(fn)}.</p>${more}</div>`;
}

async function person(id) {
  skeleton();
  let p, tree, src;
  if (isRegKey(id) && await regMeta()) {
    const h = await regHold(id);
    if (!h) { V.innerHTML = `<section class="ph"><div class="wrap"><div class="crumb"><a href="#/eiere">Eiersøk</a></div><h1 class="h2">Fant ikke eieren</h1><p class="lead" style="margin-top:16px">Denne eieren finnes ikke i aksjonærregisteret for ${REG.meta.år}.</p></div></section>`; return; }
    const [, navn, yr, place] = h.i || [];
    p = { navn: nice(navn || 'Ukjent eier'), sted: nice(place || ''), yr };
    tree = await regTree(id); src = 'reg';
  } else {
    await loadOwn();
    const e = E(id);
    if (!e || e.type !== 'person') { location.hash = '#/eiere'; return; }
    p = { navn: e.navn, sted: e.sted }; tree = buildTree(id); src = 'demo';
  }
  document.title = `${p.navn} – Kløver`;
  recent.add({ href: `#/person/${id}`, title: p.navn, sub: src === 'reg' ? [p.yr && `f. ${p.yr}`, p.sted].filter(Boolean).join(' · ') : 'Eiertre · eksempeldata', kind: 'pe' });
  const agg = aggregate(tree);
  const direct = tree.length, fn = first(p.navn);
  const open = new Set(), keyOf = n => n.chain.map(e => e.selskap).join('>');
  let selected = null, mode = 'tree';
  // Valgt selskap i eierkartet: først det personen eier gjennom flest veier
  let tid = [...agg.values()].sort((a, b) => b.paths.length - a.paths.length || b.total - a.total)[0]?.id || null;
  const find = (nodes, k) => { for (const n of nodes) { if (keyOf(n) === k) return n; const f = find(n.kids, k); if (f) return f; } };
  const all = (nodes, f) => nodes.forEach(n => { f(n); all(n.kids, f); });
  V.innerHTML = `
  <section class="ph"><canvas class="field" aria-hidden="true"></canvas><div class="wrap">
    <div class="crumb"><a href="#/eiere">Eiersøk</a><span>/</span><span>Person</span></div>
    <h1 class="h1" style="font-size:clamp(40px,5.8vw,88px)">${esc(p.navn)}</h1>
    <p class="lead" style="margin-top:20px">Eier noe i <b>${agg.size} selskaper</b> – ${direct} direkte og ${agg.size - direct} gjennom andre selskaper.</p>
    <div class="chips" style="margin-top:18px">${p.yr ? `<span class="chip">f. ${esc(p.yr)}</span>` : ''}${p.sted ? `<span class="chip">${esc(p.sted)}</span>` : ''}${src === 'reg' ? `<span class="src-tag">Aksjonærregisteret ${REG.meta.år}</span>` : '<span class="demo">Eksempeldata</span>'}</div>
  </div></section>
  <div class="wrap" style="padding-bottom:110px">
    <div class="block-h"><div><h2 class="h2">Hva eier ${esc(fn)}?</h2><p>Kartet viser alt ${esc(fn)} eier. Prosentene er ${esc(fn)}s reelle andel – ganget gjennom alle ledd og lagt sammen når det finnes flere veier.</p></div></div>
    <div id="pbox"></div>
    <div class="tv-bar"><div class="seg" id="pmode" data-thumb role="tablist" aria-label="Visning"><button type="button" role="tab" data-m="tree" class="on" aria-selected="true">Eiertre</button><button type="button" role="tab" data-m="list" aria-selected="false">Samlet oversikt</button></div><button class="btn ghost" data-x>Utvid alle</button></div>
    <div id="tv"></div>
  </div>`;
  constellation($('.ph .field'));
  const nodeHtml = (n, parent) => {
    const e = { navn: n.name }, k = keyOf(n), has = n.kids.length, isOpen = open.has(k), tot = agg.get(n.id).total;
    return `<div class="node"><div class="nrow glass ${selected === k ? 'picked' : ''}" data-key="${k}" role="treeitem" tabindex="0" aria-expanded="${has ? isOpen : ''}" aria-selected="${selected === k}">
      <span class="tg ${has ? (isOpen ? 'open' : '') : 'leaf'}">${ic('right')}</span><span class="av">${esc(ini(e.navn))}</span>
      <div class="nm"><b>${esc(e.navn)}</b><span>${esc(parent)} eier ${pcp(n.andel)}${has ? ` · eier selv ${n.kids.length} selskap${n.kids.length > 1 ? 'er' : ''}` : ''}</span></div>
      <div class="eff"><b class="num">${pcp(n.eff)}</b><span>${esc(fn)} ${n.chain.length > 1 ? 'indirekte' : 'direkte'}${Math.abs(tot - n.eff) > .01 ? ` · totalt ${pcp(tot)}` : ''}</span></div>
      <a class="open-l" href="#/selskap/${n.id}" data-open aria-label="Åpne ${esc(e.navn)}">${ic('arrow')}</a></div>
      ${has && isOpen ? `<div class="kids" role="group">${n.kids.map(c => nodeHtml(c, e.navn)).join('')}</div>` : ''}</div>`;
  };
  // Eierkartet over treet: tegn strekene når boksene har fått plass, og fremhev veiene til valgt selskap
  const selPis = () => { const m = $('#pbox .ov-m'); return m?.dataset.selpi ? m.dataset.selpi.split(',').map(Number) : null; };
  const paint = () => {
    const m = $('#pbox .ov-m'); if (!m) return;
    drawFlow($('.flow', m)); hlFlow($('.flow', m), selPis());
    $$('.fn', m).forEach(f => f.classList.toggle('is-sel', f.dataset.n === tid));
  };
  const renderMap = () => { $('#pbox').innerHTML = agg.size ? ovMap(tree, agg, p.navn, tid) : ''; requestAnimationFrame(paint); };
  const listHtml = () => `<div class="glass card"><table class="mini"><tbody>${[...agg.values()].sort((a, b) => b.total - a.total).map(a => {
    const e = { navn: a.paths[0].name }, kinds = new Set(a.paths.map(x => (x.chain.length > 1 ? 'indirekte' : 'direkte')));
    return `<tr data-href="#/selskap/${a.id}"><td><span style="display:flex;align-items:center;gap:12px"><span class="av">${esc(ini(e.navn))}</span><span><b style="font-weight:500">${esc(e.navn)}</b><br><span class="muted" style="font-size:13px">${a.paths.map(x => (x.chain.length > 1 ? `${pcp(x.eff)} via ${x.chain.slice(0, -1).map(c => esc(c.name)).join(' → ')}` : `${pcp(x.eff)} direkte`)).join(' · ')}</span></span></span></td>
      <td class="muted" style="font-weight:400;text-align:right;white-space:nowrap">${[...kinds].join(' + ')}</td><td style="font-size:20px;white-space:nowrap;padding-left:16px">${pcp(a.total)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  // Kartet blir stående når du bytter mellom eiertre og samlet oversikt – bare listen under byttes
  const render = () => { renderMap(); renderList(); };
  const renderList = () => {
    $('#tv').innerHTML = mode === 'tree' ? `<div class="tree" role="tree" aria-label="Eiertre for ${esc(p.navn)}"><div class="nrow glass" style="cursor:default;transform:none"><span class="av pe">${esc(ini(p.navn))}</span><div class="nm"><b>${esc(p.navn)}</b><span>${agg.size} selskaper totalt</span></div><div class="eff"><b>100 %</b><span>utgangspunkt</span></div></div><div class="node"><div class="kids" role="group">${tree.map(n => nodeHtml(n, fn)).join('')}</div></div></div>` : listHtml();
    $('[data-x]').style.visibility = mode === 'tree' ? '' : 'hidden'; // beholder plassen, så bryteren ikke endrer størrelse
    thumb($('#pmode'));
  };
  // Trykk i treet: åpne/lukk, og vis selskapet i eierkartet. Raden blir stående der den var på skjermen.
  const toggle = k => {
    const y0 = $(`.nrow[data-key="${k}"]`)?.getBoundingClientRect().top;
    if (open.has(k) && selected === k) open.delete(k); else open.add(k);
    selected = k; const n = find(tree, k); if (n) tid = n.id;
    render();
    const el = $(`.nrow[data-key="${k}"]`);
    if (el && y0 != null) scrollBy(0, el.getBoundingClientRect().top - y0);
    el?.focus({ preventScroll: true });
  };
  $('#tv').addEventListener('click', e => {
    if (e.target.closest('[data-open]')) return;
    const tr = e.target.closest('tr[data-href]'); if (tr) { location.hash = tr.dataset.href; return; }
    const r = e.target.closest('.nrow[data-key]'); if (r) toggle(r.dataset.key);
  });
  const pb = $('#pbox');
  // Trykk på et selskap i kartet: vis regnestykket for det
  pb.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    const f = e.target.closest('.fn'); if (f && f.dataset.n !== 'P' && f.dataset.n !== tid) { tid = f.dataset.n; renderMap(); }
  });
  // Pek (mus): fremhev veiene du peker på, og vis hva streken betyr
  const hover = matchMedia('(hover: hover)').matches;
  const restore = () => hlFlow($('.ov-m .flow', pb), selPis());
  pb.addEventListener('pointermove', e => {
    if (!hover) return;
    const fl = e.target.closest('.flow'), tp = fl && $('.ftip', fl), h = e.target.closest('[data-ftip]');
    if (tp) { if (h) { const R = fl.getBoundingClientRect(); tp.textContent = h.dataset.ftip; tp.hidden = false; tp.style.left = `${e.clientX - R.left}px`; tp.style.top = `${e.clientY - R.top}px`; } else tp.hidden = true; }
    const area = $('.ov-m .flow', pb), el = e.target.closest('[data-pi]');
    if (area && el && area.contains(el)) hlFlow(area, el.dataset.pi.split(',').map(Number)); else restore();
  });
  pb.addEventListener('pointerleave', () => { restore(); $$('.ftip', pb).forEach(x => { x.hidden = true; }); });
  let praf = 0;
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { cancelAnimationFrame(praf); praf = requestAnimationFrame(paint); }); ro.observe(pb); pageAC.signal.addEventListener('abort', () => ro.disconnect()); }
  document.fonts?.ready.then(() => requestAnimationFrame(paint));
  $('#tv').addEventListener('keydown', e => { const r = e.target.closest('.nrow[data-key]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(r.dataset.key); } });
  // Eiertre / Samlet oversikt: knyttet til akkurat denne bryteren, ikke den første .seg på siden
  $('#pmode').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === mode) return; mode = b.dataset.m; $$('#pmode button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); renderList(); });
  $('[data-x]').addEventListener('click', e => { const any = open.size; open.clear(); if (!any) all(tree, n => n.kids.length && open.add(keyOf(n))); e.target.textContent = any ? 'Utvid alle' : 'Lukk alle'; renderList(); });
  render();
}

async function owners() {
  await loadOwn();
  document.title = 'Eiersøk – Kløver';
  const reg = await regMeta();
  const people = reg ? [] : Object.entries(OWN.enheter).filter(([, e]) => e.type === 'person');
  const exHref = reg ? await examplePersonHref() : '';
  V.innerHTML = `
  <section class="ph" style="padding-bottom:80px"><canvas class="field" aria-hidden="true"></canvas><div class="wrap">
    <div class="lab nl">Eiersøk</div><h1 class="h1" style="font-size:clamp(40px,6vw,92px)">Hvem eier<br><span style="color:var(--mut)">hva</span>?</h1>
    <p class="lead" style="margin:22px 0 30px">${reg ? `Søk blant ${nf.format(reg.personer)} personer og ${nf.format(reg.selskaper)} selskaper i aksjonærregisteret for ${reg.år}. Vi følger eierskapet gjennom holdingselskapene og regner ut den reelle andelen.` : 'Søk på en person og se alt de eier – direkte og gjennom holdingselskaper. Vi regner ut den reelle andelen for deg.'}</p>
    <div id="os" style="max-width:620px"></div></div></section>
  <section class="sec" style="padding-top:40px"><div class="wrap">
    <div class="lab">${reg ? 'Prøv selv' : 'Prøv eksempelet'}</div>
    <div class="block-h"><h2 class="h2 rv">${reg ? 'Ekte eiere,<br>ekte regnestykker.' : 'Oppdiktede eiere,<br>ekte regnestykker.'}</h2>${reg ? `<span class="src-tag rv">Aksjonærregisteret ${reg.år}</span>` : '<span class="demo rv">Eksempeldata</span>'}</div>
    <div class="roles">${reg ? `<a class="role glass rv" href="${exHref}"><span class="av pe">PS</span><div><b>Petter Sommerseth</b><span>Eier via holdingselskap</span></div></a>
      <a class="role glass rv" href="#/selskap/923609016"><span class="av">EQ</span><div><b>Equinor ASA</b><span>131 000+ aksjonærer, staten eier 67 %</span></div></a>` : people.map(([pid, e]) => `<a class="role glass rv" href="#/person/${pid}"><span class="av pe">${esc(ini(e.navn))}</span><div><b>${esc(e.navn)}</b><span>Eier i ${aggregate(buildTree(pid)).size} selskaper · ${esc(e.sted)}</span></div></a>`).join('')}
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
  $('#os').append(makeSearch({ mode: 'hero', placeholder: 'Søk etter en person eller et selskap' }).el);
}

async function about() {
  await Promise.all([regMeta(), loadMeta()]);
  document.title = 'Om dataene – Kløver';
  V.innerHTML = `
  <section class="ph"><canvas class="field" aria-hidden="true"></canvas><div class="wrap"><div class="lab nl">Om dataene</div>
    <h1 class="h1" style="font-size:clamp(40px,5.8vw,88px)">Hvor tallene<br>kommer fra.</h1>
    <p class="lead" style="margin-top:22px">Kløver er bygget på åpne data fra Brønnøysundregistrene, lisensiert under Norsk lisens for offentlige data (NLOD).</p></div></section>
  <section class="sec" style="padding-top:30px"><div class="wrap"><div class="sv">
    <div class="rv"><span>01</span><h3>Enhetsregisteret</h3><p>Navn, adresse, bransje, ansatte, stiftelsesdato, navnehistorikk og roller. Hentes direkte og er alltid oppdatert.</p></div>
    <div class="rv"><span>02</span><h3>Regnskapsregisteret</h3><p>Resultat og balanse for de tre siste årene. ${LOCAL || PROXY ? 'Hentes direkte.' : 'Den publiserte siden viser et lagret utdrag for selskapene i topplistene, fordi registeret ikke kan kalles direkte fra nettleseren.'} Utbytte er estimert som årsresultat minus endring i opptjent egenkapital.</p></div>
    <div class="rv"><span>03</span><h3>Topplister</h3><p>Alle ${TMETA ? nf.format(TMETA.selskaper) + ' ' : ''}norske selskaper med regnskap i Regnskapsregisteret${TMETA ? `, hentet ${fmtDate(TMETA.generert)}` : ''}, lagret i en egen database. Regnskap i utenlandsk valuta er regnet om til kroner med Norges Banks årssnitt, og åpenbare feil i registeret (som beløp oppgitt i feil enhet) er rettet eller tatt ut.</p></div>
    <div class="rv"><span>04</span><h3>Eierskap</h3><p>${REG.meta ? `Aksjonærregisteret fra Skatteetaten for ${[...REG.meta.tidligere].reverse().join(', ')} og ${REG.meta.år}: ${nf.format(REG.meta.selskaper)} selskaper og ${nf.format(REG.meta.personer)} personer. Bare i den lokale versjonen, fordi registeret inneholder personopplysninger.` : 'Eksempeldata på denne siden. Aksjonærregisteret fra Skatteetaten er foreløpig bare koblet på i den lokale versjonen, fordi det inneholder personopplysninger.'}</p></div>
  </div></div></section>`;
  starField($('.ph .field'), { mode: 'breathe', sp: 11 });
}

route();
