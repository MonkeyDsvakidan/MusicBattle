/* votes.js – Kategorie-Abstimmung (Roadmap 6.3, Entscheidung G): reine Auswertung ohne DOM/Netz.
   Klassisches Skript mit globalen Namen; zusätzlich für node --test exportiert (tests/votes.test.js).
   Regeln: Sind Juroren im Raum, zählen nur Juroren-Stimmen, sonst die der Spieler. Pro Kategorie gewinnt
   die Mehrheit, Gleichstand zählt für keinen. Wer mehr Kategorien gewinnt, gewinnt die Runde; sonst
   Gleichstand → der Host entscheidet. */

const VOTE_CATEGORIES=[
  {key:"theme",label:"Thema",question:"Welcher Song trifft das Thema besser?",groupQuestion:"Welcher Song trifft das Thema am besten?"},
  {key:"vibe",label:"Vibe",question:"Welcher Song hat den besseren Vibe?",groupQuestion:"Welcher Song hat den besten Vibe?"},
  {key:"lyrics",label:"Lyrics",question:"Welcher Song hat die stärkeren Lyrics?",groupQuestion:"Welcher Song hat die stärksten Lyrics?"},
  {key:"surprise",label:"Überraschung",question:"Welcher Song war die grössere Überraschung?",groupQuestion:"Welcher Song war die grösste Überraschung?"},
  {key:"connoisseur",label:"Kenner-Wahl",question:"Welchen Song würden echte Kenner wählen?",groupQuestion:"Welchen Song würden echte Kenner wählen?"}
];

// Stimmen, die zählen: mit Juroren im Raum nur Juroren, sonst nur Spieler
function countedVotes(votes,hasJurors){
  const role=hasJurors?"juror":"player";
  return (votes||[]).filter(v=>v&&v.voter_role===role&&Number.isInteger(v.choice)&&v.choice>=1&&v.choice<=6);
}

/**
 * @param {Array} votes  Zeilen aus mb_category_votes einer Runde ({category, choice, voter_role, voter_member_id})
 * @param {{hasJurors:boolean}} opts
 * @returns {{categories:Array<{key,label,a,b,winner:1|2|null}>, won:{a:number,b:number}, winner:1|2|null, voters:number}}
 */
function categoryResult(votes,{hasJurors=false}={}){
  const counted=countedVotes(votes,hasJurors);
  const categories=VOTE_CATEGORIES.map(c=>{
    const mine=counted.filter(v=>v.category===c.key);
    const a=mine.filter(v=>v.choice===1).length,b=mine.filter(v=>v.choice===2).length;
    return{key:c.key,label:c.label,a,b,winner:a>b?1:b>a?2:null};
  });
  const won={a:categories.filter(c=>c.winner===1).length,b:categories.filter(c=>c.winner===2).length};
  const voters=new Set(counted.map(v=>v.voter_member_id||`${v.voter_user_id}:${v.voter_slot}`)).size;
  return{categories,won,winner:won.a>won.b?1:won.b>won.a?2:null,voters};
}

/**
 * Wer hat schon vollständig (alle fünf Kategorien) abgestimmt?
 * @param {Array} votes  Zeilen aus mb_category_votes einer Runde
 * @param {Array} eligible  berechtigte Mitglieder ({id, display_name, ...})
 * @returns {{done:number,total:number,complete:boolean,missing:Array}}
 */
function voteProgress(votes,eligible){
  const list=eligible||[];
  const doneIds=new Set(list.filter(m=>VOTE_CATEGORIES.every(c=>(votes||[]).some(v=>v.voter_member_id===m.id&&v.category===c.key))).map(m=>m.id));
  const missing=list.filter(m=>!doneIds.has(m.id));
  return{done:doneIds.size,total:list.length,complete:list.length>0&&missing.length===0,missing};
}

// Wer darf abstimmen? Mit Juroren im Raum die Juroren, sonst die Spieler (Mitglieder-Zeilen)
function eligibleVoters(members){
  const jurors=(members||[]).filter(m=>m.role==="juror");
  return jurors.length?jurors:(members||[]).filter(m=>m.role==="player");
}

