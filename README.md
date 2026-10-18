# Music Battle

Browser-Spiel für zwei Spieler: Künstler aus dem eigenen Spotify draften, pro Runde einen Song zum Thema wählen, und eine Jury entscheidet. Läuft auf dem Handy und am Desktop, auf einem Gerät (Pass & Play) oder auf zwei Geräten in Echtzeit.

**Live:** https://monkeydsvakidan.github.io/MusicBattle/

### Als App installieren

- **iPhone/iPad:** Seite in Safari öffnen → **Teilen** → **„Zum Home-Bildschirm“**. Die App startet dann ohne Browserleiste. Abspielen läuft auf dem iPhone über die Spotify-App (Spotify öffnen, dann in Music Battle auf Abspielen tippen) – Spotify erlaubt den Web-Player dort nicht.
- **Android (Chrome):** Menü → **„App installieren“** bzw. „Zum Startbildschirm hinzufügen“.
- Die Spotify-Anmeldung bleibt auf dem Gerät gespeichert, bis man auf der Startseite **Abmelden** tippt.

## Spielablauf

1. **Modus wählen** – *1 Gerät · Pass & Play* (ihr gebt ein Gerät hin und her, ein Spotify-Konto reicht) oder *2 Geräte · Realtime* (jeder auf seinem Gerät mit eigenem Spotify).
2. **Lobby** – Spieler 1 erstellt einen Raum und verbindet Spotify. Spieler 2 wird auf demselben Gerät hinzugefügt oder tritt bei, indem er den **QR-Code in der Lobby scannt** oder den geteilten **Link** öffnet (Rolle wählen, Name bestätigen – fertig). Juroren treten genauso bei (ohne Spotify). Der Raumcode zum Abtippen funktioniert weiterhin. Oben zeigt eine Fortschrittsanzeige Lobby → Draft → Battle → Ergebnis.
3. **Draft** – Abwechselnd wird ein zufälliger Künstler aus dem eigenen Spotify-Top-Pool gezogen und einer der fünf Runden zugeordnet. Jeder Spieler hat einen Skip.
4. **Battle** – Jede Runde hat ein Thema (z. B. „Regentag in der Stadt“). Jeder sucht einen Song seines Künstlers und reicht ihn ein; die Wahl bleibt verdeckt, bis beide eingereicht haben. Bei Pass & Play wählt zuerst Spieler 1, dann Spieler 2. Danach werden die Songs aufgedeckt und angespielt (Startpunkt einstellbar).
5. **Jury** – eine von drei Möglichkeiten:
   - **Menschliche Juroren** vergeben Scorecards (10–8 klar, 10–9 knapp). Sind Juroren im Raum, entscheiden nur sie.
   - **Die Jury** – fünf automatische Juroren mit eigener Persönlichkeit bewerten beide Songs anhand gesammelter Songdaten (siehe unten) und werden nacheinander aufgedeckt.
   - **Selber entscheiden** – ohne Juroren im Raum wählt der Host den Rundensieger (zählt als 10–9). Das Urteil der Jury kann der Host so auch überstimmen.
6. **Match** – Fünf Runden, Runde 5 zählt doppelt. Steht es danach unentschieden, folgt **Sudden Death** mit neuen Künstlern. Am Ende zeigt der Endstand Sieger, Statistiken und die Bilanz jedes Jurors.

### Die Jury

| Juror | Figur | Achtet auf |
|---|---|---|
| Themenschnüffler | Einsiedlerkrebs mit Lupe | Themen-Motive im Titel, im Text, in den Tags; bei Zeitreise-Themen das Jahr |
| Vibejunkie | Qualle mit Kopfhörern | Stimmungs-Tags und Energie |
| Kollegah der Lyricboss | Oktopus mit Krone | Motive und Inhalt der Lyrics |
| Snoop Underdogg | Kugelfisch mit Boxhandschuhen | den weniger bekannten Song – solange er thematisch mithält |
| Dr. Körnli | Schildkröte mit Schallplatte | Albumtracks, ältere Perlen, Genre-Vielfalt |

Jeder Juror vergibt 10–9 oder 10–8. Fehlen die nötigen Daten oder liegen beide Songs gleichauf, gibt er offen 10–10 („zu wenig Daten“ / „Gleichstand“). Endet die ganze Jury unentschieden, entscheidet der Host. Die Jury nutzt **keine KI**: Die Bewertung ist eine feste, getestete Regel (`supabase/functions/_shared/jury-engine.mjs`), die Begründungen kommen aus Textbausteinen mit echten Werten (z. B. „3 passende Motive im Text, bei „Roller“ keines“).

