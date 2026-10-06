# CLAUDE.md – Music Battle

Diese Datei wird in jeder Claude-Code-Sitzung geladen. Sie beschreibt das Projekt als Ganzes und die Regeln, nach denen gearbeitet wird. **Lies zu Beginn jeder Sitzung zusätzlich `ROADMAP.md`.**

## Was das Projekt ist

Music Battle ist ein Browser-Spiel für zwei Spieler (plus optionale menschliche Juroren):

1. **Lobby** – Spieler 1 erstellt einen Raum (Modus „1 Gerät · Pass & Play“ oder „2 Geräte · Realtime“), beide verbinden Spotify.
2. **Blind Draft** – abwechselnd wird ein Künstler aus dem eigenen Spotify-Top-Pool gezogen und einer von 5 Runden zugeordnet (1 Skip pro Spieler).
3. **Battle** – pro Runde ein Thema (z. B. „Nachtfahrt durch eine Grossstadt“). Jeder wählt einen Song seines Künstlers, die Songs werden gleichzeitig aufgedeckt und angespielt.
4. **Jury** – menschliche Juroren (Scorecards 10–8 / 10–9), die automatische 5er-Jury oder der eigene Entscheid bestimmen den Rundensieger.
5. **Match** – Runde 5 zählt doppelt, bei Gleichstand Sudden Death (Runde 6), danach Endstand mit Statistiken.

UI-Sprache ist **Deutsch (Schweiz, „ss“ statt „ß“)**. Zielgeräte: vor allem Handy, auch Desktop.

## Tech-Stack

- **Frontend:** statisches HTML/CSS/Vanilla-JS, kein Build-Step, kein Framework. Deployment über GitHub Pages (`.github/workflows/pages.yml`, Push auf `main` = live).
- **Backend:** Supabase-Projekt „MusicVote“ (`swgraidbdxpjqnvxacpq`): Postgres mit RLS, RPC-Funktionen `mb_*`, Realtime auf allen `mb_*`-Tabellen, anonyme Auth.
- **Edge Functions:** `mb-track-profile` (3.3) sammelt nach dem Einreichen einmal pro Song die Daten (LRCLIB, MusicBrainz, ListenBrainz, Last.fm) und speichert das Profil in `mb_track_profiles`. `mb-jury` (3.8) bewertet eine Runde aus diesen Profilen mit der Jury-Engine (`_shared/jury-engine.mjs`) und speichert fünf Scorecards – keine Live-Abfragen, keine KI; fehlende Profile erstellt sie zuerst über `mb-track-profile`. `mb-ai-jury` (alt) wird nicht mehr aufgerufen. Gemeinsamer Code in `supabase/functions/_shared/` (`themes.json`, `jurors.json`, `track-features.mjs`, `jury-engine.mjs`). Beim Deploy über den Supabase-MCP alle importierten `_shared`-Dateien als `../_shared/…` mitgeben. Secrets: `LASTFM_API_KEY` (gesetzt); `OPENROUTER_API_KEY` wird nicht mehr gebraucht.
- **Spotify:** OAuth PKCE im Browser, Web API für Top-Artists/Suche, Web Playback SDK zum Abspielen (Premium nötig).

### Datenmodell (public)

| Tabelle | Inhalt |
|---|---|
| `mb_rooms` | Raum, Code, Host, `status` (lobby → draft → battle → tiebreak → sudden_draft → finished), `current_round`, `device_mode` |
| `mb_members` | Spieler/Juroren pro Raum, `player_slot`, Spotify-Status, Draft-Skip |
| `mb_draft_picks` | gezogene Künstler pro Runde/Slot inkl. `artist_draft_weight` |
| `mb_rounds` | Thema, Kategorie, Status, `winner_slot` |
| `mb_submissions` | eingereichte Songs inkl. Spotify-Metadaten (ISRC, Release, Dauer …), `start_ms` |
| `mb_jury_scores` | Scorecards; `source` = `human` oder `ai`, `details` (jsonb) |
| `mb_track_profiles` | Song-Profil je Spotify-Track (Daten für die Jury, keine Lyrics-Texte); nur serverseitig beschreibbar |

## Code-Aufbau (seit Roadmap 2.2, BUILD 20261006-5)

`index.html` lädt `app.js`. Der Loader lädt der Reihe nach die klassischen Skripte aus `js/` (globale Namen, kein `import`/`export`, kein Build-Step). **Jede Funktion existiert genau einmal** – es gibt keine Überschreibungen mehr.

