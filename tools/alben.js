/* alben.js – Alben-Tool (Roadmap W.1): eigene Seite ?tool=alben, kein Teil des Spiels.
   Ersetzt Singles in den eigenen Playlists und gelikten Songs durch die Version aus einem gespeicherten Album,
   liked die Albumversion und entliked die Single. Nutzt nur die Spotify-App von Music Battle (gleiche Client-ID
   und Redirect-URI wie js/config.js) – keine Supabase, keine Spiel-Skripte. Logik in tools/alben-logic.js. */

// Gleiche öffentliche Client-ID wie SPOTIFY_CLIENT_ID in js/config.js (config.js braucht Supabase und wird hier nicht geladen)
const ALB_CLIENT_ID="173f861652ae4b668769c76f0adab3a1";
const ALB_AUTH="https://accounts.spotify.com/authorize",ALB_TOKEN="https://accounts.spotify.com/api/token",ALB_API="https://api.spotify.com/v1";
const ALB_SCOPES="user-library-read user-library-modify playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public";
const ALB_KEYS={state:"mb_alben_state",verifier:"mb_alben_pkce",access:"mb_alben_access",expires:"mb_alben_expires",refresh:"mb_alben_refresh"};

const ALB={mode:"fix",dupSel:new Set(),dupKeep:new Map(),view:"start",me:null,error:"",progress:"",filter:"",scan:null,selected:new Set(),result:null,confirm:false};

function albEsc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function albGet(store,k){try{return store.getItem(k)}catch{return null}}
function albSet(store,k,v){try{store.setItem(k,v)}catch{}}
function albDel(store,k){try{store.removeItem(k)}catch{}}
function albRedirect(){return `${location.origin}${location.pathname}`}
function albToolUrl(){return `${location.pathname}?tool=alben`}

// ---------- Anmeldung (PKCE) ----------
function albRandom(n){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";return [...crypto.getRandomValues(new Uint8Array(n))].map(x=>c[x%c.length]).join("")}
async function albChallenge(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}

async function albLogin(){
  const v=albRandom(64),st="alben-"+albRandom(24);
  albSet(sessionStorage,ALB_KEYS.verifier,v);albSet(sessionStorage,ALB_KEYS.state,st);
  const p=new URLSearchParams({response_type:"code",client_id:ALB_CLIENT_ID,scope:ALB_SCOPES,code_challenge_method:"S256",code_challenge:await albChallenge(v),redirect_uri:albRedirect(),state:st});
  location.href=`${ALB_AUTH}?${p}`;
}

async function albCallback(){
  const q=new URLSearchParams(location.search);
  if(!q.get("state"))return;
  const ok=q.get("state")===albGet(sessionStorage,ALB_KEYS.state),v=albGet(sessionStorage,ALB_KEYS.verifier);
  albDel(sessionStorage,ALB_KEYS.state);albDel(sessionStorage,ALB_KEYS.verifier);
  history.replaceState({},"",albToolUrl());
  if(q.get("error")){ALB.error=q.get("error")==="access_denied"?"Anmeldung abgebrochen.":`Spotify-Anmeldung fehlgeschlagen (${q.get("error")}).`;return}
  if(!ok||!v||!q.get("code")){ALB.error="Anmeldung ungültig. Bitte nochmals anmelden.";return}
  const r=await fetch(ALB_TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:ALB_CLIENT_ID,grant_type:"authorization_code",code:q.get("code"),redirect_uri:albRedirect(),code_verifier:v})});
  if(!r.ok){ALB.error=`Spotify-Token konnte nicht erstellt werden (${r.status}).`;return}
  albStoreToken(await r.json());
}

function albStoreToken(t){
  albSet(sessionStorage,ALB_KEYS.access,t.access_token);
  albSet(sessionStorage,ALB_KEYS.expires,String(Date.now()+((t.expires_in||3600)-60)*1000));
  if(t.refresh_token)albSet(localStorage,ALB_KEYS.refresh,t.refresh_token);
}

