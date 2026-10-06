# ROADMAP – Überarbeitung Music Battle

**Regeln:** Immer die nächste offene Aufgabe von oben bearbeiten. Pro Sitzung eine Aufgabe (oder wenige eng verwandte). Nach Abschluss abhaken `[x]`, Erkenntnisse und neue Aufgaben eintragen, Entscheidungen unten ins Entscheidungslog. Aufgaben mit 🟡 brauchen vorher eine Entscheidung des Nutzers.

---

## Befund bei Übernahme (06.10.2026)

**Ziele des Nutzers**
1. Die Jury soll nachvollziehbar auf **vorbestimmten Songdaten** urteilen, mit fünf festen Juror-Profilen. KI ist dafür nicht nötig.
2. Kaputte Funktionen reparieren – v. a. „Selber entscheiden“: Button reagiert nicht. Selber wählen soll **immer** möglich sein.
3. Design benutzerfreundlicher, mit **Hip-Hop-Touch**.

**Ursachen, die schon gefunden wurden**
- **Selber entscheiden:** Die aktive `renderBattle()` (app-6b.js) bindet die Buttons `[data-self-winner]` nicht – die Bindung existiert nur in der alten, überschriebenen Version in app-4.js. Zusätzlich ist die Option nur sichtbar, solange keine Juroren im Raum sind und die Auto-Jury noch nicht gelaufen ist, und die RLS-Policy `mb_scores_insert_host_self_decision` verbietet den Eintrag, sobald ein menschlicher Juror im Raum ist.
- **Jury:** Die Edge Function `mb-ai-jury` entscheidet bereits ohne KI (Punkte-Logik), holt aber die Daten bei jedem Klick live von 5 externen Diensten mit kurzen Timeouts. Auswertung der letzten 35 Juror-Wertungen: **Genius 0×, Last.fm 0× geliefert** (Keys vermutlich nicht gesetzt), Lyrics und ListenBrainz nur in ca. 43 % der Fälle. 23 von 35 Wertungen hatten „low confidence“ – fehlen die Daten, entscheidet ein Hash praktisch per Münzwurf. Die von der Funktion gelieferten Begründungen werden im Frontend zudem per `MutationObserver` überschrieben (app-6d.js).
- **Architektur:** 9 Skriptdateien, die sich gegenseitig Funktionen überschreiben (Liste in `CLAUDE.md`), `init()` startet in app-4.js bevor der Rest geladen ist, Juror-Bilder fehlen. Das ist die Hauptursache dafür, dass Fixes „verloren gehen“.
- **Repo unvollständig:** Datenbankschema, RPC-Funktionen, RLS-Policies und die Edge Function liegen nur in Supabase, nicht im Repo.

---

## Phase 0 – Fundament

- [x] **0.1 Supabase ins Repo holen.** `supabase init`, `supabase link --project-ref swgraidbdxpjqnvxacpq`, Schema inkl. RPCs/Policies als Baseline-Migration ziehen (`supabase db pull`), Edge Function herunterladen (`supabase functions download mb-ai-jury`). Commit ohne inhaltliche Änderung. *(Braucht Supabase CLI + Login des Nutzers; alternativ Supabase-MCP in Claude Code.)*
  - *Erledigt 06.10.2026 über Supabase-MCP (ohne CLI).* `supabase/migrations/` enthält die 9 Migrationen aus der Remote-Historie wortgetreu (per MD5 gegen `supabase_migrations.schema_migrations` geprüft) plus `20261006120000_baseline_dashboard_drift.sql` für Änderungen, die ausserhalb von Migrationen gemacht wurden (7 Spalten in `mb_draft_picks`/`mb_submissions`, Policy `mb_scores_insert_host_self_decision`). Die Drift-Migration ist idempotent und **noch nicht in der Remote-Historie eingetragen** – beim ersten `supabase db push` wird sie als No-op angewendet (oder vorher `supabase migration repair --status applied 20261006120000`).
  - Funktionen (15), Trigger, Indizes, Constraints, RLS und Realtime-Publikation stimmen mit den Migrationen überein.
  - `supabase/functions/mb-ai-jury/index.ts` = deployte Version 23 (`verify_jwt = true`). Hinweis: Die Datei wurde aus der API-Antwort übernommen; ein Byte-Vergleich mit dem Deployment war nicht möglich – beim nächsten Deploy aus dem Repo (Phase 3) kurz gegen das Dashboard prüfen.
  - Secrets konnten über die MCP-Schnittstelle nicht ausgelesen werden → Prüfung in 3.4.
