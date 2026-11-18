/* rad.js – Albumrad (Roadmap W.4): eigene Seite ?tool=rad, kein Teil des Spiels.
   Zeigt die gespeicherten Spotify-Alben als Cover-Rad, das sich beim Scrollen/Ziehen dreht.
   Nutzt nur die Spotify-App von Music Battle (gleiche Client-ID und Redirect-URI wie js/config.js) –
   keine Spiel-Skripte, keine Funktionen aus tools/alben*.js. Logik in tools/rad-logic.js. */

// Gleiche öffentliche Client-ID wie SPOTIFY_CLIENT_ID in js/config.js
const RAD_CLIENT_ID="173f861652ae4b668769c76f0adab3a1";
const RAD_AUTH="https://accounts.spotify.com/authorize",RAD_TOKEN="https://accounts.spotify.com/api/token",RAD_API="https://api.spotify.com/v1";
// „zuletzt gehört“ wird erst ab W.9 gebraucht – schon jetzt angefragt, damit später keine zweite Anmeldung nötig ist
const RAD_SCOPES="user-library-read user-read-recently-played";
const RAD_KEYS={state:"mb_rad_state",verifier:"mb_rad_pkce",access:"mb_rad_access",expires:"mb_rad_expires",refresh:"mb_rad_refresh",albums:"mb_rad_albums",colors:"mb_rad_colors_v1",sort:"mb_rad_sort"};
const RAD_CACHE_MS=60*60*1000; // Albumliste höchstens 1 Stunde aus dem Zwischenspeicher
const RAD_FOCUS_DEG=20;        // vorne = rechts, leicht unten
const RAD_TOP=48;              // Platz oben für die Rad-Punkte (gleicher Wert wie --rad-top in rad.css)
const RAD_PICK=1.25;           // vorderes Cover im Stillstand so viel grösser (gleicher Wert wie .rad-item.picked in rad.css)
const RAD_BOTTOM=76;           // Platz unten für den Vorschlag-Knopf (gleicher Wert wie --rad-bottom in rad.css)
// Protokoll (W.5): Edge Function mb-rad im Supabase-Projekt des Spiels; sie prüft das Spotify-Token selbst
const RAD_FN="https://swgraidbdxpjqnvxacpq.supabase.co/functions/v1/mb-rad";
const RAD_STATE_ERR="Protokoll konnte nicht geladen werden – Zähler fehlen.";

// view: init | login | loading | wheel · pos = Stand des Rads (Kommazahl), to = Ziel · open = Info in der Mitte sichtbar
// counts = Zähler je Album (null, solange nicht geladen) · events = letzte Protokoll-Einträge
// suggested = Album-ID des laufenden Vorschlags · skipped = in dieser Sitzung abgelehnt · sheet = offenes Blatt ("protocol" | "often" | false)
const RAD={view:"init",albums:[],error:"",progress:"",pos:0,to:0,open:false,ring:null,els:new Map(),raf:0,drag:null,snapTimer:0,counts:null,events:[],suggested:"",skipped:new Set(),sheet:false,
  // Farb-Räder (W.7): all = alle Alben, albums = Alben des gezeigten Rads (wheel) · colors = berechnete Farbgruppe je Album
  // (auf dem Gerät gemerkt) · moves = von Hand gewähltes Rad je Album (Datenbank) · posBy = Stand je Rad
  // Leiste (W.10): sort = Reihenfolge im Rad (auf dem Gerät gemerkt) · bar = Leiste oben aufgeklappt
  all:[],wheel:"all",colors:{},moves:{},posBy:{},colorRun:false,sort:"added",bar:false};

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
function radLogout(){radForget();Object.assign(RAD,{view:"login",albums:[],error:"",open:false,pos:0,to:0,counts:null,events:[],suggested:"",skipped:new Set(),sheet:false,all:[],wheel:"all",moves:{},posBy:{}});radRender()}

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
  if(cache?.items.length){RAD.all=cache.items;radPick();RAD.view="wheel";radReadColors()}
  if(RAD.view==="wheel"&&!RAD.counts)radLoadState();
  if(!force&&cache&&Date.now()-cache.at<RAD_CACHE_MS){radRender();return}
  if(RAD.view!=="wheel"){RAD.view="loading";RAD.progress="Alben laden…"}
  RAD.error="";radRender();
  try{
    const items=await radFetchAlbums();
    const frontId=RAD.albums[radFocusIndex(RAD.to,RAD.albums.length)]?.id;
    radSet(localStorage,RAD_KEYS.albums,JSON.stringify({at:Date.now(),items}));
    RAD.all=items;radPick();RAD.view="wheel";RAD.progress="";
    // Das Album, das vorne stand, bleibt vorne – auch wenn neue dazugekommen sind
    const keep=frontId?RAD.albums.findIndex(a=>a.id===frontId):-1;
    RAD.pos=RAD.to=keep>=0?keep:0;
    radReadColors();
    if(!RAD.counts||force)radLoadState();
  }catch(e){
    RAD.progress="";
    if(e.status===401){radForget();RAD.all=RAD.albums=[];RAD.view="login";RAD.error=e.message}
    else{RAD.error=e.message||String(e);if(RAD.view!=="wheel")RAD.view="login"}
  }
  radRender();
}

