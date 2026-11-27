"""Skjuler personer som har bedt om å ikke vises på Kløver (protest etter personvernforordningen artikkel 21).

En skjult person vises som «Skjult person» i eierlistene (andelen står igjen, så summen stemmer), finnes ikke i
personsøket, og personsiden svarer «Fant ikke eieren». Endringen synes på kløver.com innen en time.

Bruk:
    python3 scripts/skjul_person.py sok "Ola Nordmann" [fødselsår]   finn personen og nøkkelen (p + 10 tegn)
    python3 scripts/skjul_person.py skjul p0123456789 [--grunn "Beskyttet adresse"]
    python3 scripts/skjul_person.py vis                                 alle som er skjult
    python3 scripts/skjul_person.py angre p0123456789                   vis personen igjen
    python3 scripts/skjul_person.py oppdater                            etter at nye data er importert (se under)

Nøkkelen bygger på navn, fødselsår og sted. Flytter personen, får hun ny nøkkel når neste års data importeres.
Kjør derfor «oppdater» etter hver import: den skjuler også nye nøkler med samme navn og fødselsår.

Søket bruker den lokale kopien (data/aksjonaerregister/eiere.db). Skjulingen skrives til databasen i Cloudflare
og til den lokale kopien.
"""
import argparse, json, os, re, sqlite3, subprocess, sys, time

ROOT = os.path.join(os.path.dirname(__file__), "..")
LOCAL_DB = os.path.join(ROOT, "data", "aksjonaerregister", "eiere.db")
KEY = re.compile(r"^[pf][0-9a-f]{10}$")


def q(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def d1(sql, remote=True):
    """Kjører SQL mot klover-eiere i Cloudflare (eller den lokale kopien for «wrangler dev»)."""
    args = ["npx", "wrangler", "d1", "execute", "klover-eiere", "--json", "--command", sql]
    args += ["--remote", "-c", "proxy/wrangler.toml"] if remote else ["--local", "-c", "proxy/wrangler.dev.toml"]
    r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"Wrangler feilet:\n{r.stderr or r.stdout}")
    return json.loads(r.stdout)[0].get("results", [])


def local():
    if not os.path.exists(LOCAL_DB):
        sys.exit(f"Fant ikke {LOCAL_DB}. Kjør scripts/bygg_eierdatabase.py først.")
    return sqlite3.connect(LOCAL_DB)


def norm(s):
    return re.sub(r"[^a-zæøåäöü0-9 ]", " ", s.lower()).split()


def search(name, year=None):
    toks = norm(name)
    key = max(toks, key=len, default="")
    if len(key) < 2:
        sys.exit("Skriv minst to bokstaver av navnet.")
    rows = local().execute("SELECT DISTINCT id, navn, yr, sted, n FROM navn WHERE tok >= ? AND tok < ? ORDER BY n DESC",
                           (key, key + "￿")).fetchall()
    return [r for r in rows if all(any(x.startswith(t) for x in norm(r[1])) for t in toks) and (not year or r[2] == str(year))]


def write(sql):
    d1(sql, remote=True)
    try:
        d1(sql, remote=False)  # lokal kopi for «wrangler dev», hvis den finnes
    except SystemExit:
        pass
    con = local()
    con.execute(sql)
    con.commit()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sok"); s.add_argument("navn"); s.add_argument("aar", nargs="?")
    s = sub.add_parser("skjul"); s.add_argument("id"); s.add_argument("--grunn", default="")
    sub.add_parser("vis")
    s = sub.add_parser("angre"); s.add_argument("id")
    sub.add_parser("oppdater")
    a = ap.parse_args()

    if a.cmd == "sok":
        rows = search(a.navn, a.aar)
        for r in rows[:30]:
            print(f"{r[0]}  {r[1]}, f. {r[2]}, {r[3]} – eier i {r[4]} selskap{'er' if r[4] != 1 else ''}")
        print(f"{len(rows)} treff" + (" (viser 30)" if len(rows) > 30 else ""))
    elif a.cmd == "skjul":
        if not KEY.match(a.id):
            sys.exit("Nøkkelen ser slik ut: p0123456789. Finn den med «sok».")
        r = local().execute("SELECT navn, yr FROM navn WHERE id = ? LIMIT 1", (a.id,)).fetchone() or (None, None)
        write("INSERT OR REPLACE INTO skjult (id, navn, yr, dato, grunn) VALUES "
              f"({q(a.id)}, {q(r[0])}, {q(r[1])}, {q(time.strftime('%Y-%m-%d'))}, {q(a.grunn)})")
        print(f"Skjult: {a.id} {r[0] or ''} {r[1] or ''}. Synes på kløver.com innen en time.")
    elif a.cmd == "vis":
        rows = d1("SELECT id, navn, yr, dato, grunn FROM skjult ORDER BY dato")
        for r in rows:
            print(f"{r['id']}  {r['navn']}, f. {r['yr']} – skjult {r['dato']}{' – ' + r['grunn'] if r['grunn'] else ''}")
        print(f"{len(rows)} skjult")
    elif a.cmd == "angre":
        if not KEY.match(a.id):
            sys.exit("Ugyldig nøkkel.")
        write(f"DELETE FROM skjult WHERE id = {q(a.id)}")
        print(f"Vises igjen: {a.id}. Synes på kløver.com innen en time.")
    elif a.cmd == "oppdater":
        hidden = d1("SELECT id, navn, yr, grunn FROM skjult")
        have = {r["id"] for r in hidden}
        con, n = local(), 0
        for h in hidden:
            if not h["navn"]:
                continue
            for (pid,) in con.execute("SELECT DISTINCT id FROM navn WHERE navn = ? AND yr = ?", (h["navn"], h["yr"])):
                if pid not in have:
                    write("INSERT OR REPLACE INTO skjult (id, navn, yr, dato, grunn) VALUES "
                          f"({q(pid)}, {q(h['navn'])}, {q(h['yr'])}, {q(time.strftime('%Y-%m-%d'))}, {q(h['grunn'])})")
                    have.add(pid)
                    n += 1
        print(f"{n} nye nøkler skjult.")


if __name__ == "__main__":
    main()
