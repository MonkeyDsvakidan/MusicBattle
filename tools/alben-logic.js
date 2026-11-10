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

// Anzeige-Reihenfolge (Wunsch des Nutzers): nach Künstler, dann Album, dann Position im Album.
// Album = Ziel-Album, wenn es eins gibt, sonst die Single. Künstler = erster Künstler des Songs.
function albArtistName(row){return row?.track?.artists?.[0]?.name||""}
function albSortRows(rows){
  const coll=new Intl.Collator("de",{sensitivity:"base",numeric:true});
  const album=r=>r.decision?.target?.album?.name||r.track?.album?.name||"";
  const pos=r=>r.decision?.target?.track?.track_number??r.track?.track_number??0;
  return [...rows].sort((x,y)=>coll.compare(albArtistName(x),albArtistName(y))||coll.compare(album(x),album(y))||pos(x)-pos(y)||coll.compare(x.track?.name||"",y.track?.name||""));
}

function albChunks(list,size){const out=[];for(let i=0;i<list.length;i+=size)out.push(list.slice(i,i+size));return out}

// ---------- Doppelte entfernen (Roadmap W.2) ----------
// Gleicher Song in mehreren Versionen (Single/Album/Deluxe/Compilation) oder mehrfach in einer Playlist.
// Pro Gruppe bleibt eine Version: sie ersetzt überall (eigene Playlists + gelikte Songs) die anderen Versionen.

// Lockerer Titel: zusätzlich Versionshinweise in Klammern weg („(Live)“, „(2011 Remaster)“, „(Radio Edit)“)
function albLooseTitle(name){
  return albBaseTitle(String(name||"").replace(/[([][^)\]]*\b(live|remaster(ed)?|radio|edit|version|mix|remix|mono|stereo|acoustic|akustik|demo|explicit|clean|bonus|deluxe|sped up|slowed)\b[^)\]]*[)\]]/gi," "));
}

// Alle Song-Versionen aus eigenen Playlists und gelikten Songs: URI → {track, places, liked}
function albCollectVersions(playlists,liked){
  const map=new Map();
  const entry=t=>{if(!map.has(t.uri))map.set(t.uri,{track:t,places:[],liked:false});return map.get(t.uri)};
  for(const pl of playlists||[])for(const it of pl.items||[])
    if(albIsTrack(it.track))entry(it.track).places.push({playlistId:pl.id,playlistName:pl.name,position:it.position});
  for(const t of liked||[])if(albIsTrack(t))entry(t).liked=true;
  return map;
}

// Rang der Version, die standardmässig bleibt: gespeichertes Album > Album > Compilation > Single,
// dann die häufiger verwendete, dann die ältere Veröffentlichung
function albVersionRank(v,savedAlbumIds){
  const a=v.track.album||{};
  return a.album_type!=="single"&&savedAlbumIds.has(a.id)?0:a.album_type==="album"?1:a.album_type==="compilation"?2:3;
}
function albDefaultKeep(versions,savedAlbumIds){
  return [...versions].sort((x,y)=>albVersionRank(x,savedAlbumIds)-albVersionRank(y,savedAlbumIds)
    ||(y.places.length+(y.liked?1:0))-(x.places.length+(x.liked?1:0))
    ||String(x.track.album?.release_date||"").localeCompare(String(y.track.album?.release_date||""))
    ||x.track.uri.localeCompare(y.track.uri))[0].track.uri;
}