// ---------- Protokoll: gehört / abgelehnt (W.5) ----------
async function radFn(body,keepalive=false){
  const t=await radToken();
  if(!t)throw Error("Nicht mit Spotify verbunden.");
  const r=await fetch(RAD_FN,{method:"POST",keepalive,headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,spotify_token:t})});
  const data=await r.json().catch(()=>null);
  if(!r.ok||!data?.ok)throw Error(r.status===429?"Zu viele Einträge in kurzer Zeit. Bitte später nochmals.":"Der Speicher ist gerade nicht erreichbar.");
  return data;
}

async function radLoadState(){
  try{
    const d=await radFn({action:"state"});
    RAD.counts=radCountsMap(d.counts);RAD.events=d.events||[];radOftenMenu();
    RAD.moves=Object.fromEntries((d.moves||[]).map(m=>[m.album_id,m.wheel]));
    if(RAD.error===RAD_STATE_ERR)RAD.error="";
  }catch(e){if(!RAD.error)RAD.error=RAD_STATE_ERR}
  if(RAD.view==="wheel"){radStatus();radWheelsChanged();if(RAD.sheet)radSheet()}
}

// ---------- Farb-Räder (W.7) ----------
function radWheelList(){return radWheels(RAD.all,RAD.colors,RAD.moves)}
// Alben des gewählten Rads übernehmen; gibt es das Rad nicht (mehr), gilt „Alle“
function radPick(){
  const list=radWheelList(),w=list.find(x=>x.key===RAD.wheel)||list[0];
  RAD.wheel=w.key;RAD.albums=radSort(w.albums,RAD.sort);
}
function radGoWheel(key){
  if(key===RAD.wheel)return;
  RAD.posBy[RAD.wheel]=Math.round(RAD.to);
  RAD.wheel=key;radPick();
  RAD.pos=RAD.to=RAD.posBy[RAD.wheel]||0;RAD.open=false;RAD.suggested="";
  radRender();
}
// Farben oder Verschiebungen haben sich geändert: Punkte oben nachführen; das Rad selbst nur neu aufbauen,
// wenn sich die Alben des gezeigten Rads geändert haben (sonst würden alle Cover neu geladen)
function radWheelsChanged(){
  const before=RAD.albums,front=before[radFocusIndex(RAD.to,before.length)]?.id;
  radPick();
  if(before.length===RAD.albums.length&&before.every((a,i)=>a===RAD.albums[i])){radDots();radDraw();return}
  const keep=RAD.albums.findIndex(a=>a.id===front);
  RAD.pos=RAD.to=keep>=0?keep:Math.min(radFocusIndex(RAD.to,before.length),RAD.albums.length-1);
  radRender();
}