- [ ] **0.2 Funktionsinventur.** Kompletten Smoke-Test aus `CLAUDE.md` durchgehen, jede Fehlfunktion unten unter „Gefundene Bugs“ eintragen (Schritt, erwartet, tatsächlich, vermutete Ursache). Noch nichts reparieren.
- [ ] **0.3 Tabellenrechte härten** *(neu aus 0.1)*. `authenticated` hat auf allen `mb_*`-Tabellen alle Rechte (inkl. `DELETE`, `TRUNCATE`) – vermutlich Supabase-Default-Privileges, obwohl die erste Migration nur gezielte Grants vergibt. RLS blockiert ohne passende Policy zwar Schreibzugriffe, `TRUNCATE` unterliegt RLS aber nicht. Per Migration auf die Grants der Core-Migration zurückstellen; vorher prüfen, dass das Frontend nichts darüber hinaus braucht. Ebenso `anon`-Execute auf den RPCs prüfen.

## Phase 1 – „Selber entscheiden“ reparieren

- [ ] 🟡 **1.1 Regel festlegen** (siehe offene Entscheidungen A und B).
- [ ] **1.2 Button-Bindung** `[data-self-winner]` in der aktiven `renderBattle()` ergänzen.
- [ ] **1.3 Immer anbieten:** Sobald beide Songs aufgedeckt sind, hat der Host die Option „Selber entscheiden“ – auch wenn Juroren im Raum sind und auch nachdem die Auto-Jury geurteilt hat (dann als „Jury überstimmen“).
- [ ] **1.4 Backend angleichen:** Migration für die RLS-Policy (Juroren-Bedingung entfernen bzw. gemäss Entscheidung A anpassen).
- [ ] **1.5 Wertungslogik:** `finalizeRound()` mit klarer Rangfolge (Vorschlag: eigener Entscheid > menschliche Jury > Auto-Jury). Ein eigener Entscheid darf nicht mit Juroren-Scorecards zusammengezählt werden.
- [ ] **1.6** `window.confirm` durch eine Bestätigung in der App ersetzen. Smoke-Test Punkt 4 in beiden Gerätemodi.

## Phase 2 – Code konsolidieren (ohne Verhaltensänderung)

- [ ] **2.1** Für jede mehrfach definierte Funktion die aktive Version bestimmen. Ergebnis als Tabelle hier eintragen.
- [ ] **2.2** In eine klare Modulstruktur überführen, z. B. `js/config.js`, `state.js`, `supabase.js`, `spotify.js`, `draft.js`, `battle.js`, `jury.js`, `ui/*.js` (ES-Module, weiterhin ohne Build-Step). Tote Definitionen löschen.
- [ ] **2.3** Start-Race beheben: genau ein `init()` nach vollständigem Laden. Loader `app.js` und Cache-Busting vereinfachen.
- [ ] **2.4** `MutationObserver`-Textüberschreibung entfernen (Begründungen kommen künftig fertig aus der Jury, Phase 3).
- [ ] **2.5** Kompletter Smoke-Test, Abschnitt „Code-Aufbau“ in `CLAUDE.md` auf die neue Struktur aktualisieren, alte `app-*.js` löschen.

## Phase 3 – Neue Jury: Song-Profil × Themen-Profil × Juror-Profil

Grundidee: Die Daten werden **einmal pro Song** gesammelt und gespeichert. Die fünf Juroren vergleichen dann nur noch gespeicherte Werte nach festen Gewichtungen. Gleiche Songs + gleiches Thema = immer gleiches Urteil, und das Urteil ist sofort da.