| Datei | Inhalt |
|---|---|
| `js/config.js` | Supabase-/Spotify-Konfiguration; `JUDGES` aus der Juror-Datei; `THEMES`, `SUDDEN_THEMES`, `themeProfile()` aus der Themen-Datei |
| `js/state.js` | Zustand `S`, `$`/`esc`, Raum-/Mitglieder-/Runden-Abfragen, `resetLocalRoomState` |
| `js/ui-common.js` | `mbConfirm`, `mbConfirmLeave`, `render()`-Verteiler, Closed-Screen, gemeinsame Bausteine |
| `js/spotify.js` | Spotify-Login (PKCE), Token, Künstler-Pool, Web Playback |
| `js/room.js` | Anmeldung, Raum laden/beitreten/erstellen/verlassen, Sync (Realtime + Poll mit Fingerabdruck), `init` |
| `js/draft.js` | Draft, Skip, Sudden-Death-Draft |
| `js/battle.js` | Songsuche, Einreichen (stösst danach `mb-track-profile` im Hintergrund an), Startpunkt |
| `js/jury.js` | Scorecards, eigener Entscheid, Auto-Jury (ruft `mb-jury` auf), `roundDecision`, `finalizeRound` |
| `js/ui-screens.js` | Bildschirme: Start, Lobby, Draft, Battle, Jury, Tiebreak, Endstand |
| `js/main.js` | Start: genau ein `init()` + `render()`, nachdem alles geladen ist |

Gemeinsame Daten: `supabase/functions/_shared/themes.json` enthält alle Themen mit Profil (Schlüsselwörter DE/EN, Tags, Energie, Ära); `jurors.json` die fünf Juror-Profile (Gewichte, Mindestdaten, Text-Bausteine, schwache Gewichte für allgemeine Wörter, Energie-Tags). Das Frontend lädt sie über `app.js` (GitHub Pages liefert das ganze Repo aus), die Jury-Edge-Function importiert sie ab Roadmap 3.8. Themen und Juroren nur dort ändern.

Regeln:
- Neue Funktionen in die thematisch passende Datei; eine Funktion nie in einer zweiten Datei neu definieren.
- Top-Level-Code (Listener, Observer) läuft beim Laden – nur Funktionen aus derselben oder früheren Dateien direkt aufrufen.
- Jury-Begründungen werden so angezeigt, wie die Edge Function sie speichert (kein Nachbearbeiten im DOM). Die Juror-Bilder werden in `config.js` geleert (`assets/jury/` fehlt, → 4.5).
- Cache-Busting: `BUILD` in `app.js` und `?v=` in `index.html` erhöhen.
- Die früheren `app-1.js … app-6d.js` wurden in Roadmap 2.5 gelöscht (Stand davor: Git-Historie bis Commit `3715bcc`).

## Arbeitsregeln

### Das Projekt als Ganzes betrachten
1. **Sitzungsstart:** `CLAUDE.md` und `ROADMAP.md` lesen. Die nächste offene Aufgabe nehmen (oder die vom Nutzer genannte). Keine Aufgabe ausserhalb der Roadmap beginnen, ohne sie vorher dort einzutragen.
2. **Vor dem Ändern verstehen:** Für jede Änderung alle Stellen suchen, die betroffen sind – Frontend, RPC-Funktionen, RLS-Policies, Edge Function, Realtime. Ein Feature gilt erst als fertig, wenn alle Ebenen zusammenpassen.
3. **Keine Nebenbaustellen:** Nur das ändern, was die aktuelle Aufgabe verlangt. Auffälligkeiten nicht nebenbei „mitfixen“, sondern als neue Aufgabe in `ROADMAP.md` eintragen.
4. **Keine stillen Verhaltensänderungen:** Wenn sich Spielregeln, Abläufe oder Texte ändern, im Entscheidungslog der Roadmap festhalten.
5. **Bei echten Produktentscheidungen fragen** (Spielregeln, was gewertet wird, Design-Richtung) statt raten. Technische Details selbst entscheiden und kurz begründen.

### Sitzungsende
- Erledigte Aufgaben in `ROADMAP.md` abhaken, neue Erkenntnisse und Folgeaufgaben eintragen, Entscheidungen ins Entscheidungslog.
- Kurze Zusammenfassung: was geändert wurde, was getestet wurde, was als Nächstes kommt.
- Kleine, thematische Commits mit deutscher Commit-Message (`fix: …`, `feat: …`, `refactor: …`, `style: …`, `docs: …`).