// Leiste oben. Eingeklappt: nur der Punkt des gezeigten Rads (Tippen klappt auf). Aufgeklappt: ein Punkt je Rad
// in dessen Farbe, darunter die Sortierung und – bei Sortierung nach Künstler – die Buchstaben A–Z.
function radDots(){
  const box=document.getElementById("radWheels");
  if(!box)return;
  const list=radWheelList(),cur=list.find(w=>w.key===RAD.wheel)||list[0];
  box.classList.toggle("open",RAD.bar);
  if(!RAD.bar){
    box.innerHTML=`<button class="rad-dot rad-dot-${cur.key}" id="radBarOpen" type="button" aria-expanded="false" aria-pressed="true" aria-label="Räder und Sortierung öffnen. Gezeigt: Rad ${radEsc(cur.name)}, ${cur.albums.length} Alben" title="Räder und Sortierung"></button>`;
    document.getElementById("radBarOpen").addEventListener("click",()=>{RAD.bar=true;radDots();box.querySelector('[aria-pressed="true"]')?.focus()});
    return;
  }
  const letters=RAD.sort==="artist"?radLetterIndex(RAD.albums):null;
  box.innerHTML=`<div class="rad-bar-row">${list.map(w=>`<button class="rad-dot rad-dot-${w.key}" type="button" data-wheel="${w.key}" aria-pressed="${w.key===RAD.wheel}" aria-label="Rad ${radEsc(w.name)}, ${w.albums.length} Alben" title="${radEsc(w.name)} (${w.albums.length})"></button>`).join("")}</div>
    <div class="rad-bar-row" role="group" aria-label="Sortierung">${RAD_SORTS.map(o=>`<button class="rad-sort" type="button" data-sort="${o.key}" aria-pressed="${o.key===RAD.sort}">${radEsc(o.name)}</button>`).join("")}</div>
    ${letters?`<div class="rad-letters" role="group" aria-label="Zum Künstler mit Anfangsbuchstaben springen">${RAD_LETTERS.map(l=>`<button class="rad-letter" type="button" data-letter="${l}"${l in letters?"":" disabled"}>${l}</button>`).join("")}</div>`:""}`;
  box.querySelectorAll(".rad-dot").forEach(b=>b.addEventListener("click",()=>radGoWheel(b.dataset.wheel)));
  box.querySelectorAll(".rad-sort").forEach(b=>b.addEventListener("click",()=>radSetSort(b.dataset.sort)));
  box.querySelectorAll(".rad-letter").forEach(b=>b.addEventListener("click",()=>radJump(letters[b.dataset.letter])));
}

function radSetSort(key){
  RAD.sort=key;radSet(localStorage,RAD_KEYS.sort,key);RAD.posBy={};
  radWheelsChanged();radDots();
}

// Rad zu einem Platz drehen (Buchstabenreihe): vorwärts, weite Wege abgekürzt wie beim Vorschlag
function radJump(index){
  if(!RAD.ring||index==null||RAD.albums.length<2)return;
  clearTimeout(RAD.snapTimer);
  RAD.open=false;RAD.suggested="";
  if(radFocusIndex(RAD.to,RAD.albums.length)===index)return;
  const spin=radSpin(RAD.to,index,RAD.albums.length,Math.min(10,RAD.ring.slots));
  RAD.pos=radCalm()?spin.to:spin.from;
  radTurnTo(spin.to);
}

// Farbgruppe jedes Covers aus dem kleinen Coverbild lesen (16 × 16 Punkte genügen) und auf dem Gerät merken.
// Läuft im Hintergrund in Paketen zu 8; Spotify erlaubt das Auslesen der Bilder (Access-Control-Allow-Origin: *).
async function radReadColors(){
  if(RAD.colorRun)return;
  RAD.colorRun=true;
  try{RAD.colors={...JSON.parse(radGet(localStorage,RAD_KEYS.colors)||"{}"),...RAD.colors}}catch{}
  const todo=RAD.all.filter(a=>!RAD.colors[a.id]&&a.coverSmall);
  const canvas=document.createElement("canvas");canvas.width=canvas.height=16;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  let failed=0;
  const one=a=>new Promise(done=>{
    const img=new Image();img.crossOrigin="anonymous";
    img.onload=()=>{try{ctx.drawImage(img,0,0,16,16);const g=radColorGroup(ctx.getImageData(0,0,16,16).data);if(g)RAD.colors[a.id]=g;else failed++}catch{failed++}done()};
    img.onerror=()=>{failed++;done()};
    img.src=a.coverSmall;
  });
  for(let i=0;i<todo.length&&RAD.view==="wheel";i+=8){
    if(todo.length>24){RAD.progress=`Farben lesen… ${i} von ${todo.length}`;radStatus()}
    await Promise.all(todo.slice(i,i+8).map(one));
  }
  if(todo.length){
    radSet(localStorage,RAD_KEYS.colors,JSON.stringify(RAD.colors));
    RAD.progress="";
    if(failed===todo.length&&!RAD.error)RAD.error="Die Farben der Cover konnten nicht gelesen werden. Es gibt darum nur das Rad mit allen Alben.";
  }
  RAD.colorRun=false;
  if(RAD.view==="wheel"){radStatus();radWheelsChanged()}
}

