async function startSuddenDeath(){const theme=SUDDEN_THEMES[Math.floor(Math.random()*SUDDEN_THEMES.length)],{error}=await sb.rpc("mb_start_sudden_death",{p_room_id:S.room.id,p_theme:theme});if(error){S.error=error.message;render();return}S.currentArtist=null;S.currentArtistSlot=null;await reloadRoomNow()}
async function placeSuddenArtist(){if(!S.currentArtist||![1,2].includes(S.currentArtistSlot))return;const slotNo=S.currentArtistSlot,{error}=await sb.from("mb_draft_picks").insert({room_id:S.room.id,player_user_id:S.user.id,player_slot:slotNo,round_number:6,spotify_artist_id:S.currentArtist.id,artist_name:S.currentArtist.name,artist_image_url:S.currentArtist.image||null});if(error)S.error=error.message;else{S.currentArtist=null;S.currentArtistSlot=null}await reloadRoomNow();if(isHost()&&S.picks.filter(p=>p.round_number===6).length===2){const {error:e}=await sb.rpc("mb_begin_sudden_battle",{p_room_id:S.room.id});if(e)S.error=e.message;await reloadRoomNow()}}
function renderTiebreak(){const p=weightedMatchPoints();$("app").innerHTML=`<section class="card suddenintro">${matchScoreboard()}<div class="eyebrow">NACH 5 RUNDEN · ${p.a}–${p.b}</div><h2>Sudden Death.</h2><p>Runde 5 hat doppelt gezählt – und trotzdem steht es unentschieden. Jetzt bekommt jeder Spieler einen neuen, bisher unbenutzten Künstler. Eine letzte Kategorie entscheidet das Match.</p>${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}${isHost()?`<button class="btn primary" id="startSudden">Sudden Death starten</button>`:`<div class="notice">Der Host startet die Entscheidungsrunde.</div>`}${roomExitControls()}</section>`;if($("startSudden"))$("startSudden").onclick=startSuddenDeath;bindRoomExitControls()}
function renderSuddenDraft(){const picks=S.picks.filter(p=>p.round_number===6),turn=picks.some(p=>p.player_slot===1)?2:1,mine=ownsPlayerSlot(turn),r=S.rounds.find(x=>x.round_number===6);$("app").innerHTML=`<section class="card">${matchScoreboard()}<div class="battle-title"><div class="eyebrow">SUDDEN DEATH · NEUE KÜNSTLER</div><h2>${esc(r?.theme||"Alles oder nichts")}</h2></div>${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}<div class="suddencards">${[1,2].map(n=>{const p=picks.find(x=>x.player_slot===n);return`<div class="side"><div class="eyebrow">${esc(memberName(n))}</div>${p?`<h3>${esc(p.artist_name)}</h3><span class="chip">Künstler fixiert</span>`:(turn===n&&mine?`${S.currentArtist&&S.currentArtistSlot===n?`<div class="artistdraw">${S.currentArtist.image?`<img src="${esc(S.currentArtist.image)}">`:""}<h2>${esc(S.currentArtist.name)}</h2><button class="btn primary" id="lockSudden">Künstler übernehmen</button></div>`:`<button class="btn primary" id="drawSudden">Neuen Künstler ziehen</button>`}`:`<p class="muted">Wartet…</p>`)}</div>`}).join("")}</div>${roomExitControls()}</section>`;if($("drawSudden"))$("drawSudden").onclick=()=>drawArtist(turn);if($("lockSudden"))$("lockSudden").onclick=placeSuddenArtist;bindRoomExitControls();if(isHost()&&picks.length===2)sb.rpc("mb_begin_sudden_battle",{p_room_id:S.room.id}).then(()=>reloadRoomNow())}
function roundJuryMargin(roundId){const sc=S.scores.filter(s=>s.round_id===roundId);if(!sc.length)return null;const x=scoreSummary(sc);return{margin:Math.abs(x.a-x.b),a:x.a,b:x.b}}
function renderFinished(){
  const p=weightedMatchPoints(),winner=p.a===p.b?null:(p.a>p.b?1:2),completed=S.rounds.filter(r=>r.status==="complete"&&r.winner_slot).sort((a,b)=>a.round_number-b.round_number),margins=completed.map(r=>({r,m:roundJuryMargin(r.id)})).filter(x=>x.m),closest=[...margins].sort((a,b)=>a.m.margin-b.m.margin)[0],strongest=[...margins].sort((a,b)=>b.m.margin-a.m.margin)[0],ai=S.scores.filter(s=>s.source==="ai"),jurorVotes={};
  for(const s of ai){const k=s.juror_name||s.juror_key||"Juror";if(!jurorVotes[k])jurorVotes[k]=[0,0];if(s.score_a>s.score_b)jurorVotes[k][0]++;else jurorVotes[k][1]++}
  $("app").innerHTML=`<section class="card finalwrap"><div class="finalscore"><div class="eyebrow">MATCH BEENDET</div><h2>${winner?`${esc(memberName(winner))} gewinnt`:"Unentschieden"}</h2><div class="big">${p.a} – ${p.b}</div><p class="muted">Matchpunkte · Runde 5 zählte doppelt${S.rounds.some(r=>r.round_number===6)?" · inkl. Sudden Death":""}</p></div><div class="statsgrid"><div class="statcard"><span>Gewonnene Battles</span><b>${completed.filter(r=>r.winner_slot===1).length} – ${completed.filter(r=>r.winner_slot===2).length}</b></div><div class="statcard"><span>Knappstes Jury-Battle</span><b>${closest?`Runde ${closest.r.round_number} · ${closest.m.a}–${closest.m.b}`:"–"}</b></div><div class="statcard"><span>Klarster Jury-Entscheid</span><b>${strongest?`Runde ${strongest.r.round_number} · ${strongest.m.a}–${strongest.m.b}`:"–"}</b></div></div><div class="roundsummary">${completed.map(r=>`<div class="member"><div><strong>${r.round_number===6?"Sudden Death":`Runde ${r.round_number}${r.round_number===5?" · ×2":""}`}</strong><small>${esc(r.theme)}</small></div><span class="chip">${esc(memberName(r.winner_slot))}</span></div>`).join("")}</div>${Object.keys(jurorVotes).length?`<div class="divider"></div><div class="eyebrow">KI-JURY IM MATCH</div><div class="jurorstats">${Object.entries(jurorVotes).map(([name,v])=>`<div class="member"><strong>${esc(name)}</strong><span>${esc(memberName(1))} ${v[0]} · ${v[1]} ${esc(memberName(2))}</span></div>`).join("")}</div>`:""}${roomExitControls()}</section>`;bindRoomExitControls();
}
function render(){
  bindBrandHome();
  if(!S.user||!S.room){renderLanding();return}
  const localSlots=ownedMemberships().filter(m=>m.role==="player").map(m=>m.player_slot).sort();
  $("roomBadge").innerHTML=`<span class="chip">${esc(S.room.code)} · ${role()==="player"?(localSlots.length===2?"SPIELER 1 + 2":`SPIELER ${localSlots[0]}`):"JURY"}</span>`;
  if(S.room.status==="lobby")renderLobby();else if(S.room.status==="draft")renderDraft();else if(S.room.status==="battle")renderBattle();else if(S.room.status==="tiebreak")renderTiebreak();else if(S.room.status==="sudden_draft")renderSuddenDraft();else if(S.room.status==="finished")renderFinished();else renderLobby();
}


