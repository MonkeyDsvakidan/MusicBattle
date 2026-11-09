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
// fastestMs (7.7): schnellste Antwort, die Punkte gebracht hat (null, wenn keine).
// answers: Zeilen aus mb_quiz_answers (points erst nach dem Aufdecken gesetzt); nur Antworten des laufenden Quiz übergeben.
function quizStandings(members,answers){
  const rows=(members||[]).filter(m=>m.role==="quizzer").map(m=>({member_id:m.id,name:m.display_name,points:0,scored:0,answered:0,fastestMs:null}));
  const by=new Map(rows.map(r=>[r.member_id,r]));
  for(const a of answers||[]){const r=by.get(a.member_id);if(!r)continue;r.answered++;if(Number(a.points)>0){r.points+=Number(a.points);r.scored++;const ms=Number(a.answer_ms);if(Number.isFinite(ms)&&(r.fastestMs===null||ms<r.fastestMs))r.fastestMs=ms}}
  rows.sort((a,b)=>b.points-a.points||String(a.name).localeCompare(String(b.name),"de"));
  rows.forEach((r,i)=>{r.place=i&&r.points===rows[i-1].points?rows[i-1].place:i+1});
  return rows;
}

// ── Fragen-Bildschirm (7.6): reine Hilfsfunktionen ──
const QUIZ_KIND_LABEL={year:"Erscheinungsjahr",older:"Welcher Song ist älter?",cover:"Welches Album?",whose:"Wessen Song?"};

// Restzeit einer offenen Frage. Uhren der Handys gehen oft falsch: Liegt die eigene Uhr offensichtlich daneben
// (Frage „in der Zukunft“ oder über 60 s alt), zählt die Zeit ab dem Moment, in dem das Gerät die Frage gesehen hat.
// Die Frist selbst prüft immer der Server (mb_quiz_answer).
function quizRemainingMs(q,now,seenAt){
  if(!q?.started_at||!q?.deadline_at)return 0;
  const start=Date.parse(q.started_at),limit=Date.parse(q.deadline_at)-start;
  const sinceStart=now-start;
  const elapsed=sinceStart<-2000||sinceStart>60000?now-(seenAt??now):Math.max(0,sinceStart);
  return Math.max(0,limit-elapsed);
}

// Verpixeltes Cover: Kantenlänge in Pixeln, wird über die Zeit schärfer (6 → 64)
function coverPixelSize(remainingMs,limitMs=20000){
  const steps=[6,8,10,14,18,24,32,44,64],done=1-Math.max(0,Math.min(1,remainingMs/limitMs));
  return steps[Math.min(steps.length-1,Math.floor(done*steps.length))];
}

// Antwort und Lösung als kurzer Text (Liste nach dem Aufdecken)
function quizAnswerText(q,answer){
  if(!answer)return"keine Antwort";
  if(q?.kind==="year")return String(answer.year??"?");
  const o=q?.prompt?.options?.[Number(answer.choice)-1];
  if(q?.kind==="older")return o?.title||"?";
  if(q?.kind==="cover")return o?.album||"?";
  return"?";
}
function quizSolutionText(q,sol){
  if(!sol)return"";
  if(q?.kind==="year")return String(sol.year);
  if(q?.kind==="older"){const o=q.prompt?.options?.[sol.choice-1],y=sol.years?.[sol.choice-1];return`${o?.title||"?"} (${y}) ist älter als ${q.prompt?.options?.[2-sol.choice]?.title||"?"} (${sol.years?.[2-sol.choice]})`}
  if(q?.kind==="cover")return`${sol.album} – ${sol.artist}`;
  return"";
}

