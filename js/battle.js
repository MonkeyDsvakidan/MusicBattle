/* battle.js – Battle: Songsuche, Einreichen, Startpunkt
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

async function searchTracks(slotNo){const q=$(`songSearch${slotNo}`)?.value.trim()||"";S.searchQuery[slotNo]=q;if(!q)return;const pick=currentPicks()[slotNo-1];if(!pick)return;try{let d;const filteredQuery=`${q} artist:"${pick.artist_name}"`;try{d=await sp(slotNo,`/search?q=${encodeURIComponent(filteredQuery)}&type=track&limit=10`)}catch{const fallbackQuery=`${q} ${pick.artist_name}`;d=await sp(slotNo,`/search?q=${encodeURIComponent(fallbackQuery)}&type=track&limit=10`)}S.searchResults[slotNo]=(d.tracks?.items||[]).filter(t=>t.artists?.some(a=>a.id===pick.spotify_artist_id)).map(t=>({id:t.id,uri:t.uri,name:t.name,artist:t.artists.map(a=>a.name).join(", "),album:t.album?.name||"",image:t.album?.images?.[1]?.url||t.album?.images?.[0]?.url||"",releaseDate:t.album?.release_date||"",durationMs:Number(t.duration_ms||0)||null,albumType:t.album?.album_type||"",isrc:t.external_ids?.isrc||"",explicit:Boolean(t.explicit)}));S.notice=S.searchResults[slotNo].length?"":`Keine passenden Songs von ${pick.artist_name} gefunden. Probiere einen anderen Suchbegriff.`;render()}catch(e){S.error=`Songsuche fehlgeschlagen: ${e.message}`;render()}}

async function submitTrack(slotNo,track){
  const r=currentRound();if(!r)return;const old=currentSubs()[slotNo-1];
  if(old){S.error="Dein Song ist bereits eingereicht und kann nicht mehr geändert werden.";render();return}
  const payload={round_id:r.id,room_id:S.room.id,player_user_id:S.user.id,player_slot:slotNo,spotify_track_id:track.id,spotify_uri:track.uri,song_name:track.name,artist_name:track.artist,album_name:track.album,album_image_url:track.image,spotify_release_date:track.releaseDate||null,spotify_duration_ms:track.durationMs||null,spotify_album_type:track.albumType||null,spotify_isrc:track.isrc||null,spotify_explicit:Boolean(track.explicit),start_ms:25000};
  const {error}=await sb.from("mb_submissions").insert(payload);if(error)S.error=error.message;else{S.searchResults[slotNo]=[];S.notice="Song eingereicht und gesperrt."}await reloadRoomNow();
}

async function updateStart(slotNo,ms){const sub=currentSubs()[slotNo-1];if(!sub)return;await sb.from("mb_submissions").update({start_ms:Number(ms)}).eq("id",sub.id);refresh()}
