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
  - *Erledigt 06.10.2026 über Supabase-MCP (ohne CLI).* `supabase/migrations/` enthält die 9 Migrationen aus der Remote-Historie wortgetreu (per MD5 gegen `supabase_migrations.schema_migrations` geprüft) plus `…_baseline_dashboard_drift.sql` für Änderungen, die ausserhalb von Migrationen gemacht wurden (7 Spalten in `mb_draft_picks`/`mb_submissions`, Policy `mb_scores_insert_host_self_decision`). Die Drift-Migration ist idempotent; in 0.3 live registriert (Version `20261006143741`).
  - Funktionen (15), Trigger, Indizes, Constraints, RLS und Realtime-Publikation stimmen mit den Migrationen überein.
  - `supabase/functions/mb-ai-jury/index.ts` = deployte Version 23 (`verify_jwt = true`). Hinweis: Die Datei wurde aus der API-Antwort übernommen; ein Byte-Vergleich mit dem Deployment war nicht möglich – beim nächsten Deploy aus dem Repo (Phase 3) kurz gegen das Dashboard prüfen.
  - Secrets konnten über die MCP-Schnittstelle nicht ausgelesen werden → Prüfung in 3.4.
- [x] **0.2 Funktionsinventur.** Kompletten Smoke-Test aus `CLAUDE.md` durchgehen, jede Fehlfunktion unten unter „Gefundene Bugs“ eintragen (Schritt, erwartet, tatsächlich, vermutete Ursache). Noch nichts reparieren.
  - *Teil 1 + 2 erledigt 06.10.2026* (Pass & Play und 2 Geräte, alle 7 Smoke-Test-Schritte) – Ergebnisse unten. **Offen:** Herkunft des `length`-TypeErrors (beim Konsolidieren in 2.x mit Stacktrace prüfen).
- [x] **0.3 Tabellenrechte härten** *(neu aus 0.1)*. `authenticated` hat auf allen `mb_*`-Tabellen alle Rechte (inkl. `DELETE`, `TRUNCATE`) – vermutlich Supabase-Default-Privileges, obwohl die erste Migration nur gezielte Grants vergibt. RLS blockiert ohne passende Policy zwar Schreibzugriffe, `TRUNCATE` unterliegt RLS aber nicht. Per Migration auf die Grants der Core-Migration zurückstellen; vorher prüfen, dass das Frontend nichts darüber hinaus braucht. Ebenso `anon`-Execute auf den RPCs prüfen.
  - *Erledigt 06.10.2026:* Migration `20261006143756_harden_table_grants.sql` live angewendet. `authenticated` hat jetzt exakt die Grants der Core-Migration (kein `DELETE`/`TRUNCATE` mehr), `anon` hat auf keine `mb_*`-Tabelle und keine `mb_*`-Funktion mehr Zugriff, `mb_make_room_code`/`mb_lock_submission_identity` sind nur noch intern nutzbar. Vorher Trockenlauf in zurückgerollter Transaktion inkl. simuliertem Nutzer.
  - Gleichzeitig die Drift-Migration aus 0.1 live registriert (No-op) → neue Version `20261006143741`, Datei umbenannt. Remote-Historie und `supabase/migrations/` sind jetzt deckungsgleich (11 Migrationen).
  - Getestet (live, App-Session im Browser, Raum `K4W6BH`): Raum erstellen, Spieler 2 lokal, Spotify-Status setzen, Draft starten (`mb_rooms` update), 10 Draft-Picks, Skip, Battle starten, 2 Submissions, Startpunkt ändern, Song-Sperre greift weiter, Self-Decision-Scorecard einfügen, Rundenwechsel, Auto-Jury-Edge-Function, UI springt per Sync in Runde 2. `DELETE` auf `mb_jury_scores`/`mb_rounds` jetzt `42501 permission denied` statt stillem No-op. Nicht erneut getestet: menschlicher Juror (gleicher Grant-Pfad wie Self-Decision-Insert).
  - Hinweis für künftige Migrationen → in `CLAUDE.md` ergänzt.
