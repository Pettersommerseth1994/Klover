"""Henter regnskapet for alle aksjeselskaper fra Regnskapsregisteret (åpne data, NLOD).

Regnskapsregisteret har ingen samlet nedlasting, så regnskapene hentes ett og ett. Listen over selskaper
tas fra aksjeeierboken (alle AS og ASA med aksjonærer), og bare organisasjonsnumrene brukes derfra.

Skriptet tåler avbrudd: det som allerede er hentet, hoppes over neste gang. Det går med få samtidige
kall og venter når Brønnøysund svarer med feil eller ber oss roe ned.

Resultat (ignorert av Git, for stort til repoet):
    data/regnskap_alle/regnskap.jsonl   én linje per selskap med de tallene topplistene bruker
    data/regnskap_alle/mangler.txt      selskaper uten regnskap i registeret

Kjør:  python3 scripts/hent_alle_regnskap.py [--aksjer ~/Downloads/aksjeeiebok_2025.csv] [--traader 8] [--maks N]
"""
import argparse, json, os, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUTDIR = os.path.join(ROOT, "data", "regnskap_alle")
OUT, MISS = os.path.join(OUTDIR, "regnskap.jsonl"), os.path.join(OUTDIR, "mangler.txt")
ERR = os.path.join(OUTDIR, "feil.txt")  # registeret svarer alltid med feil for disse
API = "https://data.brreg.no/regnskapsregisteret/regnskap/"
UA = {"Accept": "application/json", "User-Agent": "Klover-datainnhenting/1.0"}


def num(d, *path):
    for p in path:
        if not isinstance(d, dict):
            return None
        d = d.get(p)
    return d if isinstance(d, (int, float)) else None


def compact(rs):
    """Tallene vi bruker, per år (bare selskapsregnskap, ikke konsern)."""
    out, cur = {}, None
    for r in rs or []:
        if r.get("regnskapstype") != "SELSKAP":
            continue
        R, A, B = r.get("resultatregnskapResultat", {}), r.get("eiendeler", {}), r.get("egenkapitalGjeld", {})
        cur = r.get("valuta") or cur
        out[r["regnskapsperiode"]["tilDato"][:4]] = {k: v for k, v in {
            "rev": num(R, "driftsresultat", "driftsinntekter", "sumDriftsinntekter"),
            "salg": num(R, "driftsresultat", "driftsinntekter", "salgsinntekter"),
            "cost": num(R, "driftsresultat", "driftskostnad", "sumDriftskostnad"),
            "wage": num(R, "driftsresultat", "driftskostnad", "loennskostnad"),
            "op": num(R, "driftsresultat", "driftsresultat"),
            "fin": num(R, "finansresultat", "nettoFinans"),
            "pre": num(R, "ordinaertResultatFoerSkattekostnad"),
            "tax": num(R, "ordinaertResultatSkattekostnad"),
            "net": num(R, "aarsresultat"),
            "ass": num(A, "sumEiendeler"),
            "omlop": num(A, "omloepsmidler", "sumOmloepsmidler"),
            "bank": num(A, "sumBankinnskuddOgKontanter"),
            "eq": num(B, "egenkapital", "sumEgenkapital"),
            "oek": num(B, "egenkapital", "opptjentEgenkapital", "sumOpptjentEgenkapital"),
            "gjeld": num(B, "gjeldOversikt", "sumGjeld"),
            "kort": num(B, "gjeldOversikt", "kortsiktigGjeld", "sumKortsiktigGjeld"),
        }.items() if v is not None}
    ys = sorted(out)
    for a, b in zip(ys, ys[1:]):  # estimert utbytte = årsresultat - økningen i opptjent egenkapital
        p, c = out[a], out[b]
        if all(k in c for k in ("net", "oek")) and "oek" in p:
            c["div"] = max(0, round(c["net"] - (c["oek"] - p["oek"])))
    return out, cur


class Throttle:
    """Roer ned når Brønnøysund svarer med 429 eller 5xx, og øker forsiktig igjen etterpå."""
    def __init__(self):
        self.pause, self.lock = 0.0, threading.Lock()

    def bad(self):
        with self.lock:
            self.pause = min(30.0, max(1.0, self.pause * 2))

    def good(self):
        with self.lock:
            self.pause = max(0.0, self.pause * 0.9 - 0.01)

    def wait(self):
        if self.pause:
            time.sleep(self.pause)


