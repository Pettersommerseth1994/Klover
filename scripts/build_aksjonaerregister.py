"""Bygger en oppslagsindeks fra aksjeeierbøkene fra Skatteetaten.

Bruk:
    python3 scripts/build_aksjonaerregister.py ~/Downloads/aksjeeiebok_2023.csv ~/Downloads/aksjeeiebok_2024.csv ~/Downloads/aksjeeiebok_2025.csv

Resultatet havner i data/aksjonaerregister/ (ignorert av Git – inneholder personopplysninger):
    meta.json                 år og nøkkeltall
    eiere/{1234}.json         aksjonærer per selskap, gruppert på de fire første sifrene i org.nr
    eierskap/{c1234|p0ab}.json  hva hver eier (selskap eller person) eier
    navn/{ab}.json            personsøk, gruppert på de to første bokstavene i for- og etternavn

Personer har ikke fødselsnummer i registeret. En person identifiseres derfor med
navn + fødselsår + postnummer/sted, slik Skatteetaten leverer det.
"""
import hashlib, json, os, re, sys, time
from collections import defaultdict

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "aksjonaerregister")
MAX_OWNERS = 300      # flest aksjonærer som lagres per selskap (resten summeres)
MAX_HOLDINGS = 400    # flest selskaper som lagres per eier


def pkey(name, year, place):
    return "p" + hashlib.sha1(f"{name}|{year}|{place}".encode()).hexdigest()[:10]


def read(path):
    """Gir (org, selskapsnavn, total, eiertype, eier-id, navn, år, sted, aksjer) per rad, aksjeklasser slått sammen."""
    agg = {}
    meta = {}
    with open(path, encoding="utf-8-sig") as f:
        next(f)
        for line in f:
            p = line.rstrip("\r\n").split(";")
            if len(p) != 9:
                continue
            org, sel, _kl, navn, fid, post, land, ant, tot = p
            fid, navn, post = fid.strip(), navn.strip(), post.strip().strip(", ")
            if len(fid) == 9 and fid.isdigit():
                t, oid, yr = "c", fid, ""
            elif len(fid) == 4 and fid.isdigit():
                t, oid, yr = "p", pkey(navn, fid, post), fid
            else:
                t, oid, yr = "f", "f" + hashlib.sha1(f"{navn}|{land}".encode()).hexdigest()[:10], ""
            try:
                a, tt = int(ant or 0), int(tot or 0)
            except ValueError:
                continue
            meta.setdefault(org, [sel, 0])
            meta[org][1] = max(meta[org][1], tt)
            k = (org, oid)
            if k in agg:
                agg[k][5] += a
            else:
                agg[k] = [t, oid, navn, yr, post if t != "f" else (land or post), a]
    return agg, meta


def main(paths):
    t0 = time.time()
    years = sorted(paths, key=lambda p: re.search(r"(20\d\d)", p).group(1))
    data = {}
    for p in years:
        y = int(re.search(r"(20\d\d)", p).group(1))
        data[y] = read(p)
        print(f"Lest {y}: {len(data[y][0]):,} eierposter, {len(data[y][1]):,} selskaper ({time.time() - t0:.0f} s)", flush=True)
    cur = max(data)
    agg, meta = data[cur]
    prev = [y for y in sorted(data) if y < cur][::-1][:2]  # f.eks. [2024, 2023]

    def pct(y, org, oid):
        a = data[y][0].get((org, oid))
        tot = data[y][1].get(org, [None, 0])[1]
        return round(a[5] / tot * 100, 4) if a and tot else None

    by_org = defaultdict(list)
    for (org, oid), r in agg.items():
        by_org[org].append(r)

    owners_sh = defaultdict(dict)
    hold = defaultdict(list)
    ident = {}  # navn, fødselsår og sted per eier, til personsidene
    people = {}
    for org, rows in by_org.items():
        name, tot = meta[org]
        rows.sort(key=lambda r: -r[5])
        out, rest_n, rest_p = [], 0, 0.0
        for i, (t, oid, navn, yr, place, a) in enumerate(rows):
            p = round(a / tot * 100, 4) if tot else 0
            hold[oid].append([org, name, a, p])
            ident.setdefault(oid, [t, navn, yr, place])
            if t == "p":
                h = people.setdefault(oid, [navn, yr, place, 0])
                h[3] += 1
            if i < MAX_OWNERS:
                out.append([t, oid, navn, yr, place, a, p] + [pct(y, org, oid) for y in prev])
            else:
                rest_n += 1
                rest_p += p
        rec = {"n": name, "t": tot, "o": out}
        if rest_n:
            rec["x"] = [rest_n, round(rest_p, 4)]
        owners_sh[org[:4]][org] = rec
    print(f"Bygget eierlister for {len(by_org):,} selskaper ({time.time() - t0:.0f} s)", flush=True)

    hold_sh = defaultdict(dict)
    for oid, lst in hold.items():
        lst.sort(key=lambda r: -r[3])
        shard = ("c" + oid[:4]) if oid[0].isdigit() else oid[:4]
        hold_sh[shard][oid] = {"h": lst[:MAX_HOLDINGS], "n": len(lst), "i": ident.get(oid)}

    def norm(s):
        return re.sub(r"[^a-zæøåäöü0-9 ]", " ", s.lower()).split()

    names_sh = defaultdict(list)
    for key, (navn, yr, place, n) in people.items():
        toks = norm(navn)
        if not toks:
            continue
        for tok in {toks[0][:2], toks[-1][:2]}:
            if len(tok) == 2:
                names_sh[tok].append([key, navn, yr, place, n])

    for sub in ("eiere", "eierskap", "navn"):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)

    def dump(sub, name, obj):
        with open(os.path.join(OUT, sub, f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))

    for k, v in owners_sh.items():
        dump("eiere", k, v)
    for k, v in hold_sh.items():
        dump("eierskap", k, v)
    for k, v in names_sh.items():
        dump("navn", k, sorted(v, key=lambda r: -r[4]))
    meta_out = {"år": cur, "tidligere": prev, "selskaper": len(by_org), "personer": len(people),
                "eierposter": len(agg), "generert": time.strftime("%Y-%m-%d"), "kilde": "Aksjonærregisteret, Skatteetaten"}
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta_out, f, ensure_ascii=False)
    print(f"Ferdig på {time.time() - t0:.0f} s: {meta_out}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main([os.path.expanduser(p) for p in sys.argv[1:]])
