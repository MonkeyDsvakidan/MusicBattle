const SUDDEN_THEMES=[
  "Alles oder nichts – der finale Song",
  "Final Boss betritt die Arena",
  "Letzte Chance auf den Sieg",
  "Der Song für den entscheidenden Moment",
  "Noch ein Song, dann ist Schluss"
];

let mbFallbackPoll=null,mbPendingRender=false,mbLastFingerprint="";
function mbEditingActive(){
  const el=document.activeElement;
  return Boolean(el&&(el.matches?.("input, textarea, select")||el.isContentEditable));
}
// Bestätigung in der App statt window.confirm (Roadmap 1.6). Hängt ausserhalb von #app,
// damit ein Neuaufbau der Seite den offenen Dialog nicht entfernt. Liefert true/false.
function mbConfirm(message,{title="Bist du sicher?",confirmLabel="Bestätigen",cancelLabel="Abbrechen",danger=false}={}){
  if(document.querySelector(".mb-dialog-backdrop"))return Promise.resolve(false);
  return new Promise(resolve=>{
    const prev=document.activeElement,wrap=document.createElement("div");
    wrap.className="mb-dialog-backdrop";
    wrap.innerHTML=`<div class="mb-dialog card" role="alertdialog" aria-modal="true" aria-labelledby="mbDialogTitle" aria-describedby="mbDialogText"><h3 id="mbDialogTitle">${esc(title)}</h3><p id="mbDialogText" class="muted">${esc(message)}</p><div class="actions"><button class="btn" type="button" data-dialog="cancel">${esc(cancelLabel)}</button><button class="btn ${danger?"danger":"primary"}" type="button" data-dialog="ok">${esc(confirmLabel)}</button></div></div>`;
    const close=ok=>{document.removeEventListener("keydown",onKey,true);wrap.remove();prev?.focus?.();resolve(ok)};
    const onKey=e=>{
      if(e.key==="Escape"){e.preventDefault();close(false);return}
      if(e.key==="Tab"){e.preventDefault();const f=[...wrap.querySelectorAll("button")],i=f.indexOf(document.activeElement);f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus()}
    };
    wrap.addEventListener("click",e=>{if(e.target===wrap){close(false);return}const b=e.target.closest("[data-dialog]");if(b)close(b.dataset.dialog==="ok")});
    document.addEventListener("keydown",onKey,true);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-dialog="ok"]').focus();
  });
}
// Fingerabdruck der Raumdaten: Sync rendert nur, wenn sich etwas geändert hat.
// Sonst ersetzt der 2,5-s-Poll laufend das DOM und Klicks/Eingaben gehen verloren.
function mbRoomFingerprint(){
  try{return JSON.stringify([S.room,S.members,S.picks,S.rounds,S.subs,S.scores])}catch{return String(Date.now())}
}
// Getippten Text über einen Neuaufbau retten (nur innerhalb derselben Phase/Runde).
function mbTextInputs(){
  return [...document.querySelectorAll("#app input:not([type]), #app input[type=text], #app input[type=search], #app textarea")];
}
function mbInputKey(el){return el.id?"#"+el.id:(el.placeholder?"ph:"+el.placeholder:"")}
function mbRenderKeepingInputs(){
  const phase=`${S.room?.id}|${S.room?.status}|${S.room?.current_round}`;
  const saved=mbTextInputs().filter(el=>el.value&&mbInputKey(el)).map(el=>[mbInputKey(el),el.value]);
  mbLastFingerprint=mbRoomFingerprint();
  render();
  if(!saved.length||phase!==`${S.room?.id}|${S.room?.status}|${S.room?.current_round}`)return;
  const fresh=mbTextInputs();
  for(const [key,value] of saved){
    const el=fresh.find(x=>mbInputKey(x)===key);
    if(el&&!el.value)el.value=value;
  }
}
async function mbSafeSync(){
  if(!S.room?.id)return;
  try{
    await loadRoom(S.room.id);
    if(!mbPendingRender&&mbRoomFingerprint()===mbLastFingerprint)return;
    if(mbEditingActive()){mbPendingRender=true;return}
    mbPendingRender=false;mbRenderKeepingInputs();
  }catch(e){console.warn("room sync",e)}
}
async function reloadRoomNow(){
  if(!S.room?.id)return;
  await loadRoom(S.room.id);
  mbLastFingerprint=mbRoomFingerprint();
  render();
}
function refresh(){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(mbSafeSync,120);
}
function startRoomFallbackPoll(){
  if(mbFallbackPoll)clearInterval(mbFallbackPoll);
  if(!S.room?.id)return;
  mbFallbackPoll=setInterval(()=>{
    if(!S.room?.id||document.hidden||mbEditingActive())return;
    mbSafeSync();
  },2500);
}
document.addEventListener("focusout",()=>{
  if(!mbPendingRender)return;
  setTimeout(()=>{if(!mbEditingActive()&&mbPendingRender){mbPendingRender=false;mbRenderKeepingInputs()}},150);
},true);
function subscribeRoom(){
  if(!S.room)return;
  if(channel)sb.removeChannel(channel);
  channel=sb.channel(`mb-${S.room.id}-v2`)
    .on("postgres_changes",{event:"*",schema:"public",table:"mb_rooms",filter:`id=eq.${S.room.id}`},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"mb_members",filter:`room_id=eq.${S.room.id}`},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"mb_draft_picks",filter:`room_id=eq.${S.room.id}`},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"mb_rounds",filter:`room_id=eq.${S.room.id}`},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"mb_submissions",filter:`room_id=eq.${S.room.id}`},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"mb_jury_scores",filter:`room_id=eq.${S.room.id}`},refresh)
    .subscribe(status=>{if(status==="SUBSCRIBED")reloadRoomNow()});
  startRoomFallbackPoll();
}
window.addEventListener("focus",()=>{if(S.room?.id&&!mbEditingActive())mbSafeSync()});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&S.room?.id&&!mbEditingActive())mbSafeSync()});