- [x] **0.4 Neu-Rendern entschärfen** *(neu aus 0.2)*. Der Fallback-Poll (`mbSafeSync`, alle 2,5 s) baut die ganze Seite neu auf, auch wenn sich nichts geändert hat. Folge: Klicks gehen sporadisch verloren, eingetippter Text verschwindet nach dem Verlassen des Feldes. Lösung: nur rendern, wenn sich die geladenen Daten tatsächlich geändert haben (z. B. Vergleich eines Daten-Fingerabdrucks), und Eingabewerte über den Neuaufbau retten. Vor Phase 1, weil sonst auch der reparierte „Selber entscheiden“-Button unzuverlässig wirkt.
  - *Erledigt 06.10.2026* in `app-6a.js`: `mbRoomFingerprint()` (JSON der Raumdaten) – `mbSafeSync()` rendert nur bei Änderung; `mbRenderKeepingInputs()` rettet Texteingaben (per `id` bzw. `placeholder`) über einen Neuaufbau, aber nur innerhalb derselben Phase/Runde; `reloadRoomNow()` (überschreibt app-1) merkt sich den Fingerabdruck nach eigenen Aktionen. BUILD `20261006-1`.
  - Getestet (Live-Seite, neuer Code injiziert, Raum `ZE9TUP`): alt 3 Neuaufbauten bei 3 Sync-Ticks + Text weg → neu 0 Neuaufbauten, Text bleibt (gleiches DOM-Element); bei Datenänderung (Spotify-Status) genau 1 Neuaufbau, Anzeige aktuell, Text gerettet; Spieler 2 hinzufügen, Draft starten, Screenwechsel funktionieren; im Draft ebenfalls 0 unnötige Neuaufbauten. Nach dem Deploy auf der Live-Version (BUILD 20261006-1, Raum `946AGB`) nachgeprüft: 0 Neuaufbauten, Text bleibt.
  - Nebenbefund: Ist das Browserfenster/-tab verborgen, pausiert der Poll (`document.hidden`) – gewollt, Realtime läuft weiter.

## Phase 1 – „Selber entscheiden“ reparieren

- [x] 🟡 **1.1 Regel festlegen** (siehe offene Entscheidungen A und B).
  - *Entschieden 06.10.2026:* **Nur der Host** entscheidet selbst (A). „Selber entscheiden“ gibt es **nur, wenn kein menschlicher Juror im Raum ist** – dann aber immer, auch statt bzw. nach der Auto-Jury (B). Mit Juror entscheidet ausschliesslich die menschliche Jury.
- [x] **1.2 Button-Bindung** `[data-self-winner]` in der aktiven `renderBattle()` ergänzen.
  - *Erledigt 06.10.2026* in `app-6b.js` (`renderBattle`).
- [x] **1.3 Immer anbieten (ohne Juror):** Sobald beide Songs aufgedeckt sind und **kein menschlicher Juror im Raum ist**, hat der Host die Option „Selber entscheiden“ – vor der Auto-Jury, statt ihr und auch nachdem sie geurteilt hat (dann als „Jury überstimmen“). Mit Juror im Raum bleibt es bei „Runde werten“ (gemäss 1.1).
  - *Erledigt:* `renderJury` (app-6c) zeigt ohne Juror die Wahl KI-Jury/selber; nach der Auto-Jury zusätzlich Block „Jury überstimmen“; mit Juror nur Warte-Hinweis bzw. „Runde werten“. Nach einem eigenen Entscheid: Block „Eigener Entscheid“.
- [x] **1.4 Backend angleichen:** Die RLS-Policy `mb_scores_insert_host_self_decision` entspricht bereits Entscheidung 1.1 (nur Host, nur ohne Juror) und **bleibt**. Prüfen: Nach einem eigenen Entscheid darf kein zweiter eingefügt werden (`mb_human_score_once` greift, da `juror_user_id` = Host) und der Override nach der Auto-Jury funktioniert ohne Konflikt mit den AI-Scores. Nur falls nötig Migration.
  - *Erledigt ohne Migration:* Policy getestet (zurückgerollte Transaktion): mit Juror im Raum blockiert (RLS), ohne Juror erlaubt; zweiter eigener Entscheid pro Runde → `23505 mb_human_score_once`; Override nach Auto-Jury ohne Konflikt.