## Technik

- **Frontend:** statisches HTML, CSS und Vanilla-JavaScript ohne Build-Step und ohne Framework. `index.html` lädt `app.js`, das die Daten (`themes.json`, `jurors.json`) und danach die Skripte in `js/` lädt.
- **Backend:** [Supabase](https://supabase.com) – Postgres mit Row Level Security, RPC-Funktionen `mb_*`, Realtime auf allen `mb_*`-Tabellen, anonyme Anmeldung.
- **Edge Functions** (Deno):
  - `mb-track-profile` sammelt nach dem Einreichen einmal pro Song Daten aus [LRCLIB](https://lrclib.net) (Lyrics – nur ausgewertet, nie gespeichert), [MusicBrainz](https://musicbrainz.org) (Erscheinungsjahr), [ListenBrainz](https://listenbrainz.org) und [Last.fm](https://www.last.fm/api) (Tags, Hörerzahlen) und speichert das Song-Profil in `mb_track_profiles`.
  - `mb-jury` bewertet eine Runde aus diesen Profilen und speichert fünf Scorecards.
- **Spotify:** Login mit OAuth PKCE im Browser, Web API für Top-Künstler und Suche, Web Playback SDK zum Abspielen (Spotify Premium und ein Browser mit DRM nötig).

### Projektstruktur

```
index.html, app.js          Einstieg und Lader (BUILD-Version für Cache-Busting)
styles.css                  Design „Titelkampf bei Nacht“ – Tokens oben in der Datei
js/                         config, state, ui-common, spotify, room, draft, battle, jury, ui-screens, main
assets/jury/                Juror-Avatare (eigene SVG-Figuren)
design/mockup-4.1.html      Design-Vorlage
supabase/migrations/        Datenbankschema als Migrationen
supabase/functions/         Edge Functions und gemeinsamer Code in _shared/
tests/                      Tests für Themen, Juroren, Song-Merkmale und Jury-Engine
ROADMAP.md, CLAUDE.md       Arbeitsstand, Entscheidungen und Regeln für die Weiterentwicklung
```

## Eigene Instanz aufsetzen

1. **Supabase-Projekt** anlegen und die Migrationen aus `supabase/migrations/` der Reihe nach ausführen (z. B. mit `supabase db push`). Anonyme Anmeldung unter *Authentication → Providers* aktivieren.
2. **Edge Functions** deployen: `supabase functions deploy mb-track-profile` und `supabase functions deploy mb-jury` (beide mit JWT-Prüfung). Der Ordner `_shared/` wird dabei mitgenommen.
3. **Secret** setzen: `supabase secrets set LASTFM_API_KEY=…` (kostenloser Key von Last.fm). Ohne Key fehlen Tags und Hörerzahlen; die Jury vergibt dann öfter 10–10.
4. **Spotify-App** im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) anlegen. Als Redirect-URI genau die Adresse der Seite eintragen (z. B. `https://<user>.github.io/MusicBattle/`). Solange die App im Entwicklungsmodus ist, müssen die Spotify-Konten der Spieler dort als Nutzer eingetragen sein.
5. In `js/config.js` die Supabase-URL, den Publishable Key und die Spotify Client-ID eintragen. Alle drei sind öffentlich und gehören ins Frontend; geheime Keys nur als Supabase-Secrets.

## Deployment

Jeder Push auf `main` veröffentlicht die Seite über GitHub Pages (`.github/workflows/pages.yml`, das ganze Repo wird ausgeliefert). Nach Änderungen an JavaScript oder CSS die `BUILD`-Version in `app.js` und die `?v=`-Parameter in `index.html` erhöhen, sonst sehen Geräte noch den alten Stand. Datenbankänderungen nur als neue Migration, Edge Functions aus dem Repo deployen.

## Tests

Die reine Logik (Themen, Juror-Profile, Song-Merkmale, Jury-Engine) ist mit Node getestet. Im Repo-Ordner ausführen:

```bash
node --test
```

Die Oberfläche wird mit dem Smoke-Test aus `CLAUDE.md` geprüft – auch ohne Handy: Spieler 2 und Juror laufen dabei als unsichtbare iframes mit eigener Anmeldung im selben Browser.

## Weiterentwickeln

`CLAUDE.md` beschreibt Aufbau, Datenmodell und Arbeitsregeln, `ROADMAP.md` den Stand, offene Aufgaben und alle Entscheidungen. Themen und Juroren werden nur in `supabase/functions/_shared/themes.json` und `jurors.json` gepflegt – Frontend und Jury lesen beide daraus.
