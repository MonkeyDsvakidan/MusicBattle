/* alben-logic.js – Alben-Tool (Roadmap W.1): Singles in Playlists/gelikten Songs durch die Version aus einem
   gespeicherten Album ersetzen. Kein Teil des Spiels. Reine Funktionen; klassisches Skript (globale Namen),
   für node --test zusätzlich exportiert. */

// Titel vergleichbar machen: „Song (feat. X) - Radio Edit“ → „song“
function albBaseTitle(name){
  return String(name||"")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g,"")
    .replace(/[([][^)\]]*\b(feat|ft|with|prod)\b[^)\]]*[)\]]/g," ")
    .replace(/\s[-–—]\s.*$/,"")
    .replace(/[^\p{L}\p{N}]+/gu," ")
    .trim();
}

function albIsTrack(t){return !!(t&&t.type==="track"&&!t.is_local&&t.id&&t.uri)}

function albIsSingle(t){return albIsTrack(t)&&t.album?.album_type==="single"}

function albYear(album){return String(album?.release_date||"").slice(0,4)}

// Passt ein Album zum optionalen Filter („nur ein Album prüfen“)? Vergleicht Album- und Künstlername.
function albMatchesFilter(album,filter){
  const f=albBaseTitle(filter);
  if(!f)return true;
  const hay=[album?.name,...(album?.artists||[]).map(a=>a.name)].map(albBaseTitle).join(" | ");
  return hay.includes(f);
}

// Gespeicherte Alben → Index Titel → Album-Songs. Gespeicherte Singles zählen nicht als Album.
// savedAlbums: [{album, tracks:[vereinfachte Songs]}]
function albBuildIndex(savedAlbums,filter=""){
  const index=new Map();
  for(const {album,tracks} of savedAlbums||[]){
    if(!album||album.album_type==="single"||!albMatchesFilter(album,filter))continue;
    for(const t of tracks||[]){
      if(!t?.id||!t.uri)continue;
      const key=albBaseTitle(t.name);
      if(!key)continue;
      if(!index.has(key))index.set(key,[]);
      index.get(key).push({track:t,album});
    }
  }
  return index;
}

// Album-Songs mit gleichem Titel und mindestens einem gemeinsamen Künstler
function albCandidates(index,single){
  const artists=new Set((single?.artists||[]).map(a=>a.id).filter(Boolean));
  return (index.get(albBaseTitle(single?.name))||[])
    .filter(c=>c.track.id!==single.id&&(c.track.artists||[]).some(a=>artists.has(a.id)));
}

// Reihenfolge, falls ein Song auf mehreren gespeicherten Alben liegt: Album vor Compilation, dann das ältere
function albRank(cands){
  const typeRank=t=>t==="album"?0:1;
  return [...cands].sort((x,y)=>typeRank(x.album.album_type)-typeRank(y.album.album_type)
    ||String(x.album.release_date||"").localeCompare(String(y.album.release_date||""))
    ||String(x.album.name||"").localeCompare(String(y.album.name||"")));
}

// Entscheid je Single. isrcOf(trackId) liefert die ISRC des Album-Songs (vom vollständigen Song-Objekt).
// sure = gleiche Aufnahme (ISRC gleich); unsure = gleicher Titel/Künstler, Länge ±10 s, aber andere ISRC;
// none = kein gespeichertes Album mit diesem Song → bleibt, wie es ist.
const ALB_UNSURE_MS=10000;
function albClassify(single,cands,isrcOf){
  const ranked=albRank(cands);
  const isrc=single?.external_ids?.isrc||"";
  if(isrc){
    const sure=ranked.filter(c=>isrcOf(c.track.id)===isrc);
    if(sure.length)return {status:"sure",target:sure[0],others:sure.slice(1)};
  }
  const near=ranked.filter(c=>Math.abs((c.track.duration_ms||0)-(single?.duration_ms||0))<=ALB_UNSURE_MS);
  if(near.length)return {status:"unsure",target:near[0],others:near.slice(1)};
  return {status:"none",target:null,others:[]};
}

// Alle Singles aus eigenen Playlists und gelikten Songs, je Song mit Fundstellen
// playlists: [{id,name,items:[{position,track}]}], liked: [track]
function albCollectSingles(playlists,liked){
  const map=new Map();
  const entry=t=>{if(!map.has(t.uri))map.set(t.uri,{track:t,places:[],liked:false});return map.get(t.uri)};
  for(const pl of playlists||[])for(const it of pl.items||[])
    if(albIsSingle(it.track))entry(it.track).places.push({playlistId:pl.id,playlistName:pl.name,position:it.position});
  for(const t of liked||[])if(albIsSingle(t))entry(t).liked=true;
  return [...map.values()];
}

// Änderungen planen. chosen: Map Single-URI → Album-URI (nur angehakte Songs).
// Je Playlist: Albumversion an der Stelle der Single einfügen (absteigend, damit frühere Positionen stimmen),
// danach die Singles entfernen. Steht die Albumversion schon in der Playlist, wird nur die Single entfernt.
// Gelikt: alle Albumversionen liken (ausser schon gelikt), gelikte Singles entliken.
function albPlan(playlists,liked,chosen){
  const playlistOps=[];
  for(const pl of playlists||[]){
    const present=new Set((pl.items||[]).map(it=>it.track?.uri).filter(Boolean));
    const inserts=[],removes=new Set();
    for(const it of pl.items||[]){
      const target=chosen.get(it.track?.uri);
      if(!target)continue;
      removes.add(it.track.uri);
      if(present.has(target))continue;
      present.add(target);
      inserts.push({uri:target,position:it.position});
    }
    if(removes.size)playlistOps.push({playlistId:pl.id,name:pl.name,inserts:inserts.sort((a,b)=>b.position-a.position),removes:[...removes]});
  }
  const likedUris=new Set((liked||[]).map(t=>t?.uri).filter(Boolean));
  const likeUris=[...new Set(chosen.values())].filter(u=>!likedUris.has(u));
  const unlikeUris=[...chosen.keys()].filter(u=>likedUris.has(u));
  return {playlistOps,likeUris,unlikeUris};
}

function albChunks(list,size){const out=[];for(let i=0;i<list.length;i+=size)out.push(list.slice(i,i+size));return out}

if(typeof module!=="undefined")module.exports={albBaseTitle,albIsTrack,albIsSingle,albYear,albMatchesFilter,albBuildIndex,albCandidates,albRank,albClassify,albCollectSingles,albPlan,albChunks,ALB_UNSURE_MS};