- [x] **1.5 Wertungslogik:** `finalizeRound()` mit klarer Rangfolge: **mit Juror** zählt nur die menschliche Jury; **ohne Juror** gilt eigener Entscheid > Auto-Jury. Ein eigener Entscheid wird nie mit anderen Scorecards zusammengezählt und ist im Endstand als „Eigener Entscheid“ markiert.
  - *Erledigt:* zentrale `roundDecision(roundId, live)` in app-6c, genutzt von `finalizeRound` (app-3), `renderBattle` (app-6b) und Endstand (`roundJuryMargin`, Rundenliste in app-6d). Eigener Entscheid übernimmt die Runde direkt (ein Klick + Rückfrage), Endstand zeigt „Eigener Entscheid“, Jury-Statistik ignoriert solche Runden. BUILD `20261006-2`.
  - Getestet (Live-Seite, Code per temporärem Branch injiziert, Raum `UXDXS3`, echte Klicks): A) eigener Entscheid vor Auto-Jury → Runde an B, 1 Scorecard; B) Auto-Jury 49–46 für A, „Jury überstimmen“ auf B → Runde an B; C) Auto-Jury → „übernehmen“ → Runde an A (unverändert); D) Juror im Raum → keine Selbst-/KI-Option, `finalizeRound` meldet fehlende Juror-Scorecard; E) Endstand markiert Runden 1+2, Jury-Statistik nur Runde 3. Nach dem Deploy live (BUILD 20261006-2, Raum `WZYNE3`) mit echtem Klick nachgeprüft: Rückfrage → Runde 1 an A → Runde 2.
- [x] **1.6** `window.confirm` durch eine Bestätigung in der App ersetzen. Smoke-Test Punkt 4 in beiden Gerätemodi.
  - *Code erledigt 06.10.2026:* `mbConfirm()` in app-6a (Dialog ausserhalb von `#app`, `role="alertdialog"`, Fokus startet auf „Bestätigen“ und bleibt im Dialog, Escape/Hintergrund/„Abbrechen“ = nein, mobil ≤ 420 px breit, Einblendung nur ohne `prefers-reduced-motion`). Ersetzt beide `window.confirm` (Selber entscheiden in app-3, Moduswechsel in app-5). Styles am Ende von `styles.css`. BUILD `20261006-3`.
  - Getestet (Live-Seite mit injiziertem Code, Raum `JCJ8PQ`, echte Klicks, `window.confirm` als Falle präpariert): Escape, „Abbrechen“, Hintergrund-Klick und Neuaufbau während offenem Dialog ändern nichts; „Ja, Sieger festlegen“ wertet die Runde; Moduswechsel: „Weiterspielen“ bleibt im Match, „Verlassen“ → Modusauswahl. Bei 375 px: Dialog 336 px breit, kein horizontales Scrollen, Buttons ≥ 44 px. Live-Version danach geprüft.
  - Smoke-Test Punkt 4 im 2-Geräte-Modus (06.10.2026, Raum `MF3Q5H`, Host im eingebauten Browser, Spieler 2 am Handy, Juror in drittem Fenster): Host entscheidet per In-App-Dialog selbst → Runde 1 an Spieler 2, Handy springt ohne Neuladen in Runde 2; Juror tritt bei → Host sieht nur „Warte auf menschliche Scorecards“ (keine Selbst-/KI-Option); Juror-Scorecard 8–10 → „Runde werten“ → Runde 2 an Spieler 2. **Phase 1 abgeschlossen.**

