function spotifyClientId(){return SPOTIFY_CLIENT_ID}
function redirectUri(){return `${location.origin}${location.pathname}`}
function rnd(n=64){const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";const a=crypto.getRandomValues(new Uint8Array(n));return [...a].map(x=>chars[x%chars.length]).join("")}
async function challenge(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
function spotifyKey(slotNo,kind){return `mb_sp_${kind}_${slotNo}`}
function poolKey(slotNo){return `mb_artist_pool_${slotNo}`}

async function connectSpotify(slotNo){
 if(!ownsPlayerSlot(slotNo)){
   S.error=`Spieler ${slotNo} ist in diesem Browser noch nicht angelegt.`;
   render();
   return;
 }
 if(slotNo===2){clearSpotifySlot(2)}
 const v=rnd(),st=rnd(24);
 sessionStorage.setItem("mb_pkce",v);sessionStorage.setItem("mb_sp_state",st);sessionStorage.setItem("mb_sp_slot",String(slotNo));
 const p=new URLSearchParams({response_type:"code",client_id:spotifyClientId(),scope:SPOTIFY.scopes,code_challenge_method:"S256",code_challenge:await challenge(v),redirect_uri:redirectUri(),state:st,show_dialog:"true"});
 location.href=`${SPOTIFY.auth}?${p}`;
}
async function spotifyCallback(){
 const q=new URLSearchParams(location.search),code=q.get("code");if(!code)return;
 const st=q.get("state"),expected=sessionStorage.getItem("mb_sp_state"),v=sessionStorage.getItem("mb_pkce"),slotNo=Number(sessionStorage.getItem("mb_sp_slot")||"0");
 if(!v||st!==expected||![1,2].includes(slotNo)){S.error="Spotify OAuth-Zustand ist ungültig. Bitte erneut verbinden.";history.replaceState({},"",location.pathname);return}
 const body=new URLSearchParams({client_id:spotifyClientId(),grant_type:"authorization_code",code,redirect_uri:redirectUri(),code_verifier:v});
 const r=await fetch(SPOTIFY.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
 if(!r.ok){S.error=`Spotify Token konnte nicht erstellt werden (${r.status}).`;history.replaceState({},"",location.pathname);return}
 storeSpotify(slotNo,await r.json());sessionStorage.removeItem("mb_pkce");sessionStorage.removeItem("mb_sp_state");sessionStorage.removeItem("mb_sp_slot");history.replaceState({},"",location.pathname);await hydrateSpotify(slotNo);
}
function storeSpotify(slotNo,t){const s=S.spotify[slotNo];s.access=t.access_token;s.refresh=t.refresh_token||s.refresh;s.expires=Date.now()+((t.expires_in||3600)-60)*1000;sessionStorage.setItem(spotifyKey(slotNo,"access"),s.access);localStorage.setItem(spotifyKey(slotNo,"refresh"),s.refresh||"");localStorage.setItem(spotifyKey(slotNo,"expires"),String(s.expires))}
function restoreSpotify(slotNo){const s=S.spotify[slotNo];s.access=sessionStorage.getItem(spotifyKey(slotNo,"access"))||s.access;s.refresh=localStorage.getItem(spotifyKey(slotNo,"refresh"))||s.refresh;s.expires=Number(localStorage.getItem(spotifyKey(slotNo,"expires"))||s.expires||0)}
async function token(slotNo){const s=S.spotify[slotNo];if(s.access&&Date.now()<s.expires)return s.access;if(!s.refresh)return"";const r=await fetch(SPOTIFY.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:s.refresh,client_id:spotifyClientId()})});if(!r.ok)return"";const t=await r.json();storeSpotify(slotNo,t);return S.spotify[slotNo].access}
async function sp(slotNo,path){const t=await token(slotNo);if(!t)throw Error(`Spotify Login für Spieler ${slotNo} fehlt.`);const r=await fetch(SPOTIFY.api+path,{headers:{Authorization:`Bearer ${t}`}});if(!r.ok){let detail="";try{const body=await r.json();detail=body?.error?.message||body?.error_description||""}catch{}throw Error(`Spotify ${r.status}${detail?`: ${detail}`:""}`)}return r.json()}
function restorePool(slotNo){if(S.artistPools[slotNo]?.length)return;try{S.artistPools[slotNo]=JSON.parse(localStorage.getItem(poolKey(slotNo))||"[]")}catch{S.artistPools[slotNo]=[]}}
function clearSpotifySlot(slotNo){const s=S.spotify[slotNo];s.access="";s.refresh="";s.expires=0;if(s.player){try{s.player.disconnect()}catch{}}s.player=null;s.deviceId="";sessionStorage.removeItem(spotifyKey(slotNo,"access"));localStorage.removeItem(spotifyKey(slotNo,"refresh"));localStorage.removeItem(spotifyKey(slotNo,"expires"));localStorage.removeItem(poolKey(slotNo));S.artistPools[slotNo]=[];S.spotifyProfiles[slotNo]=null}
function spotifyAccountKey(profile){return profile?.account_id || profile?.id || ""}
async function getProfileForSlot(slotNo){try{return await sp(slotNo,"/me")}catch{return null}}
const SPOKEN_GENRE_HINTS=["audiobook","hörbuch","hoerbuch","spoken word","spoken-word","podcast","comedy","stand-up comedy","standup comedy","storytelling","poetry","meditation","sleep","asmr","kids story","children's story","radio drama"];
const SPOKEN_NAME_HINTS=["hörbuch","hoerbuch","audiobook","podcast","geschichten","märchen","maerchen","lesung","hörspiel","hoerspiel","meditation","einschlaf","schlafgeschichten","stories for kids","fairy tales","spoken word"];
function looksLikeSpokenArtist(artist){const genres=(artist?.genres||[]).map(x=>String(x).toLowerCase()),name=String(artist?.name||"").toLowerCase();return genres.some(g=>SPOKEN_GENRE_HINTS.some(h=>g.includes(h)))||SPOKEN_NAME_HINTS.some(h=>name.includes(h))}
function looksLikeSpokenTrack(track){const hay=`${String(track?.name||"").toLowerCase()} ${String(track?.album?.name||"").toLowerCase()}`;return SPOKEN_NAME_HINTS.some(h=>hay.includes(h))}
async function enrichArtist(slotNo,artist){if(!artist?.id)return artist;try{const full=await sp(slotNo,`/artists/${artist.id}`);return{id:full.id,name:full.name,image:full.images?.[1]?.url||full.images?.[0]?.url||artist.image||"",genres:full.genres||[]}}catch{return{id:artist.id,name:artist.name,image:artist.image||"",genres:artist.genres||[]}}}
async function hydrateSpotify(slotNo){
 try{
  if(!S.room?.id)throw Error("Raum konnte nach dem Spotify-Login nicht wiederhergestellt werden.");if(!ownsPlayerSlot(slotNo))throw Error(`Spielerplatz ${slotNo} ist in diesem Browser nicht verfügbar.`);
  const profile=await sp(slotNo,"/me");
  if(slotNo===2&&ownsPlayerSlot(1)&&S.room?.device_mode==="two"){const p1=await getProfileForSlot(1),key1=spotifyAccountKey(p1),key2=spotifyAccountKey(profile);if(key1&&key2&&key1===key2){clearSpotifySlot(2);await sb.rpc("mb_set_spotify_ready_for_slot",{p_room_id:S.room.id,p_slot:2,p_ready:false,p_display_name:"",p_artist_count:0});await reloadRoomNow();S.error="Im 2-Geräte-Modus benötigt Spieler 2 ein eigenes Spotify-Konto. Wähle auf Spotify «Not you?» / «Nicht du?» und melde das zweite Konto an.";render();return}}
  S.spotifyProfiles[slotNo]=profile;const map=new Map();
  for(const range of ["short_term","medium_term","long_term"]){const d=await sp(slotNo,`/me/top/artists?limit=50&time_range=${range}`);for(const a of d.items||[]){if(looksLikeSpokenArtist(a))continue;map.set(a.id,{id:a.id,name:a.name,image:a.images?.[1]?.url||a.images?.[0]?.url||"",genres:a.genres||[]})}}
  if(map.size<15){const fallbackCandidates=new Map();let off=0;while(off<1000&&fallbackCandidates.size<60){const d=await sp(slotNo,`/me/tracks?limit=50&offset=${off}`);for(const it of d.items||[]){const track=it.track;if(!track||looksLikeSpokenTrack(track))continue;const a=track.artists?.[0];if(a?.id&&!map.has(a.id)&&!fallbackCandidates.has(a.id))fallbackCandidates.set(a.id,{id:a.id,name:a.name,image:""})}if(!d.next)break;off+=50}for(const candidate of fallbackCandidates.values()){if(map.size>=80)break;const full=await enrichArtist(slotNo,candidate);if(looksLikeSpokenArtist(full))continue;map.set(full.id,full)}}
  S.artistPools[slotNo]=[...map.values()];localStorage.setItem(poolKey(slotNo),JSON.stringify(S.artistPools[slotNo]));await sb.rpc("mb_set_spotify_ready_for_slot",{p_room_id:S.room.id,p_slot:slotNo,p_ready:true,p_display_name:profile.display_name||"",p_artist_count:S.artistPools[slotNo].length});await reloadRoomNow();
 }catch(e){S.error=e.message;render()}
}
async function addLocalPlayer2(){const name=$("localPlayer2Name")?.value.trim();if(!name){S.error="Name für Spieler 2 fehlt.";render();return}S.error="";const {error}=await sb.rpc("mb_add_local_player2",{p_room_id:S.room.id,p_display_name:name});if(error){S.error=error.message;render();return}await reloadRoomNow();if(!ownsPlayerSlot(2)){S.error="Spieler 2 wurde angelegt, konnte aber in der Lobby nicht geladen werden. Bitte Seite neu laden.";render();return}await connectSpotify(2)}
