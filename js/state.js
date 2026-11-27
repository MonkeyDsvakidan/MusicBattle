/* state.js – Zustand (S), DOM-Helfer und Abfragen auf Raum/Mitglieder/Runden
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

const S={user:null,room:null,members:[],picks:[],rounds:[],subs:[],scores:[],membership:null,currentArtist:null,currentArtistSlot:null,artistPools:{1:[],2:[]},spotifyProfiles:{1:null,2:null},spotify:{1:{access:"",refresh:"",expires:0,player:null,deviceId:""},2:{access:"",refresh:"",expires:0,player:null,deviceId:""}},searchResults:{1:[],2:[]},searchQuery:{1:"",2:""},suggestions:{},notice:"",error:"",votes:[],ballot:{},voteHandover:"",voteEditing:"",quizQuestions:[],quizAnswers:[],quizSolutions:[],quizSitouts:[]};

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

// Gruppenmodus (M.2): 3–6 Personen, jede auf dem eigenen Gerät mit genau einem Platz
 function isGroupRoom(){return S.room?.game_mode==="group"}

 function ownGroupSeat(){return ownedMemberships().find(m=>m.role==="player")?.player_slot||null}

// Ecken (M.3): im 1v1 Ecke = Platz; Runden/Ecken aus dem Raum (alte Räume ohne Werte: 5 Runden, 2 Ecken)
 function roundCount(){return Number(S.room?.round_count)||5}

 function cornerCount(){return Number(S.room?.corner_count)||2}

 function myCorners(){return ownedMemberships().filter(m=>m.role==="player").map(m=>m.corner??m.player_slot)}

 function ownsCorner(c){return myCorners().includes(c)}

// Speicherplatz des Künstler-Pools für eine Ecke: Gruppe immer 1 (ein Platz je Gerät), 1v1 = Ecke
 function poolSlot(corner){return isGroupRoom()?1:corner}

// Eigener Skip ist pro Ecke einmal (im Team für alle zusammen)
 function cornerPick(c){const n=Number(S.room?.current_round||1);return S.picks.find(p=>p.round_number===n&&p.player_slot===c)}

 function cornerSub(c){const rid=currentRound()?.id;return S.subs.find(x=>x.round_id===rid&&x.player_slot===c)}

 function cornerSkipUsed(c){return S.members.some(m=>m.role==="player"&&(m.corner??m.player_slot)===c&&m.draft_skip_used)}

 function memberName(slotNo){return S.members.find(m=>m.player_slot===slotNo)?.display_name||`Spieler ${slotNo}`}

 function currentRound(){return S.rounds.find(r=>r.round_number===Number(S.room?.current_round||1))}

 function currentPicks(){const n=Number(S.room?.current_round||1);return [S.picks.find(p=>p.round_number===n&&p.player_slot===1),S.picks.find(p=>p.round_number===n&&p.player_slot===2)]}

 function currentSubs(){const rid=currentRound()?.id;return [S.subs.find(x=>x.round_id===rid&&x.player_slot===1),S.subs.find(x=>x.round_id===rid&&x.player_slot===2)]}

function resetLocalRoomState(){rememberDeviceSpotify();clearRoom();if(channel){try{sb.removeChannel(channel)}catch{}channel=null}for(const n of [1,2])clearSpotifySlot(n);S.room=null;S.members=[];S.picks=[];S.rounds=[];S.subs=[];S.scores=[];S.votes=[];S.ballot={};S.voteHandover="";S.voteEditing="";S.membership=null;S.currentArtist=null;S.currentArtistSlot=null;S.notice="";S.error=""}

function weightedMatchPoints(){
  let a=0,b=0;
  for(const r of S.rounds.filter(x=>x.status==="complete"&&x.winner_slot)){
    const w=r.round_number===5?2:1;
    if(r.winner_slot===1)a+=w; else if(r.winner_slot===2)b+=w;
  }
  return{a,b};
}
