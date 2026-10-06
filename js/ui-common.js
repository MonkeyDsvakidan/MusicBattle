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
  if(isHost())return mbConfirm("Das laufende Match wird für alle beendet.",{title:"Match verlassen?",confirmLabel:"Verlassen",cancelLabel:"Weiterspielen",danger:true});
  if(role()==="juror")return mbConfirm(`Du kannst mit dem Raumcode ${code} wieder als Juror beitreten.`,{title:"Jury verlassen?",confirmLabel:"Verlassen",cancelLabel:"Bleiben",danger:true});
  return mbConfirm(`Das Match wartet auf dich. Mit dem Raumcode ${code} kommst du als Spieler 2 auf deinen Platz zurück.`,{title:"Match verlassen?",confirmLabel:"Verlassen",cancelLabel:"Weiterspielen",danger:true});
}

function bindBrandHome(){const el=$("brandHome");if(el)el.onclick=openModeSelection}

function roomExitControls(){if(!S.room)return"";return `<div class="actions" style="margin-top:14px"><button class="btn" id="leaveRoomBtn">Raum verlassen</button>${isHost()?`<button class="btn danger" id="newRoomBtn">Neuen Raum eröffnen</button>`:""}</div>`}

function bindRoomExitControls(){const leave=$("leaveRoomBtn");if(leave)leave.onclick=leaveCurrentRoom;const next=$("newRoomBtn");if(next)next.onclick=openNewRoom}

function matchScoreboard(){
  const p=weightedMatchPoints(),round=Number(S.room?.current_round||0);
  const label=round===5?"RUNDE 5 · ×2":round===6?"SUDDEN DEATH":round?`RUNDE ${round}`:"";
  return `<div class="matchscore"><div><span>${esc(memberName(1))}</span><b>${p.a}</b></div><div class="scoremid"><small>MATCH</small><strong>${label}</strong></div><div><b>${p.b}</b><span>${esc(memberName(2))}</span></div></div>`;
}

function render(){
  bindBrandHome();
  if(!S.user||!S.room){renderLanding();return}
  const localSlots=ownedMemberships().filter(m=>m.role==="player").map(m=>m.player_slot).sort();
  $("roomBadge").innerHTML=`<span class="chip">${esc(S.room.code)} · ${role()==="player"?(localSlots.length===2?"SPIELER 1 + 2":`SPIELER ${localSlots[0]}`):"JURY"}</span>`;
  if(S.room.status==="lobby")renderLobby();else if(S.room.status==="draft")renderDraft();else if(S.room.status==="battle")renderBattle();else if(S.room.status==="tiebreak")renderTiebreak();else if(S.room.status==="sudden_draft")renderSuddenDraft();else if(S.room.status==="finished")renderFinished();else if(S.room.status==="closed"){renderClosed();return}else renderLobby();
  renderMissingPlayerNotice();
}

// Host hat das Match verlassen → Raum ist für alle geschlossen (Entscheidung F)
function renderClosed(){
  $("roomBadge").innerHTML="";
  $("app").innerHTML=`<section class="card"><div class="eyebrow">MATCH BEENDET</div><h2>Der Host hat das Match beendet</h2><p class="muted">Raum ${esc(S.room.code)} ist geschlossen. Startet einfach ein neues Match.</p><div class="actions"><button class="btn primary" id="closedHome">Zur Startseite</button></div></section>`;
  $("closedHome").onclick=()=>{resetLocalRoomState();render()};
}

// 2 Geräte: Spieler 2 hat den Raum mitten im Match verlassen → Platz wartet auf Wiederbeitritt
function renderMissingPlayerNotice(){
  if(S.room.device_mode!=="two"||!["draft","battle","tiebreak","sudden_draft"].includes(S.room.status))return;
  if(S.members.some(m=>m.role==="player"&&m.player_slot===2))return;
  $("app").insertAdjacentHTML("afterbegin",`<div class="notice" role="status" style="margin-bottom:14px"><strong>Spieler 2 hat das Match verlassen.</strong> Das Match wartet: Mit dem Raumcode <strong>${esc(S.room.code)}</strong> kann Spieler 2 über „Als Spieler 2 beitreten“ auf seinen Platz zurück.</div>`);
}