function juryMeta(row){return row?.details&&typeof row.details==="object"?row.details:{}}
function juryEvidence(row,slotNo){const d=juryMeta(row);return slotNo===1?(d.evidence_a||{}):(d.evidence_b||{})}
function jurySide(row){return Number(row?.score_a)>Number(row?.score_b)?1:2}
function juryReleaseYears(e){const v=[e?.spotify?.release_date,e?.genius?.release_date,e?.musicbrainz?.first_release_date,...(e?.musicbrainz?.releases||[]).map(x=>x?.date)];return [...new Set(v.map(x=>Number(String(x||"").match(/(?:19|20)\d{2}/)?.[0]||0)).filter(Boolean))]}
function jurySignal(row){
  const a=juryEvidence(row,1),b=juryEvidence(row,2),pairs=[
    ["ListenBrainz-Nutzer",Number(a?.listenbrainz?.total_user_count||0),Number(b?.listenbrainz?.total_user_count||0)],
    ["ListenBrainz-Listens",Number(a?.listenbrainz?.total_listen_count||0),Number(b?.listenbrainz?.total_listen_count||0)],
    ["Last.fm-Hörer",Number(a?.lastfm?.listeners||0),Number(b?.lastfm?.listeners||0)],
    ["persönliches Spotify-Hörsignal",Number(a?.personal_listening?.draft_weight||0),Number(b?.personal_listening?.draft_weight||0)]
  ],x=pairs.find(p=>p[1]>0&&p[2]>0);return x?{label:x[0],a:x[1],b:x[2]}:null
}
function juryNumber(n){return n>=1000000?(n/1000000).toFixed(n>=10000000?0:1)+" Mio.":n>=1000?Math.round(n/1000)+"k":String(Math.round(n))}
function juryVisibleReason(row,r,subs){
  const w=jurySide(row),e=juryEvidence(row,w),o=juryEvidence(row,w===1?2:1),name=String(subs?.[w-1]?.song_name||e?.identity?.song||`Song ${w===1?"A":"B"}`),other=String(subs?.[w===1?1:0]?.song_name||o?.identity?.song||"der andere Song"),theme=String(r?.theme||"das Thema");
  if(row.juror_key==="theme"){
    const y=Number((theme+" "+String(r?.category||"")).match(/(?:19|20)\d{2}/)?.[0]||0),wy=juryReleaseYears(e),oy=juryReleaseYears(o);
    if(y&&wy.includes(y))return `„${name}“ trifft „${theme}“ am saubersten: die gespeicherten Release-Daten bestätigen ${y}. Bei „${other}“ liegen ${oy.length?oy.join("/"):"keine gleich starken Jahresbelege"} vor.`;
    return `„${name}“ bekommt den Themenpunkt für „${theme}“. Der Entscheid bleibt knapp, wenn Titel, Songkontext und vorhandene Metadaten keinen klaren Direktbeleg liefern.`
  }
  if(row.juror_key==="vibe"){
    const tags=[...(e?.listenbrainz?.tags||[]).map(x=>x?.name),...(e?.lastfm?.track_tags||[]).map(x=>x?.name)].filter(Boolean).slice(0,4);
    return tags.length?`„${name}“ bekommt den Vibe-Punkt auf Basis dokumentierter Tags wie ${tags.join(", ")}. Nicht vorhandene Audioeigenschaften werden nicht dazuerfunden.`:`Für die Atmosphäre fehlen belastbare Audio- oder Mood-Daten. „${name}“ erhält deshalb nur einen knappen Vorteil aus dem dokumentierten Songkontext.`
  }
  if(row.juror_key==="lyrics"){
    return e?.lyrics?.found?`Für „${name}“ lag ein LRCLIB-Text als Grundlage vor. Die Wertung stützt sich auf den analysierten Inhalt, ohne Textzeilen zu erfinden oder wörtlich zu zitieren.`:`Für die Textwertung fehlen ausreichende Lyrics-Daten. „${name}“ erhält nur einen knappen Vorteil aus Titel und dokumentiertem Songkontext.`
  }
  if(row.juror_key==="underdog"){
    const s=jurySignal(row);
    if(!s)return `Für beide Songs fehlt ein sauber vergleichbares Reichweiten- oder persönliches Hörsignal. Snoop erfindet deshalb keinen Popularitätsvorteil; die Stimme bleibt bewusst knapp.`;
    const mine=w===1?s.a:s.b,theirs=w===1?s.b:s.a;
    return mine<theirs?`„${name}“ bekommt den Underdog-Bonus: beim direkt vergleichbaren Signal ${s.label} liegt der Wert bei ${juryNumber(mine)} gegenüber ${juryNumber(theirs)}.`:`„${name}“ gewinnt diese Stimme trotz des kleineren Reichweitensignals von „${other}“. Der Themenfit verhindert hier einen automatischen Underdog-Bonus.`
  }
  if(row.juror_key==="connoisseur"){
    const album=String(e?.identity?.album||""),year=juryReleaseYears(e)[0],parts=[];if(album)parts.push(`Album „${album}“`);if(year)parts.push(`Release ${year}`);
    return parts.length?`„${name}“ bekommt Dr. Körnlis Punkt über den konkreteren Katalogkontext: ${parts.join(", ")}. Ein nicht belegter Deep-Cut-Status wird nicht behauptet.`:`Die Katalogdaten unterscheiden die beiden Picks kaum. „${name}“ erhält deshalb nur einen knappen Punkt; zusätzliche Katalogbehauptungen werden nicht erfunden.`
  }
  return String(row.reason||"")
}

function applyJuryTextPolish(){
  const r=currentRound(),subs=currentSubs(),rows=aiScores(),cards=[...document.querySelectorAll(".jurygrid .judge")];
  if(!r||!cards.length)return;
  cards.forEach((card,i)=>{const row=rows[i],p=card.querySelector("p.muted");if(row&&p)p.textContent=juryVisibleReason(row,r,subs)});
}
const juryTextObserver=new MutationObserver(()=>queueMicrotask(applyJuryTextPolish));
juryTextObserver.observe(document.getElementById("app"),{childList:true,subtree:true});
