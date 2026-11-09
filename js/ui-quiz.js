/* ui-quiz.js – Bildschirme des Spotify-Quiz (Roadmap Phase 7): Start, Einladung, Lobby (7.5), Fragen (7.6), Endstand (7.7).
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

// Fragen-Bildschirm (7.6): bereit → Frage (20 s, antippen) → aufdecken (Lösung, Punkte, Zwischenstand) → nächste
function renderQuizRunning(){
  const q=quizCurrentQuestion(),total=Number(S.room.quiz_length)||S.quizQuestions.length||10,no=Number(S.room.quiz_question_no)||0;
  const head=`<div class="quizhead"><span class="chip">Frage ${Math.max(no,1)} / ${total}</span>${q?`<span class="eyebrow">${esc(QUIZ_KIND_LABEL[q.kind]||"")}</span>`:""}</div>`;
  const msg=`${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}`;
  const body=!q?quizReadyView():q.status==="open"?quizQuestionView(q):quizRevealView(q,no>=total);
  $("app").innerHTML=`<section class="card quizplay">${head}${msg}${body}${roomExitControls()}</section>`;
  bindRoomExitControls();
  if($("quizNext"))$("quizNext").onclick=openNextQuestion;
  document.querySelectorAll("[data-quiz-choice]").forEach(b=>b.onclick=()=>answerQuiz({choice:Number(b.dataset.quizChoice)}));
  bindQuizYear(q);
  quizTick();
}

function quizMusicHint(){
  if(!isHost())return"";
  return hostPlaysMusic()?"":`<p class="muted">Auf diesem Gerät ist Spotify nicht verbunden – die Musik bleibt stumm. Die Fragen funktionieren trotzdem.</p>`;
}

function quizReadyView(){
  return`<h2>Bereit?</h2><p class="muted">${S.members.filter(m=>m.role==="quizzer").length} Personen spielen mit. Pro Frage habt ihr 20 Sekunden – wer schneller richtig liegt, bekommt mehr Punkte.</p>${quizMusicHint()}${isHost()?`<div class="mainaction"><button class="btn primary" id="quizNext"${S.quizBusy?" disabled":""}>Erste Frage</button></div>`:`<p class="muted">Gleich geht's los – der Host startet die erste Frage.</p>`}`;
}

function quizTimer(){return`<div class="quiztimer" role="timer"><div class="quizbar"><span id="quizBar"></span></div><b id="quizTime"></b></div>`}
function quizSongLine(o){return`<div class="quizsong">${o?.cover_url?`<img src="${esc(o.cover_url)}" alt="" loading="lazy">`:""}<div><strong>${esc(o?.title||"")}</strong><small>${esc(o?.artist||"")}</small></div></div>`}

function quizQuestionView(q){
  const mine=quizMyAnswer(q),players=S.members.filter(m=>m.role==="quizzer").length,p=q.prompt||{};
  const waiting=`<div class="notice quizwait" role="status">Deine Antwort: <strong>${esc(quizAnswerText(q,mine?.answer))}</strong><br><small>${Number(q.answer_count)||0} von ${players} haben geantwortet</small></div>`;
  let ask="";
  if(q.kind==="year"){
    const y=S.quizYear?.[q.id]??2000,max=new Date().getFullYear();
    ask=`${quizSongLine(p)}<p class="quizask">Aus welchem Jahr ist dieser Song?</p>${mine?waiting:`<div class="yearpick"><button class="btn" data-year-step="-1" aria-label="Ein Jahr früher">−</button><output id="quizYearOut" class="yearout">${y}</output><button class="btn" data-year-step="1" aria-label="Ein Jahr später">+</button></div><input type="range" id="quizYear" min="1950" max="${max}" value="${y}" aria-label="Erscheinungsjahr"><div class="mainaction"><button class="btn primary" id="quizSendYear"${S.quizAnswering?" disabled":""}>Antwort senden</button></div>`}`;
  }else if(q.kind==="older"){
    ask=`<p class="quizask">Welcher Song ist älter?</p>${mine?waiting:`<div class="quizoptions two">${(p.options||[]).map((o,i)=>`<button class="quizoption" data-quiz-choice="${i+1}"${S.quizAnswering?" disabled":""}>${quizSongLine(o)}</button>`).join("")}</div>`}`;
  }else if(q.kind==="cover"){
    ask=`<div class="quizcoverwrap"><canvas id="quizCover" class="quizcover" width="256" height="256" role="img" aria-label="Verpixeltes Album-Cover"></canvas></div><p class="quizask">Zu welchem Album gehört das Cover?</p>${mine?waiting:`<div class="quizoptions">${(p.options||[]).map((o,i)=>`<button class="quizoption" data-quiz-choice="${i+1}"${S.quizAnswering?" disabled":""}><strong>${esc(o.album)}</strong><small>${esc(o.artist)}</small></button>`).join("")}</div>`}`;
  }
  return`${quizTimer()}${ask}${quizMusicHint()}`;
}

function bindQuizYear(q){
  const r=$("quizYear"),out=$("quizYearOut");if(!r||!q)return;
  const set=v=>{const y=Math.max(Number(r.min),Math.min(Number(r.max),v));r.value=y;out.textContent=y;S.quizYear={...(S.quizYear||{}),[q.id]:y}};
  r.oninput=()=>set(Number(r.value));
  document.querySelectorAll("[data-year-step]").forEach(b=>b.onclick=()=>set(Number(r.value)+Number(b.dataset.yearStep)));
  $("quizSendYear").onclick=()=>answerQuiz({year:Number(r.value)});
}

function quizRevealView(q,last){
  const sol=quizSolution(q),mine=quizMyAnswer(q),quizzers=S.members.filter(m=>m.role==="quizzer");
  const pts=n=>Number(n||0).toLocaleString("de-CH");
  const answers=quizzers.map(m=>{const a=S.quizAnswers.find(x=>x.question_id===q.id&&x.member_id===m.id);return{m,a}}).sort((x,y)=>(Number(y.a?.points)||0)-(Number(x.a?.points)||0));
  const scored=S.quizAnswers.filter(a=>a.points!==null&&a.points!==undefined);
  const table=quizStandings(S.members,scored).slice(0,5);
  const cover=q.kind==="cover"&&q.prompt?.cover_url?`<img class="quizcover" src="${esc(q.prompt.cover_url)}" alt="">`:"";
  const myLine=!mine?`<span class="chip">keine Antwort</span>`:Number(mine.points)>0?`<span class="chip gold">+${pts(mine.points)} Punkte</span>`:`<span class="chip">0 Punkte</span>`;
  return`<div class="quizsolution"${animAttr(`quizreveal:${q.id}`,900)}>${cover}<small>LÖSUNG</small><strong${q.kind==="year"?' class="num"':""}>${esc(quizSolutionText(q,sol)||"…")}</strong>${quizMyAnswer(q)||quizMembership()?myLine:""}</div>
    <div class="stack quizanswers">${answers.map(({m,a})=>`<div class="member"><div><strong>${esc(m.display_name)}</strong><small>${esc(quizAnswerText(q,a?.answer))}</small></div><span class="chip${Number(a?.points)>0?" ok":""}">${a?pts(a.points):"–"}</span></div>`).join("")}</div>
    <div class="quizstand"><div class="eyebrow">ZWISCHENSTAND</div><ol>${table.map(r=>`<li><span>${r.place}. ${esc(r.name)}</span><b>${pts(r.points)}</b></li>`).join("")}</ol></div>
    ${isHost()?`<div class="mainaction"><button class="btn primary" id="quizNext"${S.quizBusy?" disabled":""}>${last?"Zur Rangliste":"Nächste Frage"}</button></div>`:`<p class="muted">${last?"Gleich kommt die Rangliste.":"Der Host startet gleich die nächste Frage."}</p>`}`;
}

// Endstand (7.7): Sieger, Podest (Platz 1 in Gold), eigene Zahlen, ganze Rangliste, Host: „Nochmal“ mit neuen Fragen
function quizSeconds(ms){return`${(Number(ms)/1000).toFixed(1).replace(".",",")} s`}
function renderQuizFinished(){
  const scored=S.quizAnswers.filter(a=>a.points!==null&&a.points!==undefined);
  const table=quizStandings(S.members,scored),total=S.quizQuestions.length||Number(S.room.quiz_length)||10;
  const pts=n=>Number(n||0).toLocaleString("de-CH");
  const top=table.filter(r=>r.place===1),single=top.length===1;
  const title=!table.length?"Quiz beendet":single?`${esc(top[0].name)} gewinnt`:"Gleichstand an der Spitze";
  const fastest=table.filter(r=>r.fastestMs!==null).sort((x,y)=>x.fastestMs-y.fastestMs)[0];
  const me=table.find(r=>r.member_id===quizMembership()?.id);
  const podium=table.slice(0,3),order=podium.length===3?[podium[1],podium[0],podium[2]]:podium.length===2?[podium[1],podium[0]]:podium;
  const step=r=>`<div class="step place${Math.min(r.place,3)}"><b class="pl">${r.place}.</b><strong>${esc(r.name)}</strong><span>${pts(r.points)}</span></div>`;
  $("app").innerHTML=`<section class="card finalwrap quizfinal"${animAttr(`quizfinal:${S.room.id}:${S.room.quiz_game_no}`,2500)}>
    <div class="finalscore"><div class="eyebrow">QUIZ BEENDET · ${total} FRAGEN</div><h2>${title}</h2>${table.length?`<div class="big">${pts(top[0].points)}</div>`:""}${single&&table.length>1?`<div class="belt" role="status">★ Quiz-Champion</div>`:""}</div>
    ${table.length>1?`<div class="podium">${order.map(step).join("")}</div>`:""}
    <div class="statsgrid">${me?`<div class="statcard"><span>Dein Platz</span><b>${me.place} von ${table.length}</b></div><div class="statcard"><span>Deine Treffer</span><b>${me.scored} / ${total}</b></div>`:""}<div class="statcard"><span>Schnellste Antwort</span><b>${fastest?`${quizSeconds(fastest.fastestMs)}`:"–"}</b>${fastest?`<small>${esc(fastest.name)}</small>`:""}</div></div>
    <div class="quizstand"><div class="eyebrow">RANGLISTE</div><ol>${table.map(r=>`<li><span>${r.place}. ${esc(r.name)}<small>${r.scored} / ${total} Treffer${r.fastestMs!==null?` · schnellste ${quizSeconds(r.fastestMs)}`:""}</small></span><b>${pts(r.points)}</b></li>`).join("")}</ol></div>
    ${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}
    ${isHost()?`<div class="actions rematch"><button class="btn primary" id="quizAgain"${S.quizStarting?" disabled":""}>${S.quizStarting?"Neue Fragen werden erstellt …":"Nochmal"}</button></div><p class="muted center">Gleiche Runde, neue Fragen – schon gespielte Songs kommen möglichst nicht nochmals.</p>`:`<p class="muted center">Der Host kann nochmal starten – mit neuen Fragen.</p>`}
    ${roomExitControls()}</section>`;
  bindRoomExitControls();
  if($("quizAgain"))$("quizAgain").onclick=startQuiz;
}
