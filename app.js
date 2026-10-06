// Loader: lädt die Skripte aus js/ der Reihe nach (klassische Skripte, globale Namen).
// Nach JS/CSS-Änderungen BUILD hier und die ?v=-Parameter in index.html erhöhen.
// main.js startet die App (genau ein init()), wenn alles geladen ist.
(async()=>{
  const BUILD="20261006-12";
  // Themen-Profile (gemeinsame Quelle mit der Jury) vor allen Skripten laden – config.js baut daraus THEMES
  const themesRes=await fetch(`./supabase/functions/_shared/themes.json?v=${BUILD}`);
  if(!themesRes.ok)throw new Error("Themen konnten nicht geladen werden");
  window.MB_THEME_DATA=await themesRes.json();
  // Juror-Profile (gemeinsame Quelle mit der Jury-Engine) – config.js baut daraus JUDGES
  const jurorsRes=await fetch(`./supabase/functions/_shared/jurors.json?v=${BUILD}`);
  if(!jurorsRes.ok)throw new Error("Juroren konnten nicht geladen werden");
  window.MB_JUROR_DATA=await jurorsRes.json();
  const files=["config","state","ui-common","spotify","room","draft","battle","jury","ui-screens","main"];
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