// Album von Hand einem Farb-Rad zuteilen („auto“ = wieder die berechnete Farbe): sofort anzeigen, im Hintergrund speichern
function radMove(albumId,wheel){
  const old=RAD.moves[albumId];
  RAD.moves={...RAD.moves,[albumId]:wheel};RAD.error="";radStatus();radWheelsChanged();
  radFn({action:"move",album_id:albumId,wheel}).catch(e=>{
    RAD.moves={...RAD.moves,[albumId]:old};
    RAD.error=`Nicht gespeichert: ${e.message||e}`;
    if(RAD.view==="wheel"){radStatus();radWheelsChanged()}
  });
}

// Eintrag sofort zählen und speichern; klappt das Speichern nicht, wird er wieder abgezogen und gemeldet
function radLog(albumId,kind){
  const before=RAD.counts?.[albumId];
  RAD.counts=radCount(RAD.counts||{},albumId,kind);
  RAD.error="";radStatus();radOftenMenu();
  radFn({action:"log",album_id:albumId,kind},true).then(d=>{
    if(d.event)RAD.events=[d.event,...RAD.events].slice(0,100);
    if(RAD.sheet)radSheet();
  }).catch(e=>{
    const c={...RAD.counts};
    if(before)c[albumId]=before;else delete c[albumId];
    RAD.counts=c;
    RAD.error=`Nicht gespeichert: ${e.message||e}`;
    if(RAD.view==="wheel"){radStatus();radDraw();radOftenMenu();if(RAD.sheet)radSheet()}
  });
}

// „Oft abgelehnt“ (W.8): Menüeintrag mit Anzahl, Punkt am Menü-Knopf, solange es solche Alben gibt
function radOftenMenu(){
  const n=radOftenRejected(RAD.all,RAD.counts).length,b=document.getElementById("radOften"),m=document.querySelector(".rad-menu summary");
  if(b){b.hidden=!n;b.textContent=`Oft abgelehnt (${n})`}
  if(m){m.classList.toggle("has-news",n>0);m.setAttribute("aria-label",n?`Menü – ${n} oft abgelehnte Alben`:"Menü")}
}

// Nächster Vorschlag: zufällig, selten Gehörtes öfter (nicht das vordere, keines, das in dieser Sitzung schon abgelehnt wurde)
function radSuggestNext(){
  if(RAD.view!=="wheel"||!RAD.albums.length||!RAD.ring)return;
  clearTimeout(RAD.snapTimer);
  const front=RAD.albums[radFocusIndex(RAD.to,RAD.albums.length)];
  const i=radSuggest(RAD.albums,{exclude:RAD.skipped,currentId:front?.id||"",counts:RAD.counts});
  if(i<0)return;
  RAD.suggested=RAD.albums[i].id;RAD.open=true;
  if(RAD.albums.length===1){radDraw();return}
  const spin=radSpin(RAD.to,i,RAD.albums.length,Math.min(10,RAD.ring.slots));
  RAD.pos=radCalm()?spin.to:spin.from;
  radTurnTo(spin.to);
}

