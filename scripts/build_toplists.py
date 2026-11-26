"""Bygger et eksempeldatasett for topplistene.

Henter et utvalg aksjeselskaper per fylke fra Enhetsregisteret og regnskap
for hvert av dem fra Regnskapsregisteret (åpne data, NLOD).
Kjør:  python3 scripts/build_toplists.py
"""
import json, os, sys, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

API = "https://data.brreg.no"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "toplists.json")
FYLKER = {"03": "Oslo", "11": "Rogaland", "15": "Møre og Romsdal", "18": "Nordland",
          "31": "Østfold", "32": "Akershus", "33": "Buskerud", "34": "Innlandet",
          "39": "Vestfold", "40": "Telemark", "42": "Agder", "46": "Vestland",
          "50": "Trøndelag", "55": "Troms", "56": "Finnmark"}
# Utvalg per fylke: de største arbeidsgiverne + et bånd av mellomstore
BANDS = [dict(fraAntallAnsatte=50, size=60), dict(fraAntallAnsatte=10, tilAntallAnsatte=49, size=40)]


def get(path, params=None, tries=3):
    url = API + path + ("?" + urllib.parse.urlencode(params, safe=",") if params else "")
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=20) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
        except Exception:
            pass
        time.sleep(1 + i)
    return None


def num(d, *path):
    for p in path:
        if not isinstance(d, dict):
            return None
        d = d.get(p)
    return d if isinstance(d, (int, float)) else None


def years(rs):
    out = {}
    for r in rs or []:
        if r.get("regnskapstype") != "SELSKAP":
            continue
        y = r["regnskapsperiode"]["tilDato"][:4]
        R, B = r.get("resultatregnskapResultat", {}), r.get("egenkapitalGjeld", {})
        out[y] = {
            "rev": num(R, "driftsresultat", "driftsinntekter", "sumDriftsinntekter"),
            "op": num(R, "driftsresultat", "driftsresultat"),
            "pre": num(R, "ordinaertResultatFoerSkattekostnad"),
            "net": num(R, "aarsresultat"),
            "wage": num(R, "driftsresultat", "driftskostnad", "loennskostnad"),
            "eq": num(B, "egenkapital", "sumEgenkapital"),
            "oek": num(B, "egenkapital", "opptjentEgenkapital", "sumOpptjentEgenkapital"),
            "ass": num(r, "eiendeler", "sumEiendeler"),
        }
    ys = sorted(out)
    for a, b in zip(ys, ys[1:]):  # estimert utbytte = årsresultat - endring i opptjent EK
        p, c = out[a], out[b]
        if None not in (c["net"], c["oek"], p["oek"]):
            c["div"] = max(0, round(c["net"] - (c["oek"] - p["oek"])))
    return out


def main():
    kommuner = get("/enhetsregisteret/api/kommuner", {"size": 1000})["_embedded"]["kommuner"]
    picked = {}
    for fnr, fnavn in FYLKER.items():
        knr = ",".join(k["nummer"] for k in kommuner if k["nummer"][:2] == fnr)
        for band in BANDS:
            d = get("/enhetsregisteret/api/enheter", {"kommunenummer": knr, "organisasjonsform": "AS,ASA",
                    "sort": "antallAnsatte,DESC", **band}) or {}
            for e in d.get("_embedded", {}).get("enheter", []):
                nk = e.get("naeringskode1") or {}
                picked[e["organisasjonsnummer"]] = {
                    "org": e["organisasjonsnummer"], "navn": e["navn"], "fylke": fnavn,
                    "kommune": (e.get("forretningsadresse") or {}).get("kommune", "").title(),
                    "nace": nk.get("kode", ""), "bransje": nk.get("beskrivelse", ""),
                    "form": e["organisasjonsform"]["kode"], "ansatte": e.get("antallAnsatte") or 0}
        print(f"{fnavn}: {sum(1 for c in picked.values() if c['fylke'] == fnavn)} selskaper", flush=True)

    def fetch(c):
        c["år"] = years(get(f"/regnskapsregisteret/regnskap/{c['org']}"))
        return c

    done = []
    with ThreadPoolExecutor(8) as ex:
        for i, c in enumerate(ex.map(fetch, picked.values()), 1):
            if c["år"]:
                done.append(c)
            if i % 100 == 0:
                print(f"regnskap {i}/{len(picked)}", flush=True)
    json.dump({"generert": time.strftime("%Y-%m-%d"), "selskaper": done}, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"Ferdig: {len(done)} selskaper med regnskap -> {OUT}")


if __name__ == "__main__":
    main()