def fetch(org, th):
    for i in range(6):
        th.wait()
        try:
            with urllib.request.urlopen(urllib.request.Request(API + org, headers=UA), timeout=30) as r:
                th.good()
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                th.good()
                return []
            if e.code == 500 and i >= 1:
                # Registeret klarer ikke å vise regnskapet til noen enheter (verdipapirfond, sparebanker,
                # pensjonskasser ...). Det er ikke et tegn på at vi går for fort, så vi roer ikke ned.
                return "feil"
            if e.code != 500:
                th.bad()
        except Exception:
            th.bad()
        time.sleep(min(2 ** i, 8))
    return None  # ga opp – prøves igjen neste kjøring


def orgs_from_csv(path):
    seen = set()
    with open(os.path.expanduser(path), encoding="utf-8-sig") as f:
        next(f)
        for line in f:
            o = line.split(";", 1)[0]
            if len(o) == 9 and o.isdigit():
                seen.add(o)
    return sorted(seen)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aksjer", default="~/Downloads/aksjeeiebok_2025.csv")
    ap.add_argument("--traader", type=int, default=8)
    ap.add_argument("--maks", type=int, default=0, help="bare så mange selskaper (til testing)")
    ap.add_argument("--ekstra", help="fil med flere organisasjonsnumre (én per linje), f.eks. data/regnskap_alle/ekstra_orgnr.txt")
    a = ap.parse_args()
    os.makedirs(OUTDIR, exist_ok=True)
    done = set()
    for path in (OUT, MISS, ERR):
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                for line in f:
                    done.add(line[8:17] if line.startswith('{"org":"') else line.strip())
    wanted = orgs_from_csv(a.aksjer)
    if a.ekstra:
        # Andre enheter som har levert regnskap (stiftelser, samvirkeforetak, AS uten aksjonærer i boken ...)
        wanted += [o.strip() for o in open(a.ekstra, encoding="utf-8") if len(o.strip()) == 9]
    orgs = [o for o in dict.fromkeys(wanted) if o not in done]
    if a.maks:
        orgs = orgs[:a.maks]
    print(f"{len(done):,} hentet fra før, {len(orgs):,} gjenstår", flush=True)
    th, lock, t0, n, ok, miss, fail, err = Throttle(), threading.Lock(), time.time(), 0, 0, 0, 0, 0
    with open(OUT, "a", encoding="utf-8") as fo, open(MISS, "a", encoding="utf-8") as fm, open(ERR, "a", encoding="utf-8") as fe, \
            ThreadPoolExecutor(a.traader) as ex:
        for org, rs in zip(orgs, ex.map(lambda o: fetch(o, th), orgs)):
            n += 1
            if rs is None:
                fail += 1
            elif rs == "feil":
                fe.write(org + "\n")
                err += 1
            else:
                yrs, cur = compact(rs)
                with lock:
                    if yrs:
                        fo.write(json.dumps({"org": org, "valuta": cur, "år": yrs}, ensure_ascii=False, separators=(",", ":")) + "\n")
                        ok += 1
                    else:
                        fm.write(org + "\n")
                        miss += 1
            if n % 2000 == 0 or n == len(orgs):
                fo.flush(); fm.flush(); fe.flush()
                el = time.time() - t0
                rate = n / el if el else 0
                eta = (len(orgs) - n) / rate / 60 if rate else 0
                print(f"{n:,}/{len(orgs):,} ({rate:.1f}/s, ca. {eta:.0f} min igjen) – {ok:,} med regnskap, {miss:,} uten, "
                      f"{err:,} med feil i registeret, {fail:,} feilet, pause {th.pause:.1f}s", flush=True)
    print(f"Ferdig på {(time.time() - t0) / 60:.0f} min. {ok:,} med regnskap, {miss:,} uten, {err:,} med feil i registeret, "
          f"{fail:,} må prøves igjen (kjør skriptet på nytt).", flush=True)


if __name__ == "__main__":
    sys.exit(main())
