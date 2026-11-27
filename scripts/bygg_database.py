"""Bygger topplistedatabasen fra alle regnskapene og Enhetsregisteret.

Leser (lages av hent_alle_regnskap.py og enheter_kompakt.py, ignorert av Git):
    data/regnskap_alle/regnskap.jsonl
    data/regnskap_alle/enheter.jsonl
    data/regnskap_alle/naering.json

Skriver:
    data/regnskap_alle/klover.db        SQLite-kopi for testing lokalt
    data/regnskap_alle/d1/*.sql         samme data som SQL, for import til Cloudflare D1
    data/topp-meta.json                 dato, antall selskaper og kommunene i listene (åpne data, publiseres)

Med i listene: selskaper som fortsatt finnes og ikke er konkurs eller under avvikling. Utenlandske foretak (NUF)
er utelatt, fordi mange av dem oppgir morselskapets globale regnskap.

Rettinger av åpenbare feil i registeret:
  - Regnskap i annen valuta (Equinor, Aker BP, Mowi ...) regnes om til kroner med Norges Banks årssnitt.
  - År som er registrert i feil enhet (1000 ganger for store eller små) rettes ved å sammenligne med årene rundt.
  - År der resultatet eller omsetningen ikke henger sammen med balansen, tas ut.
  - Utbytte regnes ikke når nesten hele egenkapitalen forsvinner (under 10 % igjen): det er som regel en fusjon
    eller fisjon, ikke utbytte.

Kjør:  python3 scripts/bygg_database.py
Importer filene i rekkefølge (én om gangen, prøv på nytt hvis Cloudflare svarer med feil):
    for f in data/regnskap_alle/d1/*.sql; do npx wrangler d1 execute klover --remote -c proxy/wrangler.toml --file "$f" -y; done
"""
import csv, glob, io, json, os, sqlite3, time, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
DIR = os.path.join(ROOT, "data", "regnskap_alle")
DB, SQLDIR, META = os.path.join(DIR, "klover.db"), os.path.join(DIR, "d1"), os.path.join(ROOT, "data", "topp-meta.json")
YEARS = ("2023", "2024", "2025")
FYLKER = {"03": "Oslo", "11": "Rogaland", "15": "Møre og Romsdal", "18": "Nordland", "31": "Østfold", "32": "Akershus",
          "33": "Buskerud", "34": "Innlandet", "39": "Vestfold", "40": "Telemark", "42": "Agder", "46": "Vestland",
          "50": "Trøndelag", "55": "Troms", "56": "Finnmark"}
# Næringshovedområder (SN2025) – samme inndeling som SECTIONS i assets/app.js
SECTIONS = [("A", 1, 3), ("B", 5, 9), ("C", 10, 33), ("D", 35, 35), ("E", 36, 39), ("F", 41, 43), ("G", 45, 47), ("H", 49, 53),
            ("I", 55, 56), ("J", 58, 63), ("K", 64, 66), ("L", 68, 68), ("M", 69, 75), ("N", 77, 82), ("O", 84, 84), ("P", 85, 85),
            ("Q", 86, 88), ("R", 90, 93), ("S", 94, 96)]

