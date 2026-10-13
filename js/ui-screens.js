/* ui-screens.js – Bildschirme: Start, Lobby, Draft, Battle, Jury, Tiebreak, Endstand
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

function renderLanding(){
  bindBrandHome();
  $("roomBadge").innerHTML="";
  const mode=window.MB_DEVICE_MODE_CHOICE,err=S.error?`<div class="notice error">${esc(S.error)}</div>`:"";
  if(!mode){
    $("app").innerHTML=`<section class="card hero"><div><div class="eyebrow">MUSIC BATTLE</div><h2>Wie wollt ihr spielen?</h2><p>Zwei Spieler, fünf Runden, eine Jury. Wählt euren Modus.</p>${err}<div class="modegrid"><button class="card modecard" id="modeSingle"><div class="modeicon">1</div><div><div class="eyebrow">PASS & PLAY</div><h3>Ein Gerät</h3><p class="muted">Ihr gebt ein Gerät hin und her. Ein Spotify-Konto reicht.</p></div></button><button class="card modecard" id="modeTwo"><div class="modeicon">2</div><div><div class="eyebrow">REALTIME</div><h3>Zwei Geräte</h3><p class="muted">Jeder Spieler meldet sich auf seinem eigenen Gerät an.</p></div></button></div><div class="divider"></div><div class="joinrole jurorrole"><div><div class="eyebrow">ICH BIN JUROR</div><h3>Nur bewerten</h3><p class="muted">Du spielst nicht mit und brauchst kein Spotify.</p></div><div><input id="juryCode" maxlength="6" placeholder="Raumcode"><input id="juryName" placeholder="Dein Name"><button class="btn" id="juryJoinDirect">Als Juror beitreten</button></div></div></div><div class="hero-art">VS</div></section>`;
    $("modeSingle").onclick=()=>setDeviceModeChoice("single");$("modeTwo").onclick=()=>setDeviceModeChoice("two");
    $("juryJoinDirect").onclick=async()=>{const code=$("juryCode").value.trim().toUpperCase(),name=$("juryName").value.trim();if(!code||!name){S.error="Raumcode und Name fehlen.";renderLanding();return}const {data,error}=await sb.rpc("mb_join_room",{p_room_code:code,p_display_name:name,p_role:"juror"});if(error){S.error=error.message;renderLanding();return}const row=data[0];saveRoom({room_id:row.room_id,code});await loadRoom(row.room_id);subscribeRoom();render()};
    return;
  }
  const single=mode==="single";
  $("app").innerHTML=`<section class="card"><div class="sectionhead"><div><div class="eyebrow">${single?"1 GERÄT · PASS & PLAY":"2 GERÄTE · REALTIME"}</div><h2>${single?"Gemeinsam auf einem Gerät":"Jeder auf dem eigenen Gerät"}</h2></div><button class="btn ghost" id="changeMode">Modus ändern</button></div>${err}<div class="joincolumns"><div class="joinrole playerrole"><div><div class="eyebrow">SPIELER 1 · HOST</div><h3>Neues Match erstellen</h3><p class="muted">${single?"Du meldest danach auch Spieler 2 auf diesem Gerät an.":"Du erhältst einen Raumcode für Spieler 2."}</p></div><div><input id="createName" placeholder="Name Spieler 1"><button class="btn primary" id="createBtn">Raum erstellen</button></div></div>${single?`<div class="joinrole jurorrole"><div><div class="eyebrow">JUROR</div><h3>Bestehendem Raum beitreten</h3><p class="muted">Im Pass-&-Play-Modus kann Spieler 2 nicht von einem anderen Gerät beitreten.</p></div><div><input id="joinCode" maxlength="6" placeholder="Raumcode"><input id="joinName" placeholder="Dein Name"><button class="btn" id="joinJuror">Als Juror beitreten</button></div></div>`:`<div class="joinrole player2role"><div><div class="eyebrow">SPIELER 2</div><h3>Auf deinem Gerät beitreten</h3><p class="muted">Nimm den Raumcode von Spieler 1 und verbinde danach dein eigenes Spotify.</p></div><div><input id="joinCode" maxlength="6" placeholder="Raumcode"><input id="joinName" placeholder="Name Spieler 2"><button class="btn primary" id="joinPlayer">Als Spieler 2 beitreten</button><button class="btn" id="joinJuror">Stattdessen als Juror</button></div></div>`}</div></section>`;
  $("changeMode").onclick=resetDeviceModeChoice;$("createBtn").onclick=createRoom;
  if($("joinPlayer"))$("joinPlayer").onclick=()=>joinRoom("player");$("joinJuror").onclick=()=>joinRoom("juror");
}

function renderLobby(){
  bindBrandHome();
  $("roomBadge").innerHTML=`<span class="chip">RAUM <b style="margin-left:6px">${esc(S.room.code)}</b></span>`;
  const players=S.members.filter(m=>m.role==="player"),jurors=S.members.filter(m=>m.role==="juror"),p1=players.find(p=>p.player_slot===1),p2=players.find(p=>p.player_slot===2);
  const isSingle=(S.room.device_mode||"single")==="single";
  const ready=players.length===2&&players.every(p=>p.spotify_ready);

  // Nächster Schritt (Roadmap 4.3): genau eine Hauptaktion, der Rest als „Noch offen“
  const open=[];
  if(!p1?.spotify_ready)open.push(ownsPlayerSlot(1)?"Spotify verbinden":`Spotify von ${esc(p1?.display_name||"Spieler 1")}`);
  if(!p2)open.push(isSingle?"Spieler 2 hinzufügen":"Spieler 2 tritt mit dem Code bei");
  else if(!p2.spotify_ready&&!isSingle)open.push(ownsPlayerSlot(2)?"Spotify verbinden":`Spotify von ${esc(p2.display_name)}`);
  const next=!p1?.spotify_ready&&ownsPlayerSlot(1)?"connect1":isSingle&&isHost()&&!p2?"addp2":p2&&!p2.spotify_ready&&!isSingle&&ownsPlayerSlot(2)?"connect2":ready&&isHost()?"start":"";

  const row=n=>{const p=players.find(x=>x.player_slot===n);
    if(!p)return`<div class="member p${n}"><div><strong>Spieler ${n}</strong><small>${isSingle?"noch nicht hinzugefügt":"noch nicht beigetreten"}</small></div></div>`;
    const shared=isSingle&&n===2,mine=ownsPlayerSlot(n);
    const status=p.spotify_ready?`<span class="chip ok">Spotify bereit</span>`:shared?`<span class="chip">nutzt Spotify von Spieler 1</span>`:mine?`<button class="btn ${next===`connect${n}`?"primary":"green"}" data-connect-slot="${n}">Spotify verbinden</button>`:`<span class="chip">verbindet auf eigenem Gerät</span>`;
    return`<div class="member p${n}"><div><strong>${esc(p.display_name)}</strong><small>Spieler ${n}${n===1?" · Host":""}</small></div>${status}</div>`};

  $("app").innerHTML=`<section class="card lobby"><div class="eyebrow">LOBBY · ${isSingle?"1 GERÄT · PASS & PLAY":"2 GERÄTE"}</div><h2 class="roomcode">${esc(S.room.code)}</h2>${isSingle?"":`<p class="muted">Spieler 2 und Juroren treten mit diesem Code bei.</p><button class="btn ghost" id="copyCode">Code kopieren</button>`}${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}${S.notice?`<div class="notice">${esc(S.notice)}</div>`:""}
    <div class="stack" style="margin-top:14px">${row(1)}${row(2)}</div>
    ${isSingle&&isHost()&&!p2?`<div class="addp2"><label for="localPlayer2Name">Spieler 2</label><div class="playcontrols"><input id="localPlayer2Name" placeholder="Name Spieler 2" autocomplete="off"><button class="btn ${next==="addp2"?"primary":""}" id="addLocalP2">Hinzufügen</button></div></div>`:""}
    <p class="muted jurorline">Juroren: ${jurors.length?jurors.map(j=>esc(j.display_name)).join(", "):"keine – die Auto-Jury übernimmt bei Bedarf"}</p>
    ${isHost()?`<div class="mainaction">${ready?`<button class="btn primary" id="startDraftBtn">Draft starten</button>`:`<p class="muted">Noch offen: ${open.join(" · ")}</p>`}</div><div class="actions"><button class="btn ghost" id="changeModeLobby">Spielmodus ändern</button></div>`:`<p class="muted">${ready?"Der Host startet gleich den Draft.":`Noch offen: ${open.join(" · ")}`}</p>`}
    ${roomExitControls()}</section>`;

  if($("copyCode"))$("copyCode").onclick=async()=>{try{await navigator.clipboard.writeText(S.room.code);$("copyCode").textContent="Kopiert ✓"}catch{$("copyCode").textContent=S.room.code}};
  if($("addLocalP2"))$("addLocalP2").onclick=addLocalPlayer2;
  document.querySelectorAll("[data-connect-slot]").forEach(b=>b.onclick=()=>connectSpotify(Number(b.dataset.connectSlot)));
  if($("startDraftBtn"))$("startDraftBtn").onclick=startDraft;
  if($("changeModeLobby"))$("changeModeLobby").onclick=openModeSelection;
  bindRoomExitControls();
}

function renderDraft(){
  const turn=expectedDraftSlot(),mine=ownsPlayerSlot(turn),filled=S.picks.length===10,rounds=[1,2,3,4,5],member=membershipForSlot(turn),canSkip=mine&&!member?.draft_skip_used;
  $("app").innerHTML=`<section class="card">${matchScoreboard()}<div class="sectionhead"><div><div class="eyebrow">DRAFT</div><h2>${filled?"Draft abgeschlossen":"Künstler verteilen"}</h2></div><span class="chip">${S.picks.length}/10 Künstler</span></div>${filled?"":turnBanner(turn,isPassAndPlay()?`Gerät an ${memberName(turn)} geben.`:mine?"Du bist dran.":"")}${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}${mine&&!filled?`<div class="artistdraw">${S.currentArtist&&S.currentArtistSlot===turn?`${S.currentArtist.image?`<img src="${esc(S.currentArtist.image)}">`:""}<h2>${esc(S.currentArtist.name)}</h2><p class="muted">Wähle eine freie Runde für diesen Künstler.</p><div class="actions centered">${canSkip?`<button class="btn danger" id="skipArtist">Skip (1×)</button>`:`<span class="chip">Skip benutzt</span>`}</div>`:`<h2>?</h2><p class="muted">Zufällig aus deinem Spotify-Pool.</p><button class="btn primary" id="drawArtist">Künstler ziehen</button>`}</div>`:(filled?`<div class="notice">Die fünf Themen werden jetzt aufgedeckt.</div>`:"")}<div class="roundgrid">${rounds.map(n=>{const a=S.picks.find(p=>p.round_number===n&&p.player_slot===1),b=S.picks.find(p=>p.round_number===n&&p.player_slot===2),free=mine&&S.currentArtist&&S.currentArtistSlot===turn&&!S.picks.some(p=>p.round_number===n&&p.player_slot===turn);return`<div class="roundslot ${free?"selectable":""}" data-round="${n}"><div class="roundnum">Runde ${n}${n===5?" · ×2":""}${free?`<span class="slotcta">hier einsetzen</span>`:""}</div><div class="pick p1${a?"":" empty"}">${a?esc(a.artist_name):"frei"}</div><div class="pick p2${b?"":" empty"}">${b?esc(b.artist_name):"frei"}</div></div>`}).join("")}</div>${roomExitControls()}</section>`;
  if($("drawArtist"))$("drawArtist").onclick=()=>drawArtist(turn);if($("skipArtist"))$("skipArtist").onclick=()=>useDraftSkip(turn);
  document.querySelectorAll(".roundslot.selectable").forEach(x=>x.onclick=()=>placeArtist(Number(x.dataset.round)));bindRoomExitControls();
  if(filled&&isHost()&&(S.rounds||[]).length===0&&S.room?.status!=="battle")initializeRounds();
}

function trackSide(slotNo,pick,sub,both){
  const turn=passPlayTurn(currentSubs()),waiting=Boolean(turn&&turn!==slotNo),mine=ownsPlayerSlot(slotNo)&&(!turn||turn===slotNo||Boolean(sub)),results=S.searchResults[slotNo]||[],artist=`<div class="artistline">${pick?.artist_image_url?`<img src="${esc(pick.artist_image_url)}">`:""}<div><div class="eyebrow">${cornerName(slotNo)} · ${esc(memberName(slotNo))}</div><h3>${esc(pick?.artist_name||"")}</h3></div></div>`;
  // Pass & Play: Wer gerade nicht dran ist, sieht nur eine kompakte Karte (Roadmap 4.4)
  if(waiting&&!both)return`<div class="side compact">${artist}<div class="lockbadge">${sub?"✓ Song eingereicht":`Wählt nach ${esc(memberName(turn))}`}</div></div>`;
  if(!mine&&!both)return`<div class="side">${artist}<div class="lockedpick"><div class="lockicon">●</div><strong>${sub?"Song eingereicht":"Wählt noch…"}</strong><span>Bleibt verdeckt, bis beide eingereicht haben.</span></div></div>`;
  if(mine&&!sub)return`<div class="side">${artist}<div style="margin-top:14px"><div class="playcontrols"><input id="songSearch${slotNo}" value="${esc(S.searchQuery[slotNo]||"")}" placeholder="Song suchen…" autocomplete="off"><button class="btn primary" data-search-slot="${slotNo}">Suchen</button></div><div class="results">${results.map(t=>`<div class="track" data-slot="${slotNo}" data-id="${esc(t.id)}">${t.image?`<img src="${esc(t.image)}">`:"<span></span>"}<div><strong>${esc(t.name)}</strong><small>${esc(t.album)}</small></div><span class="chip">Einreichen</span></div>`).join("")}</div></div><p class="muted hint">Eingereicht ist eingereicht – kein Wechsel mehr.</p></div>`;
  if(sub&&!both)return`<div class="side">${artist}<div class="selected"><strong>Song eingereicht</strong><div class="muted">Bleibt verdeckt, bis beide eingereicht haben.</div>${mine?`<div class="lockbadge">✓ Song gesperrt</div><label style="margin-top:12px">Startpunkt: <span id="startLabel${slotNo}">${Math.round((sub.start_ms||0)/1000)}s</span></label><input type="range" class="range" min="0" max="90" value="${Math.round((sub.start_ms||0)/1000)}" id="start${slotNo}">`:""}</div></div>`;
  if(sub)return`<div class="side">${artist}<div class="selected"><strong>${esc(sub.song_name)}</strong><div class="muted">${esc(sub.artist_name)} · ${esc(sub.album_name||"")}</div>${mine?`<div class="lockbadge">✓ Song gesperrt</div><label style="margin-top:12px">Startpunkt: <span id="startLabel${slotNo}">${Math.round((sub.start_ms||0)/1000)}s</span></label><input type="range" class="range" min="0" max="90" value="${Math.round((sub.start_ms||0)/1000)}" id="start${slotNo}"><div class="playcontrols"><button class="btn green" data-play="${slotNo}">▶ Abspielen</button><button class="btn" data-pause="${slotNo}">❚❚ Pause</button></div>`:""}</div></div>`;
  return`<div class="side">${artist}<p class="muted">Wartet auf Songauswahl…</p></div>`;
}

function renderBattle(){
  const r=currentRound(),picks=currentPicks(),subs=currentSubs();if(!r){$("app").innerHTML="<div class='card loading'>Runde wird vorbereitet…</div>";return}
  const both=Boolean(subs[0]&&subs[1]),hs=humanScores(),as=aiScores(),use=roundDecision(r.id,true).scores,summary=use.length?scoreSummary(use):null;
  const roundLabel=r.round_number===6?"SUDDEN DEATH":`RUNDE ${r.round_number} VON 5${r.round_number===5?" · DOPPELTE PUNKTE":""}`;
  $("app").innerHTML=`<section class="card">${matchScoreboard()}<div class="battle-title"><div class="eyebrow">${roundLabel} · ${esc(r.category||"")}</div><h2>${esc(r.theme)}</h2></div>${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}${S.notice?`<div class="notice">${esc(S.notice)}</div>`:""}${!both&&passPlayTurn(subs)?turnBanner(passPlayTurn(subs),`Song wählen – ${memberName(3-passPlayTurn(subs))} schaut weg.`):""}<div class="match"${both?animAttr(`reveal:${r.id}`,1500):""}>${trackSide(1,picks[0],subs[0],both)}<div class="vs">VS</div>${trackSide(2,picks[1],subs[1],both)}</div>${both?renderJury(r,subs,hs,as,summary):`<p class="muted hint centered-text">Beide Songs werden gleichzeitig aufgedeckt.</p>`}${roomExitControls()}</section>`;
  document.querySelectorAll("[data-search-slot]").forEach(b=>b.onclick=()=>searchTracks(Number(b.dataset.searchSlot)));document.querySelectorAll(".track").forEach(x=>x.onclick=()=>{const n=Number(x.dataset.slot),t=(S.searchResults[n]||[]).find(t=>t.id===x.dataset.id);if(t)submitTrack(n,t)});
  // Pass & Play: beim Wechsel zu Spieler 2 einmal zu seiner Suche scrollen
  const turn=both?null:passPlayTurn(subs);if(turn&&S.lastPassTurn!==`${r.id}:${turn}`){S.lastPassTurn=`${r.id}:${turn}`;if(turn===2)$(`songSearch2`)?.closest(".side")?.scrollIntoView({block:"start",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}
  [1,2].forEach(n=>{const el=$(`start${n}`);if(el&&ownsPlayerSlot(n)){el.oninput=()=>{$(`startLabel${n}`).textContent=el.value+"s"};el.onchange=()=>updateStart(n,Number(el.value)*1000)}});document.querySelectorAll("[data-play]").forEach(b=>b.onclick=()=>playSubmission(subs[Number(b.dataset.play)-1]));document.querySelectorAll("[data-pause]").forEach(b=>b.onclick=()=>pause(Number(b.dataset.pause)));
  if($("runAI"))$("runAI").onclick=runAIJury;if($("finalize"))$("finalize").onclick=finalizeRound;document.querySelectorAll("[data-human]").forEach(b=>b.onclick=()=>submitHumanScore(Number(b.dataset.human),b.dataset.close==="1"));document.querySelectorAll("[data-self-winner]").forEach(b=>b.onclick=()=>submitSelfDecision(Number(b.dataset.selfWinner)));if($("revealAllAI"))$("revealAllAI").onclick=()=>{S.aiReveal=5;render();document.querySelector(".jury-reveal")?.scrollIntoView({block:"start",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})};bindRoomExitControls();
}

function selfDecisionButtons(subs){return`<button class="btn" data-self-winner="1">A · ${esc(subs[0].song_name)}</button><button class="btn" data-self-winner="2">B · ${esc(subs[1].song_name)}</button>`}

function finalizeLabel(r){return r.round_number===5?"Runde 5 übernehmen · ×2":r.round_number===6?"Sudden Death übernehmen":"Runde übernehmen"}

// Datenbasis der neuen Jury (Roadmap 3.8): welche Daten für Song A/B vorlagen
function juryDataBasis(scores){const b=scores.find(x=>x.details?.data_basis)?.details?.data_basis;if(!b)return"";const f=l=>l?.length?l.join(", "):"keine Zusatzdaten";return`<p class="muted basis">Datenbasis · A: ${esc(f(b.a))} · B: ${esc(f(b.b))}</p>`}

// Punktezettel wie beim Boxen (Roadmap 4.4): eine Zeile pro Juror, Spalten Pink/Cyan, Gewinnerpunkte leuchten
function scorecardTable(rows,total){
  const pt=(v,o,side)=>`<span class="pt${v>o?` w${side}`:""}" role="cell">${v}</span>`;
  return`<div class="scorecard" role="table" aria-label="Punktezettel"><div class="sc-row sc-head" role="row"><span role="columnheader">Juror</span><span class="ca" role="columnheader">${esc(memberName(1))}</span><span class="cb" role="columnheader">${esc(memberName(2))}</span></div>${rows.map((x,i)=>`<div class="sc-row" role="row" style="--i:${i}"><span class="sc-name" role="cell">${x.image?`<img class="sc-av" src="${esc(x.image)}" alt="">`:""}<span class="sc-text"><b>${esc(x.name)}</b>${x.role?`<small class="sc-role">${esc(x.role)}</small>`:""}</span></span>${pt(x.a,x.b,"a")}${pt(x.b,x.a,"b")}${x.reason||x.weak?`<span class="sc-reason" role="cell">${x.reason?esc(x.reason):""}${x.weak?` <span class="chip">zu wenig Daten</span>`:""}</span>`:""}</div>`).join("")}${total?`<div class="sc-row sc-total" role="row" style="--i:${rows.length}"><span role="cell">Total</span>${pt(total.a,total.b,"a")}${pt(total.b,total.a,"b")}</div>`:""}</div>`;
}

// Gürtel-Banner für den Rundensieg (slot 1/2) oder ein Unentschieden (slot null)
function beltBanner(slot,text){return`<div class="belt${slot?` p${slot}`:""}" role="status">★ ${esc(text)}</div>`}

function renderJury(r,subs,hs,as,summary){
  const self=hs.filter(isSelfDecision).slice(-1)[0],jurors=S.members.filter(m=>m.role==="juror");
  hs=hs.filter(s=>!isSelfDecision(s));
  const finalizeBtn=`<div class="mainaction"><button class="btn primary" id="finalize">${finalizeLabel(r)}</button></div>`;

  // Menschlicher Juror: eigene Scorecard abgeben
  if(role()==="juror"){
    const mine=hs.find(x=>x.juror_user_id===S.user.id);
    if(mine)return`<div class="juryarea"><div class="notice success">Deine Scorecard wurde abgegeben: ${mine.score_a}–${mine.score_b}</div></div>`;
    const pickCard=(n)=>`<div class="choice"><div class="eyebrow">${cornerName(n)} · ${esc(memberName(n))}</div><h3>${esc(subs[n-1].song_name)}</h3><small class="muted">${esc(subs[n-1].artist_name)}</small><div class="actions"><button class="btn primary" data-human="${n}" data-close="0">10–8 klar</button><button class="btn" data-human="${n}" data-close="1">10–9 knapp</button></div></div>`;
    return`<div class="juryarea"><div class="sectionhead"><div><div class="eyebrow">DEINE SCORECARD</div><h2>Wer gewinnt?</h2></div></div><div class="human-score">${pickCard(1)}${pickCard(2)}</div></div>`;
  }

  // Menschliche Jury hat gewertet
  if(hs.length){
    const sum=scoreSummary(hs);
    return`<div class="juryarea belt-moment"${animAttr(`belt:${r.id}:${hs.length}`,1800)}><div class="sectionhead"><div><div class="eyebrow">MENSCHLICHE JURY</div><h2>Punktezettel</h2></div><span class="chip">${hs.length} Scorecard${hs.length===1?"":"s"}</span></div>${scorecardTable(hs.map(s=>({name:s.juror_name,reason:s.reason,a:s.score_a,b:s.score_b})),hs.length>1?sum:null)}${sum.winner?beltBanner(sum.winner,`Runde an ${memberName(sum.winner)}`):beltBanner(null,"Unentschieden")}${isHost()?`<div class="mainaction"><button class="btn primary" id="finalize">Runde werten</button></div>`:""}</div>`;
  }

  // Eigener Entscheid des Hosts
  if(self&&!jurors.length){
    const w=Number(self.score_a)>Number(self.score_b)?1:2;
    return`<div class="juryarea belt-moment"${animAttr(`self:${r.id}:${self.id}`,1800)}><div class="sectionhead"><div><div class="eyebrow">EIGENER ENTSCHEID</div><h2>„${esc(subs[w-1].song_name)}“</h2></div></div>${beltBanner(w,`Runde an ${memberName(w)} · ${self.score_a}–${self.score_b}`)}${isHost()?finalizeBtn:""}</div>`;
  }

  if(jurors.length)return`<div class="juryarea"><div class="sectionhead"><div><div class="eyebrow">JURY</div><h2>Warte auf die Scorecards</h2></div></div><div class="notice">${jurors.length} Juror${jurors.length===1?"":"en"} im Raum. Mit Juroren im Raum entscheidet ausschliesslich die menschliche Jury.</div></div>`;

  // Automatische Jury: erst aufdecken, dann Punktezettel
  if(as.length){
    const head=`<div class="sectionhead"><div><div class="eyebrow">KI-JURY · FÜNF PERSÖNLICHKEITEN</div><h2>${S.aiReveal>=5?"Punktezettel":"Urteil ist bereit"}</h2></div></div>`;
    if(S.aiReveal<5)return`<div class="juryarea">${head}<div class="juryready"><div class="avatars">${Object.values(JUDGES).map(j=>`<img src="${esc(j.image)}" alt="${esc(j.name)}" title="${esc(j.name)}">`).join("")}</div><p>Alle fünf Juroren haben unabhängig bewertet.</p><button class="btn primary" id="revealAllAI">Alle Juroren aufdecken</button></div></div>`;
    const order=Object.keys(JUDGES),rows=[...as].sort((x,y)=>order.indexOf(x.juror_key)-order.indexOf(y.juror_key)).map(s=>{const j=JUDGES[s.juror_key]||{name:s.juror_name,role:"",image:""};return{name:j.name,role:j.role,image:j.image,reason:s.reason,weak:s.details?.weak,a:s.score_a,b:s.score_b}});
    const decision=summary.winner?beltBanner(summary.winner,`Runde an ${memberName(summary.winner)}`):beltBanner(null,"Unentschieden – ihr entscheidet");
    const host=summary.winner
      ?`${finalizeBtn}<details class="override"><summary>Jury überstimmen</summary><p class="muted">Ihr seht es anders? Wählt den Rundensieger selbst – das ersetzt das Jury-Urteil dieser Runde.</p><div class="actions">${selfDecisionButtons(subs)}</div></details>`
      :`<div class="choice tiechoice"><h3>Wer gewinnt die Runde?</h3><p class="muted">Die Jury ist sich nicht einig.</p><div class="actions">${selfDecisionButtons(subs)}</div></div>`;
    return`<div class="juryarea jury-reveal"${animAttr(`jury:${r.id}`,4500)}>${head}${juryDataBasis(as)}${scorecardTable(rows,summary)}${decision}${isHost()?host:(summary.winner?"":`<p class="muted centered-text">Der Host wählt den Rundensieger.</p>`)}</div>`;
  }

  return`<div class="juryarea"><div class="sectionhead"><div><div class="eyebrow">JURY</div><h2>Wer urteilt?</h2></div></div>${(isHost()?`<div class="grid2"><div class="choice"><div class="eyebrow">KI-JURY</div><h3>Fünf Juroren urteilen lassen</h3><p class="muted">Die KI-Jury bewertet beide Songs mit den vorhandenen Songdaten.</p><button class="btn primary" id="runAI">KI-Jury starten</button></div><div class="choice"><div class="eyebrow">SELBER ENTSCHEIDEN</div><h3>Ohne Jury weiterspielen</h3><p class="muted">Ihr wählt den Rundensieger direkt. Zählt als knappe 10–9-Scorecard.</p><div class="actions">${selfDecisionButtons(subs)}</div></div></div>`:`<div class="notice">Der Host wählt zwischen KI-Jury und eigenem Entscheid.</div>`)}</div>`;
}

function renderTiebreak(){const p=weightedMatchPoints();$("app").innerHTML=`<section class="card suddenintro">${matchScoreboard()}<div class="eyebrow">NACH 5 RUNDEN · ${p.a}–${p.b}</div><h2>Sudden Death.</h2><p>Runde 5 hat doppelt gezählt – und trotzdem steht es unentschieden. Jetzt bekommt jeder Spieler einen neuen, bisher unbenutzten Künstler. Eine letzte Kategorie entscheidet das Match.</p>${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}${isHost()?`<button class="btn primary" id="startSudden">Sudden Death starten</button>`:`<div class="notice">Der Host startet die Entscheidungsrunde.</div>`}${roomExitControls()}</section>`;if($("startSudden"))$("startSudden").onclick=startSuddenDeath;bindRoomExitControls()}

function renderSuddenDraft(){const picks=S.picks.filter(p=>p.round_number===6),turn=picks.some(p=>p.player_slot===1)?2:1,mine=ownsPlayerSlot(turn),r=S.rounds.find(x=>x.round_number===6);$("app").innerHTML=`<section class="card">${matchScoreboard()}<div class="battle-title"><div class="eyebrow">SUDDEN DEATH · NEUE KÜNSTLER</div><h2>${esc(r?.theme||"Alles oder nichts")}</h2></div>${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}<div class="suddencards">${[1,2].map(n=>{const p=picks.find(x=>x.player_slot===n);return`<div class="side"><div class="eyebrow">${cornerName(n)} · ${esc(memberName(n))}</div>${p?`<h3>${esc(p.artist_name)}</h3><span class="chip">Künstler fixiert</span>`:(turn===n&&mine?`${S.currentArtist&&S.currentArtistSlot===n?`<div class="artistdraw">${S.currentArtist.image?`<img src="${esc(S.currentArtist.image)}">`:""}<h2>${esc(S.currentArtist.name)}</h2><button class="btn primary" id="lockSudden">Künstler übernehmen</button></div>`:`<button class="btn primary" id="drawSudden">Neuen Künstler ziehen</button>`}`:`<p class="muted">Wartet…</p>`)}</div>`}).join("")}</div>${roomExitControls()}</section>`;if($("drawSudden"))$("drawSudden").onclick=()=>drawArtist(turn);if($("lockSudden"))$("lockSudden").onclick=placeSuddenArtist;bindRoomExitControls();if(isHost()&&picks.length===2)sb.rpc("mb_begin_sudden_battle",{p_room_id:S.room.id}).then(()=>reloadRoomNow())}

function renderFinished(){
  const p=weightedMatchPoints(),winner=p.a===p.b?null:(p.a>p.b?1:2),completed=S.rounds.filter(r=>r.status==="complete"&&r.winner_slot).sort((a,b)=>a.round_number-b.round_number),margins=completed.map(r=>({r,m:roundJuryMargin(r.id)})).filter(x=>x.m),closest=[...margins].sort((a,b)=>a.m.margin-b.m.margin)[0],strongest=[...margins].sort((a,b)=>b.m.margin-a.m.margin)[0],ai=S.scores.filter(s=>s.source==="ai"),jurorVotes={};
  // Bilanz je Juror: Punkte für A, für B, Remis (10–10 zählt nicht mehr als Punkt für B)
  for(const s of ai){const k=s.juror_name||s.juror_key||"Juror";if(!jurorVotes[k])jurorVotes[k]=[0,0,0];if(s.score_a>s.score_b)jurorVotes[k][0]++;else if(s.score_b>s.score_a)jurorVotes[k][1]++;else jurorVotes[k][2]++}
  $("app").innerHTML=`<section class="card finalwrap"${animAttr(`final:${S.room.id}`,3500)}><div class="finalscore${winner?` p${winner}`:""}"><div class="eyebrow">MATCH BEENDET</div><h2>${winner?`${esc(memberName(winner))} gewinnt`:"Unentschieden"}</h2><div class="big"><span class="sa">${p.a}</span> – <span class="sb">${p.b}</span></div>${winner?beltBanner(winner,`Champion · ${cornerName(winner)}`):""}<p class="muted">Matchpunkte · Runde 5 zählte doppelt${S.rounds.some(r=>r.round_number===6)?" · inkl. Sudden Death":""}</p></div><div class="statsgrid"><div class="statcard"><span>Gewonnene Battles</span><b>${completed.filter(r=>r.winner_slot===1).length} – ${completed.filter(r=>r.winner_slot===2).length}</b></div><div class="statcard"><span>Knappstes Jury-Battle</span><b>${closest?`Runde ${closest.r.round_number} · ${closest.m.a}–${closest.m.b}`:"–"}</b></div><div class="statcard"><span>Klarster Jury-Entscheid</span><b>${strongest?`Runde ${strongest.r.round_number} · ${strongest.m.a}–${strongest.m.b}`:"–"}</b></div></div><div class="eyebrow">RUNDEN</div><div class="roundsummary">${completed.map(r=>`<div class="member p${r.winner_slot}"><div><strong>${r.round_number===6?"Sudden Death":`Runde ${r.round_number}${r.round_number===5?" · ×2":""}`}</strong><small>${esc(r.theme)}${roundDecision(r.id).kind==="self"?" · Eigener Entscheid":""}</small></div><span class="chip p${r.winner_slot}">${esc(memberName(r.winner_slot))}</span></div>`).join("")}</div>${Object.keys(jurorVotes).length?`<div class="divider"></div><div class="eyebrow">KI-JURY IM MATCH</div><div class="jurorstats">${Object.entries(jurorVotes).map(([name,v])=>`<div class="member"><strong>${esc(name)}</strong><span class="votes"><span class="sa">${esc(memberName(1))} ${v[0]}</span> · <span class="sb">${v[1]} ${esc(memberName(2))}</span>${v[2]?` · ${v[2]} remis`:""}</span></div>`).join("")}</div>`:""}${roomExitControls()}</section>`;bindRoomExitControls();
}
