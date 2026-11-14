/* rad.js – Albumrad (Roadmap W.4): eigene Seite ?tool=rad, kein Teil des Spiels.
   Zeigt die gespeicherten Spotify-Alben als Cover-Rad, das sich beim Scrollen/Ziehen dreht.
   Nutzt nur die Spotify-App von Music Battle (gleiche Client-ID und Redirect-URI wie js/config.js) –
   keine Spiel-Skripte, keine Funktionen aus tools/alben*.js. Logik in tools/rad-logic.js. */

// Gleiche öffentliche Client-ID wie SPOTIFY_CLIENT_ID in js/config.js
const RAD_CLIENT_ID="173f861652ae4b668769c76f0adab3a1";
const RAD_AUTH="https://accounts.spotify.com/authorize",RAD_TOKEN="https://accounts.spotify.com/api/token",RAD_API="https://api.spotify.com/v1";
// „zuletzt gehört“ wird erst ab W.9 gebraucht – schon jetzt angefragt, damit später keine zweite Anmeldung nötig ist
const RAD_SCOPES="user-library-read user-read-recently-played";
const RAD_KEYS={state:"mb_rad_state",verifier:"mb_rad_pkce",access:"mb_rad_access",expires:"mb_rad_expires",refresh:"mb_rad_refresh",albums:"mb_rad_albums"};
const RAD_CACHE_MS=60*60*1000; // Albumliste höchstens 1 Stunde aus dem Zwischenspeicher
const RAD_FOCUS_DEG=20;        // vorne = rechts, leicht unten

// view: init | login | loading | wheel · pos = Stand des Rads (Kommazahl), to = Ziel · open = Info in der Mitte sichtbar
const RAD={view:"init",albums:[],error:"",progress:"",pos:0,to:0,open:false,ring:null,els:new Map(),raf:0,drag:null,snapTimer:0};

function radEsc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function radGet(store,k){try{return store.getItem(k)}catch{return null}}
function radSet(store,k,v){try{store.setItem(k,v)}catch{}}
function radDel(store,k){try{store.removeItem(k)}catch{}}
function radRedirect(){return `${location.origin}${location.pathname}`}
function radToolUrl(){return `${location.pathname}?tool=rad`}
function radCalm(){try{return matchMedia("(prefers-reduced-motion:reduce)").matches}catch{return false}}

// ---------- Anmeldung (PKCE) ----------
function radRandom(n){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";return [...crypto.getRandomValues(new Uint8Array(n))].map(x=>c[x%c.length]).join("")}
async function radChallenge(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}

async function radLogin(){
  const v=radRandom(64),st="rad-"+radRandom(24);
  radSet(sessionStorage,RAD_KEYS.verifier,v);radSet(sessionStorage,RAD_KEYS.state,st);
  const p=new URLSearchParams({response_type:"code",client_id:RAD_CLIENT_ID,scope:RAD_SCOPES,code_challenge_method:"S256",code_challenge:await radChallenge(v),redirect_uri:radRedirect(),state:st});
  location.href=`${RAD_AUTH}?${p}`;
}

async function radCallback(){
  const q=new URLSearchParams(location.search);
  if(!q.get("state"))return;
  const ok=q.get("state")===radGet(sessionStorage,RAD_KEYS.state),v=radGet(sessionStorage,RAD_KEYS.verifier);
  radDel(sessionStorage,RAD_KEYS.state);radDel(sessionStorage,RAD_KEYS.verifier);
  history.replaceState({},"",radToolUrl());
  if(q.get("error")){RAD.error=q.get("error")==="access_denied"?"Anmeldung abgebrochen.":`Spotify-Anmeldung fehlgeschlagen (${q.get("error")}).`;return}
  if(!ok||!v||!q.get("code")){RAD.error="Anmeldung ungültig. Bitte nochmals verbinden.";return}
  const r=await fetch(RAD_TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:RAD_CLIENT_ID,grant_type:"authorization_code",code:q.get("code"),redirect_uri:radRedirect(),code_verifier:v})});
  if(!r.ok){RAD.error=`Spotify-Anmeldung konnte nicht abgeschlossen werden (${r.status}).`;return}
  radStoreToken(await r.json());
}