function allSkippedArtistIds(){return new Set(S.members.map(m=>m.draft_skipped_artist_id).filter(Boolean))}
function drawArtist(slotNo){
  restorePool(slotNo);
  const used=new Set(S.picks.map(p=>p.spotify_artist_id));
  for(const id of allSkippedArtistIds())used.add(id);
  const avail=(S.artistPools[slotNo]||[]).filter(a=>!used.has(a.id));
  if(!avail.length){S.error=`Keine eindeutigen Künstler für Spieler ${slotNo} verfügbar.`;render();return}
  const weights=avail.map(a=>Math.max(1,Number(a.draftWeight)||10));
  const total=weights.reduce((a,b)=>a+b,0);
  let roll=Math.random()*total,chosen=avail[avail.length-1];
  for(let i=0;i<avail.length;i++){roll-=weights[i];if(roll<=0){chosen=avail[i];break}}
  S.currentArtist=chosen;
  S.currentArtistSlot=slotNo;render();
}
async function useDraftSkip(slotNo){
  if(!S.currentArtist||S.currentArtistSlot!==slotNo)return;
  const member=membershipForSlot(slotNo);
  if(member?.draft_skip_used){S.error="Dein einmaliger Draft-Skip wurde bereits benutzt.";render();return}
  const {error}=await sb.rpc("mb_use_draft_skip",{p_room_id:S.room.id,p_slot:slotNo,p_artist_id:S.currentArtist.id});
  if(error){S.error=error.message;render();return}
  S.currentArtist=null;S.currentArtistSlot=null;
  await reloadRoomNow();drawArtist(slotNo);
}
function weightedMatchPoints(){
  let a=0,b=0;
  for(const r of S.rounds.filter(x=>x.status==="complete"&&x.winner_slot)){
    const w=r.round_number===5?2:1;
    if(r.winner_slot===1)a+=w; else if(r.winner_slot===2)b+=w;
  }
  return{a,b};
}
function matchScoreboard(){
  const p=weightedMatchPoints(),round=Number(S.room?.current_round||0);
  const label=round===5?"RUNDE 5 · ×2":round===6?"SUDDEN DEATH":round?`RUNDE ${round}`:"";
  return `<div class="matchscore"><div><span>${esc(memberName(1))}</span><b>${p.a}</b></div><div class="scoremid"><small>MATCH</small><strong>${label}</strong></div><div><b>${p.b}</b><span>${esc(memberName(2))}</span></div></div>`;
}