- [ ] **3.1 Themen-Profile.** Jedes Thema aus `THEMES` (und `SUDDEN_THEMES`) bekommt ein maschinenlesbares Profil: passende Stimmungs-/Genre-Tags, Schlüsselwörter (DE+EN), optional Zieljahr/Ära, Energie (hoch/mittel/tief). Eine einzige Quelle, die Frontend und Edge Function beide nutzen (z. B. `supabase/functions/_shared/themes.json`). Die vorhandenen `motifRules` aus der Edge Function als Ausgangspunkt nehmen.
- [ ] **3.2 Song-Profil-Tabelle** `mb_track_profiles` (Schlüssel `spotify_track_id`, wiederverwendbar über alle Räume): Release-Jahr, Dauer, Explicit, Albumtyp, Künstler-Genres, Hörer-/Listen-Zahlen, Stimmungs-Tags, aus den Lyrics **abgeleitete** Merkmale (Treffer pro Themen-Schlüsselwort, Wortzahl, instrumental) – **keine Lyrics-Texte speichern**. Dazu `data_coverage` (welche Quellen geliefert haben) und `fetched_at`. RLS: lesen für alle Angemeldeten, schreiben nur serverseitig.
- [ ] **3.3 Datensammlung beim Einreichen.** Neue Edge Function `mb-track-profile`, die direkt nach `submitTrack` angestossen wird und das Profil füllt (oder aus dem Cache nimmt). Fehlerhafte Quellen dürfen das Einreichen nicht blockieren.
- [ ] **3.4 Datenquellen reparieren.** Prüfen, welche Secrets gesetzt sind; Last.fm-Key einrichten (kostenlos, wichtigste Quelle für Tags/Hörerzahlen), Genius prüfen oder streichen. Hinweis: Spotify-„Audio Features“ (Tempo, Energy usw.) sind für neue Apps seit Ende 2024 gesperrt – vor Verwendung prüfen, nicht einplanen.
- [ ] **3.5 Juror-Profile** als Konfiguration (eine Datei), je Juror: welche Merkmale mit welchem Gewicht zählen, Mindestdaten, Text-Bausteine im Persona-Stil. Startpunkt:
  - **Themenschnüffler** – Schlüsselwörter in Titel/Lyrics, Tags, Zieljahr
  - **Vibejunkie** – Stimmungs-Tags und Energie im Vergleich zum Themen-Profil
  - **Lyricboss** – Lyrics-Treffer, Textdichte; ohne Lyrics bewusst schwache Stimme
  - **Snoop Underdogg** – der weniger bekannte Song gewinnt, sofern er thematisch mithalten kann
  - **Dr. Körnli** – Katalogkontext: Albumtrack statt Single, Alter, geringere Bekanntheit, Genre-Tiefe
- [ ] **3.6 Bewertungs-Engine** als reine Funktion `scoreRound(songA, songB, theme, jurors) → 5 Scorecards`, mit `node --test`-Tests (inkl. fehlender Daten und Gleichstand). Begründungen werden aus den Text-Bausteinen und den echten Werten gebaut („„X“ hat 3 Nacht-Motive im Text, „Y“ keine“).
- [ ] 🟡 **3.7 Gleichstand und fehlende Daten** gemäss Entscheidung C umsetzen – kein Münzwurf mehr.
- [ ] **3.8** `mb-ai-jury` durch die neue Jury ersetzen (neuer Name z. B. `mb-jury`), OpenRouter-Aufruf entfernen (Entscheidung D). Frontend: Juroren einzeln oder gesammelt aufdecken, gezeigte Daten-Fakten pro Juror. Alte Scores in der DB bleiben unangetastet.
- [ ] **3.9** Test mit 10 echten Song-Paaren über verschiedene Themen; Ergebnisse und Auffälligkeiten hier notieren, Gewichte nachjustieren.

## Phase 4 – Design: benutzerfreundlich mit Hip-Hop-Touch

