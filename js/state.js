/* state.js – Zustand (S), DOM-Helfer und Abfragen auf Raum/Mitglieder/Runden
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

const S={user:null,room:null,members:[],picks:[],rounds:[],subs:[],scores:[],membership:null,currentArtist:null,currentArtistSlot:null,artistPools:{1:[],2:[]},spotifyProfiles:{1:null,2:null},spotify:{1:{access:"",refresh:"",expires:0,player:null,deviceId:""},2:{access:"",refresh:"",expires:0,player:null,deviceId:""}},searchResults:{1:[],2:[]},searchQuery:{1:"",2:""},notice:"",error:"",aiReveal:0};

const $=id=>document.getElementById(id);

const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function roomStorage(){return JSON.parse(localStorage.getItem("mb_online_room")||"null")}

 function saveRoom(x){localStorage.setItem("mb_online_room",JSON.stringify(x))}

 function clearRoom(){localStorage.removeItem("mb_online_room")}

 function ownedMemberships(){return S.members.filter(m=>m.user_id===S.user?.id)}

 function membershipForSlot(slotNo){return S.members.find(m=>m.user_id===S.user?.id&&m.role==="player"&&m.player_slot===slotNo)||null}

 function ownsPlayerSlot(slotNo){return Boolean(membershipForSlot(slotNo))}

 function jurorMembership(){return S.members.find(m=>m.user_id===S.user?.id&&m.role==="juror")||null}

 function role(){return jurorMembership()?"juror":(ownedMemberships().some(m=>m.role==="player")?"player":null)}

 function slot(){const a=ownedMemberships().filter(m=>m.role==="player");return a.length===1?a[0].player_slot:null}

 function isHost(){return S.room?.host_user_id===S.user?.id}

 function memberName(slotNo){return S.members.find(m=>m.player_slot===slotNo)?.display_name||`Spieler ${slotNo}`}

 function juryScores(){return S.scores.filter(x=>x.round_id===currentRound()?.id)}

 function humanScores(){return juryScores().filter(x=>x.source==="human")}

 function aiScores(){return juryScores().filter(x=>x.source==="ai")}

 function currentRound(){return S.rounds.find(r=>r.round_number===Number(S.room?.current_round||1))}

 function currentPicks(){const n=Number(S.room?.current_round||1);return [S.picks.find(p=>p.round_number===n&&p.player_slot===1),S.picks.find(p=>p.round_number===n&&p.player_slot===2)]}

 function currentSubs(){const rid=currentRound()?.id;return [S.subs.find(x=>x.round_id===rid&&x.player_slot===1),S.subs.find(x=>x.round_id===rid&&x.player_slot===2)]}

function resetLocalRoomState(){clearRoom();if(channel){try{sb.removeChannel(channel)}catch{}channel=null}for(const n of [1,2])clearSpotifySlot(n);S.room=null;S.members=[];S.picks=[];S.rounds=[];S.subs=[];S.scores=[];S.membership=null;S.currentArtist=null;S.currentArtistSlot=null;S.aiReveal=0;S.notice="";S.error=""}

function weightedMatchPoints(){
  let a=0,b=0;
  for(const r of S.rounds.filter(x=>x.status==="complete"&&x.winner_slot)){
    const w=r.round_number===5?2:1;
    if(r.winner_slot===1)a+=w; else if(r.winner_slot===2)b+=w;
  }
  return{a,b};
}
