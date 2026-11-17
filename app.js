// Loader: lädt die Skripte aus js/ der Reihe nach (klassische Skripte, globale Namen).
// Nach JS/CSS-Änderungen BUILD hier und die ?v=-Parameter in index.html erhöhen.
// main.js startet die App (genau ein init()), wenn alles geladen ist.
(async()=>{
  const BUILD="20261117-1";
  // Werkzeuge (Roadmap „Werkzeuge“): eigene Seiten ?tool=alben / ?tool=rad, kein Teil des Spiels – laden nur tools/, keine Spiel-Skripte.
  // Die Rückkehr vom Spotify-Login (gleiche Redirect-URI wie das Spiel) gehört dem Werkzeug, von dem der state stammt.
  const TOOLS={alben:{stateKey:"mb_alben_state",css:"alben",js:["alben-logic","alben"]},rad:{stateKey:"mb_rad_state",css:"rad",js:["rad-logic","rad"]}};
  const q=new URLSearchParams(location.search);
  let tool=TOOLS[q.get("tool")]||null;
  if(!tool&&q.get("state"))tool=Object.values(TOOLS).find(t=>{try{return sessionStorage.getItem(t.stateKey)===q.get("state")}catch{return false}})||null;
  if(tool){
    const css=document.createElement("link");css.rel="stylesheet";css.href=`./tools/${tool.css}.css?v=${BUILD}`;document.head.appendChild(css);
    for(const name of tool.js){
      await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=`./tools/${name}.js?v=${BUILD}`;s.onload=resolve;s.onerror=()=>reject(new Error(`${name}.js konnte nicht geladen werden`));document.head.appendChild(s)});
    }
    return;
  }
  // Themen-Profile (gemeinsame Quelle mit der Jury) vor allen Skripten laden – config.js baut daraus THEMES
  const themesRes=await fetch(`./supabase/functions/_shared/themes.json?v=${BUILD}`);
  if(!themesRes.ok)throw new Error("Themen konnten nicht geladen werden");
  window.MB_THEME_DATA=await themesRes.json();
  // Juror-Profile (gemeinsame Quelle mit der Jury-Engine) – config.js baut daraus JUDGES
  const jurorsRes=await fetch(`./supabase/functions/_shared/jurors.json?v=${BUILD}`);
  if(!jurorsRes.ok)throw new Error("Juroren konnten nicht geladen werden");
  window.MB_JUROR_DATA=await jurorsRes.json();
  const files=["config","state","errors","ui-common","artist-filter","spotify","room","draft","battle","quiz","votes","jury","ui-screens","ui-quiz","main"];
  for(const name of files){
    await new Promise((resolve,reject)=>{
      const s=document.createElement("script");
      s.src=`./js/${name}.js?v=${BUILD}`;
      s.onload=resolve;
      s.onerror=()=>reject(new Error(`${name}.js konnte nicht geladen werden`));
      document.head.appendChild(s);
    });
  }
})().catch(err=>{console.error(err);const app=document.getElementById("app");app.innerHTML=`<div class="card"><div class="notice error" role="alert">Music Battle konnte nicht geladen werden. Prüfe dein Internet und lade die Seite neu.</div><div class="actions centered"><button class="btn" type="button" id="reloadApp">Neu laden</button></div><p class="muted" style="font-size:13px" id="loadErr"></p></div>`;document.getElementById("loadErr").textContent=`Details: ${String(err&&err.message||err)}`;document.getElementById("reloadApp").onclick=()=>location.reload()});