// Neu zeichnen erst nach dem Klick: sonst verschwindet der Link, bevor der Browser Spotify geöffnet hat
function radListen(a){RAD.suggested="";radLog(a.id,"listen");setTimeout(radDraw,0)}
function radReject(a){RAD.skipped.add(a.id);radLog(a.id,"reject");radSuggestNext()}

// ---------- Rad zeichnen ----------
function radStage(){return document.getElementById("radStage")}

function radMeasure(){
  const st=radStage();if(!st)return;
  RAD.ring=radRing(st.clientWidth,st.clientHeight-RAD_BOTTOM-RAD_TOP,RAD.albums.length);
  st.style.setProperty("--rad-size",`${RAD.ring.size}px`);
  const info=document.getElementById("radInfo");
  // Titel in der Mitte: so schmal, dass er das vordere (grösste) Cover nicht berührt
  RAD.infoW=`${Math.round(Math.max(120,Math.min(420,2*(RAD.ring.rx*Math.cos(RAD_FOCUS_DEG*Math.PI/180)-RAD.ring.size*RAD_MAX_SCALE*RAD_PICK/2)-16)))}px`;
  if(info)info.style.maxWidth=RAD.infoW;
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
    // W.11: Steht das Rad still, wird das vordere Cover etwas grösser (picked). Beim Zufallsvorschlag steht es
    // stattdessen gross in der Mitte (.rad-big in radInfo) und sein Platz im Rad bleibt leer (lifted).
    const still=Math.abs(p.d)<0.5&&Math.abs(RAD.to-RAD.pos)<=0.5&&!RAD.drag,lifted=still&&RAD.open&&RAD.suggested===RAD.albums[p.index]?.id;
    el.classList.toggle("picked",still&&!lifted);
    el.classList.toggle("lifted",lifted);
  }
  for(const [key,el] of RAD.els)if(!live.has(key)){el.remove();RAD.els.delete(key)}
  radInfo();
}

// Mitte: vorderes Album mit Titel, Zähler und „Hören“ – nur nach Tippen oder bei einem Vorschlag
// (sonst bleibt der Bildschirm ohne Text). „Ablehnen“ gibt es nur beim vorgeschlagenen Album.
function radInfo(){
  const info=document.getElementById("radInfo"),say=document.getElementById("radSay");
  const a=RAD.albums[radFocusIndex(RAD.pos,RAD.albums.length)];
  if(!info||!a)return;
  const suggested=RAD.suggested===a.id,countText=RAD.counts?radCountText(RAD.counts[a.id]):"";
  // Auswahl „Rad“ erst, wenn Verschiebungen geladen sind (sonst würde eine frühere Wahl überschrieben wirken)
  const auto=RAD.colors[a.id],moved=radIsGroup(RAD.moves[a.id])?RAD.moves[a.id]:"auto";
  const sig=`${a.id}|${suggested}|${countText}|${auto}|${moved}`;
  const text=document.getElementById("radText"),big=document.getElementById("radBig");
  if(info.dataset.sig!==sig){
    info.dataset.sig=sig;
    if(big.dataset.id!==a.id){big.dataset.id=a.id;big.src=a.cover}
    text.innerHTML=`<div class="rad-title">${radEsc(a.name)}</div><div class="rad-sub">${radEsc(a.artists.join(", "))}${a.year?` · ${radEsc(a.year)}`:""}</div>${countText?`<div class="rad-count">${radEsc(countText)}</div>`:""}${RAD.counts?`<select class="rad-select" id="radMove" aria-label="Farb-Rad dieses Albums"><option value="auto"${moved==="auto"?" selected":""}>Rad: automatisch${auto?` (${radEsc(RAD_GROUPS.find(g=>g.key===auto).name)})`:""}</option>${RAD_GROUPS.map(g=>`<option value="${g.key}"${moved===g.key?" selected":""}>Rad: ${radEsc(g.name)}</option>`).join("")}</select>`:""}<div class="rad-acts"><a class="rad-btn rad-go" id="radGo" href="${radEsc(a.url)}" target="_blank" rel="noopener">Hören</a>${suggested?`<button class="rad-btn rad-no" id="radNo" type="button">Ablehnen</button>`:""}</div>`;
    // Der Link öffnet Spotify selbst (kein blockiertes Pop-up); der Klick wird nur zusätzlich gezählt
    document.getElementById("radGo").addEventListener("click",()=>radListen(a));
    document.getElementById("radNo")?.addEventListener("click",()=>radReject(a));
    document.getElementById("radMove")?.addEventListener("change",e=>radMove(a.id,e.target.value));
  }
  // Während das Rad noch dreht, bleibt die Mitte leer – sonst flackern die Titel durch
  info.hidden=!RAD.open||Math.abs(RAD.to-RAD.pos)>0.5||!!RAD.drag;
  // Grosses Cover (W.11) nur beim Zufallsvorschlag: steht frei in der Mitte, die übrigen Cover treten zurück (.spot),
  // darum darf es breiter sein als das Innere des Rads (bis 280 px, so dass Text und Knöpfe darunter Platz haben)
  const st=radStage(),spot=!info.hidden&&suggested;
  big.hidden=!suggested;
  st?.classList.toggle("spot",spot);
  info.style.maxWidth=spot&&st?`${Math.min(420,st.clientWidth-32)}px`:RAD.infoW||"";
  if(spot&&st){
    const px=Math.round(Math.max(72,Math.min(280,st.clientWidth-48,st.clientHeight-RAD_TOP-RAD_BOTTOM-text.offsetHeight-32)));
    if(big.style.width!==`${px}px`)big.style.width=big.style.height=`${px}px`;
  }
  // Für Screenreader: vorderes Album ansagen, sobald das Rad steht
  if(say&&!RAD.raf&&say.dataset.id!==a.id){say.dataset.id=a.id;say.textContent=`${a.name} – ${a.artists.join(", ")}`}
}

