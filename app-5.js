window.MB_DEVICE_MODE_CHOICE=localStorage.getItem("mb_device_mode_choice")||"";

function setDeviceModeChoice(mode){
  if(!["single","two"].includes(mode))return;
  window.MB_DEVICE_MODE_CHOICE=mode;
  localStorage.setItem("mb_device_mode_choice",mode);
  renderLanding();
}

function resetDeviceModeChoice(){
  window.MB_DEVICE_MODE_CHOICE="";
  localStorage.removeItem("mb_device_mode_choice");
  renderLanding();
}

async function changeGameModeFromLobby(){
  if(S.room?.id){
    try{await sb.rpc("mb_leave_room",{p_room_id:S.room.id})}catch(e){console.warn("Room leave before mode change failed:",e)}
  }
  resetLocalRoomState();
  window.MB_DEVICE_MODE_CHOICE="";
  localStorage.removeItem("mb_device_mode_choice");
  renderLanding();
}

async function createRoom(){
  S.error="";
  const name=$("createName")?.value.trim()||"";
  const mode=window.MB_DEVICE_MODE_CHOICE;
  if(!name){S.error="Name ist erforderlich.";render();return}
  if(!["single","two"].includes(mode)){S.error="Bitte zuerst 1 Gerät oder 2 Geräte wählen.";renderLanding();return}
  const {data,error}=await sb.rpc("mb_create_room",{p_display_name:name,p_jury_mode:"auto",p_device_mode:mode});
  if(error){S.error=error.message;render();return}
  const row=data[0];
  saveRoom({room_id:row.room_id,code:row.room_code});
  await loadRoom(row.room_id);
  subscribeRoom();
  render();
}

function renderLanding(){
  $("roomBadge").innerHTML="";
  const mode=window.MB_DEVICE_MODE_CHOICE;
  const err=S.error?`<div class="notice error">${esc(S.error)}</div>`:"";

  if(!mode){
    $("app").innerHTML=`<section class="card hero"><div><div class="eyebrow">MUSIC BATTLE ONLINE</div><h2>Wie wollt ihr spielen?</h2><p>Wählt zuerst, ob beide Spieler dasselbe Gerät verwenden oder jeder auf seinem eigenen Gerät spielt.</p>${err}<div class="grid2" style="margin-top:18px"><button class="card modecard" id="modeSingle" style="text-align:left;cursor:pointer"><div class="eyebrow">PASS & PLAY</div><h3>1 Gerät</h3><p class="muted">Beide Spotify-Konten werden nacheinander auf demselben Handy oder Computer verbunden. Draft, Songwahl und Jury laufen komplett auf diesem Gerät.</p><span class="chip">Einfachster Modus</span></button><button class="card modecard" id="modeTwo" style="text-align:left;cursor:pointer"><div class="eyebrow">ECHTES MULTIPLAYER</div><h3>2 Geräte</h3><p class="muted">Spieler 1 erstellt den Raum. Spieler 2 tritt mit dem Raumcode auf dem eigenen Handy bei und verbindet dort sein eigenes Spotify-Konto.</p><span class="chip">Realtime über Supabase</span></button></div><div class="divider"></div><div class="eyebrow">NUR ALS JUROR BEITRETEN</div><div class="playcontrols"><input id="juryCode" maxlength="6" placeholder="Raumcode"><input id="juryName" placeholder="Name"><button class="btn" id="juryJoinDirect">Als Juror beitreten</button></div></div><div class="hero-art">VS</div></section>`;
    $("modeSingle").onclick=()=>setDeviceModeChoice("single");
    $("modeTwo").onclick=()=>setDeviceModeChoice("two");
    $("juryJoinDirect").onclick=async()=>{
      const code=$("juryCode").value.trim().toUpperCase(),name=$("juryName").value.trim();
      if(!code||!name){S.error="Raumcode und Name fehlen.";renderLanding();return}
      const {data,error}=await sb.rpc("mb_join_room",{p_room_code:code,p_display_name:name,p_role:"juror"});
      if(error){S.error=error.message;renderLanding();return}
      const row=data[0];saveRoom({room_id:row.room_id,code});await loadRoom(row.room_id);subscribeRoom();render();
    };
    return;
  }

  const isSingle=mode==="single";
  $("app").innerHTML=`<section class="card hero"><div><div class="eyebrow">${isSingle?"1 GERÄT · PASS & PLAY":"2 GERÄTE · REALTIME"}</div><h2>${isSingle?"Gemeinsam auf einem Gerät":"Jeder auf dem eigenen Gerät"}</h2><p>${isSingle?"Spieler 1 erstellt den Raum. Danach meldet ihr Spieler 1 und Spieler 2 nacheinander mit ihren eigenen Spotify-Konten auf diesem Gerät an.":"Spieler 1 erstellt einen Raum. Spieler 2 öffnet dieselbe Webseite auf dem eigenen Handy und tritt mit dem Raumcode bei."}</p>${err}<div class="actions"><button class="btn" id="changeMode">← Modus ändern</button></div><div class="divider"></div><div class="grid2"><div class="card"><div class="eyebrow">SPIELER 1</div><h3>Neuen Raum erstellen</h3><label>Dein Name</label><input id="createName" placeholder="Name"><button class="btn primary" id="createBtn" style="margin-top:12px">${isSingle?"Pass-&-Play-Raum erstellen":"2-Geräte-Raum erstellen"}</button></div><div class="card"><div class="eyebrow">${isSingle?"JUROR":"SPIELER 2 ODER JUROR"}</div><h3>Mit Raumcode beitreten</h3><label>Code</label><input id="joinCode" maxlength="6" placeholder="ABC123"><label style="margin-top:10px">Dein Name</label><input id="joinName" placeholder="Name"><div class="actions">${isSingle?"":`<button class="btn primary" id="joinPlayer">Als Spieler 2</button>`}<button class="btn" id="joinJuror">Als Juror</button></div>${isSingle?`<p class="muted">Im 1-Gerät-Modus wird Spieler 2 später direkt auf dem Gerät von Spieler 1 hinzugefügt.</p>`:`<p class="muted">Spieler 2 sollte diesen Bereich auf seinem eigenen Gerät öffnen.</p>`}</div></div></div><div class="hero-art">VS</div></section>`;
  $("changeMode").onclick=resetDeviceModeChoice;
  $("createBtn").onclick=createRoom;
  if($("joinPlayer"))$("joinPlayer").onclick=()=>joinRoom("player");
  $("joinJuror").onclick=()=>joinRoom("juror");
}