### Datenbank und Supabase
- **Schema-Änderungen nur als Migration** (`supabase/migrations/…sql`) im Repo, nie direkt im Dashboard. Edge Functions liegen unter `supabase/functions/` und werden aus dem Repo deployed.
- **Keine destruktiven Operationen** (`DROP`, `DELETE`, `TRUNCATE`, Spalten entfernen) ohne ausdrückliche Bestätigung des Nutzers.
- Jede neue Tabelle bekommt RLS. Clients dürfen keine `source = 'ai'`-Scores schreiben; das passiert nur serverseitig.
- **Rechte explizit setzen:** Supabase vergibt per Default-Privileges `ALL` auf neue Tabellen und `EXECUTE` auf neue Funktionen an `anon` und `authenticated`. Jede Migration, die eine Tabelle oder Funktion anlegt, entzieht diese Rechte (`revoke all … from anon, authenticated` bzw. `revoke execute … from public, anon`) und vergibt nur, was die App braucht (Muster: `…_harden_table_grants.sql`).
- Migrationen über den Supabase-MCP mit `apply_migration` anwenden; die dabei vergebene Version danach als Dateinamen in `supabase/migrations/` übernehmen, damit Repo und Remote-Historie deckungsgleich bleiben.
- Secrets (API-Keys) nur als Supabase-Secrets, nie im Frontend-Code. Der Publishable Key und die Spotify Client-ID im Frontend sind öffentlich und erlaubt.

### Frontend
- Kein Build-Step einführen, ohne es vorher mit dem Nutzer abzusprechen (GitHub Pages muss weiter direkt funktionieren).
- Nutzereingaben immer über `esc()` ausgeben.
- Nach Änderungen an JS/CSS die `BUILD`-Version in `app.js` und die `?v=`-Parameter in `index.html` erhöhen, sonst sehen Nutzer den alten Stand.
- Mobile-first: alles muss bei 375 px Breite ohne horizontales Scrollen bedienbar sein, Touch-Ziele mindestens 44 px.

### Testen
Es gibt keine automatischen Tests für das Frontend. Nach jeder Änderung den betroffenen Teil dieses Smoke-Tests durchgehen und im Abschluss nennen, was geprüft wurde:

> Ohne Handy testbar (seit 2.5): Im eingebauten Browser ist die Live-Seite der Host; Spieler 2 und Juror laufen als unsichtbare same-origin-iframes (srcdoc) mit eigenem In-Memory-`localStorage`/`sessionStorage` und `BroadcastChannel = undefined` → jeweils eigene anonyme Anmeldung, echte App-Oberfläche, Realtime zwischen allen. Spotify-Token für Spieler 2 aus `mb_sp_*_1` nach `mb_sp_*_2` kopieren. Nur **Abspielen** braucht einen Browser mit DRM (Chrome/Handy).

1. Raum erstellen (1 Gerät) → Spieler 2 hinzufügen → Spotify verbinden → Draft starten
2. Draft: Künstler ziehen, Skip nutzen, alle 10 Picks setzen → Themen erscheinen
3. Battle: Song suchen, einreichen, gleichzeitiges Aufdecken, Abspielen/Pause, Startpunkt
4. Jury: automatische Jury · eigener Entscheid · menschlicher Juror (zweiter Browser) · Runde übernehmen
5. Runde 5 doppelt, Unentschieden → Sudden Death → Endstand
6. 2-Geräte-Modus: Beitritt mit Code, Realtime-Sync auf beiden Geräten
7. Raum verlassen / Modus wechseln / Seite neu laden mitten im Match

Reine Logik (z. B. Jury-Bewertung) wird als reine Funktion geschrieben und mit `node --test` getestet. Tests liegen in `tests/*.test.js`; ausführen im Repo-Root mit `node --test`.

## Glossar
- **Slot** – Spielerplatz 1 oder 2 (A = Slot 1, B = Slot 2)
- **Host** – Ersteller des Raums (Spieler 1), steuert Jury und Rundenwechsel
- **Draft-Weight** – Gewicht eines Künstlers aus dem Spotify-Hörverhalten des Spielers
- **Song-Profil** – vorab gesammelte, gespeicherte Daten zu einem Song (siehe Roadmap Phase 2)
- **Themen-Profil** – maschinenlesbare Beschreibung eines Rundenthemas
- **Juror-Profil** – Gewichtung, nach der ein Juror Song- und Themen-Profil vergleicht