// Welcher Song läuft beim Aufdecken (Cover: die Lösung, Älter: der ältere Song, Jahr: läuft schon)
function quizRevealPlay(q,sol){
  if(q?.kind==="cover")return sol?.play||null;
  if(q?.kind==="older"){const o=q.prompt?.options?.[Number(sol?.choice)-1];return o?.track_id?{track_id:o.track_id,start_ms:30000}:null}
  return null;
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

// ── Fragen-Bildschirm (7.6): Daten, Aktionen, Zeitanzeige ──
// Fragen des laufenden Quiz (sichtbar ab „open“), Antworten (eigene sofort, fremde nach dem Aufdecken), Lösungen (nach dem Aufdecken)
async function loadQuizData(room){
  const [q,a,s]=await Promise.all([
    sb.from("mb_quiz_questions").select("*").eq("room_id",room.id).eq("game_no",room.quiz_game_no).order("question_no"),
    sb.from("mb_quiz_answers").select("*").eq("room_id",room.id),
    sb.from("mb_quiz_solutions").select("*").eq("room_id",room.id)
  ]);
  const ids=new Set((q.data||[]).map(x=>x.id));
  S.quizQuestions=q.data||[];
  S.quizAnswers=(a.data||[]).filter(x=>ids.has(x.question_id));
  S.quizSolutions=(s.data||[]).filter(x=>ids.has(x.question_id));
}
function quizCurrentQuestion(){return S.quizQuestions.find(q=>q.question_no===Number(S.room?.quiz_question_no))||null}
function quizSolution(q){return S.quizSolutions.find(s=>s.question_id===q?.id)?.solution||null}
function quizMyAnswer(q){const m=quizMembership();return S.quizAnswers.find(a=>a.question_id===q?.id&&a.member_id===m?.id)||null}
function quizSeenAt(q){S.quizSeen=S.quizSeen||{};if(q?.id&&!S.quizSeen[q.id])S.quizSeen[q.id]=Date.now();return S.quizSeen[q?.id]}
function quizLimitMs(q){return (Date.parse(q?.deadline_at)-Date.parse(q?.started_at))||20000}
function quizRemaining(q){return quizRemainingMs(q,Date.now(),quizSeenAt(q))}

// Musik nur auf dem Host-Gerät und nur mit dessen Spotify-Anmeldung (Premium); Fehler stoppen das Quiz nicht
function hostPlaysMusic(){return isHost()&&Boolean(S.spotify[1]?.refresh)}
async function playQuizTrack(play){
  if(!play?.track_id||!hostPlaysMusic())return;
  await playSubmission({player_slot:1,spotify_uri:`spotify:track:${play.track_id}`,start_ms:play.start_ms||0});
}

// Host: nächste Frage öffnen (20 s ab Serveruhr); nach der letzten Frage → Rangliste (Status finished)
async function openNextQuestion(){
  if(!isHost()||S.quizBusy)return;
  S.quizBusy=true;S.error="";render();
  // Player noch im Klick vorbereiten – Browser erlauben Ton nur nach einem Tippen
  if(hostPlaysMusic()&&!S.spotify[1].webFailed)ensurePlayer(1).catch(()=>{});
  try{
    const {data:no,error}=await sb.rpc("mb_quiz_open_next",{p_room_id:S.room.id});
    if(error){S.error=quizErrorText(error.message);return}
    await reloadRoomNow();
    const q=no>0?quizCurrentQuestion():null;
    if(q?.prompt?.play)playQuizTrack(q.prompt.play);else pause(1);
  }finally{S.quizBusy=false;render()}
}

async function answerQuiz(answer){
  const q=quizCurrentQuestion(),m=quizMembership();
  if(!q||!m||q.status!=="open"||quizMyAnswer(q)||S.quizAnswering)return;
  S.quizAnswering=true;S.error="";render();
  const {error}=await sb.rpc("mb_quiz_answer",{p_question_id:q.id,p_member_id:m.id,p_answer:answer});
  S.quizAnswering=false;
  if(error)S.error=quizErrorText(error.message);
  await reloadRoomNow();
}

// Host-Gerät deckt automatisch auf, sobald die Zeit um ist oder alle geantwortet haben (Server prüft beides)
async function revealQuestion(){
  const q=quizCurrentQuestion();
  if(!isHost()||!q||q.status!=="open"||S.quizRevealing)return;
  S.quizRevealing=true;
  try{
    const r=await sb.functions.invoke("mb-quiz-reveal",{body:{room_id:S.room.id}});
    if(r.error){let b={};try{b=await r.error.context.json()}catch{}if(b.error!=="still running")S.error=b.error||r.error.message}
    await reloadRoomNow();
    const now=quizCurrentQuestion();
    if(now?.status==="revealed"){const play=quizRevealPlay(now,quizSolution(now));if(play)playQuizTrack(play)}
  }finally{setTimeout(()=>{S.quizRevealing=false},2000)}
}

// Verpixeltes Cover auf eine Canvas zeichnen (Spotify-Bilder erlauben das); geht das nicht → unscharfes Bild
function drawQuizCover(q,size){
  const c=$("quizCover");if(!c||!q?.prompt?.cover_url)return;
  if(c.dataset.size===String(size)&&c.dataset.q===q.id)return;
  const draw=img=>{try{const tmp=document.createElement("canvas");tmp.width=size;tmp.height=size;tmp.getContext("2d").drawImage(img,0,0,size,size);const x=c.getContext("2d");x.imageSmoothingEnabled=false;x.clearRect(0,0,c.width,c.height);x.drawImage(tmp,0,0,c.width,c.height);c.getContext("2d").getImageData(0,0,1,1);c.dataset.size=String(size);c.dataset.q=q.id}catch{c.replaceWith(Object.assign(document.createElement("img"),{src:q.prompt.cover_url,className:"quizcover blurred",alt:""}))}};
  S.quizImg=S.quizImg||{};
  const cached=S.quizImg[q.prompt.cover_url];
  if(cached?.complete&&cached.naturalWidth)return draw(cached);
  if(!cached){const img=new Image();img.crossOrigin="anonymous";img.onload=()=>{const now=quizCurrentQuestion();if(now?.id===q.id)drawQuizCover(q,coverPixelSize(quizRemaining(q),quizLimitMs(q)))};img.src=q.prompt.cover_url;S.quizImg[q.prompt.cover_url]=img}
}

// Alle 250 ms: Restzeit und Balken (ohne Neuaufbau), Cover schärfer, Host deckt bei Ablauf/alle geantwortet auf
function quizTick(){
  if(S.room?.game!=="quiz"||S.room.status!=="quiz")return;
  const q=quizCurrentQuestion();if(!q||q.status!=="open")return;
  const rem=quizRemaining(q),limit=quizLimitMs(q);
  const t=$("quizTime"),bar=$("quizBar");
  if(t)t.textContent=`${Math.ceil(rem/1000)} s`;
  if(bar)bar.style.width=`${Math.max(0,rem/limit*100).toFixed(1)}%`;
  if(q.kind==="cover")drawQuizCover(q,coverPixelSize(rem,limit));
  if(!isHost())return;
  S.quizZeroAt=S.quizZeroAt||{};
  if(rem<=0&&!S.quizZeroAt[q.id])S.quizZeroAt[q.id]=Date.now();
  const players=S.members.filter(m=>m.role==="quizzer").length;
  if(Number(q.answer_count)>=players||(S.quizZeroAt[q.id]&&Date.now()-S.quizZeroAt[q.id]>1300))revealQuestion();
}
if(typeof window!=="undefined")setInterval(quizTick,250);   // nur im Browser (node --test lädt die Datei auch)

function quizErrorText(msg){const m=String(msg||"");if(/answer closed/i.test(m))return"Zu spät – die Zeit ist abgelaufen.";if(/already answered/i.test(m))return"Du hast schon geantwortet.";if(/question still open/i.test(m))return"Die Frage läuft noch.";if(/quiz full/i.test(m))return"Das Quiz ist voll (höchstens 20 Personen).";if(/quiz running/i.test(m))return"Das Quiz läuft schon – Songs kannst du erst vor dem nächsten Quiz ändern.";if(/not a room member/i.test(m))return"Du bist nicht (mehr) in diesem Quiz-Raum.";if(/too many tracks/i.test(m))return"Zu viele Songs auf einmal.";return m}

if(typeof module!=="undefined")module.exports={QUIZ_POOL_MAX,QUIZ_POOL_MIN,quizSongKey,quizCoverUrl,quizReleaseYear,buildQuizPool,quizPoolSummary,quizStandings,quizRemainingMs,coverPixelSize,quizAnswerText,quizSolutionText,quizRevealPlay};
