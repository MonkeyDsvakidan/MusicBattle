# Music Battle

Browser-Spiel für zwei Spieler: Künstler aus dem eigenen Spotify draften, pro Runde einen Song zum Thema wählen, und dann wird abgestimmt. Läuft auf dem Handy und am Desktop, auf einem Gerät (Pass & Play) oder auf zwei Geräten in Echtzeit. Dazu gibt es ein **Musik-Quiz** aus den eigenen Spotify-Songs – alleine oder mit beliebig vielen.

**Live:** https://monkeydsvakidan.github.io/MusicBattle/

### Als App installieren

- **iPhone/iPad:** Seite in Safari öffnen → **Teilen** → **„Zum Home-Bildschirm“**. Die App startet dann ohne Browserleiste. Abspielen läuft auf dem iPhone über die Spotify-App (Spotify öffnen, dann in Music Battle auf Abspielen tippen) – Spotify erlaubt den Web-Player dort nicht.
- **Android (Chrome):** Menü → **„App installieren“** bzw. „Zum Startbildschirm hinzufügen“.
- Die Spotify-Anmeldung bleibt auf dem Gerät gespeichert, bis man auf der Startseite **Abmelden** tippt.

## Spielablauf

1. **Modus wählen** – *1 Gerät · Pass & Play* (ihr gebt ein Gerät hin und her, ein Spotify-Konto reicht) oder *2 Geräte · Realtime* (jeder auf seinem Gerät mit eigenem Spotify).
2. **Lobby** – Spieler 1 erstellt einen Raum und verbindet Spotify. Spieler 2 wird auf demselben Gerät hinzugefügt oder tritt bei, indem er den **QR-Code in der Lobby scannt** oder den geteilten **Link** öffnet (Rolle wählen, Name bestätigen – fertig). Juroren treten genauso bei (ohne Spotify). Der Raumcode zum Abtippen funktioniert weiterhin. Oben zeigt eine Fortschrittsanzeige Lobby → Draft → Battle → Ergebnis.
3. **Draft** – Abwechselnd wird ein zufälliger Künstler aus dem eigenen Spotify-Top-Pool gezogen und einer der fünf Runden zugeordnet. Jeder Spieler hat einen Skip; zusätzlich kann ein Künstler beliebig oft übersprungen werden, wenn beide einverstanden sind (auch im Sudden Death). Hip-Hop-Künstler kommen bevorzugt dran (Pop seltener), Hörbuch-Autoren werden aussortiert.
4. **Battle** – Jede Runde hat ein Thema (z. B. „Regentag in der Stadt“). Jeder sucht einen Song seines Künstlers und reicht ihn ein; die Wahl bleibt verdeckt, bis beide eingereicht haben. Bei Pass & Play wählt zuerst Spieler 1, dann Spieler 2. Danach werden die Songs aufgedeckt und angespielt (Startpunkt einstellbar).
5. **Abstimmung** – nach dem Anhören wird in fünf Kategorien abgestimmt: **Thema, Vibe, Lyrics, Überraschung, Kenner-Wahl** („Welcher Song gewinnt?“ – Pinke oder Cyan Ecke).
   - Sind **Juroren** im Raum, stimmen nur sie ab (jeder auf seinem Gerät). Ohne Juroren stimmen die **Spieler** ab; bei Pass & Play nacheinander und verdeckt („Gerät an Mia geben“).
   - Pro Kategorie gewinnt die Mehrheit, Gleichstand zählt für keinen. Wer mehr Kategorien gewinnt, gewinnt die Runde – die Kategorien werden nacheinander aufgedeckt, danach der Gürtel „Runde an …“. Steht es gleich, wählt der Host den Rundensieger.
6. **Match** – Fünf Runden, Runde 5 zählt doppelt. Steht es danach unentschieden, folgt **Sudden Death** mit neuen Künstlern. Am Ende zeigt der Endstand Sieger, Statistiken, und die Bilanz je Kategorie. Mit **Rematch** startet der Host direkt ein neues Match mit denselben Leuten (alle wechseln automatisch, Spotify bleibt verbunden, es geht gleich mit dem Draft los).

## Musik-Quiz

