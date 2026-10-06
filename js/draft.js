/* draft.js – Draft inkl. Skip und Sudden-Death-Draft
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

async function startDraft(){if(!isHost())return;const players=S.members.filter(m=>m.role==="player");if(players.length!==2||players.some(p=>!p.spotify_ready)){S.error="Es müssen zwei Spotify-bereite Spieler im Raum sein.";render();return}const {error}=await sb.from("mb_rooms").update({status:"draft",updated_at:new Date().toISOString()}).eq("id",S.room.id);if(error)S.error=error.message}

function expectedDraftSlot(){return S.picks.length%2===0?1:2}

async function placeArtist(roundNo){if(!S.currentArtist||![1,2].includes(S.currentArtistSlot))return;const slotNo=S.currentArtistSlot,{error}=await sb.from("mb_draft_picks").insert({room_id:S.room.id,player_user_id:S.user.id,player_slot:slotNo,round_number:roundNo,spotify_artist_id:S.currentArtist.id,artist_name:S.currentArtist.name,artist_image_url:S.currentArtist.image||null,artist_draft_weight:Number(S.currentArtist.draftWeight||0)||null,artist_sources:Array.isArray(S.currentArtist.sources)?S.currentArtist.sources:[]});if(error)S.error=error.message;else{S.currentArtist=null;S.currentArtistSlot=null}await reloadRoomNow();if(isHost()&&S.picks.length===10)await initializeRounds()}

function balancedRounds(){const cats=Object.keys(THEMES).sort(()=>Math.random()-.5).slice(0,5);return cats.map((c,i)=>({round_number:i+1,category:c,theme:THEMES[c][Math.floor(Math.random()*THEMES[c].length)]}))}

async function initializeRounds(){if(!isHost())return;if((S.rounds||[]).length>=5||S.room?.status==="battle")return;const payload=balancedRounds();const {error}=await sb.rpc("mb_start_battle",{p_room_id:S.room.id,p_rounds:payload});if(error){await reloadRoomNow();if((S.rounds||[]).length>=5||S.room?.status==="battle"){S.error="";render();return}S.error=error.message;render();return}await reloadRoomNow()}

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

async function startSuddenDeath(){const theme=SUDDEN_THEMES[Math.floor(Math.random()*SUDDEN_THEMES.length)],{error}=await sb.rpc("mb_start_sudden_death",{p_room_id:S.room.id,p_theme:theme});if(error){S.error=error.message;render();return}S.currentArtist=null;S.currentArtistSlot=null;await reloadRoomNow()}

async function placeSuddenArtist(){if(!S.currentArtist||![1,2].includes(S.currentArtistSlot))return;const slotNo=S.currentArtistSlot,{error}=await sb.from("mb_draft_picks").insert({room_id:S.room.id,player_user_id:S.user.id,player_slot:slotNo,round_number:6,spotify_artist_id:S.currentArtist.id,artist_name:S.currentArtist.name,artist_image_url:S.currentArtist.image||null});if(error)S.error=error.message;else{S.currentArtist=null;S.currentArtistSlot=null}await reloadRoomNow();if(isHost()&&S.picks.filter(p=>p.round_number===6).length===2){const {error:e}=await sb.rpc("mb_begin_sudden_battle",{p_room_id:S.room.id});if(e)S.error=e.message;await reloadRoomNow()}}
