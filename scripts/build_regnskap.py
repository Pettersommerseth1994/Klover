"""Lagrer regnskap som statiske filer for GitHub Pages.

Regnskapsregisteret sender ikke CORS-headere, så nettleseren kan ikke hente
regnskap direkte fra en statisk side. Dette scriptet lagrer svaret fra API-et
for hvert selskap i topplistene (pluss noen ekstra) i data/regnskap/{orgnr}.json.
Kjør etter build_toplists.py:  python3 scripts/build_regnskap.py
"""
import json, os, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "regnskap")
EXTRA = ["935851076", "918298037", "923609016"]  # Efjord Extreme, Proff, Equinor


def fetch(org):
    url = f"https://data.brreg.no/regnskapsregisteret/regnskap/{org}"
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=20) as r:
                data = json.load(r)
            with open(os.path.join(OUT, f"{org}.json"), "w") as f:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            return True
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
        except Exception:
            pass
        time.sleep(1 + i)
    return False


def main():
    os.makedirs(OUT, exist_ok=True)
    top = json.load(open(os.path.join(ROOT, "data", "toplists.json")))
    orgs = sorted({c["org"] for c in top["selskaper"]} | set(EXTRA))
    with ThreadPoolExecutor(8) as ex:
        ok = sum(ex.map(fetch, orgs))
    print(f"Lagret regnskap for {ok} av {len(orgs)} selskaper i {OUT}")


if __name__ == "__main__":
    main()
