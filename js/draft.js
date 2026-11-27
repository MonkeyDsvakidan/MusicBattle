/* draft.js – Draft inkl. Skip und Sudden-Death-Draft
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

// Draft starten (Host): der Server prüft Spieler und Spotify (mb_start_draft, M.1/M.2) – 1v1 und Gruppe
async function startDraft(){if(!isHost())return;S.error="";const {error}=await sb.rpc("mb_start_draft",{p_room_id:S.room.id});if(error){S.error=error.message;render();return}await reloadRoomNow()}

function expectedDraftSlot(){return draftTurnCorner(S.picks,cornerCount())}

async function placeArtist(roundNo){if(!S.currentArtist||!S.currentArtistSlot)return;const slotNo=S.currentArtistSlot,{error}=await sb.from("mb_draft_picks").insert({room_id:S.room.id,player_user_id:S.user.id,player_slot:slotNo,round_number:roundNo,spotify_artist_id:S.currentArtist.id,artist_name:S.currentArtist.name,artist_image_url:S.currentArtist.image||null,artist_draft_weight:Number(S.currentArtist.draftWeight||0)||null,artist_sources:Array.isArray(S.currentArtist.sources)?S.currentArtist.sources:[]});if(error)S.error=error.message;else{S.currentArtist=null;S.currentArtistSlot=null}await reloadRoomNow();if(isHost()&&S.picks.filter(p=>p.round_number<=5).length===roundCount()*cornerCount())await initializeRounds()}

function balancedRounds(){const cats=Object.keys(THEMES).sort(()=>Math.random()-.5).slice(0,roundCount());return cats.map((c,i)=>({round_number:i+1,category:c,theme:THEMES[c][Math.floor(Math.random()*THEMES[c].length)]}))}

async function initializeRounds(){if(!isHost())return;if((S.rounds||[]).length>=roundCount()||S.room?.status==="battle")return;const payload=balancedRounds();const {error}=await sb.rpc("mb_start_battle",{p_room_id:S.room.id,p_rounds:payload});if(error){await reloadRoomNow();if((S.rounds||[]).length>=roundCount()||S.room?.status==="battle"){S.error="";render();return}S.error=error.message;render();return}await reloadRoomNow()}

// Verdeckter Draft (4.7): Gegner-Picks sind per RLS unlesbar; belegte Runden kommen ohne Künstler aus mb_draft_board.
async function addHiddenPicks(){const {data,error}=await sb.rpc("mb_draft_board",{p_room_id:S.room.id});if(error){S.error=error.message;return}for(const b of data||[])if(!S.picks.some(p=>p.round_number===b.round_number&&p.player_slot===b.player_slot))S.picks.push({...b,hidden:true})}

function allSkippedArtistIds(){return new Set([...S.members.map(m=>m.draft_skipped_artist_id).filter(Boolean),...(S.room?.draft_shared_skips||[])])}

// Ziehen gewichtet nach Hörverhalten und Genre (Hip-Hop bevorzugt, 6.5); Hörbuch-Autoren werden vor dem Anzeigen
// per Suche erkannt, aus dem Pool entfernt und es wird neu gezogen (6.4). Geprüfte Künstler merkt sich der Pool.
async function drawArtist(slotNo){
  if(S.drawing)return;S.drawing=true;
  const ps=poolSlot(slotNo); // slotNo = Ecke; Pool und Spotify-Anmeldung liegen im Speicherplatz ps
  try{
    restorePool(ps);
    const taken=new Set(); // verdeckt: beim Server als vergeben gemeldet
    for(let attempt=0;attempt<5;attempt++){
      const used=new Set([...S.picks.map(p=>p.spotify_artist_id),...taken]);
      for(const id of allSkippedArtistIds())used.add(id);
      const avail=(S.artistPools[ps]||[]).filter(a=>!used.has(a.id));
      if(!avail.length){S.error=`Keine eindeutigen Künstler für Spieler ${slotNo} verfügbar.`;render();return}
      const weights=avail.map(effectiveDraftWeight);
      const total=weights.reduce((a,b)=>a+b,0);
      let roll=Math.random()*total,chosen=avail[avail.length-1];
      for(let i=0;i<avail.length;i++){roll-=weights[i];if(roll<=0){chosen=avail[i];break}}
      // Keine Doppelten auch verdeckt: Pass & Play sieht alle Picks selbst, sonst fragt der Server.
      if(S.room?.draft_hidden&&!isPassAndPlay()){
        const {data:isTaken,error}=await sb.rpc("mb_draft_artist_taken",{p_room_id:S.room.id,p_artist_id:chosen.id});
        if(error){S.error=error.message;render();return}
        if(isTaken){taken.add(chosen.id);attempt--;continue}
      }
      if(!chosen.checked){
        if(await isAudiobookArtist(ps,chosen)){dropFromPool(ps,chosen.id);continue}
        chosen.checked=true;savePool(ps);
      }
      S.currentArtist=chosen;
      S.currentArtistSlot=slotNo;render();return;
    }
    S.error="Es wurden nur Hörbücher gezogen. Bitte nochmals ziehen.";render();
  }finally{S.drawing=false}
}

async function useDraftSkip(slotNo){
  if(!S.currentArtist||S.currentArtistSlot!==slotNo)return;
  if(cornerSkipUsed(slotNo)){S.error="Dein einmaliger Draft-Skip wurde bereits benutzt.";render();return}
  const {error}=await sb.rpc("mb_use_draft_skip",{p_room_id:S.room.id,p_slot:slotNo,p_artist_id:S.currentArtist.id});
  if(error){S.error=error.message;render();return}
  S.currentArtist=null;S.currentArtistSlot=null;
  await reloadRoomNow();drawArtist(slotNo);
}

// Gemeinsamer Skip (6.7): Der Ziehende schlägt vor, der andere Spieler sagt Ja/Nein (Pass & Play auf demselben Gerät).
// Beliebig oft, auch im Sudden-Death-Draft, ohne Ablaufzeit. Der Vorschlag liegt im Raum (draft_skip_proposal),
// damit das andere Gerät den Künstler sieht; angenommene Künstler stehen in draft_shared_skips.
async function proposeSharedSkip(slotNo){
  const a=S.currentArtist;if(!a||S.currentArtistSlot!==slotNo)return;
  const {error}=await sb.rpc("mb_propose_shared_skip",{p_room_id:S.room.id,p_slot:slotNo,p_artist_id:a.id,p_artist_name:a.name,p_artist_image:a.image||null});
  if(error)S.error=error.message;await reloadRoomNow();
}

async function answerSharedSkip(slotNo,accept){
  const {error}=await sb.rpc("mb_answer_shared_skip",{p_room_id:S.room.id,p_slot:slotNo,p_accept:accept});
  if(error)S.error=error.message;await reloadRoomNow();
}

// Nach jedem Laden: offenen eigenen Vorschlag wiederherstellen (z. B. nach Neuladen der Seite)
// und einen gemeinsam übersprungenen Künstler verwerfen und neu ziehen.
function applySharedSkipState(){
  const p=S.room?.draft_skip_proposal;
  if(p&&!S.currentArtist&&ownsCorner(p.slot)&&(!isGroupRoom()||draftCaptain(S.members,S.picks,p.slot)?.user_id===S.user?.id)){
    S.currentArtist=(S.artistPools[poolSlot(p.slot)]||[]).find(a=>a.id===p.artist_id)||{id:p.artist_id,name:p.artist_name,image:p.artist_image||""};
    S.currentArtistSlot=p.slot;
  }
  if(S.currentArtist&&(S.room?.draft_shared_skips||[]).includes(S.currentArtist.id)){
    const slot=S.currentArtistSlot;S.currentArtist=null;S.currentArtistSlot=null;
    if(ownsCorner(slot)&&["draft","sudden_draft"].includes(S.room.status))setTimeout(()=>drawArtist(slot));
  }
}

async function startSuddenDeath(){const theme=SUDDEN_THEMES[Math.floor(Math.random()*SUDDEN_THEMES.length)],{error}=await sb.rpc("mb_start_sudden_death",{p_room_id:S.room.id,p_theme:theme});if(error){S.error=error.message;render();return}S.currentArtist=null;S.currentArtistSlot=null;await reloadRoomNow()}

async function placeSuddenArtist(){if(!S.currentArtist||![1,2].includes(S.currentArtistSlot))return;const slotNo=S.currentArtistSlot,{error}=await sb.from("mb_draft_picks").insert({room_id:S.room.id,player_user_id:S.user.id,player_slot:slotNo,round_number:6,spotify_artist_id:S.currentArtist.id,artist_name:S.currentArtist.name,artist_image_url:S.currentArtist.image||null});if(error)S.error=error.message;else{S.currentArtist=null;S.currentArtistSlot=null}await reloadRoomNow();if(isHost()&&S.picks.filter(p=>p.round_number===6).length===2){const {error:e}=await sb.rpc("mb_begin_sudden_battle",{p_room_id:S.room.id});if(e)S.error=e.message;await reloadRoomNow()}}
