# Kløver – prototype

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

### Proxy for regnskap (Cloudflare Worker)

`proxy/worker.js` er en liten Cloudflare Worker som slipper gjennom `GET /regnskap/{orgnr}` til Regnskapsregisteret, legger på CORS-headere og cacher svaret i ett døgn. Publiser den slik:

```bash
cd proxy && npx wrangler login && npx wrangler deploy
```

Proxyen kjører på `https://klover-proxy.klover.workers.dev`, og adressen står i `PROXY` øverst i `assets/app.js`. Da henter den publiserte siden regnskap for alle selskaper, og faller tilbake til det lagrede utdraget hvis proxyen ikke svarer.

## Innhold

- `index.html`, `assets/app.js`, `assets/styles.css` – appen (forside, topplister, selskapsside, eiersøk). Designsystemet er hentet fra Stetinden Studio: Inter Tight, aksentfargen #EF7140, glasspanel og animerte stjernefelt.
- `assets/logo.svg`, `assets/favicon.svg` – logo. Ordmerket i `logo.svg` er tekst og trenger fonten Inter Tight for å se riktig ut.
- `data/toplists.json` – eksempelutvalg for topplistene. Bygg på nytt med `python3 scripts/build_toplists.py` (tar et par minutter).
- `data/regnskap/` – lagret regnskap per selskap, brukt av den publiserte siden. Bygg på nytt med `python3 scripts/build_regnskap.py`.
- `data/ownership.json` – **eksempeldata** for eierskap, brukt når aksjonærregisteret ikke finnes (for eksempel på GitHub Pages).
- `data/aksjonaerregister/` – **lokal** indeks over aksjonærregisteret. Inneholder personopplysninger og er ignorert av Git – skal aldri pushes.

## Aksjonærregisteret (lokalt)

Aksjeeierbøkene fra Skatteetaten (CSV, én per år) gjøres om til en oppslagsindeks:

```bash
python3 scripts/build_aksjonaerregister.py ~/Downloads/aksjeeiebok_2023.csv ~/Downloads/aksjeeiebok_2024.csv ~/Downloads/aksjeeiebok_2025.csv
```

Det tar under ett minutt og gir rundt 400 MB i `data/aksjonaerregister/`. Når mappen finnes, bruker appen ekte eierdata: direkte aksjonærer med endring fra året før, endelige eiere gjennom holdingselskaper, personsøk, eiertre per person og lenker fra styremedlemmer til eierskapet deres. Uten mappen faller appen tilbake til eksempeldataene.

Personer har ikke fødselsnummer i registeret, så en person identifiseres med navn, fødselsår og postnummer/sted. Flytter noen, kan de få ny nøkkel mellom årene.

## Datakilder

| Data | Kilde | Status |
|---|---|---|
| Selskapsinfo, roller | Enhetsregisteret | Live |
| Regnskap (3 siste år) | Regnskapsregisteret via proxy | Live |
| Topplister | Utvalg fra Brreg | ~1 400 selskaper |
| Eierskap | Aksjonærregisteret 2023–2025 (Skatteetaten) | Lokalt – eksempeldata på GitHub Pages |