- [x] 🟡 **1.7 Geschlossener Raum** *(neu aus 0.2, vom Nutzer vor Phase 2 eingeschoben)*. Verlässt der Host das Match, landen Spieler 2 und Juroren kommentarlos in der Lobby des geschlossenen Raums (Frontend kennt `status = 'closed'` nicht); `mb_leave_room` schliesst den Raum immer (beide `if`-Zweige identisch). Regel festlegen (Entscheidung F), dann Backend (`mb_leave_room`) und Frontend (Hinweis + zurück zur Startseite, Raum aus `localStorage` lösen) angleichen. Smoke-Test Punkt 7 in beiden Gerätemodi.
  - *Entschieden 06.10.2026 (F):* Host verlässt → Match endet für alle. Spieler 2 verlässt (2 Geräte) → Raum bleibt offen, Platz wartet auf Wiederbeitritt mit dem Raumcode.
  - *Umgesetzt:* `renderClosed()` + `renderMissingPlayerNotice()` in app-6d (vorher fiel `closed` in `else renderLobby()`); `mbConfirmLeave()` in app-6a mit Text je Rolle (Host / Spieler 2 / Juror), genutzt von Logo-Moduswechsel (app-5) **und neu auch von „Raum verlassen“/„Neuen Raum eröffnen“** (app-4, vorher ohne Rückfrage); in Lobby und nach Matchende keine Rückfrage. Migration `20261006151258_mb_leave_room_cleanup.sql` (doppelten Zweig entfernt, Verhalten gleich, Rechte unverändert). BUILD `20261006-4`.
  - *Getestet:* vor dem Deploy per injiziertem Code (Texte aller drei Rollen, Abbruch, Hinweis nur im 2-Geräte-Modus, Closed-Screen, „Zur Startseite“ per echtem Klick). Danach live mit Handy (Raum `3ECS49`): Spieler 2 tippt Logo → Dialog mit Wiederbeitritts-Text → „Verlassen“; Host sieht Hinweis mit Code; Spieler 2 tritt mit Code wieder bei → Platz 2 besetzt, Hinweis weg; Host „Raum verlassen“ → Dialog „für alle beendet“ → Handy zeigt „Der Host hat das Match beendet“ → „Zur Startseite“ funktioniert.
  - *Bekannte Grenzen (bewusst nicht mitgefixt):* Beim Wiederbeitritt entsteht eine neue Mitgliedschaft – Name neu, Spotify muss neu verbunden werden (Tokens werden beim Verlassen gelöscht), der Draft-Skip ist wieder frei (`draft_skip_used` hängt an der Mitgliedschaft). Juror-Verlassen nur per injiziertem Code geprüft.

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

- ✅ *behoben in 1.2–1.5* – Selber entscheiden: Button ohne Funktion · Bindung fehlt in aktiver `renderBattle()` · → 1.2
- ✅ *geklärt in 1.7* – Raum verlassen (Host) · Raum bleibt für die anderen offen oder wird bewusst geschlossen · `mb_leave_room` schliesst den Raum immer, beide `if`-Zweige sind identisch · vermutlich unfertige Logik · in 0.2 bestätigen, Regel ggf. als Entscheidung klären
- Toter Code Backend (aus 0.1): RPC `mb_set_spotify_ready` wird vom Frontend nicht mehr genutzt (nur `…_for_slot`), `validateResult()` in `mb-ai-jury` wird nie aufgerufen, `mb_rooms.jury_mode`/`game_state` scheinen ungenutzt · → beim Konsolidieren (2.x) bzw. Jury-Ersatz (3.8) entfernen (Achtung: `DROP` nur mit Bestätigung)
- Edge Function `mb-ai-jury` löscht vor dem Einfügen alle AI-Scores der Runde – bei Doppelklick zwei parallele Läufe möglich · → 3.8 beachten

**Smoke-Test 06.10.2026** (Pass & Play, eingebauter Browser der Claude-App, Raum `6BH2H6`):

