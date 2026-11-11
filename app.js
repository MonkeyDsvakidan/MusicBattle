// Loader: lädt die Skripte aus js/ der Reihe nach (klassische Skripte, globale Namen).
// Nach JS/CSS-Änderungen BUILD hier und die ?v=-Parameter in index.html erhöhen.
// main.js startet die App (genau ein init()), wenn alles geladen ist.
(async()=>{
  const BUILD="20261111-1";
  // Alben-Tool (Roadmap W.1): eigene Seite ?tool=alben, kein Teil des Spiels – lädt nur tools/, keine Spiel-Skripte.
  // Die Rückkehr vom Spotify-Login (gleiche Redirect-URI wie das Spiel) gehört dem Tool, wenn der state von ihm stammt.
  const q=new URLSearchParams(location.search);
  let albenState=null;try{albenState=sessionStorage.getItem("mb_alben_state")}catch{}
  if(q.get("tool")==="alben"||(q.get("state")&&q.get("state")===albenState)){
    const css=document.createElement("link");css.rel="stylesheet";css.href=`./tools/alben.css?v=${BUILD}`;document.head.appendChild(css);
    for(const name of ["alben-logic","alben"]){
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
  const files=["config","state","ui-common","artist-filter","spotify","room","draft","battle","quiz","votes","jury","ui-screens","ui-quiz","main"];
  for(const name of files){
    await new Promise((resolve,reject)=>{
      const s=document.createElement("script");
      s.src=`./js/${name}.js?v=${BUILD}`;
      s.onload=resolve;
      s.onerror=()=>reject(new Error(`${name}.js konnte nicht geladen werden`));
      document.head.appendChild(s);
    });
  }
})().catch(err=>{console.error(err);document.getElementById("app").innerHTML=`<div class="card"><div class="notice error">App konnte nicht geladen werden: ${String(err)}</div></div>`});
