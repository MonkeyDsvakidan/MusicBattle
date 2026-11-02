/* jury.js – Jury: Scorecards, eigener Entscheid, Auto-Jury, Rundenwertung (roundDecision)
   Die Begründungen werden so angezeigt, wie die Jury sie liefert (MutationObserver-Überschreibung in Roadmap 2.4 entfernt).
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

async function submitHumanScore(winner,close){const r=currentRound(),subs=currentSubs();if(!r||!subs[0]||!subs[1])return;const a=winner===1?10:(close?9:8),b=winner===2?10:(close?9:8),{error}=await sb.from("mb_jury_scores").insert({round_id:r.id,room_id:S.room.id,source:"human",juror_user_id:S.user.id,juror_name:jurorMembership()?.display_name||"Juror",score_a:a,score_b:b,reason:close?"Knapper Entscheid":"Klarer Entscheid",details:{kind:"human"}});if(error)S.error=error.message;await reloadRoomNow()}

// Kategorie-Abstimmung (Roadmap 6.3.3): Stimmzettel eines Mitglieds über die RPC speichern
let castVotesRunning=false;
async function castCategoryVotes(memberId){
  const r=currentRound(),choices=S.ballot[memberId]||{};
  if(!r||castVotesRunning)return;
  if(!VOTE_CATEGORIES.every(c=>choices[c.key]===1||choices[c.key]===2)){S.error="Bitte in allen fünf Kategorien einen Song wählen.";render();return}
  castVotesRunning=true;S.error="";
  try{
    const {error}=await sb.rpc("mb_cast_category_votes",{p_round_id:r.id,p_member_id:memberId,p_votes:choices});
    if(error)throw error;
    delete S.ballot[memberId];if(S.voteEditing===memberId)S.voteEditing="";
    await reloadRoomNow();
  }catch(e){S.error=voteErrorText(e?.message||String(e));render()}
  finally{castVotesRunning=false}
}
function voteErrorText(m){if(/voting closed/i.test(m))return"Die Abstimmung für diese Runde ist schon geschlossen.";if(/only jurors/i.test(m))return"Es sind Juroren im Raum – nur sie stimmen ab.";if(/only players/i.test(m))return"Ohne Juroren stimmen die Spieler ab.";if(/not revealed/i.test(m))return"Abstimmen geht erst, wenn beide Songs aufgedeckt sind.";return m}

let selfDecisionRunning=false;

async function submitSelfDecision(winner){
  if(!isHost()||selfDecisionRunning)return;
  const r=currentRound(),subs=currentSubs(),jurors=S.members.filter(m=>m.role==="juror");
  if(!r||!subs[0]||!subs[1])return;
  const tie=roundVoteResult(r.id,true),tieBreak=Boolean(tie?.complete&&!tie.winner);
  if(jurors.length&&!tieBreak){S.error="Selber entscheiden ist nur möglich, wenn keine menschlichen Juroren im Spiel sind.";render();return}
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
  aiJuryRunning=true;S.error="";S.notice="Die Jury bewertet die Songs …";render();
  let timer=null;
  try{
    const invoke=sb.functions.invoke("mb-jury",{body:{room_id:S.room.id,round_id:r.id}});
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Die Jury hat nach 40 Sekunden nicht geantwortet. Bitte erneut starten.")),40000)});
    const {data,error}=await Promise.race([invoke,timeout]);
    if(error){
      let detail=error.message||"Unbekannter Edge-Function-Fehler";
      try{if(error.context){const body=await error.context.json();detail=[body?.error,body?.detail,body?.provider_detail].filter(Boolean).join(": ")||detail}}catch{}
      throw new Error(detail);
    }
    if(data?.error)throw new Error([data.error,data.detail,data.provider_detail].filter(Boolean).join(": "));
    S.notice="Die Jury ist bereit.";S.aiReveal=0;await reloadRoomNow();
  }catch(e){
    S.notice="";S.error=`Die Jury konnte nicht ausgeführt werden: ${e?.message||String(e)}`;render();
  }finally{
    if(timer)clearTimeout(timer);
    aiJuryRunning=false;
  }
}

function scoreSummary(scores){let a=0,b=0;for(const s of scores){a+=s.score_a;b+=s.score_b}return{a,b,winner:a===b?null:(a>b?1:2)}}

/* jury-ui */
// Rangfolge pro Runde (Entscheid 1.1): mit Juror im Raum zählt nur die menschliche Jury;
// ohne Juror schlägt ein eigener Entscheid des Hosts die Auto-Jury. Nie gemischt.
// Nur ein Eintrag des Hosts zählt als eigener Entscheid (6.3.4; die Datenbank verbietet ihn Juroren zusätzlich)
function isSelfDecision(s){return s?.source==="human"&&s?.details?.kind==="self_decision"&&(!S.room?.host_user_id||s.juror_user_id===S.room.host_user_id)}