- ✅ *behoben in 0.4* – **Alle Screens** · Klicks kommen zuverlässig an · Klicks gehen sporadisch verloren (2× beobachtet: „Sudden Death übernehmen“, „Raum verlassen“ – Handler gebunden, zweiter Klick klappt) · `mbSafeSync()` (app-6a) lädt alle 2,5 s und rendert die **ganze Seite neu, auch ohne Datenänderung**; fällt ein Klick in den Neuaufbau, landet er auf einem entfernten Element · → **0.4**
- ✅ *behoben in 0.4* – **Lobby, Namensfeld Spieler 2** · eingetippter Text bleibt · Text tippen, danach daneben tippen → nach ≤ 2,5 s ist der Text weg (auf dem Handy reicht Tastatur schliessen) · gleicher Neuaufbau; Eingaben werden nur bei aktivem Fokus geschützt · → **0.4**
- **Seite laden** · keine Konsolenfehler · `onSpotifyWebPlaybackSDKReady is not defined` bei jedem Laden · `index.html` lädt das Spotify-SDK, der Callback wird nirgends definiert (App pollt stattdessen `window.Spotify`) – funktional harmlos · → 2.3
- **Battle/Jury** · keine Konsolenfehler · wiederholt `TypeError: Cannot read properties of undefined (reading 'length')`, dazu einmal HTTP 400 · Quelle nicht gefunden (evtl. Spotify-SDK nach Init-Fehler) · in Chrome mit funktionierendem Player nachprüfen · → 0.2
- **Lobby Pass & Play** · ein klarer Spotify-Hinweis · oben „ein Konto für beide“, bei Spieler 2 „öffnet Spotify für das zweite Konto“ · widersprüchliche Texte aus verschiedenen Dateiversionen · → 4.3
- **Battle, Songsuche** · Enter startet Suche · Enter macht nichts, nur der Button „Suchen“ · → 4.4
- **Battle, Song einreichen** · bewusste Bestätigung · ein Tipp auf einen Treffer sperrt den Song sofort und endgültig · Produktfrage, ob gewollt · → 4.3
- **Battle, Abspielen** · Song spielt · „Spotify Player Initialisierung: Failed to initialize player“ · **Testumgebung**: eingebauter Browser hat kein Widevine/DRM. Abspielen/Pause/Startpunkt-Wiedergabe muss in Chrome bzw. am Handy getestet werden · → 0.2. Die Fehlermeldung bleibt zudem in den nächsten Runden stehen (siehe nächster Punkt).
- **Battle, Statusmeldungen** · Meldung gilt nur für den Moment · „KI-Jury ist bereit.“ und Player-Fehler bleiben in Folgerunden stehen · `S.error`/Info wird beim Rundenwechsel nicht geleert · → 4.4
- **Jury, Auto-Jury** · Urteil mit Ladeanzeige in wenigen Sekunden · ~10 s ohne jede Ladeanzeige; Last.fm, Genius, MusicBrainz, ListenBrainz lieferten nichts, nur Song A hatte Lyrics → alle 5 Juroren 10–9 für A mit Begründung „Motiv: rap“ · `OPENROUTER_API_KEY` ist gesetzt, Umformulierung scheitert aber („No JSON object returned“) und kostet ~5 s · → 3.4, 3.8
- **Jury, Begründungen** · Text aus der DB · angezeigter Text ≠ gespeicherter Text (MutationObserver app-6d), u. a. Tippfehler „Spotify-Hörsignal-Signal“ · → 2.4
- **Jury, Motiv-Erkennung** · thematische Treffer · deutscher Artikel „die“ zählt als englisches Motiv *die* (sterben) im Thema „Letzte Chance auf den Sieg“ · `motifRules` mischt DE/EN ohne Sprachprüfung · → 3.1/3.6
- **Jury, nach Auto-Jury** · „Selber entscheiden“ weiter möglich · Option verschwindet · bekannt · → 1.3
- **Sudden Death** · sauberes Label · „SUDDEN DEATH · SUDDEN DEATH“ (Kategorie = Rundenname) · → 4.4
- **Draft, Rundenfelder** · per Tastatur bedienbar · `div.roundslot` statt Button, kein Fokus/Enter · → 4.4

