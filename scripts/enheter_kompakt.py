"""Gjør Enhetsregisterets samlede fil om til en kompakt liste med det topplistene trenger.

Last ned filen først (211 MB, oppdateres hver natt):
    curl -L -o data/regnskap_alle/enheter.json.gz \
      -H "Accept: application/vnd.brreg.enhetsregisteret.enhet.v2+gzip;charset=UTF-8" \
      https://data.brreg.no/enhetsregisteret/api/enheter/lastned

Kjør:  python3 scripts/enheter_kompakt.py

Resultat (ignorert av Git):
    data/regnskap_alle/enheter.jsonl   én linje per enhet: navn, form, kommune, bransje, ansatte, siste regnskapsår ...
    data/regnskap_alle/naering.json    bransjekode -> beskrivelse
"""
import gzip, json, os, re, time

ROOT = os.path.join(os.path.dirname(__file__), "..")
DIR = os.path.join(ROOT, "data", "regnskap_alle")
SRC, OUT, NACE = os.path.join(DIR, "enheter.json.gz"), os.path.join(DIR, "enheter.jsonl"), os.path.join(DIR, "naering.json")
WS = re.compile(r"[\s,]*")


def stream(path):
    """Leser en stor JSON-liste ett objekt om gangen, uten å lese hele filen inn i minnet."""
    dec, buf, started = json.JSONDecoder(), "", False
    with gzip.open(path, "rt", encoding="utf-8") as f:
        while True:
            chunk = f.read(1 << 22)
            buf += chunk
            pos = 0
            if not started:
                pos, started = buf.index("[") + 1, True
            while True:
                pos = WS.match(buf, pos).end()
                if pos >= len(buf) or buf[pos] == "]":
                    break
                try:
                    obj, pos2 = dec.raw_decode(buf, pos)
                except json.JSONDecodeError:
                    break  # objektet fortsetter i neste bit
                yield obj
                pos = pos2
            buf = buf[pos:]
            if not chunk:
                return


def main():
    t0, n, nace = time.time(), 0, {}
    with open(OUT, "w", encoding="utf-8") as out:
        for e in stream(SRC):
            adr = e.get("forretningsadresse") or e.get("postadresse") or {}
            nk = e.get("naeringskode1") or {}
            if nk.get("kode"):
                nace[nk["kode"]] = nk.get("beskrivelse", "")
            rec = {
                "org": e.get("organisasjonsnummer"), "navn": e.get("navn"), "form": (e.get("organisasjonsform") or {}).get("kode"),
                "knr": adr.get("kommunenummer"), "kommune": adr.get("kommune"), "postnr": adr.get("postnummer"),
                "nace": nk.get("kode"), "ans": e.get("antallAnsatte"), "siste": e.get("sisteInnsendteAarsregnskap"),
                "stiftet": e.get("stiftelsesdato"),
                "konkurs": e.get("konkurs") or None, "avvikling": (e.get("underAvvikling") or e.get("underTvangsavviklingEllerTvangsopplosning")) or None,
            }
            out.write(json.dumps({k: v for k, v in rec.items() if v not in (None, "")}, ensure_ascii=False, separators=(",", ":")) + "\n")
            n += 1
            if n % 200000 == 0:
                print(f"{n:,} enheter ({time.time() - t0:.0f} s)", flush=True)
    json.dump(dict(sorted(nace.items())), open(NACE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"Ferdig: {n:,} enheter, {len(nace)} bransjekoder på {time.time() - t0:.0f} s -> {OUT}")


if __name__ == "__main__":
    main()
