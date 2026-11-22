# ROADMAP – Music Battle

**Regeln:** Immer die nächste offene Aufgabe von oben bearbeiten. Pro Sitzung eine Aufgabe (oder wenige eng verwandte). Nach Abschluss abhaken `[x]`, Erkenntnisse und neue Aufgaben eintragen, Entscheidungen unten ins Entscheidungslog. Aufgaben mit 🟡 brauchen vorher eine Entscheidung des Nutzers.

**Archiv:** Alles Erledigte bis 22.11.2026 (Phasen 0–8, Werkzeuge, Qualitäts-Check, Bugs, Entscheidungen A–O mit Begründung) steht in `ROADMAP-ARCHIV.md`. Nur gezielt durchsuchen, wenn eine frühere Entscheidung oder ein Ablauf wichtig ist. Erledigte Aufgaben hier nach einiger Zeit ins Archiv verschieben, damit diese Datei kurz bleibt.

---

## Offene Aufgaben

- [ ] **7.9 Abschluss B.** Smoke-Test (solo; 3 Personen, davon 1 mit Spotify; 2 mit Spotify; Neuladen mitten im Quiz; Host verlässt; Abspielen am Handy über die Spotify-App), README (Spielablauf Quiz), CLAUDE.md (Projektbeschreibung, Datenmodell, Code-Aufbau, Smoke-Test, Glossar), BUILD erhöhen. Beta-Schalter `?quiz=1` (`quizEnabled`) entfernen, Quiz-Karte für alle zeigen.
  - *Gemeinsamer Test 10.11.2026 (Host im Chrome des Nutzers, Mitspieler „aj“ am Handy, Raum `QASTS5`):* echter Spotify-Login als Quiz-Mitspieler (Zustimmung durch den Nutzer) → Rückkehr in die Lobby, 300 Songs automatisch geladen (alle mit Jahr und Cover); Beitritt per Link am Handy; Quiz gestartet, **Musik im Chrome-Web-Player**: Cover-Frage spielt beim Aufdecken den Lösungs-Song (ab 0:30), Jahr-Frage während der Frage; Antworten vom Handy kommen an und werden gewertet (z. B. 680 Punkte nach 12,9 s); Nutzer: „alles funktioniert“. **Bug gefunden und behoben** (BUILD `20261110-8`): Bei Fragen ohne Musik pausierte die App den noch leeren Player → Spotify-Fehler „Cannot perform operation; no list was loaded“ als roter Hinweis beim Host → `stopQuizTrack` pausiert nur, wenn das Quiz schon etwas abgespielt hat. **Rückmeldung Nutzer: Fragen zu einfach** → 7.12. Noch offen für 7.9: Musik über die Spotify-App am iPhone als Host, Neuladen mitten in einer Frage (nicht ausdrücklich bestätigt), Host verlässt, 3+ Personen, Beta-Schalter entfernen.
  - *Code-Teil erledigt 20.11.2026 (BUILD `20261120-1`):* Beta-Schalter `quizEnabled`/`?quiz=1` entfernt (der gespeicherte Wert `mb_quiz_beta` bleibt auf alten Geräten liegen, wird nicht mehr gelesen) – die Quiz-Karte erscheint für alle; Kennzeichnung „BETA“ auf Startseite und Quiz-Startseite entfernt. Schluss-Bildschirm nach „Host verlässt“ unterscheidet jetzt die Spielart (Quiz: „Der Host hat das Quiz beendet“ statt „… das Match beendet“). README (eigener Abschnitt „Musik-Quiz“), CLAUDE.md (Projektbeschreibung, Code-Aufbau, Smoke-Test Punkt 8, Glossar) nachgeführt.
  - Geprüft: `node --test` (149 grün); lokal bei 375 px und 1280 px (ohne Datenbank, Supabase aus der Testumgebung gesperrt): Quiz-Karte ohne `?quiz=1` sichtbar, Antippen führt zur Quiz-Startseite, kein seitliches Scrollen. Im Code geprüft: `mb_leave_room` schliesst auch Quiz-Räume, wenn der Host geht; `loadRoom` lädt die Quiz-Daten mit (Neuladen sollte in die laufende Frage führen).
  - **Bleibt offen (Test mit echten Geräten, nur mit dem Nutzer):** Host am iPhone mit Musik über die Spotify-App; Neuladen mitten in einer Frage; Host verlässt (Mitspieler sehen „Quiz beendet“); 3 Personen, davon 1 mit Spotify; 2 mit Spotify. Danach abhaken.
  - Aufgefallen: Der Einleitungssatz der Startseite („Zwei Spieler, fünf Runden, eine Jury. Wählt euren Modus.“) passt nur zum Battle, seit das Quiz für alle sichtbar ist → Text-Entscheid beim Nutzer.

- [ ] **4.7 (optional)** Verdeckter Draft als Option beim Raum erstellen (Gegner-Künstler bis zum Battle verborgen) – Wunsch des Nutzers vom 06.10.2026; Bezeichnung „Blind Draft“ wurde in 4.3 gestrichen.