**Funktioniert:** Raum erstellen inkl. Pflichtfeld-Prüfung · Spieler 2 hinzufügen · „Draft starten“ gesperrt ohne Spotify · Spotify-Login inkl. Rückkehr in den Raum · Draft: ziehen, Skip je Spieler einmal, 10 Picks, Themen erscheinen · Songsuche, Einreichen, verdeckt bis beide eingereicht, gleichzeitiges Aufdecken · Startpunkt-Regler speichert (`start_ms`) · Spotify-Metadaten (ISRC, Release, Albumtyp) werden gespeichert · Auto-Jury + „Runde übernehmen“ · Seite neu laden mitten im Match (Stand bleibt) · Runde 5 doppelt, 3–3 → Sudden Death (neue Künstler ziehen, Battle, Jury) → Endstand 3–4 mit Statistik · Raum verlassen.

**Smoke-Test Teil 2 (06.10.2026, 2-Geräte-Modus, Raum `3FG3SA`, Host im eingebauten Browser + Spieler 2 am Handy):** Beitritt mit Code, Spotify je Gerät, Draft abwechselnd über beide Geräte, Einreichen verdeckt + gleichzeitiges Aufdecken – alles per Realtime synchron. Am Handy: kein horizontales Scrollen, Knöpfe gut treffbar, **Abspielen/Pause/Startpunkt funktionieren** (laut Nutzer), Enter in der Suche vermutlich ok (Handy-Tastatur).
- **Lobby 2 Geräte, Host** *(Ursache gefunden in 1.7: `resetLocalRoomState()` löscht beim Verlassen die Spotify-Tokens beider Slots)* · Spotify bleibt verbunden, wenn es im selben Browser kurz vorher verbunden war · Host musste Spotify im neuen Raum erneut verbinden (OAuth erneut) · Spotify-Status hängt offenbar am Raum/Slot statt am Browser · → 0.2-Nachtest bzw. 4.3

- **Menschlicher Juror** (zweites Browserfenster) · Beitritt mit Code, Scorecard 10–8, Host sieht sie live und „Runde werten“ übernimmt sie → Runde 2 · funktioniert. Mit Juror im Raum bietet der Host-Screen **nur** „Runde werten“ an – weder Auto-Jury noch „Selber entscheiden“ · → 1.1/1.3
- **Battle, Suchfeld** · leer in neuer Runde · Suchbegriff der Vorrunde („LUCKI“) steht in Runde 2 beim neuen Künstler (Travis Scott) · Suchtext wird beim Rundenwechsel nicht zurückgesetzt · → 4.4
- **Modus wechseln mitten im Match (Logo)** · Rückfrage, bei „Abbrechen“ bleibt alles, bei „OK“ zurück zur Modusauswahl · funktioniert (seit 1.6 In-App-Dialog). Raum wird dabei für alle geschlossen (`status = closed`), Spieler 2 und Juror bleiben als Mitglieder eingetragen · siehe Bug `mb_leave_room` oben
- ✅ *behoben in 1.7* – **Host verlässt Match (2 Geräte)** · Spieler 2 und Juror erfahren, dass das Match beendet ist · beide landen kommentarlos in der **Lobby des geschlossenen Raums** (Draft-Start usw. sichtbar) · Frontend behandelt `status = 'closed'` nirgends (kein Treffer für `closed` in `app*.js`) und fällt auf die Lobby zurück · → 1.x/4.3 (Hinweis „Host hat das Match beendet“ + zurück zur Startseite); Regel, ob der Raum für die anderen offen bleiben soll, zusammen mit `mb_leave_room` klären

Damit ist der Smoke-Test aus `CLAUDE.md` einmal vollständig durchlaufen (Ausnahme: Herkunft des `length`-TypeErrors). Runden 2–5 wurden für den Gleichstand per `mb_advance_round` direkt gesetzt (UI-Weg dafür ist „Selber entscheiden“, das kaputt ist).

## Offene Entscheidungen (Nutzer)

- ~~**A – Wer darf selber entscheiden?**~~ → entschieden 06.10.2026: nur der Host.
- ~~**B – Eigener Entscheid vs. menschliche Juroren:**~~ → entschieden 06.10.2026: Selber entscheiden nur ohne Juror im Raum; mit Juror zählt allein die menschliche Jury.
  - *Teilantwort Nutzer 06.10.2026:* Ohne Juror im Raum muss „Selber entscheiden“ immer möglich sein – auch statt der Auto-Jury, wenn man sie nicht nutzen will. Offen: Darf der Host auch **mit** Juror im Raum selbst entscheiden/überstimmen? → in 1.1 klären.
