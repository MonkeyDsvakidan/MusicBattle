/* quiz.js – Spotify-Quiz (Roadmap Phase 7): Song-Pool der Verbundenen sammeln und hochladen (7.2).
   Reine Funktionen (buildQuizPool, quizPoolSummary) sind für node --test zusätzlich exportiert.
   Klassisches Skript, globale Namen. */

const QUIZ_POOL_MAX=300;      // Obergrenze von mb_quiz_set_pool
const QUIZ_POOL_MIN=30;       // darunter Hinweis in der Lobby (zu wenig Songs für abwechslungsreiche Fragen)
const QUIZ_SOURCES=["top_short","top_medium","top_long","saved"];   // Reihenfolge = Vorrang bei Doppelten

const SPOTIFY_ID_RE=/^[A-Za-z0-9]{10,40}$/;
const SPOTIFY_COVER_RE=/^https:\/\/i\.scdn\.co\/image\/[A-Za-z0-9]+$/;

// Gleicher Song in anderer Fassung (Remaster, feat., Live …) zählt als Doppelter
function quizSongKey(track){
  const title=String(track?.name||"").toLowerCase()
    .replace(/\s*[\(\[][^\)\]]*(feat|ft\.|with|remaster|live|version|edit|mix)[^\)\]]*[\)\]]/g,"")
    .replace(/\s+-\s+.*(remaster|live|version|edit|mix|mono|stereo).*$/,"")
    .replace(/[^\p{L}\p{N}]+/gu," ").trim();
  const artist=String(track?.artists?.[0]?.name||"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
  return `${artist}|${title}`;
}

// Cover in mittlerer Grösse (Spotify liefert grösste zuerst: 640, 300, 64)
function quizCoverUrl(images){
  const list=(images||[]).filter(i=>SPOTIFY_COVER_RE.test(String(i?.url||"")));
  const mid=list.find(i=>Number(i.width)>=250&&Number(i.width)<=400);
  return (mid||list[0])?.url||null;
}

function quizReleaseYear(date){
  const y=Number(String(date||"").slice(0,4));
  return y>=1900&&y<=2100?y:null;
}

// Spotify-Songs je Quelle → Zeilen für mb_quiz_set_pool. Entfernt Podcasts, lokale Dateien, Hörbuch-Kapitel und
// Hörbuch-Autoren (chapterArtistIds aus artist-filter.js), Doppelte (gleiche ID oder gleicher Song in anderer Fassung).
// sets: [{source:"top_short", tracks:[spotifyTrack,…]}, …]; opts.isSpoken(track) optional (Hörbuch-Namen aus spotify.js)
function buildQuizPool(sets,opts={}){
  const isSpoken=opts.isSpoken||(()=>false);
  const max=opts.max||QUIZ_POOL_MAX;
  const ordered=[...(sets||[])].filter(s=>QUIZ_SOURCES.includes(s?.source)).sort((a,b)=>QUIZ_SOURCES.indexOf(a.source)-QUIZ_SOURCES.indexOf(b.source));
  const all=ordered.flatMap(s=>(s.tracks||[]).filter(Boolean));
  const authors=chapterArtistIds(all);
  const out=[],seenIds=new Set(),seenSongs=new Set();
  for(const set of ordered){
    (set.tracks||[]).forEach((t,i)=>{
      if(out.length>=max||!t||t.type&&t.type!=="track"||t.is_local)return;
      if(!SPOTIFY_ID_RE.test(String(t.id||""))||!t.name||!t.artists?.length)return;
      if(looksLikeChapterTitle(t.name)||isSpoken(t)||authors.has(t.artists[0]?.id))return;
      const key=quizSongKey(t);
      if(seenIds.has(t.id)||seenSongs.has(key))return;
      seenIds.add(t.id);seenSongs.add(key);
      const album=t.album||{};
      out.push({
        spotify_track_id:t.id,
        title:String(t.name).slice(0,300),
        artist:t.artists.map(a=>a?.name).filter(Boolean).join(", ").slice(0,300)||"?",
        album:String(album.name||"").slice(0,300),
        spotify_album_id:SPOTIFY_ID_RE.test(String(album.id||""))?album.id:null,
        album_type:["album","single","compilation"].includes(album.album_type)?album.album_type:null,
        release_date:/^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(album.release_date||""))?album.release_date:null,
        release_year:quizReleaseYear(album.release_date),
        cover_url:quizCoverUrl(album.images),
        duration_ms:Number.isFinite(t.duration_ms)?t.duration_ms:null,
        source:set.source,
        rank:Math.min(1000,i+1)
      });
    });
  }
  return out;
}

