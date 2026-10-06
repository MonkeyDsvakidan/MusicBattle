/* room.js – Raum: Anmeldung, Laden, Beitreten, Erstellen, Verlassen, Sync (Realtime + Poll), Start (init)
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

window.MB_DEVICE_MODE_CHOICE=localStorage.getItem("mb_device_mode_choice")||"";

async function ensureAnon(){const {data:{session}}=await sb.auth.getSession();if(session){S.user=session.user;return true}const {data,error}=await sb.auth.signInAnonymously({options:{data:{app:"music-battle"}}});if(error){S.error="Anonyme Anmeldung ist im Supabase-Projekt noch nicht aktiviert.";render();return false}S.user=data.user;return true}

async function init(){await ensureAnon();const saved=roomStorage();if(saved?.room_id){await loadRoom(saved.room_id);subscribeRoom()}await spotifyCallback();if(saved?.room_id)await loadRoom(saved.room_id);render()}

async function joinRoom(joinRole){S.error="";const code=$("joinCode").value.trim().toUpperCase(),name=$("joinName").value.trim();if(!code||!name){S.error="Raumcode und Name fehlen.";render();return}const {data,error}=await sb.rpc("mb_join_room",{p_room_code:code,p_display_name:name,p_role:joinRole});if(error){S.error=error.message;render();return}const row=data[0];saveRoom({room_id:row.room_id,code});await loadRoom(row.room_id);subscribeRoom();render()}

async function loadRoom(roomId){const [{data:room},{data:members},{data:picks},{data:rounds},{data:subs},{data:scores}]=await Promise.all([sb.from("mb_rooms").select("*").eq("id",roomId).single(),sb.from("mb_members").select("*").eq("room_id",roomId).order("joined_at"),sb.from("mb_draft_picks").select("*").eq("room_id",roomId).order("created_at"),sb.from("mb_rounds").select("*").eq("room_id",roomId).order("round_number"),sb.from("mb_submissions").select("*").eq("room_id",roomId).order("created_at"),sb.from("mb_jury_scores").select("*").eq("room_id",roomId).order("created_at")]);if(!room){clearRoom();return}S.room=room;S.members=members||[];S.picks=picks||[];S.rounds=rounds||[];S.subs=subs||[];S.scores=scores||[];S.membership=S.members.find(m=>m.user_id===S.user?.id)||null;restoreSpotify(1);restoreSpotify(2);restorePool(1);restorePool(2)}

async function addLocalPlayer2(){
  const name=$("localPlayer2Name")?.value.trim();
  if(!name){S.error="Name für Spieler 2 fehlt.";render();return}
  S.error="";
  const {error}=await sb.rpc("mb_add_local_player2",{p_room_id:S.room.id,p_display_name:name});
  if(error){S.error=error.message;render();return}
  await reloadRoomNow();
  if(!ownsPlayerSlot(2)){S.error="Spieler 2 wurde angelegt, konnte aber in der Lobby nicht geladen werden.";render();return}
  if(S.room?.device_mode==="single"&&membershipForSlot(1)?.spotify_ready){
    mirrorSingleDeviceSpotifyToPlayer2();
    const p=S.spotifyProfiles[1]||await getProfileForSlot(1);
    await sb.rpc("mb_set_spotify_ready_for_slot",{p_room_id:S.room.id,p_slot:2,p_ready:true,p_display_name:p?.display_name||"",p_artist_count:(S.artistPools[1]||[]).length});
    S.notice="Spieler 2 verwendet dasselbe Spotify-Konto wie Spieler 1.";
    await reloadRoomNow();
    return;
  }
  S.notice="Verbinde Spotify einmal bei Spieler 1. Dieses Konto wird im 1-Gerät-Modus automatisch für beide Spieler verwendet.";
  render();
}

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

async function openModeSelection(){
  if(!(await mbConfirmLeave()))return;
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

async function leaveCurrentRoom(opts={}){if(!S.room?.id){resetLocalRoomState();render();return}if(!opts.skipConfirm&&!(await mbConfirmLeave()))return;const roomId=S.room.id;try{const {error}=await sb.rpc("mb_leave_room",{p_room_id:roomId});if(error)throw error}catch(e){console.warn("Room leave failed:",e)}resetLocalRoomState();render()}

async function openNewRoom(){await leaveCurrentRoom()}

let channel=null;

 let refreshTimer=null;

let mbFallbackPoll=null,mbPendingRender=false,mbLastFingerprint="";

function mbEditingActive(){
  const el=document.activeElement;
  return Boolean(el&&(el.matches?.("input, textarea, select")||el.isContentEditable));
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