function radStoreToken(t){
  radSet(sessionStorage,RAD_KEYS.access,t.access_token);
  radSet(sessionStorage,RAD_KEYS.expires,String(Date.now()+((t.expires_in||3600)-60)*1000));
  if(t.refresh_token)radSet(localStorage,RAD_KEYS.refresh,t.refresh_token);
}

async function radToken(){
  const access=radGet(sessionStorage,RAD_KEYS.access),exp=Number(radGet(sessionStorage,RAD_KEYS.expires)||0);
  if(access&&Date.now()<exp)return access;
  const refresh=radGet(localStorage,RAD_KEYS.refresh);
  if(!refresh)return "";
  const r=await fetch(RAD_TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh,client_id:RAD_CLIENT_ID})});
  if(!r.ok){radDel(localStorage,RAD_KEYS.refresh);return ""}
  radStoreToken(await r.json());
  return radGet(sessionStorage,RAD_KEYS.access)||"";
}

function radForget(){for(const k of [RAD_KEYS.access,RAD_KEYS.expires])radDel(sessionStorage,k);radDel(localStorage,RAD_KEYS.refresh);radDel(localStorage,RAD_KEYS.albums)}
function radLogout(){radForget();Object.assign(RAD,{view:"login",albums:[],error:"",open:false,pos:0,to:0});radRender()}

// ---------- Spotify lesen ----------
const radSleep=ms=>new Promise(r=>setTimeout(r,ms));

async function radApi(path,attempt=0){
  const t=await radToken();
  if(!t){const e=Error("Nicht mit Spotify verbunden.");e.status=401;throw e}
  const r=await fetch(path.startsWith("http")?path:RAD_API+path,{headers:{Authorization:`Bearer ${t}`}});
  if(r.status===429){
    const wait=radBackoffSeconds(attempt,r.headers.get("Retry-After"));
    if(wait===null)throw Error("Spotify lässt gerade keine weiteren Anfragen zu. Bitte später nochmals versuchen.");
    for(let s=wait;s>0;s--){RAD.progress=`Spotify bremst – nächster Versuch in ${s} s`;radStatus();await radSleep(1000)}
    return radApi(path,attempt+1);
  }
  if(!r.ok){const e=Error(r.status===401?"Die Spotify-Anmeldung ist abgelaufen.":r.status===403?"Spotify erlaubt den Zugriff auf die gespeicherten Alben nicht.":`Spotify antwortet mit Fehler ${r.status}.`);e.status=r.status;throw e}
  return r.json();
}

async function radFetchAlbums(){
  const raw=[];let next="/me/albums?limit=50";
  while(next){
    const page=await radApi(next);
    raw.push(...(page?.items||[]));
    RAD.progress=`Alben laden… ${raw.length}${page?.total?` von ${page.total}`:""}`;radStatus();
    next=page?.next||null;
  }
  return radAlbums(raw);
}

function radReadCache(){
  try{const c=JSON.parse(radGet(localStorage,RAD_KEYS.albums)||"null");return c&&Array.isArray(c.items)?c:null}catch{return null}
}