async function albToken(){
  const access=albGet(sessionStorage,ALB_KEYS.access),exp=Number(albGet(sessionStorage,ALB_KEYS.expires)||0);
  if(access&&Date.now()<exp)return access;
  const refresh=albGet(localStorage,ALB_KEYS.refresh);
  if(!refresh)return "";
  const r=await fetch(ALB_TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh,client_id:ALB_CLIENT_ID})});
  if(!r.ok){albDel(localStorage,ALB_KEYS.refresh);return ""}
  albStoreToken(await r.json());
  return albGet(sessionStorage,ALB_KEYS.access)||"";
}

function albLogout(){for(const k of [ALB_KEYS.access,ALB_KEYS.expires])albDel(sessionStorage,k);albDel(localStorage,ALB_KEYS.refresh);Object.assign(ALB,{view:"start",me:null,scan:null,result:null,error:"",confirm:false});albRender()}

// ---------- Spotify-Aufrufe ----------
const albSleep=ms=>new Promise(r=>setTimeout(r,ms));

async function albApi(method,path,{body,tries=4}={}){
  const t=await albToken();
  if(!t)throw Error("Nicht bei Spotify angemeldet.");
  const url=path.startsWith("http")?path:ALB_API+path;
  const r=await fetch(url,{method,headers:{Authorization:`Bearer ${t}`,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  if(r.status===429&&tries>0){await albSleep((Number(r.headers.get("Retry-After"))||2)*1000+250);return albApi(method,path,{body,tries:tries-1})}
  if(r.status>=500&&tries>0){await albSleep(1500);return albApi(method,path,{body,tries:tries-1})}
  if(!r.ok){let detail="";try{const b=await r.json();detail=b?.error?.message||""}catch{}const e=Error(`Spotify ${r.status}${detail?`: ${detail}`:""}`);e.status=r.status;throw e}
  if(r.status===204)return null;
  const text=await r.text();
  return text?JSON.parse(text):null;
}

async function albPaged(path,onPage){
  const all=[];let next=path;
  while(next){const page=await albApi("GET",next);all.push(...(page?.items||[]));onPage?.(all.length,page?.total);next=page?.next||null}
  return all;
}

// ---------- Bibliothek lesen (für beide Werkzeuge) ----------
// Gespeicherte Alben; Album-Songs nur, wenn withTracks (Alben-Fix) und das Album zum Filter passt
async function albLoadSaved(step,withTracks){
  const raw=await albPaged("/me/albums?limit=50",n=>step(`Gespeicherte Alben laden… ${n}`));
  const saved=[];
  for(const it of raw){
    const album=it.album;if(!album)continue;
    if(!withTracks||!albMatchesFilter(album,ALB.filter)||album.album_type==="single"){saved.push({album,tracks:[]});continue}
    let tracks=album.tracks?.items||[];
    if(!album.tracks)tracks=await albPaged(`/albums/${album.id}/tracks?limit=50`);
    else if(album.tracks.next)tracks=tracks.concat(await albPaged(album.tracks.next));
    saved.push({album,tracks:tracks.map(t=>({...t,album}))});
  }
  return saved;
}

// Eigene und gemeinsame Playlists mit Inhalt (Position zählt jeden Eintrag, auch Podcasts/lokale Dateien)
async function albLoadPlaylists(step){
  const lists=await albPaged("/me/playlists?limit=50");
  const own=lists.filter(p=>p&&(p.owner?.id===ALB.me.id||p.collaborative));
  const playlists=[],skipped=[];
  for(let i=0;i<own.length;i++){
    const p=own[i];step(`Playlists lesen… ${i+1}/${own.length}`);
    try{
      const items=await albPaged(`/playlists/${p.id}/items?limit=50`);
      playlists.push({id:p.id,name:p.name,items:items.map((it,pos)=>({position:pos,track:it?.item??it?.track??null}))});
    }catch(e){skipped.push(`${p.name} (${e.message})`)}
  }
  return {playlists,skipped};
}

async function albLoadLiked(step){
  return (await albPaged("/me/tracks?limit=50",n=>step(`Gelikte Songs laden… ${n}`))).map(it=>it.track).filter(Boolean);
}

function albStartScan(mode){
  Object.assign(ALB,{mode,view:"scan",error:"",result:null,confirm:false});
  ALB.filter=(document.getElementById("albFilter")?.value||"").trim();
  return txt=>{ALB.progress=txt;albRender()};
}

// ---------- Testlauf Alben-Fix ----------
async function albScan(){
  const step=albStartScan("fix");
  try{
    step("Gespeicherte Alben laden…");
    const saved=await albLoadSaved(step,true);
    const index=albBuildIndex(saved,ALB.filter);
    step("Playlists laden…");
    const {playlists,skipped}=await albLoadPlaylists(step);
    step("Gelikte Songs laden…");
    const liked=await albLoadLiked(step);

    const singles=albCollectSingles(playlists,liked);
    const isrcCache=new Map();
    const isrcOf=id=>isrcCache.get(id)||"";
    const rows=[];
    let checked=0;
    for(const s of singles){
      const cands=albCandidates(index,s.track);
      if(cands.length){
        checked++;step(`Albumversionen prüfen… ${checked}`);
        for(const c of cands)if(!isrcCache.has(c.track.id)){
          try{const full=await albApi("GET",`/tracks/${c.track.id}`);isrcCache.set(c.track.id,full?.external_ids?.isrc||"")}catch{isrcCache.set(c.track.id,"")}
        }
      }
      rows.push({...s,decision:albClassify(s.track,cands,isrcOf)});
    }
    ALB.scan={playlists,liked,rows,skipped,albumCount:saved.filter(x=>x.album.album_type!=="single"&&albMatchesFilter(x.album,ALB.filter)).length};
    ALB.selected=new Set(rows.filter(r=>r.decision.status==="sure").map(r=>r.track.uri));
    ALB.view="review";
  }catch(e){ALB.error=`Testlauf abgebrochen: ${e.message}`;ALB.view="start"}
  albRender();
}

// ---------- Testlauf Doppelte (Roadmap W.2) ----------
async function albScanDup(){
  const step=albStartScan("dup");
  try{
    step("Gespeicherte Alben laden…");
    const saved=await albLoadSaved(step,false);
    const savedAlbumIds=new Set(saved.map(x=>x.album.id));
    step("Playlists laden…");
    const {playlists,skipped}=await albLoadPlaylists(step);
    step("Gelikte Songs laden…");
    const liked=await albLoadLiked(step);
    step("Doppelte suchen…");
    const versions=albCollectVersions(playlists,liked);
    const groups=albDupGroups(versions,{savedAlbumIds,filter:ALB.filter});
    ALB.scan={playlists,liked,groups,skipped,savedAlbumIds};
    ALB.dupSel=new Set(groups.filter(g=>g.kind==="sure").map(g=>g.id));
    ALB.dupKeep=new Map(groups.map(g=>[g.id,g.keep]));
    ALB.view="review";
  }catch(e){ALB.error=`Testlauf abgebrochen: ${e.message}`;ALB.view="start"}
  albRender();
}

// ---------- Ausführen ----------
async function albApply(){
  const rows=ALB.scan.rows.filter(r=>r.decision.target&&ALB.selected.has(r.track.uri));
  const chosen=new Map(rows.map(r=>[r.track.uri,r.decision.target.track.uri]));
  const plan=albPlan(ALB.scan.playlists,ALB.scan.liked,chosen);
  const res={playlistsDone:0,replaced:0,liked:0,unliked:0,errors:[]};
  Object.assign(ALB,{view:"apply",confirm:false});
  const step=txt=>{ALB.progress=txt;albRender()};
  try{
    for(let i=0;i<plan.playlistOps.length;i++){
      const op=plan.playlistOps[i];step(`Playlists ändern… ${i+1}/${plan.playlistOps.length}`);
      let failed=false;
      for(const ins of op.inserts){
        try{await albApi("POST",`/playlists/${op.playlistId}/items`,{body:{uris:[ins.uri],position:ins.position}})}
        catch(e){failed=true;res.errors.push(`${op.name}: Einfügen fehlgeschlagen (${e.message})`);break}
      }
      if(failed){res.errors.push(`${op.name}: Singles nicht entfernt, damit nichts verloren geht.`);continue}
      try{
        for(const part of albChunks(op.removes,100))await albApi("DELETE",`/playlists/${op.playlistId}/items`,{body:{items:part.map(uri=>({uri}))}});
        res.playlistsDone++;res.replaced+=op.removes.length;
      }catch(e){res.errors.push(`${op.name}: Single entfernen fehlgeschlagen (${e.message}) – Albumversion ist schon drin.`)}
    }
    step("Albumversionen liken…");
    let likeOk=true;
    for(const part of albChunks(plan.likeUris,40)){
      try{await albApi("PUT",`/me/library?uris=${encodeURIComponent(part.join(","))}`);res.liked+=part.length}
      catch(e){likeOk=false;res.errors.push(`Liken fehlgeschlagen (${e.message})`);break}
    }
    if(likeOk){
      step("Singles entliken…");
      for(const part of albChunks(plan.unlikeUris,40)){
        try{await albApi("DELETE",`/me/library?uris=${encodeURIComponent(part.join(","))}`);res.unliked+=part.length}
        catch(e){res.errors.push(`Entliken fehlgeschlagen (${e.message})`);break}
      }
    }else if(plan.unlikeUris.length)res.errors.push("Singles bleiben gelikt, weil das Liken der Albumversionen nicht geklappt hat.");
  }catch(e){res.errors.push(e.message)}
  ALB.result={...res,plan};
  ALB.view="done";
  albRender();
}

// ---------- Ausführen Doppelte (W.2) ----------
// Je Playlist: betroffene Versionen entfernen, dann die bleibende Version an der ersten Stelle einfügen.
// Fehlt danach etwas (Einfügen fehlgeschlagen), steht der Song namentlich im Bericht.
async function albApplyDup(){
  const selected=ALB.scan.groups.filter(g=>ALB.dupSel.has(g.id)).map(g=>({...g,keep:ALB.dupKeep.get(g.id)||g.keep}));
  const plan=albDupPlan(ALB.scan.playlists,ALB.scan.liked,albDupMapping(selected));
  const names=new Map();
  for(const g of ALB.scan.groups)for(const v of g.versions)names.set(v.track.uri,v.track.name);
  const res={playlistsDone:0,removed:0,liked:0,unliked:0,errors:[]};
  Object.assign(ALB,{view:"apply",confirm:false});
  const step=txt=>{ALB.progress=txt;albRender()};
  try{
    for(let i=0;i<plan.playlistOps.length;i++){
      const op=plan.playlistOps[i];step(`Playlists bereinigen… ${i+1}/${plan.playlistOps.length}`);
      try{for(const part of albChunks(op.removes,100))await albApi("DELETE",`/playlists/${op.playlistId}/items`,{body:{items:part.map(uri=>({uri}))}})}
      catch(e){res.errors.push(`${op.name}: Entfernen fehlgeschlagen (${e.message}) – Playlist bitte prüfen.`);continue}
      const missing=[];
      for(const ins of op.inserts){
        try{await albApi("POST",`/playlists/${op.playlistId}/items`,{body:{uris:[ins.uri],position:ins.position}})}
        catch{missing.push(`«${names.get(ins.uri)||ins.uri}»`)}
      }
      if(missing.length)res.errors.push(`${op.name}: fehlt jetzt, bitte in Spotify wieder hinzufügen: ${missing.join(", ")}`);
      else{res.playlistsDone++;res.removed+=op.removedCount}
    }
    step("Gelikte Songs anpassen…");
    let likeOk=true;
    for(const part of albChunks(plan.likeUris,40)){
      try{await albApi("PUT",`/me/library?uris=${encodeURIComponent(part.join(","))}`);res.liked+=part.length}
      catch(e){likeOk=false;res.errors.push(`Liken fehlgeschlagen (${e.message})`);break}
    }
    if(likeOk){
      for(const part of albChunks(plan.unlikeUris,40)){
        try{await albApi("DELETE",`/me/library?uris=${encodeURIComponent(part.join(","))}`);res.unliked+=part.length}
        catch(e){res.errors.push(`Entliken fehlgeschlagen (${e.message})`);break}
      }
    }else if(plan.unlikeUris.length)res.errors.push("Andere Versionen bleiben gelikt, weil das Liken der bleibenden Version nicht geklappt hat.");
  }catch(e){res.errors.push(e.message)}
  ALB.result={...res,plan};
  ALB.view="done";
  albRender();
}

// ---------- Oberfläche ----------
function albCover(album){const img=(album?.images||[]).slice(-1)[0]?.url;return img?`<img class="alb-cover" src="${albEsc(img)}" alt="" loading="lazy">`:`<span class="alb-cover"></span>`}

function albPlaces(r){
  const names=[...new Set(r.places.map(p=>p.playlistName))];
  const parts=[];
  if(names.length)parts.push(`${names.length===1?"Playlist":`${names.length} Playlists`}: ${names.map(albEsc).join(", ")}`);
  if(r.liked)parts.push("gelikt");
  return parts.join(" · ");
}

function albRow(r,withBox){
  const t=r.track,d=r.decision,target=d.target;
  const box=withBox?`<input type="checkbox" class="alb-check" data-uri="${albEsc(t.uri)}" ${ALB.selected.has(t.uri)?"checked":""} aria-label="${albEsc(t.name)} ersetzen">`:"";
  const to=target?`<div class="alb-to">→ Album <b>${albEsc(target.album.name)}</b>${albYear(target.album)?` (${albEsc(albYear(target.album))})`:""}${target.track.name!==t.name?` · «${albEsc(target.track.name)}»`:""}${d.others.length?` <span class="muted">· auch auf ${d.others.map(o=>albEsc(o.album.name)).join(", ")}</span>`:""}</div>`:"";
  return `<label class="alb-row">${box}${albCover(target?.album||t.album)}<span class="alb-txt"><span class="alb-title">${albEsc(t.name)}</span><span class="muted">${(t.artists||[]).map(a=>albEsc(a.name)).join(", ")} · Single «${albEsc(t.album?.name)}»</span>${to}<span class="alb-where">${albPlaces(r)}</span></span></label>`;
}

// Liste nach Künstler und Album sortiert, mit Künstler-Überschrift (Wunsch des Nutzers)
function albList(rows,withBox){
  let last=null,html="";
  for(const r of albSortRows(rows)){
    const artist=albArtistName(r);
    if(artist!==last){html+=`<div class="alb-artist">${albEsc(artist||"Unbekannt")}</div>`;last=artist}
    html+=albRow(r,withBox);
  }
  return `<div class="alb-list">${html}</div>`;
}

// ---------- Oberfläche Doppelte (W.2) ----------
function albVersionLabel(t){
  const a=t.album||{},type=a.album_type==="single"?"Single":a.album_type==="compilation"?"Compilation":"Album";
  return `${type} <b>${albEsc(a.name)}</b>${albYear(a)?` (${albEsc(albYear(a))})`:""}`;
}

function albVersionPlaces(v){
  const count=new Map();
  for(const p of v.places)count.set(p.playlistName,(count.get(p.playlistName)||0)+1);
  const parts=[...count].map(([n,c])=>`${albEsc(n)}${c>1?` (${c}×)`:""}`);
  if(v.liked)parts.push("gelikt");
  return parts.join(" · ");
}

function albGroupCard(g,idx){
  const keep=ALB.dupKeep.get(g.id)||g.keep,saved=ALB.scan.savedAlbumIds;
  const kt=(g.versions.find(v=>v.track.uri===keep)||g.versions[0]).track;
  const versions=[...g.versions].sort((x,y)=>albVersionRank(x,saved)-albVersionRank(y,saved));
  const multi=g.versions.length>1;
  const rows=versions.map(v=>{
    const t=v.track,isSaved=t.album?.album_type!=="single"&&saved.has(t.album?.id);
    return `<label class="alb-ver${t.uri===keep?" keep":""}"><input type="radio" class="alb-keep" name="albKeep${idx}" data-g="${albEsc(g.id)}" value="${albEsc(t.uri)}" ${t.uri===keep?"checked":""}>${albCover(t.album)}<span class="alb-txt"><span>${albVersionLabel(t)}${isSaved?` <span class="chip ok">gespeichert</span>`:""}</span>${t.name!==kt.name?`<span class="muted">«${albEsc(t.name)}»</span>`:""}<span class="alb-where">${albVersionPlaces(v)}</span></span></label>`;
  }).join("");
  return `<div class="alb-group"><label class="alb-ghead"><input type="checkbox" class="alb-gcheck" data-g="${albEsc(g.id)}" ${ALB.dupSel.has(g.id)?"checked":""} aria-label="${albEsc(kt.name)} bereinigen"><span class="alb-txt"><span class="alb-title">${albEsc(kt.name)}</span><span class="muted">${(kt.artists||[]).map(a=>albEsc(a.name)).join(", ")} · ${multi?`${g.versions.length} Versionen`:"mehrfach in einer Playlist"}</span></span></label><div class="alb-vers">${rows}</div></div>`;
}

// Gruppen nach Künstler und Album der bleibenden Version sortiert, mit Künstler-Überschrift
function albGroupList(groups){
  const rows=groups.map(g=>({group:g,track:(g.versions.find(v=>v.track.uri===(ALB.dupKeep.get(g.id)||g.keep))||g.versions[0]).track}));
  let last=null,html="";
  for(const r of albSortRows(rows)){
    const artist=albArtistName(r);
    if(artist!==last){html+=`<div class="alb-artist">${albEsc(artist||"Unbekannt")}</div>`;last=artist}
    html+=albGroupCard(r.group,ALB.scan.groups.indexOf(r.group));
  }
  return `<div class="alb-list">${html}</div>`;
}

function albRenderDupReview(head,err){
  const sc=ALB.scan,sure=sc.groups.filter(g=>g.kind==="sure"),unsure=sc.groups.filter(g=>g.kind==="unsure");
  const n=ALB.dupSel.size;
  const confirm=ALB.confirm?`<div class="notice"><b>${n} Song${n===1?"":"s"} bereinigen?</b> Danach steht pro Song nur noch die gewählte Version in deinen Playlists, an der Stelle des ersten Vorkommens. Verschobene oder ersetzte Songs verlieren ihr «Hinzugefügt am»; neu gelikte Versionen erscheinen bei den gelikten Songs zuoberst.</div><button class="btn primary" id="albApplyDup">Ja, bereinigen</button><button class="btn ghost" id="albCancel">Abbrechen</button>`:`<button class="btn primary" id="albAsk" ${n?"":"disabled"}>Ausgewählte bereinigen (${n})</button>`;
  return `<section class="card stack">${head}<p class="muted">Testlauf fertig – noch nichts geändert${ALB.filter?` · nur «${albEsc(ALB.filter)}»`:""}. Pro Song wählst du die Version, die bleibt.</p>
    <div class="alb-chips"><span class="chip ok">${sure.length} sicher</span><span class="chip">${unsure.length} unsicher</span></div>
    ${sure.length?`<h3>Gleiche Aufnahme</h3><p class="muted">Derselbe Song mehrfach in einer Playlist oder als Single, Album- und Deluxe-Version verteilt.</p>${albGroupList(sure)}`:`<div class="notice">Keine doppelten Aufnahmen gefunden.</div>`}
    ${unsure.length?`<h3>Unsicher – andere Versionen</h3><p class="muted">Gleicher Titel und Künstler, aber andere Aufnahmen (Live, Remaster, Radio Edit, Remix). Nur anhaken, wenn du wirklich nur eine Version willst – dann ersetzt sie alle anderen.</p>${albGroupList(unsure)}`:""}
    ${sc.skipped.length?`<details><summary>Nicht lesbare Playlists (${sc.skipped.length})</summary><p class="muted">${sc.skipped.map(albEsc).join("<br>")}</p></details>`:""}
    ${err}${confirm}<button class="btn ghost" id="albBack">Zurück</button></section>`;
}

function albRender(){
  const app=document.getElementById("app");if(!app)return;
  const err=ALB.error?`<div class="notice error">${albEsc(ALB.error)}</div>`:"";
  const head=`<div class="eyebrow">WERKZEUG · KEIN TEIL DES SPIELS</div><h2>${ALB.mode==="dup"&&ALB.view!=="start"?"Doppelte entfernen":"Alben-Fix"}</h2>`;
  if(ALB.view==="start"&&!ALB.me){
    app.innerHTML=`<section class="card stack">${head}<p class="muted">Räumt deine Spotify-Bibliothek auf: Singles durch die Version aus deinem gespeicherten Album ersetzen und doppelte Songs entfernen. Zuerst kommt immer ein Testlauf, geändert wird erst nach deiner Bestätigung.</p>${err}<button class="btn primary" id="albLogin">Mit Spotify anmelden</button></section>`;
  }else if(ALB.view==="start"){
    app.innerHTML=`<section class="card stack">${head}<p class="muted">Angemeldet als <b>${albEsc(ALB.me.display_name||ALB.me.id)}</b>.</p>${err}<div><label for="albFilter">Nur bestimmtes Album oder Künstler (optional)</label><input id="albFilter" value="${albEsc(ALB.filter)}" placeholder="z. B. D-TEC – leer = alles" autocomplete="off"></div>
      <div class="alb-mode stack"><h3>Albumversion statt Single</h3><p class="muted">Singles werden durch die Version aus deinem gespeicherten Album ersetzt, die Albumversion gelikt.</p><button class="btn primary" id="albScan">Testlauf Alben-Fix</button></div>
      <div class="alb-mode stack"><h3>Doppelte entfernen</h3><p class="muted">Gleicher Song mehrfach in einer Playlist oder in verschiedenen Versionen über Playlists und Likes verteilt. Du wählst pro Song, welche Version bleibt.</p><button class="btn primary" id="albScanDup">Testlauf Doppelte</button></div>
      <button class="btn ghost" id="albLogout">Abmelden</button></section>`;
  }else if(ALB.view==="scan"||ALB.view==="apply"){
    app.innerHTML=`<section class="card stack">${head}<p class="alb-progress">${albEsc(ALB.progress)}</p><p class="muted">Seite bitte offen lassen.</p></section>`;
  }else if(ALB.view==="review"&&ALB.mode==="dup"){
    app.innerHTML=albRenderDupReview(head,err);
  }else if(ALB.view==="done"&&ALB.mode==="dup"){
    const r=ALB.result,ok=!r.errors.length;
    app.innerHTML=`<section class="card stack">${head}<div class="notice ${ok?"success":"error"}">${ok?"Fertig.":"Fertig, aber nicht alles hat geklappt."}</div>
      <ul class="alb-sum"><li>${r.playlistsDone} Playlist${r.playlistsDone===1?"":"s"} bereinigt</li><li>${r.removed} doppelte Einträge entfernt</li><li>${r.liked} Version${r.liked===1?"":"en"} gelikt, ${r.unliked} entlikt</li></ul>
      ${r.errors.length?`<div class="notice error">${r.errors.map(albEsc).join("<br>")}</div>${r.errors.some(e=>/403/.test(e))?`<p class="muted">403 heisst: Spotify erlaubt dieser App das Ändern gerade nicht (Einschränkung im Entwicklungsmodus).</p>`:""}`:""}
      <button class="btn primary" id="albAgain">Nochmals prüfen</button><button class="btn ghost" id="albLogout">Abmelden</button></section>`;
  }else if(ALB.view==="review"){
    const sc=ALB.scan,sure=sc.rows.filter(r=>r.decision.status==="sure"),unsure=sc.rows.filter(r=>r.decision.status==="unsure"),none=sc.rows.filter(r=>r.decision.status==="none");
    const n=ALB.selected.size;
    const filterNote=ALB.filter?` · nur Alben mit «${albEsc(ALB.filter)}» (${sc.albumCount})`:` · ${sc.albumCount} gespeicherte Alben`;
    const confirm=ALB.confirm?`<div class="notice"><b>${n} Song${n===1?"":"s"} ersetzen?</b> In den Playlists geht dabei das «Hinzugefügt am»-Datum dieser Songs verloren, die Albumversionen erscheinen bei den gelikten Songs zuoberst.</div><button class="btn primary" id="albApply">Ja, ersetzen</button><button class="btn ghost" id="albCancel">Abbrechen</button>`:`<button class="btn primary" id="albAsk" ${n?"":"disabled"}>Ausgewählte ersetzen (${n})</button>`;
    app.innerHTML=`<section class="card stack">${head}<p class="muted">Testlauf fertig – noch nichts geändert${filterNote}.</p>
      <div class="alb-chips"><span class="chip ok">${sure.length} sicher</span><span class="chip">${unsure.length} unsicher</span><span class="chip">${none.length} ohne gespeichertes Album</span></div>
      ${sure.length?`<h3>Albumversion gefunden</h3><p class="muted">Gleiche Aufnahme wie die Single.</p>${albList(sure,true)}`:`<div class="notice">Keine Single gefunden, deren Aufnahme auf einem deiner gespeicherten Alben liegt.</div>`}
      ${unsure.length?`<h3>Unsicher – bitte prüfen</h3><p class="muted">Gleicher Titel, aber eine andere Aufnahme (z. B. Radio Edit, Remix, neue Abmischung). Nur anhaken, wenn du die Albumversion willst.</p>${albList(unsure,true)}`:""}
      ${none.length?`<details><summary>Bleiben, wie sie sind (${none.length})</summary>${albList(none,false)}</details>`:""}
      ${sc.skipped.length?`<details><summary>Nicht lesbare Playlists (${sc.skipped.length})</summary><p class="muted">${sc.skipped.map(albEsc).join("<br>")}</p></details>`:""}
      ${err}${confirm}<button class="btn ghost" id="albBack">Zurück</button></section>`;
  }else if(ALB.view==="done"){
    const r=ALB.result,ok=!r.errors.length;
    app.innerHTML=`<section class="card stack">${head}<div class="notice ${ok?"success":"error"}">${ok?"Fertig.":"Fertig, aber nicht alles hat geklappt."}</div>
      <ul class="alb-sum"><li>${r.replaced} Single${r.replaced===1?"":"s"} in ${r.playlistsDone} Playlist${r.playlistsDone===1?"":"s"} ersetzt</li><li>${r.liked} Albumversion${r.liked===1?"":"en"} gelikt</li><li>${r.unliked} Single${r.unliked===1?"":"s"} entlikt</li></ul>
      ${r.errors.length?`<div class="notice error">${r.errors.map(albEsc).join("<br>")}</div>${r.errors.some(e=>/403/.test(e))?`<p class="muted">403 heisst: Spotify erlaubt dieser App das Ändern gerade nicht (Einschränkung im Entwicklungsmodus).</p>`:""}`:""}
      <button class="btn primary" id="albAgain">Nochmals prüfen</button><button class="btn ghost" id="albLogout">Abmelden</button></section>`;
  }
  albBind();
}

function albBind(){
  const on=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn};
  on("albLogin",albLogin);
  on("albLogout",albLogout);
  on("albScan",albScan);
  on("albScanDup",albScanDup);
  on("albApplyDup",albApplyDup);
  on("albAsk",()=>{ALB.confirm=true;albRender()});
  on("albCancel",()=>{ALB.confirm=false;albRender()});
  on("albApply",albApply);
  on("albBack",()=>{Object.assign(ALB,{view:"start",confirm:false});albRender()});
  on("albAgain",()=>{Object.assign(ALB,{view:"start",result:null});albRender()});
  const filter=document.getElementById("albFilter");
  if(filter){filter.oninput=()=>{ALB.filter=filter.value};filter.onkeydown=e=>{if(e.key==="Enter")albScan()}}
  for(const box of document.querySelectorAll(".alb-gcheck"))box.onchange=()=>{if(box.checked)ALB.dupSel.add(box.dataset.g);else ALB.dupSel.delete(box.dataset.g);ALB.confirm=false;albRender()};
  for(const r of document.querySelectorAll(".alb-keep"))r.onchange=()=>{ALB.dupKeep.set(r.dataset.g,r.value);ALB.dupSel.add(r.dataset.g);ALB.confirm=false;albRender()};
  for(const box of document.querySelectorAll(".alb-check"))box.onchange=()=>{if(box.checked)ALB.selected.add(box.dataset.uri);else ALB.selected.delete(box.dataset.uri);ALB.confirm=false;albRender()};
}

async function albInit(){
  document.title="Alben-Fix · Music Battle";
  const home=document.getElementById("brandHome");if(home)home.onclick=()=>{location.href=location.pathname};
  await albCallback();
  if(await albToken()){
    try{ALB.me=await albApi("GET","/me")}
    catch(e){ALB.error=`Spotify-Profil konnte nicht geladen werden (${e.message}).`}
  }
  albRender();
}

albInit();
