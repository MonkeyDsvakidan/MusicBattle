/* battle.js – Battle: Songsuche, Einreichen, Startpunkt
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

async function searchTracks(slotNo){const q=$(`songSearch${slotNo}`)?.value.trim()||"";S.searchQuery[slotNo]=q;if(!q)return;const pick=currentPicks()[slotNo-1];if(!pick)return;try{let d;const filteredQuery=`${q} artist:"${pick.artist_name}"`;try{d=await sp(slotNo,`/search?q=${encodeURIComponent(filteredQuery)}&type=track&limit=10`)}catch{const fallbackQuery=`${q} ${pick.artist_name}`;d=await sp(slotNo,`/search?q=${encodeURIComponent(fallbackQuery)}&type=track&limit=10`)}S.searchResults[slotNo]=(d.tracks?.items||[]).filter(t=>t.artists?.some(a=>a.id===pick.spotify_artist_id)).map(trackItem);S.notice=S.searchResults[slotNo].length?"":`Keine passenden Songs von ${pick.artist_name} gefunden. Probiere einen anderen Suchbegriff.`;render()}catch(e){S.error=`Songsuche fehlgeschlagen: ${e.message}`;render()}}

// Spotify-Track → Objekt für Suchtreffer, Vorschläge und Einreichen
function trackItem(t){return{id:t.id,uri:t.uri,name:t.name,artist:(t.artists||[]).map(a=>a.name).join(", "),album:t.album?.name||"",image:t.album?.images?.[1]?.url||t.album?.images?.[0]?.url||"",releaseDate:t.album?.release_date||"",durationMs:Number(t.duration_ms||0)||null,albumType:t.album?.album_type||"",isrc:t.external_ids?.isrc||"",explicit:Boolean(t.explicit)}}

// Vorschläge unter der Suche (6.8): eigene meistgehörte Songs des Künstlers (Ränge aus 4 Wochen/6 Monaten/1 Jahr
// zusammengezählt), danach mit Spotify-Suchtreffern aufgefüllt. Gleicher Titel nur einmal. Rein, für node --test.
function rankSuggestions(topSets,searchItems,artistId,n=5){
  const own=t=>t?.id&&(t.artists||[]).some(a=>a.id===artistId),score=new Map();
  (topSets||[]).forEach(set=>(set||[]).forEach((t,i)=>{if(!own(t))return;const e=score.get(t.id)||{t,s:0};e.s+=50-i;score.set(t.id,e)}));
  const out=[],names=new Set(),add=(t,source)=>{const k=String(t.name||"").trim().toLowerCase();if(out.length>=n||names.has(k))return;names.add(k);out.push({...trackItem(t),source})};
  [...score.values()].sort((a,b)=>b.s-a.s).forEach(e=>add(e.t,"top"));
  (searchItems||[]).filter(own).forEach(t=>add(t,"search"));
  return out;
}

async function loadSuggestions(slotNo,pick,roundId){
  const key=`${roundId}:${slotNo}`;if(S.suggestions[key])return;S.suggestions[key]=[];
  // Pass & Play: Spieler 2 nutzt das Spotify-Konto von Spieler 1 – dessen Hörverhalten wäre nicht seines, also nur Suche
  const ranges=slotNo===2&&S.room?.device_mode==="single"?[]:["short_term","medium_term","long_term"];
  const [search,...tops]=await Promise.all([
    sp(slotNo,`/search?type=track&limit=10&q=${encodeURIComponent(`artist:"${pick.artist_name}"`)}`).then(d=>d.tracks?.items||[]).catch(()=>[]),
    ...ranges.map(r=>sp(slotNo,`/me/top/tracks?limit=50&time_range=${r}`).then(d=>d.items||[]).catch(()=>[]))]);
  S.suggestions[key]=rankSuggestions(tops,search,pick.spotify_artist_id);
  if(!S.suggestions[key].length||currentRound()?.id!==roundId)return;
  // Getippten Suchtext über das Neuzeichnen retten
  [1,2].forEach(n=>{const el=$(`songSearch${n}`);if(el)S.searchQuery[n]=el.value});render();
}

async function submitTrack(slotNo,track){
  const r=currentRound();if(!r)return;const old=currentSubs()[slotNo-1];
  if(old){S.error="Dein Song ist bereits eingereicht und kann nicht mehr geändert werden.";render();return}
  const payload={round_id:r.id,room_id:S.room.id,player_user_id:S.user.id,player_slot:slotNo,spotify_track_id:track.id,spotify_uri:track.uri,song_name:track.name,artist_name:track.artist,album_name:track.album,album_image_url:track.image,spotify_release_date:track.releaseDate||null,spotify_duration_ms:track.durationMs||null,spotify_album_type:track.albumType||null,spotify_isrc:track.isrc||null,spotify_explicit:Boolean(track.explicit),start_ms:25000};
  const {data:inserted,error}=await sb.from("mb_submissions").insert(payload).select("id").single();if(error)S.error=error.message;else{S.searchResults[slotNo]=[];S.notice="Song eingereicht und gesperrt.";requestTrackProfile(inserted?.id)}await reloadRoomNow();
}

// Song-Profil für die Jury im Hintergrund anstossen (Roadmap 3.3). Bewusst ohne await:
// Fehler oder langsame Quellen dürfen das Einreichen nie blockieren.
function requestTrackProfile(submissionId){
  if(!submissionId)return;
  sb.functions.invoke("mb-track-profile",{body:{submission_id:submissionId}}).catch(e=>console.warn("Song-Profil:",e?.message||e));
}

async function updateStart(slotNo,ms){const sub=currentSubs()[slotNo-1];if(!sub)return;await sb.from("mb_submissions").update({start_ms:Number(ms)}).eq("id",sub.id);refresh()}

if(typeof module!=="undefined")module.exports={trackItem,rankSuggestions};