// Blatt „Oft abgelehnt“: Alben mit 3+ Ablehnungen seit dem letzten Hören; „Behalten“ setzt die Zählung zurück,
// entfernen geht in Spotify selbst (das Rad hat bewusst keine Schreibrechte für die Bibliothek)
function radOftenSheet(box){
  const list=radOftenRejected(RAD.all,RAD.counts);
  box.setAttribute("aria-label","Oft abgelehnt");
  box.innerHTML=`<div class="rad-sheet-head"><h2 class="rad-h">Oft abgelehnt</h2><button class="rad-link" id="radSheetClose" type="button">Schliessen</button></div>
    <p class="rad-note">${list.length?`Diese Alben hast du seit dem letzten Hören mindestens ${RAD_OFTEN}× abgelehnt. Behalten oder in Spotify aus der Bibliothek entfernen?`:"Keine Alben mehr – nichts zu prüfen."}</p>
    ${list.length?`<ul class="rad-log">${list.map(a=>`<li>${a.coverSmall?`<img src="${radEsc(a.coverSmall)}" alt="" loading="lazy">`:`<span class="rad-nocover"></span>`}<span class="rad-log-txt"><span class="rad-log-name">${radEsc(a.name)}</span><span class="rad-log-sub">${radEsc(a.artists.join(", "))} · ${RAD.counts[a.id].since}× abgelehnt</span><span class="rad-often-acts"><button class="rad-link" type="button" data-keep="${radEsc(a.id)}">Behalten</button><a class="rad-link" href="${radEsc(a.url)}" target="_blank" rel="noopener">In Spotify öffnen</a></span></span></li>`).join("")}</ul>`:""}`;
  box.querySelectorAll("[data-keep]").forEach(b=>b.addEventListener("click",()=>{radLog(b.dataset.keep,"keep");radSheet();document.getElementById("radSheetClose")?.focus()}));
}