Auf der Startseite **„Quiz“** wählen (direkt: `…/MusicBattle/?mode=quiz`, so verlinkt die GameMaster-Startseite). Der Host erstellt ein Quiz und lädt per QR-Code ein; jede Person spielt auf dem eigenen Handy. Wer Spotify verbindet, steuert seine Songs bei (mindestens 30 Songs nötig). Der Host wählt 10, 15 oder 20 Fragen und startet. Pro Frage gibt es 20 Sekunden: Erscheinungsjahr schätzen (Punkte nur bis 3 Jahre daneben), den älteren von zwei zeitlich nahen Songs wählen, das Album zu einem verpixelten Cover erraten, einen Song am Intro erkennen (nur wenn der Host Musik abspielt) oder sagen, auf welchem Album ein Song ist. Danach wird aufgedeckt (Lösung, Punkte, Zwischenstand); Musik läuft auf dem Gerät des Hosts. Am Schluss zeigt die Rangliste ein Podest, Treffer und die schnellste Antwort; mit „Nochmal“ startet der Host neue Fragen, möglichst ohne schon gespielte Songs. **Solo:** „Alleine spielen“ startet sofort ein Quiz aus den eigenen Spotify-Songs; der beste Punktestand je Fragenzahl bleibt auf dem Gerät.

Verlässt der Host das Quiz, ist der Raum für alle geschlossen. Auf dem iPhone als Host läuft die Musik über die Spotify-App (wie im Battle).

**Abend-Rangliste (GameMaster):** Jedes beendete Match und Quiz mit mindestens zwei Personen zählt auf dem Host-Gerät für «Heute Abend» auf der GameMaster-Startseite (1. Platz 3 Punkte, 2. Platz 2, 3. Platz 1; zu zweit 3/1). Nach 6 Stunden ohne Spiel beginnt ein neuer Abend. Die Namen des Abends werden im nächsten Spiel vorgeschlagen.

## Werkzeug: Alben-Fix (kein Teil des Spiels)

Unter `…/MusicBattle/?tool=alben` ersetzt der Alben-Fix Singles in den eigenen Spotify-Playlists und gelikten Songs durch die Version aus einem gespeicherten Album bzw. einer gespeicherten EP (Album hat Vorrang; Albumversion liken, Single entliken). Zuerst läuft ein Testlauf, geändert wird erst nach Bestätigung; optional nur für ein Album. Zweiter Knopf **Doppelte entfernen**: findet Songs, die mehrfach in einer Playlist oder in verschiedenen Versionen (Single/Album/Deluxe) über Playlists und Likes verteilt sind; pro Song wählt man, welche Version bleibt. Nutzt die Spotify-App des Spiels mit eigener Anmeldung, Code in `tools/`.

## Werkzeug: Albumrad (kein Teil des Spiels)

Unter `…/MusicBattle/?tool=rad` erscheinen die gespeicherten Spotify-Alben als Rad aus Covern. Scrollen, Ziehen oder die Pfeiltasten drehen das Rad; Tippen auf ein Cover holt es nach vorne, Tippen auf das vordere Cover zeigt Titel, Zähler und „Hören“ (öffnet Spotify). Der runde Knopf unten schlägt ein zufälliges Album vor; „Hören“ und „Ablehnen“ werden pro Spotify-Konto gezählt (Menü „⋯“ → Protokoll), auf allen Geräten gleich. Die Alben sind zusätzlich nach der Farbe ihres Covers in vier Räder aufgeteilt (Warm, Kalt, Dunkel, Hell); die Punkte oben oder seitliches Wischen wechseln das Rad, und ein Album lässt sich von Hand in ein anderes Rad legen. Der Punkt oben klappt eine Leiste auf: Räder, Sortierung (zuletzt gespeichert, Künstler A–Z, Jahr) und bei Künstler eine Buchstabenreihe zum Springen. Der Vorschlag bevorzugt selten gehörte Alben; wer ein Album seit dem letzten Hören 3× abgelehnt hat, findet es im Menü unter „Oft abgelehnt“ und kann es behalten oder in Spotify entfernen. Beim Öffnen gleicht das Rad die letzten 50 in Spotify gespielten Songs ab: lief an einem Tag mindestens die Hälfte der Songs eines gespeicherten Albums (höchstens 8), zählt es als gehört – pro Tag höchstens einmal, auch zusammen mit „Hören“.

## Technik

