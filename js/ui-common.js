/* ui-common.js – Gemeinsame UI: Dialoge, render()-Verteiler, Bausteine
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

// Bestätigung in der App statt window.confirm (Roadmap 1.6). Hängt ausserhalb von #app,
// damit ein Neuaufbau der Seite den offenen Dialog nicht entfernt. Liefert true/false.
function mbConfirm(message,{title="Bist du sicher?",confirmLabel="Bestätigen",cancelLabel="Abbrechen",danger=false}={}){
  if(document.querySelector(".mb-dialog-backdrop"))return Promise.resolve(false);
  return new Promise(resolve=>{
    const prev=document.activeElement,wrap=document.createElement("div");
    wrap.className="mb-dialog-backdrop";
    wrap.innerHTML=`<div class="mb-dialog card" role="alertdialog" aria-modal="true" aria-labelledby="mbDialogTitle" aria-describedby="mbDialogText"><h3 id="mbDialogTitle">${esc(title)}</h3><p id="mbDialogText" class="muted">${esc(message)}</p><div class="actions"><button class="btn" type="button" data-dialog="cancel">${esc(cancelLabel)}</button><button class="btn ${danger?"danger":"primary"}" type="button" data-dialog="ok">${esc(confirmLabel)}</button></div></div>`;
    const close=ok=>{document.removeEventListener("keydown",onKey,true);wrap.remove();prev?.focus?.();resolve(ok)};
    const onKey=e=>{
      if(e.key==="Escape"){e.preventDefault();close(false);return}
      if(e.key==="Tab"){e.preventDefault();const f=[...wrap.querySelectorAll("button")],i=f.indexOf(document.activeElement);f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus()}
    };
    wrap.addEventListener("click",e=>{if(e.target===wrap){close(false);return}const b=e.target.closest("[data-dialog]");if(b)close(b.dataset.dialog==="ok")});
    document.addEventListener("keydown",onKey,true);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-dialog="ok"]').focus();
  });
}

// Rückfrage beim Verlassen, passend zur Rolle (Entscheidung F, Roadmap 1.7).
// In der Lobby und nach Matchende wird nicht gefragt.
async function mbConfirmLeave(){
  if(!S.room?.id||["lobby","finished","closed"].includes(S.room.status))return true;
  const code=S.room.code;
  if(S.room.game==="quiz")return isHost()?mbConfirm("Das laufende Quiz wird für alle beendet.",{title:"Quiz verlassen?",confirmLabel:"Verlassen",cancelLabel:"Weiterspielen",danger:true}):mbConfirm(`Mit dem Raumcode ${code} kannst du wieder mitspielen.`,{title:"Quiz verlassen?",confirmLabel:"Verlassen",cancelLabel:"Weiterspielen",danger:true});
  if(isHost())return mbConfirm("Das laufende Match wird für alle beendet.",{title:"Match verlassen?",confirmLabel:"Verlassen",cancelLabel:"Weiterspielen",danger:true});
  if(role()==="juror")return mbConfirm(`Du kannst mit dem Raumcode ${code} wieder als Juror beitreten.`,{title:"Jury verlassen?",confirmLabel:"Verlassen",cancelLabel:"Bleiben",danger:true});
  return mbConfirm(`Das Match wartet auf dich. Mit dem Raumcode ${code} kommst du als Spieler 2 auf deinen Platz zurück.`,{title:"Match verlassen?",confirmLabel:"Verlassen",cancelLabel:"Weiterspielen",danger:true});
}

// Kopfzeile (8.3): GameMaster-Maske + Spielname; Tipp führt zur GameMaster-Übersicht, im laufenden Spiel mit Rückfrage (Raum bleibt offen)
function currentGameName(){return (S.room?S.room.game==="quiz":window.MB_DEVICE_MODE_CHOICE==="quiz")?"Musik-Quiz":"Music 1v1"}
function bindBrandHome(){
  const name=currentGameName();
  if($("brandTitle"))$("brandTitle").textContent=name;
  document.title=`${name} · GameMaster`;
  document.documentElement.classList.toggle("quiz",name==="Musik-Quiz"); // eigener Quiz-Look (8.6), Tokens unter html.quiz in styles.css
  for(const id of ["brandHome","allGames"]){const el=$(id);if(el)el.onclick=goToOverview}
  bindGameBar(name==="Musik-Quiz"?"quiz":"mb");
}
// Leiste unten (8.3): 1v1 ↔ Quiz wechselt wie «Modus ändern» (Raum verlassen, im laufenden Spiel mit Rückfrage);
// TotalGuesser, Poker und Tools sind andere Seiten → wie «Alle Spiele» (Raum bleibt offen)
function bindGameBar(active){
  document.querySelectorAll("#gmBar a").forEach(a=>{
    if(a.dataset.k===active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");
    a.onclick=async e=>{
      if(["tg","poker","tools"].includes(a.dataset.k))return goToOverview(e);
      e.preventDefault();
      if(a.dataset.k===active)return;
      if(await openModeSelection()&&a.dataset.k==="quiz")setDeviceModeChoice("quiz");
    };
  });
}
async function goToOverview(e){
  const link=e.currentTarget,href=link.getAttribute("href")||"/",target=link.closest("#gmBar")?link.textContent.trim():"";
  e.preventDefault();
  const running=S.room?.id&&!["lobby","finished","closed"].includes(S.room.status);
  if(running&&!(await mbConfirm(`Der Raum bleibt offen. Über ${currentGameName()} kommst du zurück ${S.room.game==="quiz"?"ins Quiz":"ins Match"}.`,{title:target?`Zu ${target}?`:"Zur Übersicht?",confirmLabel:target?"Wechseln":"Zur Übersicht",cancelLabel:"Weiterspielen"})))return;
  location.href=href;
}

// Abend-Rangliste über alle GameMaster-Spiele (gemeinsamer Raum, 26.11.2026): /abend.js von der Startseite (gleiche Domain).
// Nur das Host-Gerät trägt ein (dort liegt das ganze Ergebnis); fehlt /abend.js (z. B. lokal), passiert nichts.
function abendNames(){try{return window.GMAbend?.names()||[]}catch{return[]}}
function abendNameList(){return `<datalist id="gmNames">${abendNames().map(n=>`<option value="${esc(n)}"></option>`).join("")}</datalist>`}
function abendRecord(id,game,places){
  const A=window.GMAbend;if(!A||!isHost()||places.length<2)return"";
  try{A.record({id,game,places})}catch{return""}
  return `<p class="muted center abendline">Heute Abend: ${esc(A.summary(places))} · <a href="/">Rangliste</a></p>`;
}
function roomExitControls(){if(!S.room)return"";return `<div class="exitbar"><button class="btn ghost" id="leaveRoomBtn">Raum verlassen</button>${isHost()?`<button class="btn ghost danger" id="newRoomBtn">Neuer Raum</button>`:""}</div>`}

// Momente mit Wirkung (Roadmap 4.6): Startzeit je Moment merken. Solange die Animation läuft, bekommt das
// Element data-anim und --elapsed (negativ) – ein neues Rendern (Realtime) setzt die Animation dort fort,
// statt sie neu zu starten. Danach wird statisch gerendert. „Bewegung reduzieren“ regelt das CSS.
function animAttr(key,durationMs){
  S.anim=S.anim||{};
  const now=Date.now();
  if(!(key in S.anim))S.anim[key]=now;
  const elapsed=now-S.anim[key];
  return elapsed<durationMs?` data-anim style="--elapsed:-${elapsed}ms"`:"";
}

// Fortschritt im Match (Roadmap 4.3): Lobby → Draft → Battle → Ergebnis
function flowSteps(){
  if(S.room?.game==="quiz"){const q=["lobby","quiz","finished"].indexOf(S.room.status);return q<0?"":`<nav class="flow" aria-label="Spielablauf"><ol>${["Lobby","Quiz","Rangliste"].map((l,n)=>`<li class="${n<q?"done":n===q?"now":""}"${n===q?' aria-current="step"':""}>${l}</li>`).join("")}</ol></nav>`}
  const st=S.room?.status,i=st==="lobby"?0:st==="draft"?1:["battle","tiebreak","sudden_draft"].includes(st)?2:st==="finished"?3:-1;
  if(i<0)return"";
  return `<nav class="flow" aria-label="Spielablauf"><ol>${["Lobby","Draft","Battle","Ergebnis"].map((l,n)=>`<li class="${n<i?"done":n===i?"now":""}"${n===i?' aria-current="step"':""}>${l}</li>`).join("")}</ol></nav>`;
}

// Ecke im Boxring je Spieler (Design „Titelkampf bei Nacht“, Roadmap 4.4)
function cornerName(slotNo){return slotNo===1?"PINKE ECKE":"CYAN ECKE"}

// Homescreen-App (Roadmap 6.1): Hinweis nur auf iPhone/iPad, solange Music Battle nicht als App geöffnet ist
function isIosDevice(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)}
function isStandaloneApp(){return navigator.standalone===true||matchMedia("(display-mode: standalone)").matches}
function installHint(){
  let off=false;try{off=localStorage.getItem("mb_install_hint_off")==="1"}catch{}
  if(off||!isIosDevice()||isStandaloneApp())return"";
  return`<div class="installhint" role="note"><span class="installicon" aria-hidden="true">⬆︎</span><p><b>GameMaster als App speichern:</b> unten auf <b>Teilen</b> tippen, dann <b>„Zum Home-Bildschirm“</b>.</p><button class="btn ghost" id="installHintOk">Ok</button></div>`;
}
function bindInstallHint(){const b=$("installHintOk");if(b)b.onclick=()=>{try{localStorage.setItem("mb_install_hint_off","1")}catch{}b.closest(".installhint")?.remove()}}

// Pass & Play: beide Spieler auf diesem Gerät
function isPassAndPlay(){return S.room?.device_mode==="single"&&ownsPlayerSlot(1)&&ownsPlayerSlot(2)}

// Pass & Play im Battle: zuerst wählt Spieler 1, dann Spieler 2 (die Wahl des anderen bleibt verdeckt)
function passPlayTurn(subs){if(!isPassAndPlay())return null;return !subs[0]?1:!subs[1]?2:null}

// Grosse Anzeige „Wer ist dran?“ in der Farbe des Spielers
function turnBanner(slotNo,text){return `<div class="turnbanner p${slotNo}" role="status"><small>WER IST DRAN?</small><strong>${esc(memberName(slotNo))}</strong>${text?`<span>${esc(text)}</span>`:""}</div>`}

function bindRoomExitControls(){const leave=$("leaveRoomBtn");if(leave)leave.onclick=leaveCurrentRoom;const next=$("newRoomBtn");if(next)next.onclick=openNewRoom}

function matchScoreboard(){
  const p=weightedMatchPoints(),round=Number(S.room?.current_round||0);
  const label=round===5?"RUNDE 5 · ×2":round===6?"SUDDEN DEATH":round?`RUNDE ${round}`:"";
  return `<div class="matchscore"><div><span>${esc(memberName(1))}</span><b>${p.a}</b></div><div class="scoremid"><small>MATCH</small><strong>${label}</strong></div><div><b>${p.b}</b><span>${esc(memberName(2))}</span></div></div>`;
}

function render(){
  bindBrandHome();
  if(S.user&&S.pendingJoin){renderInvite();return}
  if(!S.user||!S.room){renderLanding();return}
  if(S.room.game==="quiz"){if(S.room.status==="closed"){renderClosed();return}$("roomBadge").innerHTML=`<span class="chip">${esc(S.room.code)} · QUIZ</span>`;renderQuiz();$("app").insertAdjacentHTML("afterbegin",flowSteps());return}
  const localSlots=ownedMemberships().filter(m=>m.role==="player").map(m=>m.player_slot).sort();
  $("roomBadge").innerHTML=`<span class="chip">${esc(S.room.code)} · ${role()==="player"?(localSlots.length===2?"SPIELER 1 + 2":`SPIELER ${localSlots[0]}`):"JURY"}</span>`;
  if(S.room.status==="lobby")renderLobby();else if(S.room.status==="draft")renderDraft();else if(S.room.status==="battle")renderBattle();else if(S.room.status==="tiebreak")renderTiebreak();else if(S.room.status==="sudden_draft")renderSuddenDraft();else if(S.room.status==="finished")renderFinished();else if(S.room.status==="closed"){renderClosed();return}else renderLobby();
  renderMissingPlayerNotice();
  $("app").insertAdjacentHTML("afterbegin",flowSteps());
}

// Host hat das Match verlassen → Raum ist für alle geschlossen (Entscheidung F)
function renderClosed(){
  $("roomBadge").innerHTML="";
  $("app").innerHTML=`<section class="card">${S.room.game==="quiz"?`<div class="eyebrow">QUIZ BEENDET</div><h2>Der Host hat das Quiz beendet</h2><p class="muted">Raum ${esc(S.room.code)} ist geschlossen. Startet einfach ein neues Quiz.</p>`:`<div class="eyebrow">MATCH BEENDET</div><h2>Der Host hat das Match beendet</h2><p class="muted">Raum ${esc(S.room.code)} ist geschlossen. Startet einfach ein neues Match.</p>`}<div class="actions"><button class="btn primary" id="closedHome">Zur Startseite</button></div></section>`;
  $("closedHome").onclick=()=>{resetLocalRoomState();render()};
}

// 2 Geräte: Spieler 2 hat den Raum mitten im Match verlassen → Platz wartet auf Wiederbeitritt
function renderMissingPlayerNotice(){
  if(S.room.device_mode!=="two"||!["draft","battle","tiebreak","sudden_draft"].includes(S.room.status))return;
  if(S.members.some(m=>m.role==="player"&&m.player_slot===2))return;
  $("app").insertAdjacentHTML("afterbegin",`<div class="notice" role="status" style="margin-bottom:14px"><strong>Spieler 2 hat das Match verlassen.</strong> Das Match wartet: Mit dem Raumcode <strong>${esc(S.room.code)}</strong> kann Spieler 2 über „Als Spieler 2 beitreten“ auf seinen Platz zurück.</div>`);
}
// Q.1: Fehlerbox; Text über errorText() aus js/errors.js
function errorNotice(){return S.error?`<div class="notice error" role="alert">${esc(errorText(S.error))}</div>`:""}
