/* jury.js – Jury: Scorecards, eigener Entscheid, Auto-Jury, Rundenwertung (roundDecision), Jury-Texte
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

async function submitHumanScore(winner,close){const r=currentRound(),subs=currentSubs();if(!r||!subs[0]||!subs[1])return;const a=winner===1?10:(close?9:8),b=winner===2?10:(close?9:8),{error}=await sb.from("mb_jury_scores").insert({round_id:r.id,room_id:S.room.id,source:"human",juror_user_id:S.user.id,juror_name:jurorMembership()?.display_name||"Juror",score_a:a,score_b:b,reason:close?"Knapper Entscheid":"Klarer Entscheid",details:{kind:"human"}});if(error)S.error=error.message;await reloadRoomNow()}

let selfDecisionRunning=false;

async function submitSelfDecision(winner){
  if(!isHost()||selfDecisionRunning)return;
  const r=currentRound(),subs=currentSubs(),jurors=S.members.filter(m=>m.role==="juror");
  if(!r||!subs[0]||!subs[1])return;
  if(jurors.length){S.error="Selber entscheiden ist nur möglich, wenn keine menschlichen Juroren im Spiel sind.";render();return}
  const chosen=subs[winner-1];
  if(!(await mbConfirm(`„${chosen.song_name}“ als Rundensieger wählen? Die Runde wird sofort gewertet.`,{title:"Selber entscheiden",confirmLabel:"Ja, Sieger festlegen"})))return;
  selfDecisionRunning=true;S.error="";
  try{
    // Pro Runde und Host nur ein eigener Entscheid (Index mb_human_score_once)
    if(!S.scores.some(s=>s.round_id===r.id&&isSelfDecision(s))){
      const {error}=await sb.from("mb_jury_scores").insert({
        round_id:r.id,room_id:S.room.id,source:"human",juror_user_id:S.user.id,
        juror_name:"Eigener Entscheid",score_a:winner===1?10:9,score_b:winner===2?10:9,
        reason:`Manueller Entscheid: ${chosen.song_name}`,details:{kind:"self_decision",winner_slot:winner}
      });
      if(error)throw error;
    }
    await reloadRoomNow();
    // Der Entscheid ist bereits bestätigt – Runde direkt übernehmen
    await finalizeRound();
  }catch(e){S.error=e?.message||String(e);render()}
  finally{selfDecisionRunning=false}
}

let aiJuryRunning=false;

async function runAIJury(){
  const r=currentRound();if(!r||aiJuryRunning)return;
  aiJuryRunning=true;S.error="";S.notice="KI-Jury sammelt Songdaten und bewertet …";render();
  let timer=null;
  try{
    const invoke=sb.functions.invoke("mb-ai-jury",{body:{room_id:S.room.id,round_id:r.id}});
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Die KI-Jury hat nach 40 Sekunden nicht geantwortet. Bitte erneut starten.")),40000)});
    const {data,error}=await Promise.race([invoke,timeout]);
    if(error){
      let detail=error.message||"Unbekannter Edge-Function-Fehler";
      try{if(error.context){const body=await error.context.json();detail=[body?.error,body?.detail,body?.provider_detail].filter(Boolean).join(": ")||detail}}catch{}
      throw new Error(detail);
    }
    if(data?.error)throw new Error([data.error,data.detail,data.provider_detail].filter(Boolean).join(": "));
    S.notice="KI-Jury ist bereit.";S.aiReveal=0;await reloadRoomNow();
  }catch(e){
    S.notice="";S.error=`KI-Jury konnte nicht ausgeführt werden: ${e?.message||String(e)}`;render();
  }finally{
    if(timer)clearTimeout(timer);
    aiJuryRunning=false;
  }
}

function scoreSummary(scores){let a=0,b=0;for(const s of scores){a+=s.score_a;b+=s.score_b}return{a,b,winner:a===b?null:(a>b?1:2)}}

/* jury-ui */
// Rangfolge pro Runde (Entscheid 1.1): mit Juror im Raum zählt nur die menschliche Jury;
// ohne Juror schlägt ein eigener Entscheid des Hosts die Auto-Jury. Nie gemischt.
function isSelfDecision(s){return s?.source==="human"&&s?.details?.kind==="self_decision"}

function roundDecision(roundId,live=false){
  const sc=S.scores.filter(s=>s.round_id===roundId);
  const juror=sc.filter(s=>s.source==="human"&&!isSelfDecision(s));
  if(juror.length||(live&&S.members.some(m=>m.role==="juror")))return{kind:"juror",scores:juror};
  const self=sc.filter(isSelfDecision);
  if(self.length)return{kind:"self",scores:self.slice(-1)};
  const ai=sc.filter(s=>s.source==="ai");
  return ai.length?{kind:"ai",scores:ai}:{kind:"none",scores:[]};
}

async function finalizeRound(){const r=currentRound();if(!r)return;const d=roundDecision(r.id,true),use=d.scores;if(!use.length){S.error=d.kind==="juror"?"Noch keine Scorecard der Juroren vorhanden.":"Noch keine Jury-Wertung vorhanden.";render();return}const x=scoreSummary(use);if(!x.winner){S.error=d.kind==="juror"?"Score ist unentschieden. Bitte eine weitere menschliche Jurorin/einen weiteren Juror abstimmen lassen.":"Score ist unentschieden. Bitte den Rundensieger selber wählen.";render();return}const {error}=await sb.rpc("mb_advance_round",{p_room_id:S.room.id,p_round_number:r.round_number,p_winner_slot:x.winner});if(error)S.error=error.message;S.aiReveal=0;await reloadRoomNow()}

function roundJuryMargin(roundId){const d=roundDecision(roundId),sc=d.scores;if(d.kind==="self"||!sc.length)return null;const x=scoreSummary(sc);return{margin:Math.abs(x.a-x.b),a:x.a,b:x.b}}

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