// ---------- Gruppe (M.5): Stimmen = Punkte, gleiche Regeln wie mb_cast_category_votes / mb_advance_round ----------

// Wer stimmt in einer Gruppen-Runde ab? Mit Juroren nur sie; in der Entscheidung (Runde 6) nicht die
// Punktgleichen, solange es andere Spieler gibt
function groupEligibleVoters(members,corners,roundNumber){
  const all=eligibleVoters(members);
  if(all.some(m=>m.role==="juror")||Number(roundNumber)!==6)return all;
  const others=all.filter(m=>!corners.includes(m.corner??m.player_slot));
  return others.length?others:all;
}

// Wofür darf diese Person stimmen? Ab 3 Ecken nicht für die eigene (Spieler), sonst frei
function groupChoices(corners,voter){
  const own=voter?.role==="player"?(voter.corner??voter.player_slot):null;
  return corners.filter(c=>corners.length<3||c!==own);
}

/**
 * Punkte einer Gruppen-Runde: jede gezählte Stimme = 1 Punkt für die gewählte Ecke.
 * @returns {{points:Object<number,number>, top:number[], winner:number|null}} winner nur ohne Gleichstand
 */
function groupRoundPoints(votes,corners,{hasJurors=false}={}){
  const counted=countedVotes(votes,hasJurors);
  const points=Object.fromEntries(corners.map(c=>[c,counted.filter(v=>v.choice===c).length]));
  const max=Math.max(0,...Object.values(points));
  const top=corners.filter(c=>points[c]===max);
  return{points,top,winner:top.length===1?top[0]:null};
}

/**
 * Zwischenstand: Punkte aller gewerteten Runden (mb_rounds.points), letzte Runde doppelt,
 * plus optional die laufende Runde (live). Rangliste mit geteilten Plätzen.
 * @returns {Array<{corner,total,rank}>} absteigend sortiert
 */
function groupStandings(rounds,cornerCount,roundCount,live){
  const n=Math.max(2,Number(cornerCount)||2),last=Number(roundCount)||5;
  const totals=Array.from({length:n},(_,i)=>({corner:i+1,total:0}));
  const add=(roundNumber,points)=>{if(Number(roundNumber)>last)return;const w=Number(roundNumber)===last?2:1;for(const t of totals)t.total+=(Number(points?.[t.corner])||0)*w};
  for(const r of rounds||[])if(r.status==="complete"&&r.points&&(!live||r.round_number!==live.round_number))add(r.round_number,r.points);
  if(live)add(live.round_number,live.points);
  totals.sort((a,b)=>b.total-a.total||a.corner-b.corner);
  totals.forEach((t,i)=>{t.rank=i&&t.total===totals[i-1].total?totals[i-1].rank:i+1});
  return totals;
}

/**
 * Endstand (M.6): Totale wie groupStandings; hat die Entscheidung (Runde 6) einen Sieger, ist er Platz 1
 * und die übrigen Punktgleichen teilen Platz 2 (die anderen behalten ihren Platz).
 * @returns {Array<{corner,total,rank,decided?}>} absteigend nach Platz
 */
function groupFinalStandings(rounds,cornerCount,roundCount){
  const table=groupStandings(rounds,cornerCount,roundCount);
  const w=Number((rounds||[]).find(r=>Number(r.round_number)===6&&r.status==="complete")?.winner_slot)||null;
  const win=w&&table.find(t=>t.corner===w&&t.rank===1);if(!win)return table;
  for(const t of table)if(t.rank===1&&t!==win)t.rank=2;
  win.decided=true;
  return[win,...table.filter(t=>t!==win)];
}

if(typeof module!=="undefined")module.exports={VOTE_CATEGORIES,countedVotes,categoryResult,voteProgress,eligibleVoters,groupEligibleVoters,groupChoices,groupRoundPoints,groupStandings,groupFinalStandings};