// Albumliste holen: frischer Zwischenspeicher reicht; sonst von Spotify (ein alter Stand bleibt dabei schon sichtbar)
async function radLoad(force=false){
  const cache=radReadCache();
  if(cache?.items.length){RAD.albums=cache.items;RAD.view="wheel"}
  if(!force&&cache&&Date.now()-cache.at<RAD_CACHE_MS){radRender();return}
  if(RAD.view!=="wheel"){RAD.view="loading";RAD.progress="Alben laden…"}
  RAD.error="";radRender();
  try{
    const items=await radFetchAlbums();
    const frontId=RAD.albums[radFocusIndex(RAD.to,RAD.albums.length)]?.id;
    radSet(localStorage,RAD_KEYS.albums,JSON.stringify({at:Date.now(),items}));
    RAD.albums=items;RAD.view="wheel";RAD.progress="";
    // Das Album, das vorne stand, bleibt vorne – auch wenn neue dazugekommen sind
    const keep=frontId?items.findIndex(a=>a.id===frontId):-1;
    RAD.pos=RAD.to=keep>=0?keep:0;
  }catch(e){
    RAD.progress="";
    if(e.status===401){radForget();RAD.albums=[];RAD.view="login";RAD.error=e.message}
    else{RAD.error=e.message||String(e);if(RAD.view!=="wheel")RAD.view="login"}
  }
  radRender();
}

// ---------- Rad zeichnen ----------
function radStage(){return document.getElementById("radStage")}

function radMeasure(){
  const st=radStage();if(!st)return;
  RAD.ring=radRing(st.clientWidth,st.clientHeight,RAD.albums.length);
  st.style.setProperty("--rad-size",`${RAD.ring.size}px`);
  const info=document.getElementById("radInfo");
  // Titel in der Mitte: so schmal, dass er das vordere (grösste) Cover nicht berührt
  if(info)info.style.maxWidth=`${Math.round(Math.max(120,Math.min(420,2*(RAD.ring.rx*Math.cos(RAD_FOCUS_DEG*Math.PI/180)-RAD.ring.size*RAD_MAX_SCALE/2)-16)))}px`;
}

// Cover an ihre Plätze setzen. Elemente bleiben erhalten, solange ihr Album auf dem Rad ist (keine Bilder neu laden).
function radDraw(){
  const ringEl=document.getElementById("radRing");
  if(!ringEl||!RAD.ring)return;
  const layout=radLayout({pos:RAD.pos,count:RAD.albums.length,slots:RAD.ring.slots,rx:RAD.ring.rx,ry:RAD.ring.ry,focusDeg:RAD_FOCUS_DEG});
  const live=new Set();
  for(const p of layout){
    live.add(p.key);
    let el=RAD.els.get(p.key);
    if(!el){
      const a=RAD.albums[p.index];
      el=document.createElement("div");el.className="rad-item";el.dataset.key=String(p.key);
      const img=document.createElement("img");
      img.alt="";img.draggable=false;img.decoding="async";
      img.src=RAD.ring.size*RAD_MAX_SCALE*(window.devicePixelRatio||1)>64?a.cover:a.coverSmall;
      el.appendChild(img);ringEl.appendChild(el);RAD.els.set(p.key,el);
    }
    el.style.transform=`translate(-50%,-50%) translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) rotate(${p.tilt.toFixed(2)}deg) scale(${p.scale.toFixed(3)})`;
    el.style.opacity=p.opacity.toFixed(2);
    el.style.zIndex=String(p.z);
    el.classList.toggle("front",Math.abs(p.d)<0.5);
  }
  for(const [key,el] of RAD.els)if(!live.has(key)){el.remove();RAD.els.delete(key)}
  radInfo();
}

// Mitte: Titel des vorderen Albums – nur nach Tippen (sonst bleibt der Bildschirm ohne Text)
function radInfo(){
  const info=document.getElementById("radInfo"),say=document.getElementById("radSay");
  const a=RAD.albums[radFocusIndex(RAD.pos,RAD.albums.length)];
  if(!info||!a)return;
  if(info.dataset.id!==a.id){
    info.dataset.id=a.id;
    info.innerHTML=`<div class="rad-title">${radEsc(a.name)}</div><div class="rad-sub">${radEsc(a.artists.join(", "))}${a.year?` · ${radEsc(a.year)}`:""}</div><a class="rad-open" href="${radEsc(a.url)}" target="_blank" rel="noopener">In Spotify öffnen</a>`;
  }
  info.hidden=!RAD.open;
  // Für Screenreader: vorderes Album ansagen, sobald das Rad steht
  if(say&&!RAD.raf&&say.dataset.id!==a.id){say.dataset.id=a.id;say.textContent=`${a.name} – ${a.artists.join(", ")}`}
}