// Blatt über dem Rad: „Oft abgelehnt“ oder das Protokoll mit Summen und den letzten 100 Einträgen
function radSheet(){
  const box=document.getElementById("radSheet");
  if(!box)return;
  box.hidden=!RAD.sheet;
  if(!RAD.sheet)return;
  if(RAD.sheet==="often"){radOftenSheet(box);document.getElementById("radSheetClose").addEventListener("click",()=>{RAD.sheet=false;radSheet();radStage()?.focus()});return}
  box.setAttribute("aria-label","Protokoll");
  const rows=radProtocol(RAD.events,RAD.all);
  const sum=Object.values(RAD.counts||{}).reduce((t,c)=>({l:t.l+c.listens,r:t.r+c.rejects}),{l:0,r:0});
  const list=rows.length?`<ul class="rad-log">${rows.map(r=>`<li>${r.cover?`<img src="${radEsc(r.cover)}" alt="" loading="lazy">`:`<span class="rad-nocover"></span>`}<span class="rad-log-txt"><span class="rad-log-name">${radEsc(r.name)}</span><span class="rad-log-sub">${radEsc(r.artists)}</span></span><span class="rad-log-what"><span class="${r.kind==="reject"?"rad-nope":"rad-yes"}">${{listen:"gehört",reject:"abgelehnt",keep:"behalten"}[r.kind]}</span><span class="rad-log-sub">${radEsc(radWhen(r.at))}</span></span></li>`).join("")}</ul>${RAD.events.length>=100?`<p class="rad-note">Es werden die letzten 100 Einträge gezeigt.</p>`:""}`
    :`<p class="rad-note">${RAD.counts?"Noch keine Einträge. Tippe unten auf den Vorschlag-Knopf.":"Protokoll wird geladen…"}</p>`;
  box.innerHTML=`<div class="rad-sheet-head"><h2 class="rad-h">Protokoll</h2><button class="rad-link" id="radSheetClose" type="button">Schliessen</button></div>${RAD.counts?`<p class="rad-note rad-sum">${sum.l}× gehört · ${sum.r}× abgelehnt</p>`:""}${list}`;
  document.getElementById("radSheetClose").addEventListener("click",()=>{RAD.sheet=false;radSheet();radStage()?.focus()});
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
  if(RAD.view!=="wheel"||!RAD.ring||RAD.sheet)return;
  e.preventDefault();
  const px=(Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX)*(e.deltaMode===1?32:e.deltaMode===2?RAD.ring.stepPx*3:1);
  // Höchstens ein Album pro Scroll-Schritt, damit auch Mausräder mit grossen Schritten ruhig drehen
  RAD.to+=Math.max(-1,Math.min(1,px/RAD.ring.stepPx));
  radKick();radSnapSoon();
}

