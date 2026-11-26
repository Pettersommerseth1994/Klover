# ddai – prototype

Selskapsinnsikt bygget på åpne data fra Brønnøysundregistrene (NLOD).

## Kjør lokalt

```bash
python3 server.py
```

Åpne http://localhost:5173. Serveren videresender `/api/*` til `data.brreg.no`, siden Brreg avviser kall direkte fra nettleseren (CORS).

## Publisert versjon (GitHub Pages)

GitHub Pages kan bare servere statiske filer, så `server.py` kjører ikke der. Appen merker dette selv:

- Enhetsregisteret (søk, selskapsinfo, roller) kalles direkte fra nettleseren – det API-et støtter CORS.
- Regnskapsregisteret sender ikke CORS-headere, så den publiserte siden leser regnskap fra `data/regnskap/{orgnr}.json`. Selskaper som ikke er med i utdraget viser en melding om det.

For full dekning på nett trengs en liten proxy (for eksempel en Cloudflare Worker) foran Regnskapsregisteret.

## Innhold

- `index.html`, `assets/app.js`, `assets/styles.css` – appen (forside, topplister, selskapsside, eiersøk)
- `assets/logo.svg`, `assets/favicon.svg` – logo. Ordmerket i `logo.svg` er tekst og trenger fonten Geist for å se riktig ut.
- `data/toplists.json` – eksempelutvalg for topplistene. Bygg på nytt med `python3 scripts/build_toplists.py` (tar et par minutter).
- `data/regnskap/` – lagret regnskap per selskap, brukt av den publiserte siden. Bygg på nytt med `python3 scripts/build_regnskap.py`.
- `data/ownership.json` – **eksempeldata** for eierskap. Personer og holdingselskaper er oppdiktet, og eierandelene i Efjord Extreme AS er også oppdiktet.

## Datakilder

| Data | Kilde | Status |
|---|---|---|
| Selskapsinfo, roller | Enhetsregisteret | Live |
| Regnskap (3 siste år) | Regnskapsregisteret | Live |
| Topplister | Utvalg fra Brreg | ~1 400 selskaper |
| Eierskap | Aksjonærregisteret (Skatteetaten) | Ikke koblet på – eksempeldata |
