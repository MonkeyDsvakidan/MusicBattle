// Loader: lädt die Skripte aus js/ der Reihe nach (klassische Skripte, globale Namen).
// Nach JS/CSS-Änderungen BUILD hier und die ?v=-Parameter in index.html erhöhen.
// main.js startet die App (genau ein init()), wenn alles geladen ist.
(async()=>{
  const BUILD="20261006-6";
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