function radOnDown(e){
  if(RAD.view!=="wheel"||!RAD.ring||e.button>0)return;
  if(e.target.closest("a,button,summary,details,select"))return;
  if(RAD.bar){RAD.bar=false;radDots()}
  clearTimeout(RAD.snapTimer);
  RAD.drag={id:e.pointerId,y:e.clientY,x:e.clientX,pos:RAD.pos,moved:false,lastY:e.clientY,lastT:e.timeStamp,v:0,item:e.target.closest(".rad-item")};
}
function radOnMove(e){
  const d=RAD.drag;if(!d||e.pointerId!==d.id)return;
  const dy=e.clientY-d.y;
  if(!d.moved){
    if(Math.abs(dy)<6&&Math.abs(e.clientX-d.x)<6)return;
    d.moved=true;try{radStage().setPointerCapture(d.id)}catch{}
    // Seitlich wischen wechselt das Farb-Rad (nur wenn es mehrere gibt), sonst dreht die Bewegung das Rad
    d.swipe=Math.abs(e.clientX-d.x)>Math.abs(dy)&&radWheelList().length>1;
  }
  if(d.swipe){const ring=document.getElementById("radRing");if(ring&&!radCalm())ring.style.translate=`${Math.round((e.clientX-d.x)/3)}px 0`;return}
  // Nach oben ziehen = nächstes Album kommt nach vorne
  RAD.pos=d.pos-dy/RAD.ring.stepPx;
  const dt=e.timeStamp-d.lastT;
  if(dt>0){d.v=0.7*d.v+0.3*((e.clientY-d.lastY)/dt);d.lastY=e.clientY;d.lastT=e.timeStamp}
  radKick();
}
function radOnUp(e){
  const d=RAD.drag;if(!d||e.pointerId!==d.id)return;
  RAD.drag=null;
  if(d.swipe){
    const dx=e.clientX-d.x,ring=document.getElementById("radRing");
    if(ring)ring.style.translate="";
    if(e.type!=="pointercancel"&&Math.abs(dx)>50)radGoWheel(radNextWheel(radWheelList(),RAD.wheel,dx<0?1:-1));
    else radDraw();
    return;
  }
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
  if(RAD.view!=="wheel")return;
  if(RAD.sheet){if(e.key==="Escape"){RAD.sheet=false;radSheet()}return}
  if(e.key==="Escape"&&RAD.bar){RAD.bar=false;radDots();document.getElementById("radBarOpen")?.focus();return}
  if(e.target.closest("a,button,summary,select"))return;
  const many=radWheelList().length>1;
  if(many&&(e.key==="ArrowRight"||e.key==="ArrowLeft")){e.preventDefault();radGoWheel(radNextWheel(radWheelList(),RAD.wheel,e.key==="ArrowRight"?1:-1))}
  else if(e.key==="ArrowDown"||e.key==="ArrowRight"){e.preventDefault();radTurnTo(Math.round(RAD.to)+1)}
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
    app.innerHTML=`<div class="rad-stage" id="radStage" tabindex="0" role="group" aria-label="Albumrad mit ${RAD.albums.length} Alben. Pfeil hoch und runter dreht das Rad, links und rechts wechselt das Farb-Rad, Eingabetaste zeigt den Titel.">
      <div class="rad-ring" id="radRing"></div>
      <div class="rad-info" id="radInfo" hidden><img class="rad-big" id="radBig" alt="" decoding="async"><div class="rad-text" id="radText"></div></div>
      <p class="rad-status" id="radStatus" role="status">${radEsc(RAD.error||RAD.progress)}</p>
      <p class="rad-sr" id="radSay" aria-live="polite"></p>
    </div>
    <button class="rad-dice" id="radSuggest" type="button" aria-label="Album vorschlagen" title="Album vorschlagen"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h3.500c2 0 3.200 1 4.300 2.600l2.400 4.800c1.100 1.600 2.300 2.600 4.300 2.600H21"/><path d="M3 17h3.500c1.300 0 2.300-.4 3.100-1.200M21 7h-3.500c-1.300 0-2.300.4-3.100 1.200"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/></svg></button>
    <details class="rad-menu"><summary aria-label="Menü">⋯</summary><div class="rad-menu-box"><button class="rad-link" id="radOften" type="button" hidden></button><button class="rad-link" id="radProtocol" type="button">Protokoll</button><button class="rad-link" id="radReload" type="button">Alben neu laden</button><button class="rad-link" id="radLogout" type="button">Abmelden</button></div></details>
    <div class="rad-wheels" id="radWheels" role="group" aria-label="Räder und Sortierung"></div>
    <div class="rad-sheet" id="radSheet" role="dialog" aria-label="Protokoll" hidden></div>`;
    const st=radStage();
    st.addEventListener("wheel",radOnWheel,{passive:false});
    st.addEventListener("pointerdown",radOnDown);
    st.addEventListener("pointermove",radOnMove);
    st.addEventListener("pointerup",radOnUp);
    st.addEventListener("pointercancel",radOnUp);
    document.getElementById("radSuggest").addEventListener("click",radSuggestNext);
    const openSheet=kind=>{RAD.sheet=kind;document.querySelector(".rad-menu").open=false;radSheet();document.getElementById("radSheetClose")?.focus()};
    document.getElementById("radProtocol").addEventListener("click",()=>openSheet("protocol"));
    document.getElementById("radOften").addEventListener("click",()=>openSheet("often"));
    radMeasure();radDraw();radSheet();radDots();radOftenMenu();
  }
  document.getElementById("radReload").addEventListener("click",()=>radLoad(true));
  document.getElementById("radLogout").addEventListener("click",radLogout);
}

async function radInit(){
  document.documentElement.classList.add("rad");
  document.title="Albumrad";
  const savedSort=radGet(localStorage,RAD_KEYS.sort);
  if(RAD_SORTS.some(o=>o.key===savedSort))RAD.sort=savedSort;
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