function renderLobby(){
  $("roomBadge").innerHTML=`<span class="chip">RAUM <b style="margin-left:6px">${esc(S.room.code)}</b></span>`;
  const players=S.members.filter(m=>m.role==="player"),jurors=S.members.filter(m=>m.role==="juror"),p2=players.find(p=>p.player_slot===2);
  const mode=S.room.device_mode||"single";
  const isSingle=mode==="single";
  const mySlots=ownedMemberships().filter(m=>m.role==="player").map(m=>m.player_slot);

  const modeInfo=isSingle
    ? `<div class="notice success"><b>1 Gerät · Pass & Play</b><br>Beide Spieler werden auf diesem Gerät mit Spotify verbunden. Danach gebt ihr das Gerät je nach Zug weiter.</div>`
    : `<div class="notice success"><b>2 Geräte · Realtime</b><br>Spieler 2 öffnet <b>${esc(location.origin+location.pathname)}</b> auf dem eigenen Gerät und tritt mit Raumcode <b>${esc(S.room.code)}</b> als Spieler 2 bei.</div>`;

  $("app").innerHTML=`<div class="grid2"><section class="card"><div class="eyebrow">LOBBY · ${isSingle?"PASS & PLAY":"2 GERÄTE"}</div><h2 class="roomcode">${esc(S.room.code)}</h2>${modeInfo}${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}${S.notice?`<div class="notice">${esc(S.notice)}</div>`:""}<div class="divider"></div><h3>Spieler</h3><div class="stack">${[1,2].map(n=>{const p=players.find(x=>x.player_slot===n);return p?`<div class="member"><div><strong>${esc(p.display_name)}</strong><small>Spieler ${n}${p.spotify_display_name?` · Spotify: ${esc(p.spotify_display_name)}`:""}</small></div><span class="chip">${p.spotify_ready?"Spotify bereit":"nicht verbunden"}</span></div>`:`<div class="member"><div><strong>Spieler ${n}</strong><small>${isSingle?"wird auf diesem Gerät hinzugefügt":"wartet auf Beitritt mit Raumcode"}</small></div></div>`}).join("")}</div>${isSingle&&isHost()&&!p2?`<div class="divider"></div><div class="eyebrow">SPIELER 2</div><h3>Pass-&-Play-Spieler hinzufügen</h3><p class="muted">Name eingeben. Danach öffnet Spotify für das zweite Konto auf demselben Gerät.</p><div class="playcontrols"><input id="localPlayer2Name" placeholder="Name Spieler 2"><button class="btn primary" id="addLocalP2">Spieler 2 anmelden</button></div>`:""}${!isSingle&&isHost()&&!p2?`<div class="notice" style="margin-top:14px">Warte auf Spieler 2. Teile den Raumcode <b>${esc(S.room.code)}</b>.</div>`:""}<h3 style="margin-top:18px">Menschliche Juroren</h3><div class="stack">${jurors.map(j=>`<div class="member"><strong>${esc(j.display_name)}</strong><span class="chip">Jury</span></div>`).join("")||"<p class=muted>Noch keine – KI-Jury übernimmt bei Bedarf.</p>"}</div>${isHost()?`<div class="actions"><button class="btn primary" id="startDraftBtn" ${players.length===2&&players.every(p=>p.spotify_ready)?"":"disabled"}>Draft starten</button><button class="btn secondary" id="changeModeLobby">Spielmodus ändern</button></div>`:""}${roomExitControls()}</section><section class="card"><div class="eyebrow">SPOTIFY</div><h2>${isSingle?"Beide Konten auf diesem Gerät":"Dein Spotify-Konto"}</h2>${[1,2].map(n=>{const p=players.find(x=>x.player_slot===n);if(!p)return"";const mine=ownsPlayerSlot(n);return`<div class="member" style="margin-bottom:10px"><div><strong>Spieler ${n}: ${esc(p.display_name)}</strong><small>${p.spotify_ready?`Verbunden als ${esc(p.spotify_display_name||"Spotify User")}`:(mine?"Auf diesem Gerät noch verbinden":"Verbindung erfolgt auf dem anderen Gerät")}</small></div>${mine&&!p.spotify_ready?`<button class="btn green" data-connect-slot="${n}">Spotify verbinden</button>`:p.spotify_ready?`<span class="chip">bereit</span>`:`<span class="chip">anderes Gerät</span>`}</div>`}).join("")}${isSingle&&ownsPlayerSlot(1)&&ownsPlayerSlot(2)?`<div class="notice success">Beide Spielerplätze gehören zu diesem Browser. Die Spotify-Sessions werden getrennt gespeichert.</div>`:""}${isSingle&&players.find(p=>p.player_slot===1)?.spotify_ready&&players.find(p=>p.player_slot===2)&&!players.find(p=>p.player_slot===2)?.spotify_ready?`<div class="notice" style="margin-top:10px">Beim Login für Spieler 2: Falls Spotify noch Spieler 1 anzeigt, wähle <b>«Not you?» / «Nicht du?»</b>.</div>`:""}${!isSingle?`<div class="notice" style="margin-top:14px">Dieses Gerät kontrolliert nur ${mySlots.length?mySlots.map(n=>`Spieler ${n}`).join(", "):"seinen eigenen Platz"}. Draft und Songwahl werden live synchronisiert.</div>`:""}<div class="notice" style="margin-top:14px">Spotify Redirect URI: <b>${esc(redirectUri())}</b></div></section></div>`;

  if($("addLocalP2"))$("addLocalP2").onclick=addLocalPlayer2;
  document.querySelectorAll("[data-connect-slot]").forEach(b=>b.onclick=()=>connectSpotify(Number(b.dataset.connectSlot)));
  if($("startDraftBtn"))$("startDraftBtn").onclick=startDraft;
  if($("changeModeLobby"))$("changeModeLobby").onclick=changeGameModeFromLobby;
  bindRoomExitControls();
}