function renderLanding(){
  bindBrandHome();
  $("roomBadge").innerHTML="";
  const mode=window.MB_DEVICE_MODE_CHOICE,err=S.error?`<div class="notice error">${esc(S.error)}</div>`:"";
  if(!mode){
    $("app").innerHTML=`<section class="card hero"><div><div class="eyebrow">MUSIC BATTLE</div><h2>Wie wollt ihr spielen?</h2><p>Wählt zuerst euren Spielmodus. Juroren können unabhängig davon jederzeit mit einem Raumcode beitreten.</p>${err}<div class="modegrid"><button class="card modecard" id="modeSingle"><div class="modeicon">1</div><div><div class="eyebrow">PASS & PLAY</div><h3>Ein Gerät</h3><p class="muted">Beide Spotify-Konten nacheinander auf demselben Gerät.</p></div></button><button class="card modecard" id="modeTwo"><div class="modeicon">2</div><div><div class="eyebrow">REALTIME</div><h3>Zwei Geräte</h3><p class="muted">Jeder Spieler meldet sich auf seinem eigenen Gerät an.</p></div></button></div><div class="divider"></div><div class="joinrole jurorrole"><div><div class="eyebrow">ICH BIN JUROR</div><h3>Nur bewerten</h3><p class="muted">Du spielst nicht mit und brauchst kein Spotify.</p></div><div><input id="juryCode" maxlength="6" placeholder="Raumcode"><input id="juryName" placeholder="Dein Name"><button class="btn" id="juryJoinDirect">Als Juror beitreten</button></div></div></div><div class="hero-art">VS</div></section>`;
    $("modeSingle").onclick=()=>setDeviceModeChoice("single");$("modeTwo").onclick=()=>setDeviceModeChoice("two");
    $("juryJoinDirect").onclick=async()=>{const code=$("juryCode").value.trim().toUpperCase(),name=$("juryName").value.trim();if(!code||!name){S.error="Raumcode und Name fehlen.";renderLanding();return}const {data,error}=await sb.rpc("mb_join_room",{p_room_code:code,p_display_name:name,p_role:"juror"});if(error){S.error=error.message;renderLanding();return}const row=data[0];saveRoom({room_id:row.room_id,code});await loadRoom(row.room_id);subscribeRoom();render()};
    return;
  }
  const single=mode==="single";
  $("app").innerHTML=`<section class="card"><div class="sectionhead"><div><div class="eyebrow">${single?"1 GERÄT · PASS & PLAY":"2 GERÄTE · REALTIME"}</div><h2>${single?"Gemeinsam auf einem Gerät":"Jeder auf dem eigenen Gerät"}</h2></div><button class="btn secondary" id="changeMode">Modus ändern</button></div>${err}<div class="joincolumns"><div class="joinrole playerrole"><div><div class="eyebrow">SPIELER 1 · HOST</div><h3>Neues Match erstellen</h3><p class="muted">${single?"Du meldest danach auch Spieler 2 auf diesem Gerät an.":"Du erhältst einen Raumcode für Spieler 2."}</p></div><div><input id="createName" placeholder="Name Spieler 1"><button class="btn primary" id="createBtn">Raum erstellen</button></div></div>${single?`<div class="joinrole jurorrole"><div><div class="eyebrow">JUROR</div><h3>Bestehendem Raum beitreten</h3><p class="muted">Im Pass-&-Play-Modus kann Spieler 2 nicht von einem anderen Gerät beitreten.</p></div><div><input id="joinCode" maxlength="6" placeholder="Raumcode"><input id="joinName" placeholder="Dein Name"><button class="btn" id="joinJuror">Als Juror beitreten</button></div></div>`:`<div class="joinrole player2role"><div><div class="eyebrow">SPIELER 2</div><h3>Auf deinem Gerät beitreten</h3><p class="muted">Nimm den Raumcode von Spieler 1 und verbinde danach dein eigenes Spotify.</p></div><div><input id="joinCode" maxlength="6" placeholder="Raumcode"><input id="joinName" placeholder="Name Spieler 2"><button class="btn primary" id="joinPlayer">Als Spieler 2 beitreten</button><button class="btn" id="joinJuror">Stattdessen als Juror</button></div></div>`}</div></section>`;
  $("changeMode").onclick=resetDeviceModeChoice;$("createBtn").onclick=createRoom;
  if($("joinPlayer"))$("joinPlayer").onclick=()=>joinRoom("player");$("joinJuror").onclick=()=>joinRoom("juror");
}
