"""Bygger topplistene «Hvem tok mest utbytte fra holdingselskapet sitt?» for utvalgte byer.

Leser (ignorert av Git – personopplysninger):
    data/aksjonaerregister/lister/utbytte-<by>.json   personer og holdingselskapene deres (scripts/build_lister.py --bare-utbytte --by <By>)
    data/regnskap_alle/klover.db                       utbytte per selskap, med rettingene i scripts/bygg_database.py

Skriver:
    data/aksjonaerregister/d1/50-utbytte.sql          tabellen utbytte i eierdatabasen (klover-eiere)

Bare de 50 øverste i hver by lagres. Utbyttet en person får, er anslått som selskapets utbytte ganget med
eierandelen, summert over holdingselskapene der personen eier minst 20 %.

Kjør:      python3 scripts/bygg_utbytteliste.py
Importer:  npx wrangler d1 execute klover-eiere --remote -c proxy/wrangler.toml --file data/aksjonaerregister/d1/50-utbytte.sql -y
"""
import json, os, re, sqlite3, time

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "data", "aksjonaerregister", "lister")
ACC = os.path.join(ROOT, "data", "regnskap_alle", "klover.db")
OUT = os.path.join(ROOT, "data", "aksjonaerregister", "d1", "50-utbytte.sql")
BYER = ("trondheim", "bergen", "oslo")
YEAR, TOP = 2025, 50


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    con = sqlite3.connect(ACC)
    div = dict(con.execute("SELECT org, div FROM aar WHERE ar = ? AND div > 0", (YEAR,)))
    stmts = ["DROP TABLE IF EXISTS utbytte;",
             "CREATE TABLE utbytte (by TEXT NOT NULL, rang INTEGER NOT NULL, id TEXT NOT NULL, d TEXT NOT NULL, PRIMARY KEY (by, rang)) WITHOUT ROWID;"]
    for by in BYER:
        D = json.load(open(os.path.join(SRC, f"utbytte-{by}.json"), encoding="utf-8"))
        rows = []
        for p in D["personer"]:
            parts = [(h, div[h["org"]] * h["pct"] / 100) for h in p["h"] if h["org"] in div]
            v = sum(x for _, x in parts)
            if v <= 0 or not p.get("key"):
                continue
            top = max(parts, key=lambda x: x[1])[0]
            # [nøkkel, navn, fødselsår, sted (uten postnummer), anslått utbytte, største holdingselskap, navn, andel, antall selskaper]
            rows.append([p["key"], p["navn"], p["yr"], re.sub(r"^\d{4}\s+", "", p["sted"]), round(v), top["org"], top["navn"], top["pct"], len(parts)])
        rows.sort(key=lambda r: -r[4])
        for i, r in enumerate(rows[:TOP], 1):
            stmts.append(f"INSERT INTO utbytte VALUES ({q(by)}, {i}, {q(r[0])}, {q(json.dumps(r, ensure_ascii=False, separators=(',', ':')))});")
        print(f"{by}: {len(rows):,} personer med utbytte, topp {TOP} lagret. Nr. 1: {rows[0][1].title()} {rows[0][4]:,} kr", flush=True)
    stmts.append("INSERT OR REPLACE INTO meta VALUES ('utbytte', " + q(json.dumps({"år": YEAR, "byer": list(BYER), "generert": time.strftime("%Y-%m-%d")})) + ");")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write("\n".join(stmts) + "\n")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
