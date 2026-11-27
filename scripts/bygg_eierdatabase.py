"""Bygger eierdatabasen (D1-databasen «klover-eiere») fra den lokale indeksen over aksjonærregisteret.

Kjør først scripts/build_aksjonaerregister.py, så:
    python3 scripts/bygg_eierdatabase.py

Leser data/aksjonaerregister/{meta.json,eiere,eierskap,navn} og skriver (alt ignorert av Git – personopplysninger):
    data/aksjonaerregister/eiere.db     SQLite-kopi for testing
    data/aksjonaerregister/d1/*.sql      samme data som SQL, for import til D1

Tabeller:
    meta      nøkkeltall om registeret
    eiere     aksjonærene i hvert selskap (JSON, samme form som den lokale indeksen)
    eierskap  hva hver eier (selskap eller person) eier (JSON)
    navn      personsøk: én rad per ord i navnet, så søket kan slå opp på begynnelsen av et ord

Importer lokalt (for «wrangler dev»), én fil om gangen:
    for f in data/aksjonaerregister/d1/*.sql; do npx wrangler d1 execute klover-eiere --local -c proxy/wrangler.dev.toml --file "$f"; done
Publisering: opprett databasen i EU (kan ikke endres senere), legg bindingen EIERE inn i proxy/wrangler.toml,
og importer med --remote og -c proxy/wrangler.toml i stedet for --local og wrangler.dev.toml:
    npx wrangler d1 create klover-eiere --jurisdiction=eu
"""
import glob, json, os, re, sqlite3, time

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "data", "aksjonaerregister")
DB, SQLDIR = os.path.join(SRC, "eiere.db"), os.path.join(SRC, "d1")
MAX_STMT = 90_000  # D1 tåler maks 100 kB per SQL-setning

SCHEMA = """
DROP TABLE IF EXISTS meta;
DROP TABLE IF EXISTS eiere;
DROP TABLE IF EXISTS eierskap;
DROP TABLE IF EXISTS navn;
CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE eiere (org TEXT PRIMARY KEY, d TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE eierskap (id TEXT PRIMARY KEY, d TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE navn (tok TEXT NOT NULL, id TEXT NOT NULL, navn TEXT NOT NULL, yr TEXT, sted TEXT, n INTEGER NOT NULL, PRIMARY KEY (tok, id)) WITHOUT ROWID;
"""


def norm(s):
    return re.sub(r"[^a-zæøåäöü0-9 ]", " ", s.lower()).split()


def shards(sub):
    for path in sorted(glob.glob(os.path.join(SRC, sub, "*.json"))):
        with open(path, encoding="utf-8") as f:
            yield json.load(f)


def sql_val(v):
    if v is None:
        return "NULL"
    if isinstance(v, str):
        return "'" + v.replace("'", "''") + "'"
    return repr(v)


class SqlWriter:
    """INSERT-setninger under 90 kB, fordelt på filer på rundt 20 MB."""
    def __init__(self, name, table, cols, per_file=20_000_000):
        self.name, self.head, self.per_file = name, f"INSERT INTO {table} ({','.join(cols)}) VALUES ", per_file
        self.files, self.buf, self.size, self.vals, self.vsize = [], [], 0, [], 0

    def add(self, row):
        v = "(" + ",".join(map(sql_val, row)) + ")"
        if self.vals and self.vsize + len(v) > MAX_STMT:
            self._stmt()
        self.vals.append(v)
        self.vsize += len(v) + 1

    def _stmt(self):
        s = self.head + ",".join(self.vals) + ";\n"
        self.buf.append(s)
        self.size += len(s)
        self.vals, self.vsize = [], 0
        if self.size >= self.per_file:
            self._file()

    def _file(self):
        if self.buf:
            path = os.path.join(SQLDIR, f"{self.name}-{len(self.files) + 1:02d}.sql")
            open(path, "w", encoding="utf-8").write("".join(self.buf))
            self.files.append(path)
            self.buf, self.size = [], 0

    def close(self):
        if self.vals:
            self._stmt()
        self._file()
        return self.files


def main():
    t0 = time.time()
    os.makedirs(SQLDIR, exist_ok=True)
    for old in glob.glob(os.path.join(SQLDIR, "*.sql")):
        os.remove(old)
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    open(os.path.join(SQLDIR, "00-skjema.sql"), "w", encoding="utf-8").write(SCHEMA)

    meta = json.load(open(os.path.join(SRC, "meta.json"), encoding="utf-8"))
    w = SqlWriter("10-meta", "meta", ("k", "v"))
    row = ("meta", json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
    con.execute("INSERT INTO meta VALUES (?,?)", row)
    w.add(row)
    w.close()

    counts = {}
    for sub, table, name in (("eiere", "eiere", "20-eiere"), ("eierskap", "eierskap", "30-eierskap")):
        w, n, batch = SqlWriter(name, table, ("org" if table == "eiere" else "id", "d")), 0, []
        for shard in shards(sub):
            for k, rec in shard.items():
                row = (k, json.dumps(rec, ensure_ascii=False, separators=(",", ":")))
                batch.append(row)
                w.add(row)
                n += 1
            if len(batch) > 50_000:
                con.executemany(f"INSERT INTO {table} VALUES (?,?)", batch)
                batch = []
        con.executemany(f"INSERT INTO {table} VALUES (?,?)", batch)
        counts[table] = (n, len(w.close()))
        print(f"{table}: {n:,} rader ({time.time() - t0:.0f} s)", flush=True)

    # Personsøk: hver person står i to navnefiler (for- og etternavn), så de slås sammen først
    people = {}
    for shard in shards("navn"):
        for key, navn, yr, sted, n in shard:
            people[key] = (navn, yr, sted, n)
    w, rows = SqlWriter("40-navn", "navn", ("tok", "id", "navn", "yr", "sted", "n")), []
    for key, (navn, yr, sted, n) in people.items():
        for tok in sorted(set(norm(navn))):
            row = (tok, key, navn, yr, sted, n)
            rows.append(row)
            w.add(row)
    con.executemany("INSERT INTO navn VALUES (?,?,?,?,?,?)", rows)
    counts["navn"] = (len(rows), len(w.close()))
    print(f"navn: {len(people):,} personer, {len(rows):,} ord ({time.time() - t0:.0f} s)", flush=True)

    con.commit()
    con.close()
    mb = sum(os.path.getsize(p) for p in glob.glob(os.path.join(SQLDIR, "*.sql"))) / 1e6
    print(f"-> {DB} ({os.path.getsize(DB) / 1e6:.0f} MB)")
    print(f"-> {SQLDIR} ({len(glob.glob(os.path.join(SQLDIR, '*.sql')))} filer, {mb:.0f} MB). Ferdig på {time.time() - t0:.0f} s.")


if __name__ == "__main__":
    main()