// Lobby: „x Songs von y Personen“ und ob es für ein Quiz reicht
function quizPoolSummary(members){
  const quizzers=(members||[]).filter(m=>m.role==="quizzer");
  const suppliers=quizzers.filter(m=>Number(m.quiz_track_count)>0);
  const tracks=suppliers.reduce((n,m)=>n+Number(m.quiz_track_count),0);
  return {tracks,people:suppliers.length,players:quizzers.length,enough:tracks>=QUIZ_POOL_MIN};
}

// Rangliste (7.4): Punkte je Mitspieler aus den aufgedeckten Antworten; gleiche Punkte = gleicher Platz.
// answers: Zeilen aus mb_quiz_answers (points erst nach dem Aufdecken gesetzt); nur Antworten des laufenden Quiz übergeben.
function quizStandings(members,answers){
  const rows=(members||[]).filter(m=>m.role==="quizzer").map(m=>({member_id:m.id,name:m.display_name,points:0,scored:0,answered:0}));
  const by=new Map(rows.map(r=>[r.member_id,r]));
  for(const a of answers||[]){const r=by.get(a.member_id);if(!r)continue;r.answered++;if(Number(a.points)>0){r.points+=Number(a.points);r.scored++}}
  rows.sort((a,b)=>b.points-a.points||String(a.name).localeCompare(String(b.name),"de"));
  rows.forEach((r,i)=>{r.place=i&&r.points===rows[i-1].points?rows[i-1].place:i+1});
  return rows;
}

function quizMembership(){return (typeof S!=="undefined"&&S.members||[]).find(m=>m.user_id===S.user?.id&&m.role==="quizzer")||null}

// Eigene Spotify-Songs laden: Top-Songs (4 Wochen, 6 Monate, 1 Jahr) und bis zu 200 gespeicherte Songs.
// Einzelne fehlgeschlagene Abfragen liefern nur weniger Songs, brechen aber nicht ab.
async function fetchQuizTracks(slotNo){
  const ranges=[["short_term","top_short"],["medium_term","top_medium"],["long_term","top_long"]];
  const sets=await Promise.all(ranges.map(([range,source])=>sp(slotNo,`/me/top/tracks?limit=50&time_range=${range}`).then(d=>({source,tracks:d.items||[]})).catch(()=>({source,tracks:[]}))));
  const saved=[];
  for(let off=0;off<200;off+=50){
    try{const d=await sp(slotNo,`/me/tracks?limit=50&offset=${off}`);saved.push(...(d.items||[]).map(it=>it?.track));if(!d.next)break}catch{break}
  }
  sets.push({source:"saved",tracks:saved});
  return sets;
}

// Song-Pool der eigenen Mitgliedschaft im Quiz-Raum setzen (ersetzt einen früheren). Gibt die Anzahl Songs zurück.
async function uploadQuizPool(slotNo){
  const member=quizMembership();
  if(!S.room?.id||S.room.game!=="quiz"||!member)throw Error("Kein Quiz-Raum geladen.");
  const tracks=buildQuizPool(await fetchQuizTracks(slotNo),{isSpoken:looksLikeSpokenTrack});
  if(!tracks.length)throw Error("Auf diesem Spotify-Konto wurden keine Songs gefunden.");
  const {data,error}=await sb.rpc("mb_quiz_set_pool",{p_room_id:S.room.id,p_member_id:member.id,p_tracks:tracks});
  if(error)throw Error(quizErrorText(error.message));
  return Number(data)||0;
}

// Quiz noch im Aufbau (bis 7.7): Auf der Startseite nur sichtbar, wenn die Seite einmal mit ?quiz=1 geöffnet wurde
// (bleibt auf dem Gerät gespeichert, ?quiz=0 blendet wieder aus). Einladungslinks zu einem Quiz funktionieren immer.
function quizEnabled(){
  try{const q=new URLSearchParams(location.search).get("quiz");if(q==="1")localStorage.setItem("mb_quiz_beta","1");if(q==="0")localStorage.removeItem("mb_quiz_beta");return localStorage.getItem("mb_quiz_beta")==="1"}catch{return false}
}

