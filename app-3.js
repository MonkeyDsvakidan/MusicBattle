async function startDraft(){if(!isHost())return;const players=S.members.filter(m=>m.role==="player");if(players.length!==2||players.some(p=>!p.spotify_ready)){S.error="Es müssen zwei Spotify-bereite Spieler im Raum sein.";render();return}const {error}=await sb.from("mb_rooms").update({status:"draft",updated_at:new Date().toISOString()}).eq("id",S.room.id);if(error)S.error=error.message}
function expectedDraftSlot(){return S.picks.length%2===0?1:2}
function drawArtist(slotNo){restorePool(slotNo);const used=new Set(S.picks.map(p=>p.spotify_artist_id)),avail=(S.artistPools[slotNo]||[]).filter(a=>!used.has(a.id));if(!avail.length){S.error=`Keine eindeutigen Künstler für Spieler ${slotNo} verfügbar.`;render();return}S.currentArtist=avail[Math.floor(Math.random()*avail.length)];S.currentArtistSlot=slotNo;render()}
async function placeArtist(roundNo){if(!S.currentArtist||![1,2].includes(S.currentArtistSlot))return;const slotNo=S.currentArtistSlot,{error}=await sb.from("mb_draft_picks").insert({room_id:S.room.id,player_user_id:S.user.id,player_slot:slotNo,round_number:roundNo,spotify_artist_id:S.currentArtist.id,artist_name:S.currentArtist.name,artist_image_url:S.currentArtist.image||null});if(error)S.error=error.message;else{S.currentArtist=null;S.currentArtistSlot=null}await reloadRoomNow();if(isHost()&&S.picks.length===10)await initializeRounds()}
function balancedRounds(){const cats=Object.keys(THEMES).sort(()=>Math.random()-.5).slice(0,5);return cats.map((c,i)=>({round_number:i+1,category:c,theme:THEMES[c][Math.floor(Math.random()*THEMES[c].length)]}))}
async function initializeRounds(){if(!isHost())return;if((S.rounds||[]).length>=5||S.room?.status==="battle")return;const payload=balancedRounds();const {error}=await sb.rpc("mb_start_battle",{p_room_id:S.room.id,p_rounds:payload});if(error){await reloadRoomNow();if((S.rounds||[]).length>=5||S.room?.status==="battle"){S.error="";render();return}S.error=error.message;render();return}await reloadRoomNow()}
async function searchTracks(slotNo){const q=$(`songSearch${slotNo}`)?.value.trim()||"";S.searchQuery[slotNo]=q;if(!q)return;const pick=currentPicks()[slotNo-1];if(!pick)return;try{let d;const filteredQuery=`${q} artist:"${pick.artist_name}"`;try{d=await sp(slotNo,`/search?q=${encodeURIComponent(filteredQuery)}&type=track&limit=10`)}catch{const fallbackQuery=`${q} ${pick.artist_name}`;d=await sp(slotNo,`/search?q=${encodeURIComponent(fallbackQuery)}&type=track&limit=10`)}S.searchResults[slotNo]=(d.tracks?.items||[]).filter(t=>t.artists?.some(a=>a.id===pick.spotify_artist_id)).map(t=>({id:t.id,uri:t.uri,name:t.name,artist:t.artists.map(a=>a.name).join(", "),album:t.album?.name||"",image:t.album?.images?.[1]?.url||t.album?.images?.[0]?.url||""}));S.notice=S.searchResults[slotNo].length?"":`Keine passenden Songs von ${pick.artist_name} gefunden. Probiere einen anderen Suchbegriff.`;render()}catch(e){S.error=`Songsuche fehlgeschlagen: ${e.message}`;render()}}
async function submitTrack(slotNo,track){const r=currentRound();if(!r)return;const old=currentSubs()[slotNo-1],payload={round_id:r.id,room_id:S.room.id,player_user_id:S.user.id,player_slot:slotNo,spotify_track_id:track.id,spotify_uri:track.uri,song_name:track.name,artist_name:track.artist,album_name:track.album,album_image_url:track.image,start_ms:25000},q=old?sb.from("mb_submissions").update(payload).eq("id",old.id):sb.from("mb_submissions").insert(payload),{error}=await q;if(error)S.error=error.message;await reloadRoomNow()}
async function updateStart(slotNo,ms){const sub=currentSubs()[slotNo-1];if(!sub)return;await sb.from("mb_submissions").update({start_ms:Number(ms)}).eq("id",sub.id);refresh()}
function waitSdk(){return new Promise((ok,no)=>{if(window.Spotify?.Player)return ok();let n=0,t=setInterval(()=>{if(window.Spotify?.Player){clearInterval(t);ok()}else if(++n>100){clearInterval(t);no(Error("Spotify SDK lädt nicht"))}},100)})}
function playbackSlotForBrowser(slotNo){
  return S.room?.device_mode==="single"?1:slotNo;
}
async function ensurePlayer(slotNo){
  const playbackSlot=playbackSlotForBrowser(slotNo),ss=S.spotify[playbackSlot];
  if(ss.player&&ss.deviceId)return ss.deviceId;
  await waitSdk();
  const t=await token(playbackSlot);
  if(!t)throw Error(`Spotify Login für Spieler ${playbackSlot} fehlt`);
  return new Promise(async(ok,no)=>{
    const p=new Spotify.Player({
      name:S.room?.device_mode==="single"?"Music Battle · Pass & Play":`Music Battle · Spieler ${playbackSlot}`,
      getOAuthToken:cb=>token(playbackSlot).then(cb).catch(()=>cb("")),
      volume:.75
    });
    ss.player=p;
    p.addListener("ready",x=>{ss.deviceId=x.device_id;ok(x.device_id)});
    p.addListener("authentication_error",x=>no(Error("Spotify Player Auth: "+x.message)));
    p.addListener("account_error",x=>no(Error("Spotify Premium erforderlich: "+x.message)));
    p.addListener("initialization_error",x=>no(Error("Spotify Player Initialisierung: "+x.message)));
    p.addListener("playback_error",x=>{S.error="Spotify Playback: "+x.message;render()});
    await p.activateElement?.();
    const success=await p.connect();
    if(!success)no(Error("Spotify Web Playback SDK hat die Verbindung abgelehnt."));
  });
}
async function playSubmission(sub){
  try{
    const slotNo=Number(sub.player_slot),playbackSlot=playbackSlotForBrowser(slotNo),dev=await ensurePlayer(slotNo),t=await token(playbackSlot);
    const r=await fetch(`${SPOTIFY.api}/me/player/play?device_id=${encodeURIComponent(dev)}`,{
      method:"PUT",
      headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},
      body:JSON.stringify({uris:[sub.spotify_uri],position_ms:sub.start_ms||0})
    });
    if(!r.ok){
      let detail="";try{const body=await r.json();detail=body?.error?.message||""}catch{}
      throw Error(`Spotify Playback ${r.status}${detail?": "+detail:""}`);
    }
    S.error="";
  }catch(e){S.error=e.message;render()}
}
async function pause(slotNo){
  try{
    const playbackSlot=playbackSlotForBrowser(slotNo);
    await S.spotify[playbackSlot]?.player?.pause();
  }catch{}
}
async function submitHumanScore(winner,close){const r=currentRound(),subs=currentSubs();if(!r||!subs[0]||!subs[1])return;const a=winner===1?10:(close?9:8),b=winner===2?10:(close?9:8),{error}=await sb.from("mb_jury_scores").insert({round_id:r.id,room_id:S.room.id,source:"human",juror_user_id:S.user.id,juror_name:jurorMembership()?.display_name||"Juror",score_a:a,score_b:b,reason:close?"Knapper Entscheid":"Klarer Entscheid",details:{kind:"human"}});if(error)S.error=error.message;await reloadRoomNow()}
async function runAIJury(){const r=currentRound();if(!r)return;S.error="";S.notice="KI-Jury bewertet die beiden Songs …";render();try{const {data,error}=await sb.functions.invoke("mb-ai-jury",{body:{room_id:S.room.id,round_id:r.id}});if(error){let detail=error.message||"Unbekannter Edge-Function-Fehler";try{if(error.context){const body=await error.context.json();detail=[body?.error,body?.detail].filter(Boolean).join(": ")||detail}}catch{}throw new Error(detail)}if(data?.error)throw new Error([data.error,data.detail].filter(Boolean).join(": "));S.notice="KI-Jury ist bereit. Die Juroren können jetzt nacheinander aufgedeckt werden.";S.aiReveal=0;await reloadRoomNow()}catch(e){S.notice="";S.error=`KI-Jury konnte nicht ausgeführt werden: ${e?.message||String(e)}`;render()}}
function scoreSummary(scores){let a=0,b=0;for(const s of scores){a+=s.score_a;b+=s.score_b}return{a,b,winner:a===b?null:(a>b?1:2)}}
async function finalizeRound(){const r=currentRound(),hs=humanScores(),as=aiScores(),use=hs.length?hs:as;if(!use.length){S.error="Noch keine Jury-Wertung vorhanden.";render();return}const x=scoreSummary(use);if(!x.winner){S.error="Score ist unentschieden. Bitte eine weitere menschliche Jurorin/einen weiteren Juror abstimmen lassen.";render();return}const {error}=await sb.rpc("mb_advance_round",{p_room_id:S.room.id,p_round_number:r.round_number,p_winner_slot:x.winner});if(error)S.error=error.message;S.aiReveal=0;await reloadRoomNow()}
