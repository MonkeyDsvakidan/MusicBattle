/* ui-quiz.js – Bildschirme des Spotify-Quiz (Roadmap Phase 7): Start, Einladung, Lobby (7.5); Frage (7.6) und Rangliste (7.7) folgen.
   Klassisches Skript, globale Namen. */

// Startseite → „Quiz“: Quiz erstellen oder mit Code mitspielen
function renderQuizLanding(err){
  $("app").innerHTML=`<section class="card"><div class="sectionhead"><div><div class="eyebrow">MUSIK-QUIZ · BETA</div><h2>Wer kennt seine Musik?</h2></div><button class="btn ghost" id="changeMode">Modus ändern</button></div>${err}<p class="muted">Fragen aus den Spotify-Songs der Mitspieler: Erscheinungsjahr, welcher Song ist älter, welches Album gehört zum Cover. Wer schneller richtig liegt, bekommt mehr Punkte.</p><div class="joincolumns"><div class="joinrole playerrole"><div><div class="eyebrow">HOST</div><h3>Quiz erstellen</h3><p class="muted">Du lädst die anderen per QR-Code ein. Auf deinem Gerät läuft die Musik.</p></div><div><input id="createName" placeholder="Dein Name" value="${esc(lastName())}" autocomplete="nickname"><button class="btn primary" id="createQuizBtn">Quiz erstellen</button></div></div><div class="joinrole player2role"><div><div class="eyebrow">MITSPIELEN</div><h3>Mit Code beitreten</h3><p class="muted">Am einfachsten scannst du den QR-Code des Hosts.</p></div><div><input id="joinCode" maxlength="6" placeholder="Raumcode"><input id="joinName" placeholder="Dein Name" value="${esc(lastName())}"><button class="btn" id="joinQuizBtn">Mitspielen</button></div></div></div></section>`;
  $("changeMode").onclick=resetDeviceModeChoice;
  $("createQuizBtn").onclick=createQuizRoom;
  $("joinQuizBtn").onclick=()=>joinRoom("quizzer");
}

// Einladungsseite nach dem Scannen (?join=CODE&m=quiz)
function renderQuizInvite(j){
  $("app").innerHTML=`<section class="card invitecard"><div class="eyebrow">EINLADUNG · MUSIK-QUIZ</div><h2>Quiz <span class="roomcode">${esc(j.code)}</span></h2><p class="muted">Spiel mit – auf deinem eigenen Handy. Spotify ist freiwillig: Wer es verbindet, steuert Songs bei.</p>${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}<input type="hidden" id="joinCode" value="${esc(j.code)}"><label for="joinName">Dein Name</label><input id="joinName" value="${esc(lastName())}" placeholder="Dein Name" autocomplete="nickname" maxlength="30"><div class="mainaction invitebtns"><button class="btn primary" id="inviteQuiz">Mitspielen</button></div><div class="actions centered"><button class="btn ghost" id="inviteCancel">Nicht beitreten</button></div></section>`;
  $("inviteQuiz").onclick=()=>joinRoom("quizzer");
  $("inviteCancel").onclick=()=>{S.pendingJoin=null;S.error="";render()};
}

function renderQuiz(){
  if(S.room.status==="quiz")renderQuizRunning();
  else if(S.room.status==="finished")renderQuizFinished();
  else renderQuizLobby();
}

// Lobby (7.5): Einladung, Mitspieler mit gelieferten Songs, Spotify (freiwillig), Länge, eine Hauptaktion
function renderQuizLobby(){
  const me=quizMembership(),sum=quizPoolSummary(S.members),len=Number(S.room.quiz_length)||10;
  const quizzers=S.members.filter(m=>m.role==="quizzer");
  const mineHasSongs=Number(me?.quiz_track_count)>0;
  const row=m=>{
    const mine=m.id===me?.id,n=Number(m.quiz_track_count)||0,host=m.user_id===S.room.host_user_id;
    const status=mine&&S.quizSyncing?`<span class="chip">Songs werden geladen …</span>`
      :n?`<span class="chip ok">♫ ${n} Songs</span>`
      :mine?`<button class="btn ${sum.enough?"":"primary"}" id="quizSpotify">Spotify verbinden</button>`
      :`<span class="chip">ohne Spotify</span>`;
    return`<div class="member"><div><strong>${esc(m.display_name)}${mine?" (du)":""}</strong><small>${host?"Host":"Mitspieler"}</small></div>${status}</div>`;
  };
  const poolLine=sum.tracks?`${sum.tracks} Songs von ${sum.people} ${sum.people===1?"Person":"Personen"}`:"Noch keine Songs";
  const hint=sum.enough?"":`<p class="muted">Für ein Quiz braucht es mindestens ${QUIZ_POOL_MIN} Songs – mindestens eine Person muss Spotify verbinden.</p>`;
  const lengthPick=`<div class="lengthpick" role="group" aria-label="Anzahl Fragen">${[10,15,20].map(n=>`<button class="btn${n===len?" on":""}" data-quiz-length="${n}" aria-pressed="${n===len}">${n} Fragen</button>`).join("")}</div>`;
  $("app").innerHTML=`<section class="card lobby quizlobby"><div class="eyebrow">QUIZ · MUSIKWISSEN</div><h2 class="roomcode">${esc(S.room.code)}</h2>${inviteBlock(false)}${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}${S.notice?`<div class="notice">${esc(S.notice)}</div>`:""}
    <div class="sectionhead" style="margin-top:14px"><h3>Mitspieler · ${quizzers.length}</h3><span class="chip">${esc(poolLine)}</span></div>
    <div class="stack">${quizzers.map(row).join("")}</div>
    ${mineHasSongs&&!S.quizSyncing?`<div class="actions"><button class="btn ghost" id="quizSpotify">Meine Songs neu laden</button></div>`:""}
    ${hint}
    ${isHost()?`<div class="quizsettings"><label>Länge</label>${lengthPick}</div><div class="mainaction"><button class="btn primary" id="startQuizBtn"${!sum.enough||S.quizStarting?" disabled":""}>${S.quizStarting?"Fragen werden erstellt …":"Quiz starten"}</button></div>`:`<p class="muted">${len} Fragen · Der Host startet das Quiz, sobald alle da sind.</p>`}
    ${roomExitControls()}</section>`;
  bindInvite();bindRoomExitControls();
  if($("quizSpotify"))$("quizSpotify").onclick=connectQuizSpotify;
  document.querySelectorAll("[data-quiz-length]").forEach(b=>b.onclick=()=>setQuizLength(Number(b.dataset.quizLength)));
  if($("startQuizBtn"))$("startQuizBtn").onclick=startQuiz;
}

// Platzhalter bis 7.6/7.7 (Quiz ist bis dahin nur mit ?quiz=1 erreichbar)
function renderQuizRunning(){
  $("app").innerHTML=`<section class="card"><div class="eyebrow">QUIZ LÄUFT</div><h2>${Number(S.room.quiz_length)||10} Fragen sind bereit</h2><p class="muted">Der Fragen-Bildschirm folgt im nächsten Schritt (Roadmap 7.6).</p>${roomExitControls()}</section>`;
  bindRoomExitControls();
}
function renderQuizFinished(){
  $("app").innerHTML=`<section class="card"><div class="eyebrow">QUIZ BEENDET</div><h2>Rangliste</h2><p class="muted">Die Rangliste folgt in Roadmap 7.7.</p>${roomExitControls()}</section>`;
  bindRoomExitControls();
}