function radTick(){
  RAD.raf=0;
  if(!RAD.drag){
    const diff=RAD.to-RAD.pos;
    if(Math.abs(diff)<0.002||radCalm())RAD.pos=RAD.to;
    else RAD.pos+=diff*0.16;
  }
  if(RAD.drag||RAD.pos!==RAD.to)RAD.raf=requestAnimationFrame(radTick);
  radDraw();
}
function radKick(){if(!RAD.raf)RAD.raf=requestAnimationFrame(radTick)}
function radTurnTo(target){RAD.to=target;radKick()}
// Nach dem Scrollen auf dem nächsten Album einrasten
function radSnapSoon(){clearTimeout(RAD.snapTimer);RAD.snapTimer=setTimeout(()=>radTurnTo(Math.round(RAD.to)),140)}

// ---------- Bedienung ----------
function radOnWheel(e){
  if(RAD.view!=="wheel"||!RAD.ring)return;
  e.preventDefault();
  const px=(Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX)*(e.deltaMode===1?32:e.deltaMode===2?RAD.ring.stepPx*3:1);
  // Höchstens ein Album pro Scroll-Schritt, damit auch Mausräder mit grossen Schritten ruhig drehen
  RAD.to+=Math.max(-1,Math.min(1,px/RAD.ring.stepPx));
  radKick();radSnapSoon();
}

function radOnDown(e){
  if(RAD.view!=="wheel"||!RAD.ring||e.button>0)return;
  if(e.target.closest("a,button,summary,details"))return;
  clearTimeout(RAD.snapTimer);
  RAD.drag={id:e.pointerId,y:e.clientY,x:e.clientX,pos:RAD.pos,moved:false,lastY:e.clientY,lastT:e.timeStamp,v:0,item:e.target.closest(".rad-item")};
}
function radOnMove(e){
  const d=RAD.drag;if(!d||e.pointerId!==d.id)return;
  const dy=e.clientY-d.y;
  if(!d.moved){
    if(Math.abs(dy)<6&&Math.abs(e.clientX-d.x)<6)return;
    d.moved=true;try{radStage().setPointerCapture(d.id)}catch{}
  }
  // Nach oben ziehen = nächstes Album kommt nach vorne
  RAD.pos=d.pos-dy/RAD.ring.stepPx;
  const dt=e.timeStamp-d.lastT;
  if(dt>0){d.v=0.7*d.v+0.3*((e.clientY-d.lastY)/dt);d.lastY=e.clientY;d.lastT=e.timeStamp}
  radKick();
}
function radOnUp(e){
  const d=RAD.drag;if(!d||e.pointerId!==d.id)return;
  RAD.drag=null;
  if(d.moved){
    // Schwung mitnehmen (ausser bei „Bewegung reduzieren“), dann einrasten
    const throwBy=radCalm()||e.type==="pointercancel"?0:Math.max(-6,Math.min(6,-d.v*180/RAD.ring.stepPx));
    radTurnTo(Math.round(RAD.pos+throwBy));
    return;
  }
  if(e.type==="pointercancel")return;
  // Tippen: Cover vorne → Titel zeigen/verbergen · anderes Cover → nach vorne drehen · daneben → Titel weg
  const key=d.item?Number(d.item.dataset.key):null;
  if(key===null){RAD.open=false;radDraw();return}
  const p=radLayout({pos:RAD.pos,count:RAD.albums.length,slots:RAD.ring.slots,rx:RAD.ring.rx,ry:RAD.ring.ry,focusDeg:RAD_FOCUS_DEG}).find(x=>x.key===key);
  if(!p)return;
  if(Math.abs(p.d)<0.5){RAD.open=!RAD.open;radDraw()}
  else radTurnTo(Math.round(RAD.pos+p.d));
}