## Später (vom Nutzer zurückgestellt, 22.11.2026)

- [ ] 🟡 **7.10 Modus A „Unter Freunden“.** Alle verbinden Spotify (≤ 5). Fragen über die Personen: „Wessen Song ist das?“ (Lieferant aus `mb_quiz_pool`), z. B. „Wer ist bei Mia auf Platz 1?“, „Wer hat diesen Künstler in den Top-Künstlern?“. Offen (Entscheidung J): welche Fragetypen; darf man bei „Wessen Song?“ sich selbst wählen bzw. bekommt man für eigene Songs Punkte; Umgang mit Personen ohne freigeschaltetes Konto.

- [ ] 🟡 **7.11 (optional) Vorteil der Song-Lieferanten in B.** Wer Songs liefert, kennt sie besser. Ausgleichen (z. B. eigene Songs geben weniger Punkte oder kommen für einen selbst nicht vor) oder bewusst so lassen? → Entscheidung J.

- [ ] 🟡 **Mehrspieler-Modus für Music 1v1** (Wunsch des Nutzers, 22.11.2026, später). Vor dem Start mit dem Nutzer klären, was gemeint ist (z. B. mehr als zwei Spieler im Battle, Turnier mit mehreren Paarungen) – davon hängen Draft, Abstimmung, Wertung und Datenmodell (`player_slot` kennt heute nur 1 und 2) ab.

## Zuletzt erledigt

- [x] **7.12 Fragen schwieriger** – Code in PR #29, live seit 22.11.2026: Migration `20261122003745_mb_quiz_harder` (Fragetypen `intro`/`album`, RPC `mb_quiz_host_play`), Functions `mb-quiz-start` v4 und `mb-quiz-reveal` v2. Geprüft: Functions starten und antworten (Aufruf mit erfundener Raum-ID → „quiz not found“), neue RPC nur für angemeldete Nutzer. **Test mit einem echten Quiz (Spotify am Host, Intro hörbar) vom Nutzer auf später gestellt.** Details im Archiv unter 7.12.
- [x] **Battle-Endstand 375 px** (Bug aus 10.11.2026) – `overflow-x:clip` gilt für alle Endstände (PR #29).
- [x] **Aufräumen 22.11.2026** (Vorschläge des Nutzers angenommen): Migration `20261122004200_mb_cleanup_unused` (RPC `mb_set_spotify_ready` und Spalte `mb_rooms.game_state` entfernt – ungenutzt, alle Räume leer); Migration `20261122004202_mb_perf_indexes_policies` (9 Indizes auf Fremdschlüsseln, 9 RLS-Regeln mit `(select auth.uid())` statt `auth.uid()`, gleiche Bedingungen); Roadmap ins Archiv aufgeteilt; ungenutzte `themeProfile()` entfernt; Satz auf der 1v1-Startseite entfernt; GitHub Actions auf aktuelle Versionen (PR #30); 23 alte Branches gelöscht (alle gemergt bzw. in #29 enthalten).

## Bekannte offene Punkte (Technik)

- **Nur der Nutzer kann das (Supabase-Dashboard):** alte Edge Function `mb-ai-jury` löschen (wird seit 3.8 nicht mehr aufgerufen, der MCP kann keine Functions löschen) und das Secret `OPENROUTER_API_KEY` entfernen (seit Entscheidung D nicht mehr gebraucht).
- `mb_rooms.jury_mode` bleibt bewusst: `mb_create_room(p_jury_mode …)` und `mb_rematch` schreiben die Spalte noch (alle Räume `auto`). Entfernen hiesse, beide Funktionen und den Aufruf in `js/room.js` umzubauen – lohnt sich nicht.
- Herkunft des `TypeError: Cannot read properties of undefined (reading 'length')` aus dem Smoke-Test vom 06.10.2026 nie gefunden (vermutlich Spotify-SDK nach Init-Fehler). Nur angehen, wenn er wieder auftaucht.

## Offene Entscheidungen (Nutzer)

- **J – Offen für 7.10/7.11:** Welche Fragetypen in A „Unter Freunden“? Punkte für eigene Songs bzw. Ausgleich des Vorteils der Song-Lieferanten in B? – *vom Nutzer auf später gestellt (22.11.2026).*

## Entscheidungslog

*(ab 22.11.2026; alle früheren Einträge im Archiv)*

- **22.11.2026** – Startseite Music 1v1: Der Satz „Zwei Spieler, fünf Runden, eine Jury. Wählt euren Modus.“ entfällt (Wunsch des Nutzers; passte nicht mehr, seit das Quiz für alle sichtbar ist). 7.10/7.11 (Entscheidung J) und ein Mehrspieler-Modus für Music 1v1 kommen später. Roadmap aufgeteilt in `ROADMAP.md` (offen) und `ROADMAP-ARCHIV.md` (erledigt).
