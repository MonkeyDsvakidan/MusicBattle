async function startSuddenDeath(){const theme=SUDDEN_THEMES[Math.floor(Math.random()*SUDDEN_THEMES.length)],{error}=await sb.rpc("mb_start_sudden_death",{p_room_id:S.room.id,p_theme:theme});if(error){S.error=error.message;render();return}S.currentArtist=null;S.currentArtistSlot=null;await reloadRoomNow()}
async function placeSuddenArtist(){if(!S.currentArtist||![1,2].includes(S.currentArtistSlot))return;const slotNo=S.currentArtistSlot,{error}=await sb.from("mb_draft_picks").insert({room_id:S.room.id,player_user_id:S.user.id,player_slot:slotNo,round_number:6,spotify_artist_id:S.currentArtist.id,artist_name:S.currentArtist.name,artist_image_url:S.currentArtist.image||null});if(error)S.error=error.message;else{S.currentArtist=null;S.currentArtistSlot=null}await reloadRoomNow();if(isHost()&&S.picks.filter(p=>p.round_number===6).length===2){const {error:e}=await sb.rpc("mb_begin_sudden_battle",{p_room_id:S.room.id});if(e)S.error=e.message;await reloadRoomNow()}}
function renderTiebreak(){const p=weightedMatchPoints();$("app").innerHTML=`<section class="card suddenintro">${matchScoreboard()}<div class="eyebrow">NACH 5 RUNDEN · ${p.a}–${p.b}</div><h2>Sudden Death.</h2><p>Runde 5 hat doppelt gezählt – und trotzdem steht es unentschieden. Jetzt bekommt jeder Spieler einen neuen, bisher unbenutzten Künstler. Eine letzte Kategorie entscheidet das Match.</p>${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}${isHost()?`<button class="btn primary" id="startSudden">Sudden Death starten</button>`:`<div class="notice">Der Host startet die Entscheidungsrunde.</div>`}${roomExitControls()}</section>`;if($("startSudden"))$("startSudden").onclick=startSuddenDeath;bindRoomExitControls()}
function renderSuddenDraft(){const picks=S.picks.filter(p=>p.round_number===6),turn=picks.some(p=>p.player_slot===1)?2:1,mine=ownsPlayerSlot(turn),r=S.rounds.find(x=>x.round_number===6);$("app").innerHTML=`<section class="card">${matchScoreboard()}<div class="battle-title"><div class="eyebrow">SUDDEN DEATH · NEUE KÜNSTLER</div><h2>${esc(r?.theme||"Alles oder nichts")}</h2></div>${S.error?`<div class="notice error">${esc(S.error)}</div>`:""}<div class="suddencards">${[1,2].map(n=>{const p=picks.find(x=>x.player_slot===n);return`<div class="side"><div class="eyebrow">${esc(memberName(n))}</div>${p?`<h3>${esc(p.artist_name)}</h3><span class="chip">Künstler fixiert</span>`:(turn===n&&mine?`${S.currentArtist&&S.currentArtistSlot===n?`<div class="artistdraw">${S.currentArtist.image?`<img src="${esc(S.currentArtist.image)}">`:""}<h2>${esc(S.currentArtist.name)}</h2><button class="btn primary" id="lockSudden">Künstler übernehmen</button></div>`:`<button class="btn primary" id="drawSudden">Neuen Künstler ziehen</button>`}`:`<p class="muted">Wartet…</p>`)}</div>`}).join("")}</div>${roomExitControls()}</section>`;if($("drawSudden"))$("drawSudden").onclick=()=>drawArtist(turn);if($("lockSudden"))$("lockSudden").onclick=placeSuddenArtist;bindRoomExitControls();if(isHost()&&picks.length===2)sb.rpc("mb_begin_sudden_battle",{p_room_id:S.room.id}).then(()=>reloadRoomNow())}
function roundJuryMargin(roundId){const d=roundDecision(roundId),sc=d.scores;if(d.kind==="self"||!sc.length)return null;const x=scoreSummary(sc);return{margin:Math.abs(x.a-x.b),a:x.a,b:x.b}}
function renderFinished(){
  const p=weightedMatchPoints(),winner=p.a===p.b?null:(p.a>p.b?1:2),completed=S.rounds.filter(r=>r.status==="complete"&&r.winner_slot).sort((a,b)=>a.round_number-b.round_number),margins=completed.map(r=>({r,m:roundJuryMargin(r.id)})).filter(x=>x.m),closest=[...margins].sort((a,b)=>a.m.margin-b.m.margin)[0],strongest=[...margins].sort((a,b)=>b.m.margin-a.m.margin)[0],ai=S.scores.filter(s=>s.source==="ai"),jurorVotes={};
  for(const s of ai){const k=s.juror_name||s.juror_key||"Juror";if(!jurorVotes[k])jurorVotes[k]=[0,0];if(s.score_a>s.score_b)jurorVotes[k][0]++;else jurorVotes[k][1]++}
  $("app").innerHTML=`<section class="card finalwrap"><div class="finalscore"><div class="eyebrow">MATCH BEENDET</div><h2>${winner?`${esc(memberName(winner))} gewinnt`:"Unentschieden"}</h2><div class="big">${p.a} – ${p.b}</div><p class="muted">Matchpunkte · Runde 5 zählte doppelt${S.rounds.some(r=>r.round_number===6)?" · inkl. Sudden Death":""}</p></div><div class="statsgrid"><div class="statcard"><span>Gewonnene Battles</span><b>${completed.filter(r=>r.winner_slot===1).length} – ${completed.filter(r=>r.winner_slot===2).length}</b></div><div class="statcard"><span>Knappstes Jury-Battle</span><b>${closest?`Runde ${closest.r.round_number} · ${closest.m.a}–${closest.m.b}`:"–"}</b></div><div class="statcard"><span>Klarster Jury-Entscheid</span><b>${strongest?`Runde ${strongest.r.round_number} · ${strongest.m.a}–${strongest.m.b}`:"–"}</b></div></div><div class="roundsummary">${completed.map(r=>`<div class="member"><div><strong>${r.round_number===6?"Sudden Death":`Runde ${r.round_number}${r.round_number===5?" · ×2":""}`}</strong><small>${esc(r.theme)}${roundDecision(r.id).kind==="self"?" · Eigener Entscheid":""}</small></div><span class="chip">${esc(memberName(r.winner_slot))}</span></div>`).join("")}</div>${Object.keys(jurorVotes).length?`<div class="divider"></div><div class="eyebrow">KI-JURY IM MATCH</div><div class="jurorstats">${Object.entries(jurorVotes).map(([name,v])=>`<div class="member"><strong>${esc(name)}</strong><span>${esc(memberName(1))} ${v[0]} · ${v[1]} ${esc(memberName(2))}</span></div>`).join("")}</div>`:""}${roomExitControls()}</section>`;bindRoomExitControls();
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
  const w=jurySide(row),e=juryEvidence(row,w),o=juryEvidence(row,w===1?2:1),name=String(subs?.[w-1]?.song_name||e?.identity?.song||`Song ${w===1?"A":"B"}`),other=String(subs?.[w===1?1:0]?.song_name||o?.identity?.song||"der andere Song"),theme=String(r?.theme||"das Thema"),raw=String(row?.reason||"");
  const motifMatch=raw.match(/(?:Motive sind|rund um|wie)\s+([^\.]+)/i),motifs=(motifMatch?.[1]||"").trim(),hasMotifs=Boolean(motifs&&!/wenige direkte|keine|nicht verfügbar/i.test(motifs));

  if(row.juror_key==="theme"){
    const y=Number((theme+" "+String(r?.category||"")).match(/(?:19|20)\d{2}/)?.[0]||0),wy=juryReleaseYears(e),oy=juryReleaseYears(o);
    if(y&&wy.includes(y))return `„${name}“ erfüllt „${theme}“ direkt: die Release-Daten bestätigen ${y}. „${other}“ liegt bei ${oy.length?oy.join("/"):"einem nicht eindeutig bestätigten Jahr"} – deshalb geht der Themenpunkt an „${name}“.`;
    if(y&&oy.length&&!oy.includes(y))return `„${other}“ ist mit Release ${oy.join("/")} nicht als ${y}-Song belegt. Für „${name}“ fehlt zwar ebenfalls ein eindeutiger ${y}-Nachweis, aber der Gegenbeleg ist schwächer – deshalb nur 10–9 für „${name}“.`;
    if(hasMotifs)return `„${name}“ passt direkter zu „${theme}“: In den vorhandenen Songdaten tauchen konkrete Motive wie ${motifs} auf. Beim anderen Song ist dieser Bezug schwächer – deshalb geht der Punkt an „${name}“.`;
    return `Für „${theme}“ liefern beide Songs nur schwache direkte Belege. „${name}“ bekommt deshalb bewusst nur 10–9, weil der verfügbare Titel- und Songkontext etwas besser passt.`
  }

  if(row.juror_key==="vibe"){
    const tags=[...(e?.listenbrainz?.tags||[]).map(x=>x?.name),...(e?.lastfm?.track_tags||[]).map(x=>x?.name)].filter(Boolean).slice(0,4),otherTags=[...(o?.listenbrainz?.tags||[]).map(x=>x?.name),...(o?.lastfm?.track_tags||[]).map(x=>x?.name)].filter(Boolean).slice(0,4);
    if(tags.length)return `„${name}“ bekommt den Vibe-Punkt: dokumentierte Tags wie ${tags.join(", ")} stützen die Atmosphäre von „${theme}“ stärker${otherTags.length?` als die verfügbaren Tags zu „${other}“`:""}. Deshalb 10–9 für „${name}“.`;
    const context=[e?.genius?.description?"Genius-Kontext":null,e?.lyrics?.found?"Lyrics-Inhalt":null].filter(Boolean);
    return context.length?`Für „${name}“ liegen mit ${context.join(" und ")} zumindest indirekte Hinweise auf die Atmosphäre vor. Da echte Audio-/Mood-Daten fehlen, bleibt der Entscheid bewusst knapp bei 10–9.`:`Für beide Songs fehlen belastbare Audio- oder Mood-Daten. Der Vibe-Punkt ist deshalb nur schwach abgesichert und bleibt bei 10–9 für „${name}“.`
  }

  if(row.juror_key==="lyrics"){
    const otherHas=Boolean(o?.lyrics?.found);
    if(e?.lyrics?.found&&hasMotifs)return `„${name}“ liegt textlich vorn: Im ausgewerteten LRCLIB-Text zeigen sich stärkere Themenmotive rund um ${motifs}. Deshalb 10–9 für „${name}“, ohne Lyrics zu erfinden oder wörtlich zu zitieren.`;
    if(e?.lyrics?.found&&!otherHas)return `Für „${name}“ lag ein LRCLIB-Text als echte Inhaltsgrundlage vor, für „${other}“ nicht in gleicher Qualität. Deshalb erhält „${name}“ den knappen 10–9-Vorteil.`;
    if(e?.lyrics?.found&&otherHas)return `Für beide Songs lagen Lyrics als Grundlage vor. Die gespeicherte Analyse sieht bei „${name}“ den etwas stärkeren thematischen Inhalt, aber ohne klaren Abstand – deshalb nur 10–9.`;
    return `Für die Textwertung fehlen ausreichende Lyrics-Daten. „${name}“ erhält deshalb nur einen knappen 10–9-Vorteil aus Titel und dokumentiertem Songkontext.`
  }

  if(row.juror_key==="underdog"){
    const s=jurySignal(row);
    if(!s)return `Für beide Songs fehlt ein sauber vergleichbares Reichweiten- oder persönliches Hörsignal. Snoop erfindet deshalb keinen Popularitätsvorteil; die Stimme bleibt bewusst knapp.`;
    const mine=w===1?s.a:s.b,theirs=w===1?s.b:s.a;
    return mine<theirs?`„${name}“ ist beim vergleichbaren Signal ${s.label} klar der kleinere Pick: ${juryNumber(mine)} gegenüber ${juryNumber(theirs)}. Genau dafür bekommt er den Underdog-Punkt.`:`„${other}“ wäre beim Signal ${s.label} zwar der kleinere Pick (${juryNumber(theirs)} vs. ${juryNumber(mine)}), aber der Themenfit reicht nicht für den Bonus. Deshalb bleibt die Stimme bei „${name}“.`
  }

  if(row.juror_key==="connoisseur"){
    const album=String(e?.identity?.album||""),otherAlbum=String(o?.identity?.album||""),year=juryReleaseYears(e)[0],otherYear=juryReleaseYears(o)[0],s=jurySignal(row),parts=[],otherParts=[];
    if(album)parts.push(`Album „${album}“`);if(year)parts.push(`Release ${year}`);
    if(otherAlbum)otherParts.push(`Album „${otherAlbum}“`);if(otherYear)otherParts.push(`Release ${otherYear}`);
    if(s){const mine=w===1?s.a:s.b,theirs=w===1?s.b:s.a;if(mine<theirs)parts.push(`kleineres ${s.label}-Signal (${juryNumber(mine)} vs. ${juryNumber(theirs)})`)}
    if(parts.length)return `„${name}“ bekommt Dr. Körnlis Punkt über den konkreteren Katalogkontext: ${parts.join(", ")}${otherParts.length?`; „${other}“ bringt ${otherParts.join(", ")} mit`:""}. Der Vorteil bleibt 10–9, weil daraus kein unbelegter Deep-Cut-Status abgeleitet wird.`;
    return `Die verfügbaren Katalogdaten unterscheiden die beiden Picks kaum. „${name}“ erhält deshalb nur 10–9; zusätzliche Katalogbehauptungen werden nicht erfunden.`
  }

  return raw
}

function applyJuryTextPolish(){
  const r=currentRound(),subs=currentSubs(),rows=aiScores(),cards=[...document.querySelectorAll(".jurygrid .judge")];
  if(!r||!cards.length)return;
  cards.forEach((card,i)=>{const row=rows[i],p=card.querySelector("p.muted");if(row&&p){const next=juryVisibleReason(row,r,subs);if(p.textContent!==next)p.textContent=next}});
}
const juryTextObserver=new MutationObserver(()=>queueMicrotask(applyJuryTextPolish));
juryTextObserver.observe(document.getElementById("app"),{childList:true,subtree:true});