- **Frontend:** statisches HTML, CSS und Vanilla-JavaScript ohne Build-Step und ohne Framework. `index.html` lädt `app.js`, das die Daten (`themes.json`) und danach die Skripte in `js/` lädt.
- **Backend:** [Supabase](https://supabase.com) – Postgres mit Row Level Security, RPC-Funktionen `mb_*`, Realtime auf allen `mb_*`-Tabellen, anonyme Anmeldung.
- **Edge Functions** (Deno):
  - `mb-track-profile` sammelt nach dem Einreichen einmal pro Song Daten aus [LRCLIB](https://lrclib.net) (Lyrics – nur ausgewertet, nie gespeichert), [MusicBrainz](https://musicbrainz.org) (Erscheinungsjahr), [ListenBrainz](https://listenbrainz.org) und [Last.fm](https://www.last.fm/api) (Tags, Hörerzahlen) und speichert das Song-Profil in `mb_track_profiles` (das Quiz nutzt daraus das Erscheinungsjahr).
  - `mb-quiz-start` und `mb-quiz-reveal` erzeugen die Quiz-Fragen bzw. decken sie auf und rechnen die Punkte.
- **Spotify:** Login mit OAuth PKCE im Browser, Web API für Top-Künstler und Suche, Web Playback SDK zum Abspielen (Spotify Premium und ein Browser mit DRM nötig).

### Projektstruktur

```
index.html, app.js          Einstieg und Lader (BUILD-Version für Cache-Busting)
styles.css                  Design „Titelkampf bei Nacht“ – Tokens oben in der Datei
js/                         config, state, ui-common, spotify, room, draft, battle, jury, ui-screens, main
design/mockup-4.1.html      Design-Vorlage
supabase/migrations/        Datenbankschema als Migrationen
supabase/functions/         Edge Functions und gemeinsamer Code in _shared/
tests/                      Tests für Themen, Song-Merkmale, Abstimmung, Quiz und Werkzeuge
ROADMAP.md, CLAUDE.md       Arbeitsstand, Entscheidungen und Regeln für die Weiterentwicklung
```

## Eigene Instanz aufsetzen

1. **Supabase-Projekt** anlegen und die Migrationen aus `supabase/migrations/` der Reihe nach ausführen (z. B. mit `supabase db push`). Anonyme Anmeldung unter *Authentication → Providers* aktivieren.
2. **Edge Functions** deployen: alle Ordner unter `supabase/functions/` (z. B. `supabase functions deploy mb-track-profile`; JWT-Prüfung laut `supabase/config.toml`). Der Ordner `_shared/` wird dabei mitgenommen.
3. **Secret** setzen: `supabase secrets set LASTFM_API_KEY=…` (kostenloser Key von Last.fm). Ohne Key fehlen Tags und Hörerzahlen in den Song-Profilen.
4. **Spotify-App** im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) anlegen. Als Redirect-URI genau die Adresse der Seite eintragen (z. B. `https://<user>.github.io/MusicBattle/`). Solange die App im Entwicklungsmodus ist, müssen die Spotify-Konten der Spieler dort als Nutzer eingetragen sein.
5. In `js/config.js` die Supabase-URL, den Publishable Key und die Spotify Client-ID eintragen. Alle drei sind öffentlich und gehören ins Frontend; geheime Keys nur als Supabase-Secrets.

## Deployment

Jeder Push auf `main` veröffentlicht die Seite über GitHub Pages (`.github/workflows/pages.yml`, das ganze Repo wird ausgeliefert). Nach Änderungen an JavaScript oder CSS die `BUILD`-Version in `app.js` und die `?v=`-Parameter in `index.html` erhöhen, sonst sehen Geräte noch den alten Stand. Datenbankänderungen nur als neue Migration, Edge Functions aus dem Repo deployen.

## Tests

Die reine Logik (Themen, Song-Merkmale, Abstimmung, Quiz) ist mit Node getestet. Im Repo-Ordner ausführen:

```bash
node --test
```

Die Oberfläche wird mit dem Smoke-Test aus `CLAUDE.md` geprüft – auch ohne Handy: Spieler 2 und Juror laufen dabei als unsichtbare iframes mit eigener Anmeldung im selben Browser.

## Weiterentwickeln

`CLAUDE.md` beschreibt Aufbau, Datenmodell und Arbeitsregeln, `ROADMAP.md` den Stand, offene Aufgaben und alle Entscheidungen. Themen werden nur in `supabase/functions/_shared/themes.json` gepflegt – Frontend und Edge Functions lesen daraus.