SCHEMA = """
DROP TABLE IF EXISTS selskap;
DROP TABLE IF EXISTS aar;
DROP TABLE IF EXISTS naering;
CREATE TABLE selskap (org TEXT PRIMARY KEY, navn TEXT NOT NULL, kommune TEXT);
CREATE TABLE naering (kode TEXT PRIMARY KEY, navn TEXT NOT NULL);
-- Én rad per selskap og regnskapsår. Filterfeltene er kopiert inn, så en toppliste er ett oppslag i én tabell.
CREATE TABLE aar (
  org TEXT NOT NULL, ar INTEGER NOT NULL,
  form TEXT, fylke TEXT, knr TEXT, seksjon TEXT, nace TEXT, ans INTEGER NOT NULL DEFAULT 0,
  rev INTEGER, op INTEGER, net INTEGER, eq INTEGER, ass INTEGER, div INTEGER,
  margin REAL, solid REAL, vekst REAL,
  PRIMARY KEY (org, ar)
) WITHOUT ROWID;
"""
INDEXES = """
CREATE INDEX aar_margin ON aar (ar, margin);
CREATE INDEX aar_net ON aar (ar, net);
CREATE INDEX aar_div ON aar (ar, div);
CREATE INDEX aar_eq ON aar (ar, eq);
CREATE INDEX aar_rev ON aar (ar, rev);
CREATE INDEX aar_vekst ON aar (ar, vekst);
CREATE INDEX aar_solid ON aar (ar, solid);
CREATE INDEX aar_ans ON aar (ar, ans);
CREATE INDEX aar_fylke ON aar (ar, fylke);
CREATE INDEX aar_knr ON aar (knr, ar);
CREATE INDEX aar_seksjon ON aar (ar, seksjon);
CREATE INDEX aar_nace ON aar (nace, ar);
"""
COLS = ("org", "ar", "form", "fylke", "knr", "seksjon", "nace", "ans", "rev", "op", "net", "eq", "ass", "div", "margin", "solid", "vekst")


def seksjon(nace):
    try:
        d = int(nace[:2])
    except (TypeError, ValueError):
        return None
    return next((s for s, lo, hi in SECTIONS if lo <= d <= hi), None)


def i(v):
    return None if v is None else int(round(v))


def r2(v):
    return None if v is None else round(v, 2)


MONEY = ("rev", "salg", "cost", "wage", "op", "fin", "pre", "tax", "net", "ass", "omlop", "bank", "eq", "oek", "gjeld", "kort")


def rates():
    """Norges Banks årlige gjennomsnittskurser: {valuta: {år: kroner per enhet}}."""
    url = ("https://data.norges-bank.no/api/data/EXR/A.USD+EUR+GBP+SEK+DKK+CHF+JPY.NOK.SP"
           "?format=csv&startPeriod=2020&endPeriod=2026&locale=en")
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Klover-datainnhenting/1.0"}), timeout=30) as r:
        rows = csv.DictReader(io.StringIO(r.read().decode("utf-8-sig")), delimiter=";")
        out = {}
        for row in rows:
            out.setdefault(row["BASE_CUR"], {})[row["TIME_PERIOD"]] = float(row["OBS_VALUE"].replace(",", "")) / 10 ** int(row["UNIT_MULT"])
    return out


def to_nok(yrs, cur, fx):
    if cur in (None, "NOK"):
        return yrs
    r = fx.get(cur)
    if not r:
        return None  # ukjent valuta
    last = r[max(r)]
    return {y: {k: (v * r.get(y, last) if k in MONEY and v is not None else v) for k, v in c.items()} for y, c in yrs.items()}


def fix_units(yrs, nok, sek):
    """Noen år er registrert i feil enhet (1000 ganger for store eller små) – sammenlign sum eiendeler med årene rundt."""
    ys = sorted(yrs)
    for y in ys:
        a = yrs[y].get("ass")
        nb = [yrs[str(int(y) + d)].get("ass") for d in (-1, 1) if str(int(y) + d) in yrs]
        nb = [b for b in nb if b and b > 0]
        if not a or a <= 0 or not nb:
            continue
        r = [a / b for b in nb]
        f = 1e-3 if all(400 <= x <= 2500 for x in r) else 1e3 if all(1 / 2500 <= x <= 1 / 400 for x in r) else None
        if f:
            yrs[y] = {k: (v * f if k in MONEY and v is not None else v) for k, v in yrs[y].items()}
    # Hele serien i tusen kroner: ingen norske selskaper utenom bank og forsikring har over 500 mrd. kr i eiendeler
    # (de største, Bane NOR og Telenor, har rundt 250 mrd.)
    if nok and sek != "K" and max((c.get("ass") or 0) for c in yrs.values()) > 5e11:
        yrs = {y: {k: (v / 1000 if k in MONEY and v is not None else v) for k, v in c.items()} for y, c in yrs.items()}
    # Anslått utbytte på nytt (årsresultat minus økningen i opptjent egenkapital), med rettede tall
    for a, b in zip(ys, ys[1:]):
        p, c = yrs[a], yrs[b]
        c.pop("div", None)
        if int(b) - int(a) == 1 and all(k in c for k in ("net", "oek")) and "oek" in p:
            c["div"] = max(0, round(c["net"] - (c["oek"] - p["oek"])))
    return yrs