// Gruppen bilden. sure = gleiche Aufnahme (gleiche ISRC bzw. gleicher Song), mit mehreren Versionen oder
// mehrfach in einer Playlist; unsure = gleicher Titel (locker) und Hauptkünstler, aber verschiedene Aufnahmen.
function albDupGroups(versionMap,{savedAlbumIds=new Set(),filter=""}={}){
  const versions=[...versionMap.values()];
  const parent=new Map(versions.map(v=>[v.track.uri,v.track.uri]));
  const find=u=>{while(parent.get(u)!==u){parent.set(u,parent.get(parent.get(u)));u=parent.get(u)}return u};
  const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(b,a)};
  const byKey=(keyOf)=>{const first=new Map();for(const v of versions){const k=keyOf(v);if(!k)continue;if(first.has(k))union(first.get(k),v.track.uri);else first.set(k,v.track.uri)}};
  const isrcKey=v=>v.track.external_ids?.isrc||"";
  byKey(isrcKey);
  byKey(v=>{const t=albLooseTitle(v.track.name),a=v.track.artists?.[0]?.id;return t&&a?`${t}|${a}`:""});
  const clusters=new Map();
  for(const v of versions){const r=find(v.track.uri);if(!clusters.has(r))clusters.set(r,[]);clusters.get(r).push(v)}
  const dupInPlaylist=vs=>{const seen=new Set();for(const v of vs)for(const p of v.places){if(seen.has(p.playlistId))return true;seen.add(p.playlistId)}return false};
  const groups=[];
  for(const vs of clusters.values()){
    if(filter&&!vs.some(v=>albMatchesFilter(v.track.album,filter)||(v.track.artists||[]).some(a=>albMatchesFilter({name:a.name},filter))))continue;
    const comps=new Map();
    for(const v of vs){const k=isrcKey(v)||v.track.uri;if(!comps.has(k))comps.set(k,[]);comps.get(k).push(v)}
    for(const [k,cv] of comps)if(cv.length>1||dupInPlaylist(cv))
      groups.push({id:`s:${k}`,kind:"sure",versions:cv,keep:albDefaultKeep(cv,savedAlbumIds)});
    if(comps.size>1)groups.push({id:`u:${vs.map(v=>v.track.uri).sort()[0]}`,kind:"unsure",versions:vs,keep:albDefaultKeep(vs,savedAlbumIds)});
  }
  return groups;
}

// Gewählte Gruppen → Zuordnung Version → bleibende Version. Unsichere Gruppen überstimmen die sicheren darin.
// selected: [{versions, keep, kind}]
function albDupMapping(selected){
  const map=new Map();
  for(const g of selected.filter(g=>g.kind==="unsure"))for(const v of g.versions)map.set(v.track.uri,g.keep);
  for(const g of selected.filter(g=>g.kind!=="unsure"))for(const v of g.versions)if(!map.has(v.track.uri))map.set(v.track.uri,g.keep);
  for(const t of new Set(map.values()))map.set(t,map.get(t)||t);
  return map;
}

// Änderungen planen: In jeder Playlist steht pro Gruppe danach genau einmal die bleibende Version, an der Stelle des
// ersten Vorkommens. Vorgehen je Playlist: betroffene URIs entfernen (Spotify entfernt alle Vorkommen), dann die
// bleibenden Versionen aufsteigend an ihrer Endposition einfügen. Steht die bleibende Version schon einmal an erster
// Stelle, wird sie nicht angefasst. Gelikt: andere Versionen entliken, bleibende liken (falls eine Version gelikt war).
function albDupPlan(playlists,liked,mapping){
  const playlistOps=[];
  for(const pl of playlists||[]){
    const items=pl.items||[];
    const occ=new Map();
    items.forEach((it,i)=>{const u=it.track?.uri,t=u&&mapping.get(u);if(!t)return;if(!occ.has(t))occ.set(t,[]);occ.get(t).push({i,u})});
    const changed=new Set(),moveKeep=new Set(),removes=new Set();
    for(const [t,os] of occ){
      if(os.length<2&&os[0].u===t)continue;
      changed.add(t);
      for(const o of os)if(o.u!==t)removes.add(o.u);
      if(os[0].u!==t||os.filter(o=>o.u===t).length>1){moveKeep.add(t);if(os.some(o=>o.u===t))removes.add(t)}
    }
    if(!changed.size)continue;
    const final=[];
    items.forEach((it,i)=>{
      const u=it.track?.uri,t=u&&mapping.get(u);
      if(t&&changed.has(t)){if(occ.get(t)[0].i===i)final.push({uri:t,insert:moveKeep.has(t)});return}
      final.push({uri:u||null,insert:false});
    });
    const inserts=final.map((e,position)=>e.insert?{uri:e.uri,position}:null).filter(Boolean);
    const removedCount=items.length-final.length;
    playlistOps.push({playlistId:pl.id,name:pl.name,removes:[...removes],inserts,removedCount});
  }
  const likedUris=new Set((liked||[]).map(t=>t?.uri).filter(Boolean));
  const unlikeUris=[...likedUris].filter(u=>mapping.has(u)&&mapping.get(u)!==u);
  const likeUris=[...new Set(unlikeUris.map(u=>mapping.get(u)))].filter(u=>!likedUris.has(u));
  return {playlistOps,likeUris,unlikeUris};
}

if(typeof module!=="undefined")module.exports={albBaseTitle,albIsTrack,albIsSingle,albYear,albMatchesFilter,albBuildIndex,albCandidates,albRank,albClassify,albCollectSingles,albPlan,albArtistName,albSortRows,albChunks,ALB_UNSURE_MS,albLooseTitle,albCollectVersions,albVersionRank,albDefaultKeep,albDupGroups,albDupMapping,albDupPlan};
