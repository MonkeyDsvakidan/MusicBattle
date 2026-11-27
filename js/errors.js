// Q.1 (überarbeitet nach Review PR #7): Fehlermeldungen verständlich machen.
// Regeln – nach Herkunft entscheiden, nie nach einzelnen Wörtern raten:
// 1. Verbindungsfehler → Ausgang unklar (kann schon gespeichert sein): erst neu laden und Stand prüfen.
// 2. Eigene Spotify-Fehler («Spotify 403: …», «Spotify Playback 404: …») → passender Rat je Status, Spotifys Details bleiben sichtbar.
// 3. Meldungen unserer Datenbank-Funktionen (raise exception in supabase/migrations) → feste Übersetzungstabelle.
// 4. Bekannte technische Meldungen von Supabase/Postgres → feste Übersetzung bzw. allgemeiner Satz mit Details.
// 5. Alles andere (v. a. eigene deutsche Texte der App) → unverändert.
// Neue raise-exception-Texte in einer Migration hier in BACKEND_ERRORS ergänzen (Test: tests/errors.test.js).

const ERR_UNCLEAR="Die Verbindung ist abgebrochen. Vielleicht wurde trotzdem gespeichert. Lade die Seite neu und prüfe den Stand, bevor du es nochmals versuchst.";

const BACKEND_ERRORS={
  "already answered":"Du hast diese Frage schon beantwortet.",
  "already started":"Das Spiel hat schon begonnen.",
  "answer closed":"Die Zeit für diese Frage ist abgelaufen.",
  "artist required":"Bitte zuerst einen Künstler wählen.",
  "authentication required":"Die Anmeldung fehlt. Lade die Seite neu.",
  "draft skip unavailable":"Dein Skip ist schon verbraucht oder gerade nicht möglich.",
  "sitting out":"Diese Frage ist zu einem deiner Songs – du schaust diesmal zu.",
  "shared skip unavailable":"Gemeinsamer Skip ist gerade nicht möglich. Lade die Seite neu.",
  "shared skip pending":"Es ist schon ein Skip-Vorschlag offen.",
  "no shared skip pending":"Der Skip-Vorschlag ist schon erledigt.",
  "five rounds required":"Es braucht zuerst fünf Runden mit Künstlern.",
  "host only or invalid state":"Das kann nur der Host machen – oder der Schritt passt gerade nicht. Lade die Seite neu.",
  "host only":"Das kann nur der Host (Spieler 1) machen.",
  "only host":"Das kann nur der Host (Spieler 1) machen.",
  "invalid answer":"Diese Antwort ist ungültig.",
  "invalid device mode":"Ungültiger Spielmodus.",
  "invalid display name":"Bitte einen Namen eingeben (höchstens 30 Zeichen).",
  "invalid jury mode":"Ungültige Jury-Einstellung.",
  "invalid player slot":"Ungültiger Spielerplatz.",
  "invalid slot":"Ungültiger Spielerplatz.",
  "invalid points":"Ungültige Punktzahl.",
  "invalid question count":"Die Quiz-Fragen sind ungültig. Starte das Quiz neu.",
  "invalid questions":"Die Quiz-Fragen sind ungültig. Starte das Quiz neu.",
  "invalid quiz kind":"Ungültige Quiz-Art.",
  "invalid quiz length":"Ungültige Quiz-Länge.",
  "invalid role":"Ungültige Rolle.",
  "invalid tracks":"Die Song-Liste ist ungültig.",
  "too many tracks":"Die Song-Liste ist zu lang.",
  "too many artists":"Die Künstler-Liste ist zu lang.",
  "invalid artists":"Die Künstler-Liste ist ungültig.",
  "invalid votes":"Die Stimmen sind ungültig. Lade die Seite neu und stimme nochmals ab.",
  "invalid winner":"Ungültiger Sieger.",
  "local player 2 is only available in one-device lobby":"Spieler 2 auf diesem Gerät gibt es nur im Modus «1 Gerät» und nur in der Lobby.",
  "match not finished":"Das Match ist noch nicht fertig.",
  "not a room member":"Du bist nicht (mehr) in diesem Raum. Tritt mit dem Code neu bei.",
  "only host can add local player 2 in lobby":"Nur der Host kann in der Lobby Spieler 2 hinzufügen.",
  "only jurors vote":"Mit Juroren im Raum stimmen nur die Juroren ab.",
  "only players vote":"Hier stimmen nur die Spieler ab.",
  "player 2 already exists":"Spieler 2 gibt es schon.",
  "player membership not found":"Dieser Spielerplatz gehört nicht zu diesem Gerät. Lade die Seite neu.",
  "player slot not owned by user":"Dieser Spielerplatz gehört nicht zu diesem Gerät. Lade die Seite neu.",
  "player slots full":"Beide Spielerplätze sind schon besetzt. Du kannst als Juror beitreten.",
  "players missing":"Es fehlen noch Spieler.",
  "question not found":"Diese Frage gibt es nicht (mehr). Lade die Seite neu.",
  "question not open":"Diese Frage ist gerade nicht offen.",
  "question still open":"Die Frage läuft noch.",
  "quiz full":"Das Quiz ist voll (höchstens 20 Personen).",
  "quiz not found":"Dieses Quiz gibt es nicht (mehr).",
  "quiz not running":"Das Quiz läuft gerade nicht.",
  "quiz running":"Das Quiz läuft schon.",
  "room has incomplete round setup":"Die Runden sind noch nicht vollständig vorbereitet. Lade die Seite neu.",
  "room not found":"Diesen Raum gibt es nicht (mehr). Frag nach einem neuen Link oder Code.",
  "round not found":"Diese Runde gibt es nicht (mehr). Lade die Seite neu.",
  "song selection is locked":"Die Songwahl ist schon abgeschlossen.",
  "songs not revealed":"Die Songs sind noch nicht aufgedeckt.",
  "sudden death not available":"Sudden Death ist gerade nicht möglich.",
  "this room is a battle":"Das ist ein Battle-Raum, kein Quiz.",
  "this room is a quiz":"Das ist ein Quiz-Raum – öffne den Einladungslink oder tritt über «Quiz» bei.",
  "this room uses one-device pass & play":"Dieses Match läuft auf einem Gerät – du kannst nur als Juror beitreten.",
  "two sudden death artists required":"Für Sudden Death braucht es zwei Künstler.",
  "voting closed":"Die Abstimmung ist schon geschlossen.",
};
// raise exception mit Platzhalter (z. B. «invalid vote: theme»)
const BACKEND_PREFIXES=[
  ["invalid vote:","Diese Stimme ist ungültig. Lade die Seite neu und stimme nochmals ab."],
  ["missing vote:","Bitte in allen fünf Kategorien abstimmen."],
];

