/* jury.js – Rundenwertung: Kategorie-Abstimmung speichern, eigener Entscheid des Hosts bei Gleichstand,
   roundDecision, finalizeRound. «Die Jury» (automatische Juroren) wurde in J.R (26.11.2026) entfernt.
   Klassisches Skript, globale Namen. */

// Kategorie-Abstimmung (Roadmap 6.3.3): Stimmzettel eines Mitglieds über die RPC speichern
let castVotesRunning=false;
async function castCategoryVotes(memberId){
  const r=currentRound(),choices=S.ballot[memberId]||{};
  if(!r||castVotesRunning)return;
  const allowed=ballotChoices(S.members.find(m=>m.id===memberId));
  if(!VOTE_CATEGORIES.every(c=>allowed.includes(choices[c.key]))){S.error="Bitte in allen fünf Kategorien einen Song wählen.";render();return}
  castVotesRunning=true;S.error="";
  try{
    const {error}=await sb.rpc("mb_cast_category_votes",{p_round_id:r.id,p_member_id:memberId,p_votes:choices});
    if(error)throw error;
    delete S.ballot[memberId];if(S.voteEditing===memberId)S.voteEditing="";
    await reloadRoomNow();
  }catch(e){S.error=voteErrorText(e?.message||String(e));render()}
  finally{castVotesRunning=false}
}
// Wählbare Songs (Ecken) für ein Mitglied: 1v1 beide, Gruppe die Ecken der Runde (ab 3 ohne die eigene)
function ballotChoices(member){
  if(!isGroupRoom())return[1,2];
  const r=currentRound();return groupChoices(cornersInPlay(S.room,r?.round_number),member);
}
function voteErrorText(m){if(/voting closed/i.test(m))return"Die Abstimmung für diese Runde ist schon geschlossen.";if(/only jurors/i.test(m))return"Es sind Juroren im Raum – nur sie stimmen ab.";if(/only players/i.test(m))return"Ohne Juroren stimmen die Spieler ab.";if(/not revealed/i.test(m))return"Abstimmen geht erst, wenn beide Songs aufgedeckt sind.";return m}

let selfDecisionRunning=false;

async function submitSelfDecision(winner){
  if(!isHost()||selfDecisionRunning)return;
  const r=currentRound(),subs=currentSubs();
  if(!r||!subs[0]||!subs[1])return;
  const tie=roundVoteResult(r.id,true);
  if(!(tie?.complete&&!tie.winner)){S.error="Selber entscheiden geht nur bei Gleichstand der Abstimmung.";render();return}
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

// Eigener Entscheid des Hosts (bei Gleichstand der Abstimmung, Entscheidung G); die Datenbank verbietet ihn Juroren
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

// Wertung einer Runde: Sieger der Abstimmung, sonst (Gleichstand) der eigene Entscheid des Hosts
function roundDecision(roundId,live=false){
  const vote=roundVoteResult(roundId,live);
  if(vote?.complete&&vote.winner)return{kind:"vote",winner:vote.winner,vote};
  const self=S.scores.filter(s=>s.round_id===roundId&&isSelfDecision(s)).slice(-1)[0];
  if(self)return{kind:"self",winner:Number(self.score_a)>Number(self.score_b)?1:2,self};
  return{kind:vote&&!vote.complete?"pending":"none",winner:null};
}

async function finalizeRound(){
  const r=currentRound();if(!r)return;const d=roundDecision(r.id,true);
  if(!d.winner){S.error=d.kind==="pending"?"Noch haben nicht alle abgestimmt.":"Unentschieden – bitte den Rundensieger selber wählen.";render();return}
  const {error}=await sb.rpc("mb_advance_round",{p_room_id:S.room.id,p_round_number:r.round_number,p_winner_slot:d.winner});
  if(error)S.error=error.message;await reloadRoomNow();
}

// Abstand im Endstand (gewonnene Kategorien); nur für Abstimmungs-Runden
function roundJuryMargin(roundId){const d=roundDecision(roundId);return d.kind==="vote"?{margin:Math.abs(d.vote.won.a-d.vote.won.b),a:d.vote.won.a,b:d.vote.won.b}:null}

// Gruppe (M.5): Host übernimmt die Runde, der Server rechnet die Punkte (mb_advance_round).
// winner nur in der Entscheidung bei Gleichstand: der Host wählt einen der Gleichen.
let groupFinalizeRunning=false;
async function finalizeGroupRound(winner=null){
  const r=currentRound();if(!r||!isHost()||groupFinalizeRunning)return;
  if(winner&&!(await mbConfirm(`${cornerLabel(S.members,winner,Boolean(S.room?.team_mode))} gewinnt die Entscheidung?`,{title:"Selber entscheiden",confirmLabel:"Ja, Sieger festlegen"})))return;
  groupFinalizeRunning=true;S.error="";
  try{
    const {error}=await sb.rpc("mb_advance_round",{p_room_id:S.room.id,p_round_number:r.round_number,p_winner_slot:winner});
    if(error)throw error;
    await reloadRoomNow();
  }catch(e){S.error=e?.message||String(e);render()}
  finally{groupFinalizeRunning=false}
}