def suspect(c):
    """Resultat eller omsetning som ikke henger sammen med balansen (blandede enheter i samme regnskap)."""
    ass = max(c.get("ass") or 0, 1)
    return abs(c.get("net") or 0) >= 1e8 and abs(c["net"]) > 100 * ass or (c.get("rev") or 0) >= 1e8 and c["rev"] > 100 * ass


def rows_for(e, yrs, cur, fx):
    yrs = to_nok(fix_units(yrs, cur in (None, "NOK"), seksjon(e.get("nace"))), cur, fx)
    if yrs is None:
        return
    for y in YEARS:
        c = yrs.get(y)
        if not c or suspect(c):
            continue
        p = yrs.get(str(int(y) - 1)) or {}
        rev, op, eq, ass = c.get("rev"), c.get("op"), c.get("eq"), c.get("ass")
        div = c.get("div")
        if div is not None and p.get("eq") is not None and p["eq"] > 1e6 and eq is not None and eq < p["eq"] * 0.1:
            div = None  # fusjon eller fisjon, ikke utbytte
        if div and (suspect(p) or div > max(0, (p.get("eq") or 0) + (c.get("net") or 0)) * 1.05 + 1e6):
            div = None  # mer enn selskapet hadde å dele ut: feil i tallene, ikke utbytte
        yield (e["org"], int(y), e.get("form"), e["fylke"], e.get("knr"), seksjon(e.get("nace")), e.get("nace"), e.get("ans") or 0,
               i(rev), i(op), i(c.get("net")), i(eq), i(ass), i(div) or None,
               # Driftsresultat over omsetningen betyr negative kostnader (f.eks. verdiøkning på eiendom), ikke lønnsomhet
               r2(op / rev * 100) if rev and rev > 0 and op is not None and op <= rev else None,
               r2(eq / ass * 100) if ass and ass > 0 and eq is not None and eq <= ass else None,
               r2((rev / p["rev"] - 1) * 100) if rev is not None and (p.get("rev") or 0) >= 1e7 else None)


def sql_val(v):
    if v is None:
        return "NULL"
    if isinstance(v, str):
        return "'" + v.replace("'", "''") + "'"
    return repr(v)


def write_sql(name, table, cols, rows, per=250, per_file=200_000):
    """INSERT-setninger i biter (D1 tåler maks 100 kB per setning), fordelt på flere filer."""
    files, buf, n = [], [], 0
    def flush_file():
        nonlocal buf
        if buf:
            path = os.path.join(SQLDIR, f"{name}-{len(files) + 1:02d}.sql")
            open(path, "w", encoding="utf-8").write("".join(buf))
            files.append(path)
            buf = []
    batch = []
    for r in rows:
        batch.append("(" + ",".join(map(sql_val, r)) + ")")
        n += 1
        if len(batch) == per:
            buf.append(f"INSERT INTO {table} ({','.join(cols)}) VALUES {','.join(batch)};\n")
            batch = []
        if n % per_file == 0:
            if batch:
                buf.append(f"INSERT INTO {table} ({','.join(cols)}) VALUES {','.join(batch)};\n")
                batch = []
            flush_file()
    if batch:
        buf.append(f"INSERT INTO {table} ({','.join(cols)}) VALUES {','.join(batch)};\n")
    flush_file()
    return files