function radOnKey(e){
  if(RAD.view!=="wheel"||e.target.closest("a,button,summary"))return;
  if(e.key==="ArrowDown"||e.key==="ArrowRight"){e.preventDefault();radTurnTo(Math.round(RAD.to)+1)}
  else if(e.key==="ArrowUp"||e.key==="ArrowLeft"){e.preventDefault();radTurnTo(Math.round(RAD.to)-1)}
  else if(e.key==="Enter"||e.key===" "){e.preventDefault();RAD.open=!RAD.open;radDraw()}
  else if(e.key==="Escape"&&RAD.open){RAD.open=false;radDraw()}
}

// ---------- Bildschirme ----------
function radStatus(){const el=document.getElementById("radStatus");if(el)el.textContent=RAD.error||RAD.progress||""}

function radRender(){
  const app=document.getElementById("app");
  cancelAnimationFrame(RAD.raf);RAD.raf=0;RAD.els.clear();RAD.drag=null;
  if(RAD.view==="init"||RAD.view==="loading"){
    app.innerHTML=`<div class="rad-center"><p class="rad-note" id="radStatus" role="status">${radEsc(RAD.progress||"Verbinde mit Spotify…")}</p></div>`;
    return;
  }
  if(RAD.view==="login"){
    app.innerHTML=`<div class="rad-center"><h1 class="rad-h">Albumrad</h1><p class="rad-note">Deine gespeicherten Alben als Rad zum Durchdrehen.</p>${RAD.error?`<p class="rad-note rad-err" role="alert">${radEsc(RAD.error)}</p>`:""}<button class="rad-btn" id="radLogin" type="button">Mit Spotify verbinden</button></div>`;
    document.getElementById("radLogin").addEventListener("click",radLogin);
    return;
  }
  if(!RAD.albums.length){
    app.innerHTML=`<div class="rad-center"><p class="rad-note">Du hast noch keine Alben in Spotify gespeichert.</p><button class="rad-btn" id="radReload" type="button">Neu laden</button><button class="rad-link" id="radLogout" type="button">Abmelden</button></div>`;
  }else{
    app.innerHTML=`<div class="rad-stage" id="radStage" tabindex="0" role="group" aria-label="Albumrad mit ${RAD.albums.length} Alben. Pfeiltasten drehen das Rad, Eingabetaste zeigt den Titel.">
      <div class="rad-ring" id="radRing"></div>
      <div class="rad-info" id="radInfo" hidden></div>
      <p class="rad-status" id="radStatus" role="status">${radEsc(RAD.error||RAD.progress)}</p>
      <p class="rad-sr" id="radSay" aria-live="polite"></p>
    </div>
    <details class="rad-menu"><summary aria-label="Menü">⋯</summary><div class="rad-menu-box"><button class="rad-link" id="radReload" type="button">Alben neu laden</button><button class="rad-link" id="radLogout" type="button">Abmelden</button></div></details>`;
    const st=radStage();
    st.addEventListener("wheel",radOnWheel,{passive:false});
    st.addEventListener("pointerdown",radOnDown);
    st.addEventListener("pointermove",radOnMove);
    st.addEventListener("pointerup",radOnUp);
    st.addEventListener("pointercancel",radOnUp);
    radMeasure();radDraw();
  }
  document.getElementById("radReload").addEventListener("click",()=>radLoad(true));
  document.getElementById("radLogout").addEventListener("click",radLogout);
}

async function radInit(){
  document.documentElement.classList.add("rad");
  document.title="Albumrad";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content","#ffffff");
  radRender();
  window.addEventListener("resize",()=>{if(RAD.view==="wheel"&&radStage()){radMeasure();radDraw()}});
  window.addEventListener("keydown",radOnKey);
  try{await radCallback()}catch(e){RAD.error="Spotify-Anmeldung konnte nicht abgeschlossen werden. Bitte nochmals verbinden."}
  if(!(await radToken().catch(()=>""))){
    RAD.view="login";radRender();return;
  }
  await radLoad();
}

radInit();
