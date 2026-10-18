/* votes.js – Kategorie-Abstimmung (Roadmap 6.3, Entscheidung G): reine Auswertung ohne DOM/Netz.
   Klassisches Skript mit globalen Namen; zusätzlich für node --test exportiert (tests/votes.test.js).
   Regeln: Sind Juroren im Raum, zählen nur Juroren-Stimmen, sonst die der Spieler. Pro Kategorie gewinnt
   die Mehrheit, Gleichstand zählt für keinen. Wer mehr Kategorien gewinnt, gewinnt die Runde; sonst
   Gleichstand → der Host entscheidet. */

const VOTE_CATEGORIES=[
  {key:"theme",label:"Thema",question:"Welcher Song trifft das Thema besser?"},
  {key:"vibe",label:"Vibe",question:"Welcher Song hat den besseren Vibe?"},
  {key:"lyrics",label:"Lyrics",question:"Welcher Song hat die stärkeren Lyrics?"},
  {key:"surprise",label:"Überraschung",question:"Welcher Song war die grössere Überraschung?"},
  {key:"connoisseur",label:"Kenner-Wahl",question:"Welchen Song würden echte Kenner wählen?"}
];

// Stimmen, die zählen: mit Juroren im Raum nur Juroren, sonst nur Spieler
function countedVotes(votes,hasJurors){
  const role=hasJurors?"juror":"player";
  return (votes||[]).filter(v=>v&&v.voter_role===role&&(v.choice===1||v.choice===2));
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

if(typeof module!=="undefined")module.exports={VOTE_CATEGORIES,countedVotes,categoryResult,voteProgress,eligibleVoters};