def main():
    t0 = time.time()
    fx = rates()
    print("Valutakurser 2025: " + ", ".join(f"{k} {v.get('2025', 0):.4g}" for k, v in sorted(fx.items())), flush=True)
    acc, cur = {}, {}
    with open(os.path.join(DIR, "regnskap.jsonl"), encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            if any(y in d["år"] for y in YEARS):
                acc[d["org"]], cur[d["org"]] = d["år"], d.get("valuta")
    print(f"{len(acc):,} selskaper med regnskap for {YEARS[0]}–{YEARS[-1]} "
          f"({sum(1 for v in cur.values() if v not in (None, 'NOK')):,} regnes om fra annen valuta)", flush=True)

    ents, gone = {}, 0
    with open(os.path.join(DIR, "enheter.jsonl"), encoding="utf-8") as f:
        for line in f:
            o = line[8:17]
            if o not in acc:
                continue
            e = json.loads(line)
            if e.get("konkurs") or e.get("avvikling") or e.get("form") == "NUF":
                gone += 1
                continue
            e["fylke"] = FYLKER.get((e.get("knr") or "")[:2])
            e["kommune"] = (e.get("kommune") or "").title() or None
            ents[o] = e
    print(f"{len(ents):,} med i listene ({gone:,} konkurs, under avvikling eller NUF, {len(acc) - len(ents) - gone:,} slettet)", flush=True)

    naering = json.load(open(os.path.join(DIR, "naering.json"), encoding="utf-8"))
    sel_rows = [(o, e["navn"], e["kommune"]) for o, e in ents.items()]
    aar_rows = [r for o, e in ents.items() for r in rows_for(e, acc[o], cur[o], fx)]
    print(f"{len(aar_rows):,} rader (selskap × år)", flush=True)

    # Lokal SQLite for testing
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    con.executemany("INSERT INTO selskap VALUES (?,?,?)", sel_rows)
    con.executemany("INSERT INTO naering VALUES (?,?)", naering.items())
    con.executemany(f"INSERT INTO aar VALUES ({','.join('?' * len(COLS))})", aar_rows)
    con.executescript(INDEXES)
    con.execute("ANALYZE")
    con.commit()
    con.close()
    print(f"-> {DB} ({os.path.getsize(DB) / 1e6:.0f} MB)", flush=True)

    # SQL for D1: skjema, data, så indekser (raskere å bygge indeksene til slutt)
    os.makedirs(SQLDIR, exist_ok=True)
    for old in glob.glob(os.path.join(SQLDIR, "*.sql")):
        os.remove(old)
    open(os.path.join(SQLDIR, "00-skjema.sql"), "w", encoding="utf-8").write(SCHEMA)
    files = write_sql("10-selskap", "selskap", ("org", "navn", "kommune"), sel_rows)
    files += write_sql("20-naering", "naering", ("kode", "navn"), naering.items())
    files += write_sql("30-aar", "aar", COLS, aar_rows)
    # Én indeks per fil: D1 bruker for lang tid på alle samtidig og avbryter
    for n, stmt in enumerate([x for x in INDEXES.strip().splitlines() if x.strip()], 1):
        open(os.path.join(SQLDIR, f"90-indeks-{n:02d}.sql"), "w", encoding="utf-8").write(stmt + "\n")
    open(os.path.join(SQLDIR, "99-optimize.sql"), "w", encoding="utf-8").write("PRAGMA optimize;\n")
    mb = sum(os.path.getsize(p) for p in glob.glob(os.path.join(SQLDIR, "*.sql"))) / 1e6
    print(f"-> {SQLDIR} ({len(files) + 2} filer, {mb:.0f} MB)", flush=True)

    # Kommuner med selskaper (til filteret på topplistesiden)
    kom = {}
    for e in ents.values():
        if e.get("knr") and e.get("kommune") and e.get("fylke"):
            kom[e["knr"]] = (e["kommune"], e["fylke"])
    per_year = {y: sum(1 for r in aar_rows if r[1] == int(y)) for y in YEARS}
    # Valutakursene brukes også på selskapssiden, så regnskap i USD og EUR vises i kroner der også
    json.dump({"generert": time.strftime("%Y-%m-%d"), "selskaper": len(ents), "per_år": per_year,
               "valuta": {k: {y: round(r, 6) for y, r in v.items()} for k, v in fx.items()},
               "kommuner": sorted([[k, n, f] for k, (n, f) in kom.items()], key=lambda x: x[1])},
              open(META, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"-> {META} ({len(kom)} kommuner). Ferdig på {time.time() - t0:.0f} s.")


if __name__ == "__main__":
    main()