const SPOTIFY_ADVICE={
  401:"Die Spotify-Anmeldung ist abgelaufen. Verbinde Spotify neu.",
  403:"Spotify hat das abgelehnt. Zum Abspielen braucht es Spotify Premium – prüfe auch, ob das richtige Konto verbunden ist.",
  404:"Spotify findet kein aktives Gerät. Öffne kurz die Spotify-App und versuche es dann nochmals.",
  429:"Spotify bremst gerade (zu viele Anfragen). Warte kurz und versuche es dann nochmals.",
};

function errorText(msg){
  const raw=String(msg||"").trim(),m=raw.toLowerCase();
  if(!raw)return"";
  if(/failed to fetch|networkerror|load failed|network request failed|fetch failed/.test(m))return ERR_UNCLEAR;
  const sp=raw.match(/^Spotify(?: Playback)? (\d{3})(?::\s*([\s\S]*))?$/);
  if(sp){const status=Number(sp[1]),detail=(sp[2]||"").trim();
    const advice=SPOTIFY_ADVICE[status]||(status>=500?"Spotify hat gerade Probleme. Versuche es in ein paar Minuten nochmals.":"Spotify meldet einen Fehler.");
    return`${advice} (Spotify ${status}${detail?`: ${detail}`:""})`}
  if(Object.prototype.hasOwnProperty.call(BACKEND_ERRORS,m))return BACKEND_ERRORS[m];
  for(const [prefix,text] of BACKEND_PREFIXES)if(m.startsWith(prefix))return text;
  if(/jwt expired|invalid jwt|refresh token/.test(m))return"Die Anmeldung ist abgelaufen. Lade die Seite neu.";
  if(/row-level security|permission denied/.test(m))return"Das darfst du in diesem Raum nicht. Lade die Seite neu.";
  if(/too many requests/.test(m))return"Zu viele Anfragen auf einmal. Warte kurz und versuche es dann nochmals.";
  if(/violates|duplicate key|does not exist|edge function returned/.test(m))return`Etwas ist schiefgelaufen. Lade die Seite neu und prüfe den Stand. (Details: ${raw})`;
  return raw;
}

if(typeof module!=="undefined")module.exports={errorText,BACKEND_ERRORS,BACKEND_PREFIXES};
