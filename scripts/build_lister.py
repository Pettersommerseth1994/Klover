"""Bygger data til forslagene til nye topplister.

Åpne data (kan publiseres) -> data/lister.json:
  - Konsulentselskaper i Oslo (bedriftsrådgivning 70.200 og IT-konsulenter 62.200), minst 5 ansatte
  - Advokatselskaper i hele landet (juridisk tjenesteyting 69.100), minst 5 ansatte
  - Regnskapsbyråer i Oslo (regnskapsføring og bokføring 69.202) med ansatte

Aksjonærregisteret (personopplysninger, bare lokalt) -> data/aksjonaerregister/lister/utbytte-<by>.json:
  - Personer med adresse i en by og holdingselskapene deres (navnet inneholder HOLDING, personen eier minst 20 %).
    Utbyttet er anslått fra regnskapet: årsresultat minus økningen i opptjent egenkapital.

Bransjekodene er de nye (SN2025) som Enhetsregisteret bruker.

Kjør:  python3 scripts/build_lister.py [--by Trondheim] [--aksjer ~/Downloads/aksjeeiebok_2025.csv]
"""
import argparse, hashlib, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
from build_toplists import get, years  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "lister.json")
OUT_REG = os.path.join(ROOT, "data", "aksjonaerregister", "lister")
GROUPS = {
    "konsulent": dict(kode=("70.200", "62.200"), params={"naeringskode": "70.200,62.200", "kommunenummer": "0301", "fraAntallAnsatte": 5}),
    "advokat": dict(kode=("69.100",), params={"naeringskode": "69.100", "fraAntallAnsatte": 5}),
    # Enhetsregisteret oppgir ikke antall ansatte under 5, så filteret kan bare være 1 (har ansatte) eller minst 5
    "regnskap": dict(kode=("69.202",), params={"naeringskode": "69.202", "kommunenummer": "0301", "fraAntallAnsatte": 1}),
}


def search(params):
    """Alle enheter som passer, side for side (søket gir treff på både hoved- og bikoder)."""
    out, page = [], 0
    while True:
        d = get("/enhetsregisteret/api/enheter", {**params, "size": 1000, "page": page}) or {}
        out += d.get("_embedded", {}).get("enheter", [])
        if page + 1 >= d.get("page", {}).get("totalPages", 0):
            return out
        page += 1


def company(e):
    nk = e.get("naeringskode1") or {}
    return {"org": e["organisasjonsnummer"], "navn": e["navn"], "kommune": (e.get("forretningsadresse") or {}).get("kommune", "").title(),
            "nace": nk.get("kode", ""), "bransje": nk.get("beskrivelse", ""), "form": e["organisasjonsform"]["kode"], "ansatte": e.get("antallAnsatte") or 0}


def with_accounts(items, label):
    def fetch(c):
        c["år"] = years(get(f"/regnskapsregisteret/regnskap/{c['org']}"))
        return c
    done = []
    with ThreadPoolExecutor(8) as ex:
        for i, c in enumerate(ex.map(fetch, items), 1):
            if c["år"]:
                done.append(c)
            if i % 200 == 0:
                print(f"  {label}: regnskap {i}/{len(items)}", flush=True)
    return done


def open_lists(only=None):
    old = json.load(open(OUT, encoding="utf-8")) if only and os.path.exists(OUT) else {}
    out = {k: v for k, v in old.items() if k in GROUPS}
    for key, g in GROUPS.items():
        if only and key not in only:
            continue
        found = [company(e) for e in search(g["params"]) if (e.get("naeringskode1") or {}).get("kode") in g["kode"]]
        out[key] = with_accounts(found, key)
        print(f"{key}: {len(found)} selskaper, {len(out[key])} med regnskap", flush=True)
    json.dump({"generert": time.strftime("%Y-%m-%d"), **out}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"-> {OUT}")


def dividends(by, csv_path):
    """Personer i byen som eier minst 20 % av et holdingselskap, og anslått utbytte til dem."""
    by_up, own, tot, names = by.upper(), {}, {}, {}
    with open(os.path.expanduser(csv_path), encoding="utf-8-sig") as f:
        next(f)
        for line in f:
            p = line.rstrip("\r\n").split(";")
            if len(p) != 9:
                continue
            org, sel, _kl, navn, fid, post, _land, ant, tt = p
            try:
                a, t = int(ant or 0), int(tt or 0)
            except ValueError:
                continue
            tot[org] = max(tot.get(org, 0), t)
            names[org] = sel
            fid, post = fid.strip(), post.strip()
            if len(fid) == 4 and fid.isdigit() and by_up in post.upper():
                k = (org, navn.strip(), fid, post)
                own[k] = own.get(k, 0) + a
    rows = [(k, a / tot[k[0]] * 100) for k, a in own.items() if tot.get(k[0]) and "HOLDING" in names[k[0]].upper()]
    rows = [r for r in rows if r[1] >= 20]
    orgs = sorted({k[0] for k, _ in rows})
    print(f"utbytte {by}: {len(rows)} eierposter i {len(orgs)} holdingselskaper", flush=True)
    acc = {c["org"]: c["år"] for c in with_accounts([{"org": o} for o in orgs], f"utbytte {by}")}
    people = {}
    for (org, navn, yr, post), pct in rows:
        ys = acc.get(org) or {}
        # Samme nøkkel som i build_aksjonaerregister.py, så listen kan lenke til personsiden
        key = "p" + hashlib.sha1(f"{navn}|{yr}|{post.strip(', ')}".encode()).hexdigest()[:10]
        h = people.setdefault((navn, yr, post), {"navn": navn, "yr": yr, "sted": post, "key": key, "h": []})
        h["h"].append({"org": org, "navn": names[org], "pct": round(pct, 2),
                       "år": {y: {k: v.get(k) for k in ("net", "div", "eq")} for y, v in ys.items()}})
    os.makedirs(OUT_REG, exist_ok=True)
    path = os.path.join(OUT_REG, f"utbytte-{by.lower()}.json")
    json.dump({"generert": time.strftime("%Y-%m-%d"), "by": by, "personer": list(people.values())},
              open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"-> {path} ({len(people)} personer)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--by", default="Trondheim")
    ap.add_argument("--aksjer", default="~/Downloads/aksjeeiebok_2025.csv")
    ap.add_argument("--bare-utbytte", action="store_true")
    ap.add_argument("--grupper", help="bare disse gruppene, f.eks. regnskap,advokat (resten beholdes)")
    a = ap.parse_args()
    if not a.bare_utbytte:
        open_lists(a.grupper.split(",") if a.grupper else None)
    if os.path.exists(os.path.expanduser(a.aksjer)):
        dividends(a.by, a.aksjer)
    else:
        print("Fant ikke aksjeeierboken – hopper over utbyttelisten.")
