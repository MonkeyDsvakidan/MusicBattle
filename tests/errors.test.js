const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {errorText,BACKEND_ERRORS,BACKEND_PREFIXES}=require("../js/errors.js");

// Alle Fehlertexte, die unsere Datenbank-Funktionen werfen (raise exception '…')
function backendMessages(){
  const dir=path.join(__dirname,"..","supabase","migrations");
  const out=new Set();
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith(".sql"))){
    for(const m of fs.readFileSync(path.join(dir,f),"utf8").matchAll(/raise exception '([^']*)'/gi))out.add(m[1]);
  }
  return [...out];
}

test("jede raise-exception-Meldung aus den Migrationen hat eine deutsche Übersetzung",()=>{
  const missing=backendMessages().filter(msg=>{
    const m=msg.toLowerCase();
    if(Object.prototype.hasOwnProperty.call(BACKEND_ERRORS,m))return false;
    return !BACKEND_PREFIXES.some(([p])=>m.startsWith(p)&&m.includes("%"));
  });
  assert.deepEqual(missing,[],"In js/errors.js (BACKEND_ERRORS) ergänzen: "+missing.join(", "));
});

test("Backend-Meldungen werden übersetzt",()=>{
  assert.equal(errorText("draft skip unavailable"),"Dein Skip ist schon verbraucht oder gerade nicht möglich.");
  assert.equal(errorText("authentication required"),"Die Anmeldung fehlt. Lade die Seite neu.");
  assert.equal(errorText("missing vote: theme"),"Bitte in allen fünf Kategorien abstimmen.");
});

test("eigene deutsche Texte bleiben unverändert – auch mit englischen Wörtern darin",()=>{
  const msg="Im 2-Geräte-Modus benötigt Spieler 2 ein eigenes Spotify-Konto. Wähle auf Spotify «Not you?» / «Nicht du?» und melde das zweite Konto an.";
  assert.equal(errorText(msg),msg);
  assert.equal(errorText("Raumcode und Name fehlen."),"Raumcode und Name fehlen.");
});

test("Spotify-Fehler: passender Rat und Spotifys Details bleiben sichtbar",()=>{
  const t=errorText("Spotify Playback 403: Player command failed: Premium required");
  assert.match(t,/Premium/);
  assert.match(t,/Spotify 403: Player command failed: Premium required/);
  assert.match(errorText("Spotify 401: The access token expired"),/neu/);
  assert.match(errorText("Spotify Playback 404: Device not found"),/Spotify 404: Device not found/);
  assert.doesNotMatch(errorText("Spotify Playback 403: x"),/in diesem Raum/);
});

test("Verbindungsfehler: erst neu laden und prüfen, nicht blind wiederholen",()=>{
  assert.match(errorText("TypeError: Failed to fetch"),/Vielleicht wurde trotzdem gespeichert/);
});

test("unbekannte Postgres-Fehler: allgemeiner Satz mit Details",()=>{
  assert.match(errorText('duplicate key value violates unique constraint "x"'),/^Etwas ist schiefgelaufen.*Details: duplicate key/);
});