- [ ] 🟡 **4.1 Design-Richtung festlegen** (Entscheidung E): 2–3 Varianten als statische Mockups (ein Screen, z. B. Battle) vorschlagen, Nutzer wählt.
- [ ] **4.2 Design-Tokens** in `styles.css` neu aufsetzen (Farben, Schriften, Abstände, Radien, Schatten). Ideen: kräftige Condensed-Display-Schrift für Titel, Sticker-/Tape-Elemente, Gold- oder Neon-Akzente, Boxkampf-Scorecards, Vinyl-/Kassetten-Motive – Lesbarkeit und Kontrast gehen vor.
- [ ] **4.3 Ablauf vereinfachen:** Fortschrittsanzeige Lobby → Draft → Battle → Ergebnis, pro Screen genau eine klare Hauptaktion, weniger Erklärtext, Entwickler-Hinweise (z. B. Redirect-URI) aus der Lobby entfernen, „Wer ist dran?“ bei Pass & Play gross anzeigen.
- [ ] **4.4 Screens umsetzen** in dieser Reihenfolge: Start/Modus → Lobby → Draft → Battle → Jury → Endstand. Nach jedem Screen Mobil-Check (375 px).
- [ ] **4.5 Juror-Avatare** als eigene Illustrationen (SVG), keine Fotos oder Abbildungen echter Personen.
- [ ] **4.6** Momente mit Wirkung: Song-Reveal, Juror-Aufdecken, Rundensieg, Matchsieg (dezente Animationen, `prefers-reduced-motion` respektieren).

## Phase 5 – Abschluss

- [ ] **5.1** Kompletter Smoke-Test in beiden Gerätemodi, auf Handy und Desktop.
- [ ] **5.2** `README.md` (Spielablauf, Setup, Deployment) und `CLAUDE.md` final aktualisieren.
- [ ] **5.3** PWA-Manifest-Beschreibung und Texte an neue Jury anpassen („KI-Jury“ → neuer Name).

---

## Gefundene Bugs
*(wird in 0.2 und laufend gefüllt – Format: Schritt · erwartet · tatsächlich · Ursache · Aufgabe)*

- Selber entscheiden: Button ohne Funktion · Bindung fehlt in aktiver `renderBattle()` · → 1.2
- Raum verlassen (Host) · Raum bleibt für die anderen offen oder wird bewusst geschlossen · `mb_leave_room` schliesst den Raum immer, beide `if`-Zweige sind identisch · vermutlich unfertige Logik · in 0.2 bestätigen, Regel ggf. als Entscheidung klären
- Toter Code Backend (aus 0.1): RPC `mb_set_spotify_ready` wird vom Frontend nicht mehr genutzt (nur `…_for_slot`), `validateResult()` in `mb-ai-jury` wird nie aufgerufen, `mb_rooms.jury_mode`/`game_state` scheinen ungenutzt · → beim Konsolidieren (2.x) bzw. Jury-Ersatz (3.8) entfernen (Achtung: `DROP` nur mit Bestätigung)
- Edge Function `mb-ai-jury` löscht vor dem Einfügen alle AI-Scores der Runde – bei Doppelklick zwei parallele Läufe möglich · → 3.8 beachten

## Offene Entscheidungen (Nutzer)

- **A – Wer darf selber entscheiden?** Vorschlag: nur der Host. Alternative im 2-Geräte-Modus: beide Spieler müssen denselben Sieger bestätigen.
- **B – Eigener Entscheid vs. menschliche Juroren:** Vorschlag: Eigener Entscheid überstimmt immer alles (bewusster Override, wird im Endstand markiert).
- **C – Gleichstand bei einem Juror / zu wenig Daten:** Vorschlag: Juror vergibt 10–10 und sagt offen „zu wenig Daten“; endet die ganze Jury unentschieden, wird „Selber entscheiden“ hervorgehoben.
- **D – KI für Formulierungen behalten?** Vorschlag: nein – Text-Bausteine pro Juror sind konsistenter, schneller und kostenlos.
- **E – Design-Richtung** (siehe 4.1).

## Entscheidungslog
*(Datum · Entscheidung · Begründung)*

- 06.10.2026 · Jury soll ohne KI auf gespeicherten Songdaten urteilen · Wunsch des Nutzers, bessere Nachvollziehbarkeit und Zuverlässigkeit
- 06.10.2026 · „Selber entscheiden“ soll immer verfügbar sein · Wunsch des Nutzers
- 06.10.2026 · Supabase-Stand per MCP statt CLI ins Repo geholt: Remote-Migrationshistorie 1:1 übernommen, Dashboard-Änderungen als eigene idempotente Migration nachgetragen (statt einer einzigen Gesamt-Baseline) · so bleibt die Historie mit `supabase migration list` deckungsgleich und nichts muss in der Live-DB repariert werden