async function createQuizRoom(){
  S.error="";
  const name=$("createName")?.value.trim()||"";
  if(!name){S.error="Name ist erforderlich.";render();return}
  rememberName(name);
  const {data,error}=await sb.rpc("mb_create_quiz_room",{p_display_name:name,p_kind:"music",p_length:10});
  if(error){S.error=quizErrorText(error.message);render();return}
  const row=data[0];
  saveRoom({room_id:row.room_id,code:row.room_code});
  await loadRoom(row.room_id);subscribeRoom();render();
  await autoQuizSpotify();
}

// Spotify im Quiz (7.5): jede Person hat auf ihrem Gerät genau eine Anmeldung → Speicherplatz 1 des Geräts.
// Ist das Gerät schon angemeldet (gespeicherte Anmeldung 5.6), steuert es seine Songs automatisch bei.
async function autoQuizSpotify(){
  const m=quizMembership(),saved=savedSpotify();
  if(!m||Number(m.quiz_track_count)>0||S.quizSyncing||!["lobby","finished"].includes(S.room?.status))return;
  const s=S.spotify[1];
  if(!s.refresh&&saved){s.refresh=saved.refresh;s.access="";s.expires=0;localStorage.setItem(spotifyKey(1,"refresh"),saved.refresh)}
  if(s.refresh)await syncQuizSpotify();
}
// Knopf „Spotify verbinden“: mit vorhandener Anmeldung Songs (neu) laden, sonst zum Spotify-Login
async function connectQuizSpotify(){
  const saved=savedSpotify(),s=S.spotify[1];
  if(!s.refresh&&saved){s.refresh=saved.refresh;s.access="";s.expires=0;localStorage.setItem(spotifyKey(1,"refresh"),saved.refresh)}
  if(s.refresh){await syncQuizSpotify();if(S.spotify[1]?.refresh)return}
  await connectSpotify(1);
}
// Songs laden und hochladen; abgelaufene Anmeldung → vergessen und neu verbinden lassen
async function syncQuizSpotify(){
  if(S.quizSyncing)return;
  S.quizSyncing=true;S.error="";render();
  try{
    if(!(await token(1))){clearSpotifySlot(1);forgetSavedSpotify();S.notice="Die gespeicherte Spotify-Anmeldung ist abgelaufen. Bitte Spotify neu verbinden.";return}
    const n=await uploadQuizPool(1);
    S.notice=`${n} Songs von deinem Spotify sind im Quiz.`;
    rememberDeviceSpotify();
  }catch(e){S.error=e.message}
  finally{S.quizSyncing=false;await reloadRoomNow()}
}

function setQuizLength(n){
  if(!isHost()||![10,15,20].includes(n)||S.room?.status==="quiz")return;
  S.room.quiz_length=n;render();
  sb.from("mb_rooms").update({quiz_length:n,updated_at:new Date().toISOString()}).eq("id",S.room.id).then(({error})=>{if(error)S.error=quizErrorText(error.message);reloadRoomNow()});
}

// Host startet: der Server erzeugt die Fragen (mb-quiz-start), alle wechseln per Realtime in den Status „quiz“
async function startQuiz(){
  if(!isHost()||S.quizStarting)return;
  S.quizStarting=true;S.error="";render();
  try{
    const r=await sb.functions.invoke("mb-quiz-start",{body:{room_id:S.room.id}});
    if(r.error){let b={};try{b=await r.error.context.json()}catch{}S.error=quizStartErrorText(b,r.error.message)}
  }finally{S.quizStarting=false;await reloadRoomNow()}
}
function quizStartErrorText(b,fallback){
  if(b?.error==="pool too small")return`Zu wenig Songs: Aus ${b.songs} Songs entstehen nur ${b.questions} von ${b.needed} Fragen. Wählt weniger Fragen oder verbindet mehr Spotify-Konten.`;
  if(b?.error==="only host")return"Nur der Host kann das Quiz starten.";
  if(b?.error==="already started")return"";
  return b?.error||fallback||"Das Quiz konnte nicht gestartet werden.";
}

function quizErrorText(msg){const m=String(msg||"");if(/quiz full/i.test(m))return"Das Quiz ist voll (höchstens 20 Personen).";if(/quiz running/i.test(m))return"Das Quiz läuft schon – Songs kannst du erst vor dem nächsten Quiz ändern.";if(/not a room member/i.test(m))return"Du bist nicht (mehr) in diesem Quiz-Raum.";if(/too many tracks/i.test(m))return"Zu viele Songs auf einmal.";return m}

if(typeof module!=="undefined")module.exports={QUIZ_POOL_MAX,QUIZ_POOL_MIN,quizSongKey,quizCoverUrl,quizReleaseYear,buildQuizPool,quizPoolSummary,quizStandings};