// Abstimmung einer Runde auswerten (6.3.4). live: Juroren aus dem aktuellen Raum, sonst aus den Stimmen selbst
function roundVoteResult(roundId,live=false){
  const votes=S.votes.filter(v=>v.round_id===roundId);
  if(!votes.length)return null;
  const hasJurors=live?S.members.some(m=>m.role==="juror"):votes.some(v=>v.voter_role==="juror");
  const result=categoryResult(votes,{hasJurors});
  const progress=live?voteProgress(votes,eligibleVoters(S.members)):{complete:true};
  return{...result,hasJurors,complete:progress.complete};
}

function roundDecision(roundId,live=false){
  const sc=S.scores.filter(s=>s.round_id===roundId);
  // Abstimmung in fünf Kategorien (Entscheidung G) hat Vorrang, sobald sie einen Sieger hat
  const vote=roundVoteResult(roundId,live);
  if(vote?.complete&&vote.winner)return{kind:"vote",scores:[],winner:vote.winner,vote};
  // Gleichstand der Abstimmung: der eigene Entscheid des Hosts gilt – auch mit Juroren im Raum (Entscheidung G)
  if(vote?.complete&&!vote.winner){const self=sc.filter(isSelfDecision);if(self.length)return{kind:"self",scores:self.slice(-1)}}
  const juror=sc.filter(s=>s.source==="human"&&!isSelfDecision(s));
  if(juror.length||(live&&S.members.some(m=>m.role==="juror")))return{kind:"juror",scores:juror};
  const self=sc.filter(isSelfDecision);
  if(self.length)return{kind:"self",scores:self.slice(-1)};
  const ai=sc.filter(s=>s.source==="ai");
  return ai.length?{kind:"ai",scores:ai}:{kind:"none",scores:[]};
}

async function finalizeRound(){const r=currentRound();if(!r)return;const d=roundDecision(r.id,true),use=d.scores;
  if(d.kind==="vote"){const {error}=await sb.rpc("mb_advance_round",{p_room_id:S.room.id,p_round_number:r.round_number,p_winner_slot:d.winner});if(error)S.error=error.message;S.aiReveal=0;await reloadRoomNow();return}
  const pendingVote=roundVoteResult(r.id,true);if(pendingVote&&!pendingVote.complete&&!use.length){S.error="Noch haben nicht alle abgestimmt.";render();return}if(!use.length){S.error=d.kind==="juror"?"Noch keine Scorecard der Juroren vorhanden.":"Noch keine Jury-Wertung vorhanden.";render();return}const x=scoreSummary(use);if(!x.winner){S.error=d.kind==="juror"?"Score ist unentschieden. Bitte eine weitere menschliche Jurorin/einen weiteren Juror abstimmen lassen.":"Score ist unentschieden. Bitte den Rundensieger selber wählen.";render();return}const {error}=await sb.rpc("mb_advance_round",{p_room_id:S.room.id,p_round_number:r.round_number,p_winner_slot:x.winner});if(error)S.error=error.message;S.aiReveal=0;await reloadRoomNow()}

function roundJuryMargin(roundId){const d=roundDecision(roundId),sc=d.scores;if(d.kind==="vote")return{margin:Math.abs(d.vote.won.a-d.vote.won.b),a:d.vote.won.a,b:d.vote.won.b,unit:"Kategorien"};if(d.kind==="self"||!sc.length)return null;const x=scoreSummary(sc);return{margin:Math.abs(x.a-x.b),a:x.a,b:x.b}}