- **C – Gleichstand bei einem Juror / zu wenig Daten:** Vorschlag: Juror vergibt 10–10 und sagt offen „zu wenig Daten“; endet die ganze Jury unentschieden, wird „Selber entscheiden“ hervorgehoben.
- **D – KI für Formulierungen behalten?** Vorschlag: nein – Text-Bausteine pro Juror sind konsistenter, schneller und kostenlos.
- **E – Design-Richtung** (siehe 4.1).
- ~~**F – Was passiert, wenn jemand das Match verlässt?**~~ → entschieden 06.10.2026: Host → Match endet für alle; Spieler 2 (2 Geräte) → Raum wartet auf Wiederbeitritt.

## Entscheidungslog
*(Datum · Entscheidung · Begründung)*

- 06.10.2026 · Jury soll ohne KI auf gespeicherten Songdaten urteilen · Wunsch des Nutzers, bessere Nachvollziehbarkeit und Zuverlässigkeit
- 06.10.2026 · „Selber entscheiden“ soll immer verfügbar sein · Wunsch des Nutzers
- 06.10.2026 · Supabase-Stand per MCP statt CLI ins Repo geholt: Remote-Migrationshistorie 1:1 übernommen, Dashboard-Änderungen als eigene idempotente Migration nachgetragen (statt einer einzigen Gesamt-Baseline) · so bleibt die Historie mit `supabase migration list` deckungsgleich und nichts muss in der Live-DB repariert werden
- 06.10.2026 · Verlassen-Regel F: Host verlässt → Match endet für alle (Hinweis + Startseite); Spieler 2 verlässt → Platz wartet auf Wiederbeitritt per Raumcode · Entscheid des Nutzers (1.7). „Raum verlassen“ fragt mitten im Match jetzt ebenfalls nach (vorher ohne Rückfrage)
- 06.10.2026 · Text Moduswechsel: „Das laufende Match wird für alle beendet“ statt „…wird verlassen“, Buttons „Weiterspielen“/„Verlassen“ · entspricht dem tatsächlichen Verhalten (Raum wird geschlossen, siehe Bug `mb_leave_room`)
- 06.10.2026 · Eigener Entscheid übernimmt die Runde sofort (kein zweiter Klick „Runde werten“ mehr) · die Rückfrage bestätigt den Sieger bereits; ein Hauptschritt pro Screen. Fällt der Rundenwechsel aus, bleibt „Runde übernehmen“ als Rückfall sichtbar
- 06.10.2026 · Selber entscheiden: nur der Host, nur ohne menschlichen Juror im Raum (dann immer, auch statt/nach der Auto-Jury); mit Juror entscheidet ausschliesslich die menschliche Jury · Entscheid des Nutzers (1.1); bestehende RLS-Policy passt bereits dazu
- 06.10.2026 · Tabellenrechte auf die Grants der Core-Migration zurückgesetzt (nicht weiter verschärft, z. B. `mb_rounds` insert/update bleibt, obwohl das Frontend es nur über RPCs nutzt) · keine Verhaltensänderung für die App; weitere Verschärfung erst nach der Konsolidierung (Phase 2), wenn klar ist, welche Zugriffe bleiben
- 06.10.2026 · „Blind Draft“ ist kein Blind Draft (Gegner-Künstler sind im Draft sichtbar) · Nutzer: Bezeichnung streichen oder „verdeckt“ als Option anbieten → bei 4.3/4.4 umsetzen
- 06.10.2026 · Neue Aufgabe 0.4 (Neu-Rendern) vor Phase 1 eingeschoben · im Smoke-Test als Ursache für verlorene Klicks und verlorene Eingaben identifiziert; ohne Fix wirkt jeder reparierte Button weiterhin „manchmal kaputt“
